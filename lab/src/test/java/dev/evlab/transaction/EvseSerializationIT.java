package dev.evlab.transaction;

import static org.assertj.core.api.Assertions.assertThat;

import dev.evlab.ocpp.messages.TransactionEventType;
import dev.evlab.simulator.SimulatedCharger;
import dev.evlab.simulator.StatusAnswerSpec;
import dev.evlab.station.EvseStatusRepository;
import dev.evlab.support.AbstractLabIT;
import java.time.Instant;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * "No newer transaction on this EVSE" is only true if nothing can start one between the check and the close, so
 * the reconciliation decision and a Started take the same per-EVSE lock. Made deterministic by holding that lock
 * from the test and watching PostgreSQL report who waits for it, instead of racing two threads and hoping.
 */
@TestPropertySource(properties = "lab.fix.enabled=true")
class EvseSerializationIT extends AbstractLabIT {

    private static final Instant T0 = Instant.parse("2026-03-02T10:00:00Z");
    private static final String OLD = "TX-OLD";

    @Autowired
    private EvseStatusRepository evseStatus;
    @Autowired
    private PlatformTransactionManager txManager;
    @Autowired
    private TransactionEventService events;

    private final ExecutorService background = Executors.newCachedThreadPool();

    @AfterEach
    void stopBackgroundWork() {
        background.shutdownNow();
        // The flag is cached by the application and the cache outlives the table truncation between tests.
        stations.setFixEnabled(STATION, null, clock.instant());
    }

    @Test
    void a_newer_transaction_that_starts_while_the_sweeper_waits_for_the_EVSE_is_seen_by_the_decision() {
        clock.set(T0.plusSeconds(1900));
        try (SimulatedCharger second = reconnectedWithOldTransactionReadyToClose()) {
            clock.set(T0.plusSeconds(1900 + 60));

            Future<Integer> sweep = inTransactionHoldingTheEvseLock(() -> {
                Future<Integer> f = background.submit(() -> reconciliation.sweep(STATION));
                awaitSomeoneWaitingForAnEvseLock("the sweeper");
                // The newer transaction becomes visible together with the release of the lock.
                insertNewerTransaction("TX-NEW");
                return f;
            });

            assertThat(get(sweep)).as("the sweeper closed nothing").isZero();
            Transaction old = tx(OLD);
            assertThat(old.state()).isEqualTo(TxState.CHARGING);
            assertThat(old.reconciliation().reviewReason()).isEqualTo(ReviewReason.NEWER_TRANSACTION);
        }
    }

    @Test
    void a_Started_waits_for_the_EVSE_while_a_reconciliation_decision_holds_it() {
        clock.set(T0.plusSeconds(1900));
        try (SimulatedCharger second = reconnectedWithOldTransactionReadyToClose()) {
            Future<EventOutcome> started = inTransactionHoldingTheEvseLock(() -> {
                Future<EventOutcome> f = background.submit(() -> events.handle(STATION, new TxEvent("TX-NEW", 0,
                        TransactionEventType.Started, T0.plusSeconds(1950), "CablePluggedIn", false, null, 1, 0.0,
                        T0.plusSeconds(1950))));
                awaitSomeoneWaitingForAnEvseLock("the Started");
                assertThat(f.isDone()).as("the Started has to wait while the lock is held").isFalse();
                return f;
            });

            assertThat(get(started)).isEqualTo(EventOutcome.APPLIED);
            assertThat(tx("TX-NEW").startedAt()).isEqualTo(T0.plusSeconds(1950));
        }
    }

