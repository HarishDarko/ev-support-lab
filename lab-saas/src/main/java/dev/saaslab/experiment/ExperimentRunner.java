package dev.saaslab.experiment;

import dev.saaslab.delivery.DeliveryStore;
import dev.saaslab.delivery.DeliveryStore.Endpoint;
import dev.saaslab.delivery.DeliveryTrace;
import dev.saaslab.delivery.DeliveryTrace.Line;
import dev.saaslab.experiment.ExperimentInputs.Burst;
import dev.saaslab.experiment.ExperimentInputs.Capture;
import dev.saaslab.experiment.ExperimentInputs.Outage;
import dev.saaslab.experiment.ExperimentInputs.Window;
import dev.saaslab.experiment.ExperimentResult.Comparison;
import dev.saaslab.experiment.ExperimentResult.Group;
import dev.saaslab.experiment.ExperimentResult.Log;
import dev.saaslab.simulator.FakeEndpoint;
import dev.saaslab.simulator.FakeIdentityProvider;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.IntStream;
import java.util.stream.Stream;
import org.springframework.jdbc.core.simple.JdbcClient;

/**
 * Plays a synthetic fleet of OAuth endpoints through the delivery service twice: 14 days with the flag off
 * everywhere (before), then 14 days with it on for the canary workspaces only (after). Every endpoint gets the
 * hourly recurring-task job on the hour; the inputs add bursts, outages and the log captures. Support replays
 * paused endpoints every morning. Outcomes are read from the database after each window.
 */
public final class ExperimentRunner {

    private final ExperimentInputs in;
    private final String jdbcUrl;

    public ExperimentRunner(ExperimentInputs inputs, String jdbcUrl) {
        this.in = inputs;
        this.jdbcUrl = jdbcUrl;
    }

    public ExperimentResult run() {
        Instant start = Instant.parse(in.start());
        try (LabHarness lab = LabHarness.start(jdbcUrl, false, start);
                FakeIdentityProvider idp = new FakeIdentityProvider(lab.clock(), in.tokenLifetimeSeconds(),
                        in.tokenRequestsPerMinute());
                FakeEndpoint hooks = new FakeEndpoint(lab.clock())) {
            DeliveryStore store = lab.store();
            List<String> all = Stream.concat(in.canary().stream(), in.control().stream()).toList();
            for (String ep : all) {
                String ws = "ws-" + ep;
                store.addWorkspace(ws, "Workspace " + ep, false);
                store.addEndpoint(new Endpoint(ep, ws, hooks.url(ep), "oauth", "client-" + ep, idp.tokenUrl()));
                hooks.oauth(ep, idp, "client-" + ep);
            }
            String hmac = in.hmac().endpoint();
            store.addWorkspace("ws-" + hmac, "Workspace " + hmac, false);
            store.addEndpoint(new Endpoint(hmac, "ws-" + hmac, hooks.url(hmac), "hmac", null, null));
            hooks.hmac(hmac, "sig-ws-" + hmac);

            Map<String, Map<String, Group>> windows = new LinkedHashMap<>();
            List<Log> logs = new ArrayList<>();
            for (int w = 0; w < in.windows().size(); w++) {
                Window window = in.windows().get(w);
                Instant from = start.plus(Duration.ofDays((long) w * in.days()));
                Instant to = from.plus(Duration.ofDays(in.days()));
                for (String ep : in.canary()) {
                    store.setFixOverride("ws-" + ep, window.fixOnCanary());
                }
                play(lab, hooks, window, w, from, all, logs);
                Map<String, Group> groups = new LinkedHashMap<>();
                groups.put("canary", group(lab.jdbc(), hooks, window.name(), in.canary(), from, to));
                groups.put("control", group(lab.jdbc(), hooks, window.name(), in.control(), from, to));
                windows.put(window.name(), groups);
            }
            return new ExperimentResult(windows, logs, compare(windows), Map.of(
                    "days", in.days(), "eventsPerHour", in.eventsPerHour(),
                    "tokenLifetimeSeconds", in.tokenLifetimeSeconds(),
                    "tokenRequestsPerMinute", in.tokenRequestsPerMinute(), "stormThreshold", in.stormThreshold(),
                    "canaryEndpoints", in.canary().size(), "controlEndpoints", in.control().size()));
        }
    }

