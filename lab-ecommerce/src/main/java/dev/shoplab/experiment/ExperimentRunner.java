package dev.shoplab.experiment;

import dev.shoplab.experiment.ExperimentInputs.Scripted;
import dev.shoplab.experiment.ExperimentInputs.Store;
import dev.shoplab.experiment.ExperimentInputs.Window;
import dev.shoplab.experiment.ExperimentResult.Comparison;
import dev.shoplab.experiment.ExperimentResult.Group;
import dev.shoplab.experiment.ExperimentResult.Log;
import dev.shoplab.shop.OrderTrace.Line;
import dev.shoplab.shop.ShopStore;
import dev.shoplab.simulator.FakeProcessor;
import dev.shoplab.simulator.ScriptedWorld;
import dev.shoplab.simulator.ScriptedWorld.Shopper;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;

/**
 * Plays a synthetic shop of five regional stores through the checkout and order service twice: 14 days with the
 * flag off everywhere (before), then 14 days with it on for the canary store only (after). Every store gets its
 * regular checkouts, spread over the day, with fast processor answers; the inputs add the scripted slow, declined
 * and lost-webhook checkouts and the log captures. Outcomes are read from the database after each window.
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
                FakeProcessor processor = new FakeProcessor(lab.clock(), 1400)) {
            processor.webhookUrl(lab.webhookUrl());
            ShopStore store = lab.store();
            for (Store s : in.stores()) {
                store.addStore(s.id(), s.name(), processor.url(), false);
            }
            Map<String, Map<String, Group>> windows = new LinkedHashMap<>();
            List<Log> logs = new ArrayList<>();
            for (int w = 0; w < in.windows().size(); w++) {
                Window window = in.windows().get(w);
                Instant from = start.plus(Duration.ofDays((long) w * in.days()));
                Instant to = from.plus(Duration.ofDays(in.days()));
                for (String id : in.canary()) {
                    store.setFixOverride(id, window.fixOnCanary());
                }
                ScriptedWorld world = lab.world(processor);
                List<Shopper> shoppers = shoppers(window, w, from);
                shoppers.forEach(world::add);
                world.runAll();
                for (Shopper s : shoppers) {
                    if (s.title() != null) {
                        logs.add(log(s.title(), lab.trace().stop(s.orderId())));
                    }
                }
                Map<String, Group> groups = new LinkedHashMap<>();
                groups.put("canary", group(lab.jdbc(), in.canary(), from, to));
                groups.put("control", group(lab.jdbc(), in.control(), from, to));
                windows.put(window.name(), groups);
            }
            Map<String, Object> settings = new LinkedHashMap<>();
            settings.put("days", in.days());
            settings.put("stores", in.stores().size());
            settings.put("canaryStores", in.canary());
            settings.put("controlStores", in.control());
            settings.put("checkoutTimeoutSeconds", 8);
            settings.put("appRetryMillis", ScriptedWorld.APP_RETRY.toMillis());
            settings.put("captureTakesMillis", ScriptedWorld.CAPTURE_TAKES.toMillis());
            return new ExperimentResult(windows, logs, compare(windows), settings);
        }
    }

    /** The regular checkouts of every store and day, plus the scripted ones. */
    private List<Shopper> shoppers(Window window, int w, Instant from) {
        List<Shopper> out = new ArrayList<>();
        String prefix = window.name().substring(0, 1).toUpperCase();
        long span = Duration.ofHours(in.lastHour() - in.firstHour()).toMillis();
        for (int day = 0; day < in.days(); day++) {
            Instant dayStart = from.plus(Duration.ofDays(day));
            for (int si = 0; si < in.stores().size(); si++) {
                Store s = in.stores().get(si);
                for (int i = 0; i < s.checkoutsPerDay(); i++) {
                    Instant at = dayStart.plus(Duration.ofHours(in.firstHour()))
                            .plusMillis(i * span / s.checkoutsPerDay()).plusSeconds(si * 13L + day * 7L);
                    String order = String.format("%s%d-%02d-%03d", prefix, si + 1, day, i);
                    String channel = in.channels().get((i + si) % in.channels().size());
                    int amount = in.amountsPence().get((i * 7 + day + si) % in.amountsPence().size());
                    long answer = in.answerMillis().get((i + day + si) % in.answerMillis().size());
                    out.add(new Shopper("co-" + order, s.id(), order, channel, amount, at, List.of(answer), null,
                            null, 20_000, false, null));
                }
            }
        }
        for (Scripted x : window.shoppers()) {
            Instant at = from.plus(Duration.ofDays(x.day()))
                    .plusNanos(LocalTime.parse(x.time()).toNanoOfDay());
            out.add(new Shopper("co-" + x.order(), x.store(), x.order(), x.channel(), x.amountPence(), at,
                    x.answerMillis(), x.repayAfterMillis(), x.declineFirst() ? "card-declining-" + x.order() : null,
                    20_000, x.dropWebhooks(), x.title()));
        }
        return out;
    }

    private static Log log(String title, List<Line> lines) {
        return new Log(title, lines.stream().map(l -> List.of(l.time(), l.actor(), l.detail())).toList());
    }

    private static final String ORDERS = "orders o where o.store_id = any(?) and o.created_at >= ? and o.created_at < ? ";

    private Group group(JdbcClient jdbc, List<String> stores, Instant from, Instant to) {
        Object[] p = {stores.toArray(String[]::new), Timestamp.from(from), Timestamp.from(to)};
        return new Group(stores.size(),
                count(jdbc, "select count(*) from " + ORDERS, p),
                count(jdbc, "select count(*) from " + ORDERS + """
                         and exists (select 1 from payment_attempt a where a.order_id = o.id and a.attempt_no = 1
                                     and a.outcome = 'timed_out')""", p),
                count(jdbc, "select count(*) from " + ORDERS + """
                         and exists (select 1 from payment_attempt a where a.order_id = o.id and a.outcome = 'timed_out')
                         and (select count(distinct a.idempotency_key) from payment_attempt a
                              where a.order_id = o.id) > 1""", p),
                count(jdbc, "select count(*) from " + ORDERS + """
                         and (select count(*) from payment_authorization z where z.order_id = o.id) > 1""", p),
                count(jdbc, "select count(*) from " + ORDERS + """
                         and o.status = 'PAYMENT_PENDING' and o.hold_reason like 'extra authorization%'""", p),
                count(jdbc, "select count(*) from " + ORDERS + """
                         and (select count(*) from capture c where c.order_id = o.id) > 1""", p),
                count(jdbc, "select coalesce(sum(o.amount_pence), 0) from " + ORDERS + """
                         and (select count(*) from capture c where c.order_id = o.id) > 1""", p),
                count(jdbc, "select count(*) from " + ORDERS + """
                         and o.status = 'PAYMENT_PENDING' and o.hold_reason not like 'extra authorization%'
                         and o.hold_reason <> 'two captures'""", p),
                count(jdbc, "select count(*) from " + ORDERS + " and o.status = 'CONFIRMED'", p),
                count(jdbc, "select count(*) from " + ORDERS + """
                         and o.status = 'CONFIRMED'
                         and exists (select 1 from payment_attempt a where a.order_id = o.id and a.outcome = 'declined')
                         and (select count(*) from capture c where c.order_id = o.id) = 1
                         and (select count(*) from payment_authorization z where z.order_id = o.id) = 1""", p),
                count(jdbc, "select count(*) from payment_lookup l where l.order_id in (select o.id from " + ORDERS + ")", p),
                count(jdbc, "select count(*) from " + ORDERS + """
                         and o.status = 'PAYMENT_PENDING'
                         and (select count(distinct z.idempotency_key) from payment_authorization z
                              where z.order_id = o.id) >= 2
                         and (select max(z.first_seen_at) - min(z.first_seen_at) from payment_authorization z
                              where z.order_id = o.id) <= interval '60 seconds'""", p));
    }

    private static int count(JdbcClient jdbc, String sql, Object[] params) {
        return jdbc.sql(sql).params(params).query(Integer.class).single();
    }

    private List<Comparison> compare(Map<String, Map<String, Group>> windows) {
        Map<String, Integer> computed = new LinkedHashMap<>();
        windows.forEach((w, groups) -> groups.forEach((g, v) -> {
            computed.put(w + "." + g + ".checkouts", v.checkouts());
            computed.put(w + "." + g + ".slowFirstAnswer", v.slowFirstAnswer());
            computed.put(w + "." + g + ".secondAuthorization", v.secondAuthorization());
            computed.put(w + "." + g + ".stuck", v.stuck());
            computed.put(w + "." + g + ".bothCaptured", v.bothCaptured());
            computed.put(w + "." + g + ".heldOther", v.heldOther());
            computed.put(w + "." + g + ".newCardAfterDecline", v.newCardAfterDecline());
            computed.put(w + "." + g + ".detectorHits", v.detectorHits());
        }));
        List<Comparison> out = new ArrayList<>();
        in.expectedStory().forEach((metric, expected) -> {
            int value = computed.getOrDefault(metric, -1);
            out.add(new Comparison(metric, expected, value, value == expected));
        });
        return out;
    }
}
