package dev.shoplab.simulator;

import dev.shoplab.checkout.CheckoutService;
import dev.shoplab.clock.MutableClock;
import dev.shoplab.orders.CaptureGate;
import dev.shoplab.orders.OrderService;
import dev.shoplab.shop.OrderTrace;
import dev.shoplab.shop.OrderTrace.Line;
import dev.shoplab.shop.ShopStore;
import dev.shoplab.shop.ShopStore.Attempt;
import dev.shoplab.shop.ShopStore.Order;
import dev.shoplab.simulator.Scenarios.Scenario;
import dev.shoplab.simulator.ScriptedWorld.Seen;
import dev.shoplab.simulator.ScriptedWorld.Shopper;
import java.time.Duration;
import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;

/** Plays one scenario against the checkout and order service, with a fresh scripted processor. */
public final class ScenarioPlayer {

    /** What a played scenario left behind, read from the database and the scripted processor. */
    public record Outcome(String orderStatus, String holdReason, int authorizations, int captures,
            int processorAuthorizations, int processorCaptures, List<Attempt> attempts, List<String> keys,
            int lookups, Seen seen, List<RaceDispatcher.Race> races, List<Line> log) {}

    public static final String STORE = "store-test";

    private final CheckoutService checkout;
    private final OrderService orders;
    private final ShopStore store;
    private final CaptureGate gate;
    private final JdbcClient jdbc;
    private final OrderTrace trace;
    private final MutableClock clock;
    private final String webhookUrl;
    private final Duration webhookWait;

    public ScenarioPlayer(CheckoutService checkout, OrderService orders, ShopStore store, CaptureGate gate,
            JdbcClient jdbc, OrderTrace trace, MutableClock clock, String webhookUrl, Duration webhookWait) {
        this.checkout = checkout;
        this.orders = orders;
        this.store = store;
        this.gate = gate;
        this.jdbc = jdbc;
        this.trace = trace;
        this.clock = clock;
        this.webhookUrl = webhookUrl;
        this.webhookWait = webhookWait;
    }

    /**
     * @param fixOverride the store's flag override, or null to follow lab.fix.enabled
     */
    public Outcome play(Scenario scenario, Boolean fixOverride) {
        return play(scenario, fixOverride, () -> {});
    }

    /**
     * @param whileProcessorRuns runs after the scenario, while the scripted processor still answers (support's RB-21)
     */
    public Outcome play(Scenario scenario, Boolean fixOverride, Runnable whileProcessorRuns) {
        try (FakeProcessor processor = new FakeProcessor(clock, 1400)) {
            processor.webhookUrl(webhookUrl);
            store.addStore(STORE, "Test store (synthetic)", processor.url(), fixOverride);
            ScriptedWorld world = new ScriptedWorld(checkout, orders, processor, gate, jdbc, trace, clock,
                    webhookWait);
            String id = scenario.orderId();
            world.add(new Shopper("co-" + id, STORE, id, scenario.channel(), scenario.amountPence(), clock.instant(),
                    scenario.answerMillis(), scenario.repayAfterMillis(),
                    scenario.declineFirst() ? "card-declining-" + id : null, 20_000, scenario.dropWebhooks(),
                    scenario.name()));
            world.runAll();
            whileProcessorRuns.run();
            List<Line> log = trace.stop(id);
            Order order = store.order(id);
            List<Attempt> attempts = store.attemptsFor(id);
            return new Outcome(order.status(), order.holdReason(), store.authorizationsFor(id).size(),
                    store.capturesFor(id).size(), processor.authorizations(id), processor.captures(id), attempts,
                    attempts.stream().map(Attempt::idempotencyKey).distinct().toList(),
                    jdbc.sql("select count(*) from payment_lookup where order_id = ?").param(id)
                            .query(Integer.class).single(),
                    world.seen(id), world.races(), log);
        }
    }
}