    private void play(LabHarness lab, FakeEndpoint hooks, Window window, int w, Instant from, List<String> all,
            List<Log> logs) {
        DeliveryStore store = lab.store();
        DeliveryTrace trace = lab.trace();
        Map<String, Burst> bursts = new HashMap<>();
        window.bursts().forEach(b -> bursts.put(key(b.endpoint(), b.day(), b.hour()), b));
        Map<String, Outage> outages = new HashMap<>();
        window.outages().forEach(o -> outages.put(key(o.endpoint(), o.day(), o.hour()), o));
        Map<String, Capture> captures = new HashMap<>();
        window.captures().forEach(c -> captures.put(key(c.endpoint(), c.day(), c.hour()), c));
        Map<String, String> capturing = new HashMap<>();
        boolean hmacWindow = w == 0;

        for (int day = 0; day < in.days(); day++) {
            for (int hour = 0; hour < 24; hour++) {
                lab.clock().set(from.plus(Duration.ofDays(day)).plus(Duration.ofHours(hour)));
                for (String ep : all) {
                    String k = key(ep, day, hour);
                    // A capture with no pause ends after the hour it started in.
                    if (capturing.containsKey(ep) && !captures.containsKey(k) && !store.paused(ep)) {
                        logs.add(log(capturing.remove(ep), trace.stop(ep)));
                    }
                    Outage outage = outages.get(k);
                    if (outage != null) {
                        hooks.down(ep, outage.status(), lab.clock().instant().plus(Duration.ofMinutes(outage.minutes())));
                    }
                    Capture capture = captures.get(k);
                    if (capture != null) {
                        trace.capture(ep);
                        capturing.put(ep, capture.title());
                    }
                    Burst burst = bursts.get(k);
                    int n = burst != null ? burst.size() : in.eventsPerHour();
                    if (burst != null) {
                        trace.line(ep, "recurring-jobs", "burst: " + n + " task events on the hour");
                    }
                    String prefix = window.name() + "-" + ep + "-d" + bucket(day) + "-h" + bucket(hour) + "-";
                    List<String> ids = IntStream.range(0, n).mapToObj(i -> prefix + i).toList();
                    for (String id : ids) {
                        store.addEvent(id, ep, lab.clock().instant());
                    }
                    lab.worker().deliverTogether(ep, ids);
                }
                playHmac(lab, hooks, day, hour, hmacWindow, from, logs);
                if (hour == in.replayHour()) {
                    lab.clock().set(lab.clock().instant().plus(Duration.ofMinutes(in.replayMinute())));
                    for (String ep : all) {
                        if (store.paused(ep)) {
                            lab.replay().replay(ep);
                            String title = capturing.remove(ep);
                            if (title != null) {
                                logs.add(log(title, trace.stop(ep)));
                            }
                        }
                    }
                }
            }
        }
        capturing.forEach((ep, title) -> logs.add(log(title, trace.stop(ep))));
    }

    /** The HMAC contrast: two events every hour; the customer rotates the secret, support re-enters it an hour later. */
    private void playHmac(LabHarness lab, FakeEndpoint hooks, int day, int hour, boolean window, Instant from,
            List<Log> logs) {
        ExperimentInputs.Hmac h = in.hmac();
        String ep = h.endpoint();
        boolean rotated = window && day == h.day() && hour == h.hour();
        if (rotated) {
            hooks.hmac(ep, "sig-rotated");
            lab.trace().capture(ep);
        }
        String prefix = "w" + (window ? 0 : 1) + "-" + ep + "-d" + bucket(day) + "-h" + bucket(hour) + "-";
        List<String> ids = IntStream.range(0, in.eventsPerHour()).mapToObj(i -> prefix + i).toList();
        for (String id : ids) {
            lab.store().addEvent(id, ep, lab.clock().instant());
        }
        lab.worker().deliverTogether(ep, ids);
        if (rotated) {
            hooks.hmac(ep, "sig-ws-" + ep);
            logs.add(log(h.title(), lab.trace().stop(ep)));
        }
    }

