package dev.shoplab.simulator;

import dev.shoplab.clock.MutableClock;
import dev.shoplab.orders.CaptureGate;
import dev.shoplab.simulator.FakeProcessor.Webhook;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.springframework.jdbc.core.simple.JdbcClient;

/**
 * Two webhooks for one order that arrive closer together than one capture takes are handled by two workers at once.
 * This plays that race the same way every time, with real threads and real HTTP: worker 1 is held between its
 * "no capture yet" check and its capture (the {@link CaptureGate}); then worker 2 runs until it either finishes or
 * waits for a database lock, which PostgreSQL reports in {@code pg_locks}; then worker 1 goes on.
 */
public final class RaceDispatcher {

    /** What happened. {@code secondWaitedForLock}: worker 2 was seen waiting for the order lock. */
    public record Race(boolean firstHeldAtGate, boolean secondWaitedForLock) {}

    private final FakeProcessor processor;
    private final CaptureGate gate;
    private final JdbcClient jdbc;
    private final MutableClock clock;

    public RaceDispatcher(FakeProcessor processor, CaptureGate gate, JdbcClient jdbc, MutableClock clock) {
        this.processor = processor;
        this.gate = gate;
        this.jdbc = jdbc;
        this.clock = clock;
    }

    public Race deliverTogether(Webhook first, Webhook second) {
        CaptureGate.Armed armed = gate.arm(first.orderId());
        try (ExecutorService workers = Executors.newFixedThreadPool(2)) {
            clock.set(first.at());
            Future<Integer> one = workers.submit(() -> processor.deliver(first));
            boolean held = awaitAtGateOrDone(armed, one);
            clock.set(second.at().isAfter(clock.instant()) ? second.at() : clock.instant());
            Future<Integer> two = workers.submit(() -> processor.deliver(second));
            boolean waited = awaitDoneOrWaitingForLock(two);
            armed.release();
            get(one);
            get(two);
            return new Race(held, waited);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(e);
        } finally {
            gate.disarm(armed);
        }
    }

    /** Worker 1 may not reach the gate at all (it found a capture and held the order); then it finishes instead. */
    private static boolean awaitAtGateOrDone(CaptureGate.Armed armed, Future<Integer> one)
            throws InterruptedException {
        long deadline = System.currentTimeMillis() + 10_000;
        while (!armed.awaitArrival(2)) {
            if (one.isDone()) {
                get(one);
                return false;
            }
            if (System.currentTimeMillis() > deadline) {
                throw new IllegalStateException("worker 1 neither reached the capture gate nor finished");
            }
        }
        return true;
    }

    private boolean awaitDoneOrWaitingForLock(Future<Integer> f) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 10_000;
        while (!f.isDone()) {
            if (jdbc.sql("select count(*) from pg_locks where not granted").query(Long.class).single() > 0) {
                return true;
            }
            if (System.currentTimeMillis() > deadline) {
                throw new IllegalStateException("worker 2 neither finished nor waited for a lock");
            }
            Thread.sleep(2);
        }
        return false;
    }

    private static int get(Future<Integer> f) {
        try {
            int status = f.get(15, TimeUnit.SECONDS);
            if (status != 200) {
                throw new IllegalStateException("webhook answered HTTP " + status);
            }
            return status;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(e);
        } catch (Exception e) {
            throw new IllegalStateException("webhook worker failed", e);
        }
    }
}
