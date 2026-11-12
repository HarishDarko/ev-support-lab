package dev.shoplab.orders;

import static org.assertj.core.api.Assertions.assertThat;

import dev.shoplab.payment.ProcessorClient;
import dev.shoplab.simulator.FakeProcessor;
import dev.shoplab.simulator.FakeProcessor.Webhook;
import dev.shoplab.simulator.RaceDispatcher;
import dev.shoplab.simulator.RaceDispatcher.Race;
import dev.shoplab.support.AbstractLabIT;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * The capture race itself, with real threads and real HTTP, made deterministic: two authorizations for one order,
 * and their webhooks handled by two workers at once. Worker 1 is held between "no capture yet" and its capture
 * (the capture gate); worker 2 then runs until it finishes or PostgreSQL reports it waiting for a lock
 * ({@code pg_locks}). Off, both workers capture. On, worker 2 waits for the order lock, then sees worker 1's
 * capture and holds the order instead of capturing again.
 */
class CaptureSerializationIT extends AbstractLabIT {

    private static final String ORDER = "51209";

    @Autowired
    private ProcessorClient processorClient;

    @Test
    void withTheFixOffBothWorkersCapture() {
        try (FakeProcessor processor = new FakeProcessor(clock, 4_000)) {
            Race race = race(processor, false);

            assertThat(race.firstHeldAtGate()).as("worker 1 was held between its check and its capture").isTrue();
            assertThat(race.secondWaitedForLock()).as("worker 2 did not wait for anything").isFalse();
            assertThat(store.capturesFor(ORDER)).hasSize(2);
            assertThat(processor.captures(ORDER)).as("settled charges at the processor").isEqualTo(2);
            assertThat(store.order(ORDER).holdReason()).isEqualTo("two captures");
        }
    }

    @Test
    void withTheFixOnTheSecondWorkerWaitsForTheOrderLockAndSeesTheFirstCapture() {
        try (FakeProcessor processor = new FakeProcessor(clock, 4_000)) {
            Race race = race(processor, true);

            assertThat(race.firstHeldAtGate()).isTrue();
            assertThat(race.secondWaitedForLock()).as("worker 2 waited for the order lock").isTrue();
            assertThat(store.capturesFor(ORDER)).hasSize(1);
            assertThat(processor.captures(ORDER)).isEqualTo(1);
            assertThat(store.order(ORDER).status()).isEqualTo("PAYMENT_PENDING");
            assertThat(store.order(ORDER).holdReason()).startsWith("extra authorization");
        }
    }

    /** One order with two authorizations from two keys, whose webhooks are due 20 ms apart. */
    private Race race(FakeProcessor processor, boolean fix) {
        processor.webhookUrl(webhookUrl());
        processor.plan(ORDER, new FakeProcessor.Plan(List.of(4_000L, 3_980L), false));
        store.addStore("store-race", "Race store (synthetic)", processor.url(), fix);
        checkout.start("co-" + ORDER, "store-race", ORDER, "ios", 3650);
        processorClient.authorize(processor.url(), "ck_51209_a1", ORDER, 3650, "card-a");
        clock.advance(java.time.Duration.ofMillis(40));
        processorClient.authorize(processor.url(), "ck_51209_a2", ORDER, 3650, "card-a");
        List<Webhook> due = processor.takeScheduled();
        assertThat(due).hasSize(2);
        clock.set(due.getFirst().at());
        return new RaceDispatcher(processor, gate, jdbc, clock).deliverTogether(due.get(0), due.get(1));
    }
}