    @Test
    void a_flag_turned_off_while_the_sweeper_waits_for_the_EVSE_stops_the_reconciliation() {
        clock.set(T0.plusSeconds(1900));
        try (SimulatedCharger second = reconnectedWithOldTransactionReadyToClose()) {
            clock.set(T0.plusSeconds(1900 + 60));

            Future<Integer> sweep = inTransactionHoldingTheEvseLock(() -> {
                Future<Integer> f = background.submit(() -> reconciliation.sweep(STATION));
                awaitSomeoneWaitingForAnEvseLock("the sweeper");
                // The sweeper has already passed its flag check; the change becomes visible with the lock's release.
                stations.setFixEnabled(STATION, false, clock.instant());
                return f;
            });

            assertThat(get(sweep)).as("the sweeper reconciled nothing").isZero();
            Transaction old = tx(OLD);
            assertThat(old.state()).isEqualTo(TxState.CHARGING);
            assertThat(old.reconciliation().reconciledAt()).isNull();
            assertThat(old.reconciliation().reviewReason()).as("no decision at all, not even a flag").isNull();
            assertThat(counter("ocpp.transactions.reconciled")).isZero();

            // The skip was the flag, not the data: with the flag back on, the next sweep reconciles it.
            stations.setFixEnabled(STATION, true, clock.instant());
            assertThat(reconciliation.sweep(STATION)).isEqualTo(1);
        }
    }

    @Test
    void the_same_waiting_sweep_reconciles_when_the_flag_is_back_on_before_it_decides() {
        clock.set(T0.plusSeconds(1900));
        try (SimulatedCharger second = reconnectedWithOldTransactionReadyToClose()) {
            clock.set(T0.plusSeconds(1900 + 60));

            Future<Integer> sweep = inTransactionHoldingTheEvseLock(() -> {
                Future<Integer> f = background.submit(() -> reconciliation.sweep(STATION));
                awaitSomeoneWaitingForAnEvseLock("the sweeper");
                stations.setFixEnabled(STATION, false, clock.instant());
                stations.setFixEnabled(STATION, true, clock.instant());
                return f;
            });

            assertThat(get(sweep)).as("only the flag at the moment of the decision counts").isEqualTo(1);
            assertThat(tx(OLD).closeSource()).isEqualTo(CloseSource.RECONCILED);
        }
    }

    // ---- helpers ---------------------------------------------------------------------------------------------

    /** An open transaction on EVSE 1 that the policy would close if no newer one existed. */
    private SimulatedCharger reconnectedWithOldTransactionReadyToClose() {
        SimulatedCharger first = driver.newCharger(STATION);
        first.connect();
        send(first, OLD, TransactionEventType.Started, 0, T0, 0.0);
        send(first, OLD, TransactionEventType.Updated, 1, T0.plusSeconds(600), 5000.0);
        send(first, OLD, TransactionEventType.Updated, 2, T0.plusSeconds(1200), 5000.0);
        first.drop();
        first.close();
        SimulatedCharger second = driver.newCharger(STATION);
        second.statusAnswer(StatusAnswerSpec.NOTHING_PENDING);
        second.connect();
        awaitStatusAnswer(OLD);
        return second;
    }

    /**
     * Takes the EVSE lock of EVSE 1 in a database transaction of this thread, runs {@code whileHeld}, then commits,
     * which releases the lock. Returns what {@code whileHeld} returned.
     */
    private <T> T inTransactionHoldingTheEvseLock(Supplier<T> whileHeld) {
        return new TransactionTemplate(txManager).execute(status -> {
            evseStatus.lockEvse(STATION, 1);
            return whileHeld.get();
        });
    }

    private void insertNewerTransaction(String id) {
        jdbc.sql("""
                insert into transaction (station_id, transaction_id, evse_id, state, started_at,
                                         started_received_at, created_at)
                values (:s, :id, 1, 'CHARGING', :startedAt, :startedAt, :startedAt)
                """).param("s", STATION).param("id", id)
                .param("startedAt", java.sql.Timestamp.from(T0.plusSeconds(1950))).update();
    }

    /** PostgreSQL lists a session that is waiting for an advisory lock as an ungranted lock. */
    private void awaitSomeoneWaitingForAnEvseLock(String who) {
        long deadline = System.currentTimeMillis() + 10_000;
        while (jdbc.sql("select count(*) from pg_locks where locktype = 'advisory' and not granted")
                .query(Long.class).single() == 0) {
            if (System.currentTimeMillis() > deadline) {
                throw new AssertionError(who + " did not wait for the EVSE lock");
            }
            try {
                Thread.sleep(5);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException(e);
            }
        }
    }

    private static <T> T get(Future<T> future) {
        try {
            return future.get(10, TimeUnit.SECONDS);
        } catch (Exception e) {
            throw new AssertionError("background call did not finish", e);
        }
    }
}
