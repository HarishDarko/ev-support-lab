package dev.saaslab.simulator;

import dev.saaslab.clock.MutableClock;
import dev.saaslab.delivery.DeliveryStore;
import dev.saaslab.delivery.DeliveryStore.Endpoint;
import dev.saaslab.delivery.DeliveryTrace;
import dev.saaslab.delivery.DeliveryTrace.Line;
import dev.saaslab.delivery.DeliveryWorker;
import dev.saaslab.simulator.Scenarios.Scenario;
import dev.saaslab.simulator.Scenarios.Step;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.IntStream;
import org.springframework.jdbc.core.simple.JdbcClient;

/** Plays one scenario against the delivery service, with a fresh identity provider and endpoint. */
public final class ScenarioPlayer {

    /** What a played scenario left behind, read from the database and the scripted parties. */
    public record Outcome(int delivered, int failed, int pending, int tokenRequests, int pauses,
            long deliveredTwice, List<Line> log) {}

    public static final String WORKSPACE = "ws-test";
    public static final String ENDPOINT = "ep-test";
    public static final String CLIENT = "client-test";

    private final DeliveryStore store;
    private final DeliveryWorker worker;
    private final DeliveryTrace trace;
    private final JdbcClient jdbc;
    private final MutableClock clock;

    public ScenarioPlayer(DeliveryStore store, DeliveryWorker worker, DeliveryTrace trace, JdbcClient jdbc,
            MutableClock clock) {
        this.store = store;
        this.worker = worker;
        this.trace = trace;
        this.jdbc = jdbc;
        this.clock = clock;
    }

    /**
     * @param fixOverride the workspace's flag override, or null to follow lab.fix.enabled
     */
    public Outcome play(Scenario scenario, Boolean fixOverride) {
        try (FakeIdentityProvider idp = new FakeIdentityProvider(clock, 3600, 100);
                FakeEndpoint endpoint = new FakeEndpoint(clock)) {
            store.addWorkspace(WORKSPACE, "Test workspace", fixOverride);
            boolean oauth = scenario.auth().equals("oauth");
            store.addEndpoint(new Endpoint(ENDPOINT, WORKSPACE, endpoint.url(ENDPOINT), scenario.auth(),
                    oauth ? CLIENT : null, oauth ? idp.tokenUrl() : null));
            if (oauth) {
                endpoint.oauth(ENDPOINT, idp, CLIENT);
            } else {
                endpoint.hmac(ENDPOINT, scenario.signatureOk() ? "sig-" + WORKSPACE : "sig-rotated");
            }
            trace.capture(ENDPOINT);
            Instant start = clock.instant();
            int[] seq = {0};
            burst(1, seq);
            for (Step step : scenario.steps()) {
                clock.set(start.plusSeconds(step.offsetSeconds()));
                switch (step.action()) {
                    case BURST -> burst(step.n(), seq);
                    case REVOKE -> idp.revoke(CLIENT);
                    case DOWN -> endpoint.down(ENDPOINT, step.n(), clock.instant().plusSeconds(40 * 60));
                    case SPEND_QUOTA -> spendQuota(idp, step.n());
                    case DUE -> worker.deliverDue(ENDPOINT);
                }
            }
            List<Line> log = trace.stop(ENDPOINT);
            return new Outcome(count("delivered"), count("failed"), count("pending"),
                    jdbc.sql("select count(*) from token_request").query(Integer.class).single(),
                    jdbc.sql("select count(*) from endpoint_pause").query(Integer.class).single(),
                    endpoint.deliveredTwice(), log);
        }
    }

    private void burst(int n, int[] seq) {
        List<String> ids = IntStream.range(0, n).mapToObj(i -> "evt-" + (++seq[0])).toList();
        for (String id : ids) {
            store.addEvent(id, ENDPOINT, clock.instant());
        }
        worker.deliverTogether(ENDPOINT, new ArrayList<>(ids));
    }

    private int count(String status) {
        return jdbc.sql("select count(*) from event where status = ?").param(status).query(Integer.class).single();
    }

    /** Another system using the same client spends this minute's token requests. */
    private static void spendQuota(FakeIdentityProvider idp, int n) {
        HttpClient http = HttpClient.newHttpClient();
        for (int i = 0; i < n; i++) {
            try {
                http.send(HttpRequest.newBuilder(URI.create(idp.tokenUrl()))
                        .header("Content-Type", "application/x-www-form-urlencoded")
                        .POST(HttpRequest.BodyPublishers.ofString("grant_type=client_credentials&client_id="
                                + CLIENT))
                        .build(), HttpResponse.BodyHandlers.discarding());
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
        }
    }
}