    private static Log log(String title, List<Line> lines) {
        return new Log(title, lines.stream().map(l -> List.of(l.time(), l.actor(), l.detail())).toList());
    }

    private Group group(JdbcClient jdbc, FakeEndpoint hooks, String window, List<String> endpoints, Instant from,
            Instant to) {
        Timestamp a = Timestamp.from(from);
        Timestamp b = Timestamp.from(to);
        String[] eps = endpoints.toArray(String[]::new);
        int events = jdbc.sql("select count(*) from event where endpoint_id = any(?) and created_at >= ? and created_at < ?")
                .params(eps, a, b).query(Integer.class).single();
        int tokens = jdbc.sql("select count(*) from token_request where endpoint_id = any(?) and at >= ? and at < ?")
                .params(eps, a, b).query(Integer.class).single();
        int storms = jdbc.sql("""
                select count(*) from (select endpoint_id, date_trunc('minute', at) m from token_request
                where endpoint_id = any(?) and at >= ? and at < ? group by 1, 2 having count(*) > ?) s""")
                .params(eps, a, b, in.stormThreshold()).query(Integer.class).single();
        int pauses = jdbc.sql("select count(*) from endpoint_pause where endpoint_id = any(?) and paused_at >= ? and paused_at < ?")
                .params(eps, a, b).query(Integer.class).single();
        int real = jdbc.sql("""
                select count(*) from endpoint_pause p where endpoint_id = any(?) and paused_at >= ? and paused_at < ?
                and (select detail from delivery_attempt d where d.endpoint_id = p.endpoint_id
                     and d.counts_toward_pause and d.at <= p.paused_at order by d.at desc, d.id desc limit 1) like 'HTTP 5%'""")
                .params(eps, a, b).query(Integer.class).single();
        int failed = jdbc.sql("""
                select count(*) from delivery_attempt where endpoint_id = any(?) and at >= ? and at < ?
                and outcome = 'failed' and counts_toward_pause""").params(eps, a, b).query(Integer.class).single();
        int waited = jdbc.sql("""
                select count(*) from delivery_attempt where endpoint_id = any(?) and at >= ? and at < ?
                and outcome = 'waited'""").params(eps, a, b).query(Integer.class).single();
        int replayed = jdbc.sql("""
                select count(*) from event e where endpoint_id = any(?) and created_at >= ? and created_at < ?
                and status = 'delivered'
                and exists (select 1 from delivery_attempt d where d.event_id = e.id and d.outcome = 'failed')""")
                .params(eps, a, b).query(Integer.class).single();
        int lost = jdbc.sql("""
                select count(*) from event where endpoint_id = any(?) and created_at >= ? and created_at < ?
                and status = 'failed'""").params(eps, a, b).query(Integer.class).single();
        long twice = hooks.deliveredTwice(endpoints, window + "-");
        return new Group(endpoints.size(), events, tokens, storms, pauses, real, failed, waited, replayed, lost, twice);
    }

    private List<Comparison> compare(Map<String, Map<String, Group>> windows) {
        Map<String, Integer> computed = new LinkedHashMap<>();
        windows.forEach((w, groups) -> groups.forEach((g, v) -> {
            computed.put(w + "." + g + ".storms", v.storms());
            computed.put(w + "." + g + ".tokenRequests", v.tokenRequests());
            computed.put(w + "." + g + ".pauses", v.pauses());
            computed.put(w + "." + g + ".realOutagePauses", v.realOutagePauses());
            computed.put(w + "." + g + ".events", v.events());
            computed.put(w + "." + g + ".lost", v.lost());
            computed.put(w + "." + g + ".deliveredTwice", (int) v.deliveredTwice());
        }));
        List<Comparison> out = new ArrayList<>();
        in.expectedStory().forEach((metric, expected) -> {
            int value = computed.getOrDefault(metric, -1);
            out.add(new Comparison(metric, expected, value, value == expected));
        });
        return out;
    }

    private static String key(String endpoint, int day, int hour) {
        return endpoint + "@" + day + "@" + hour;
    }

    private static String bucket(int n) {
        return n < 10 ? "0" + n : String.valueOf(n);
    }
}
