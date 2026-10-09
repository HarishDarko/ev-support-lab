package dev.evlab.transaction;

import static org.assertj.core.api.Assertions.assertThat;

import dev.evlab.ocpp.messages.TransactionEventType;
import dev.evlab.simulator.ScenarioParams;
import dev.evlab.simulator.Scenarios;
import dev.evlab.simulator.SimulatedCharger;
import dev.evlab.simulator.StatusAnswerSpec;
import dev.evlab.support.AbstractLabIT;
import java.time.Instant;
import java.util.function.Consumer;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.TestPropertySource;

/** Edge cases of the fix. The flag is forced on so these do not depend on how the suite is invoked. */
@TestPropertySource(properties = "lab.fix.enabled=true")
class ReconciliationEdgeCasesTest extends AbstractLabIT {

    private static final Instant T0 = Instant.parse("2026-03-02T10:00:00Z");

    // ---- sessions that may still be delivering ---------------------------------------------------------------

    @Test
    void a_session_whose_charger_reports_it_ongoing_is_left_alone_until_its_own_Ended() {
        Played p = play(Scenarios.STILL_DELIVERING, new ScenarioParams(null, null, null, null, null, null, null,
                true, null));

        Transaction t = tx(p.id());
        assertThat(t.closeSource()).isEqualTo(CloseSource.REAL); // it ended by itself, minutes later
        assertThat(t.reconciliation().reconciledAt()).isNull();
        assertThat(t.reconciliation().reviewReason()).as("ongoing is not a reason to ask a person").isNull();
        assertThat(counter("ocpp.transactions.reconciled")).isZero();
    }

    @Test
    void an_ongoing_session_with_queued_messages_stays_open_and_unflagged_however_long_it_waits() {
        String id = "TX-ONGOING";
        clock.set(T0.plusSeconds(1900));
        // Flat energy and nothing else wrong: with ongoingIndicator=false this session would be reconciled.
        try (SimulatedCharger second = reconnectAfter(id, new StatusAnswerSpec(true, true), first -> {
            send(first, id, TransactionEventType.Started, 0, T0, 0.0);
            send(first, id, TransactionEventType.Updated, 1, T0.plusSeconds(600), 5000.0);
            send(first, id, TransactionEventType.Updated, 2, T0.plusSeconds(1200), 5000.0);
        })) {
            clock.set(T0.plusSeconds(1900 + 60));
            reconciliation.sweep(STATION);
            assertThat(tx(id).state()).isEqualTo(TxState.CHARGING);
            assertThat(tx(id).reconciliation().reviewReason()).isNull();

            // Past the 15 minute queue wait, which would have flagged it had it not been ongoing.
            clock.set(T0.plusSeconds(1900 + 60 + 20 * 60));
            reconciliation.sweep(STATION);
            Transaction t = tx(id);
            assertThat(t.state()).isEqualTo(TxState.CHARGING);
            assertThat(t.reconciliation().reconciledAt()).isNull();
            assertThat(t.reconciliation().reviewReason()).isNull();
            assertThat(counter("ocpp.transactions.reconciled")).isZero();
            assertThat(counter("ocpp.transactions.flagged", "reason", "queue_not_delivered")).isZero();
        }
    }

    @Test
    void rising_energy_keeps_a_session_open_even_when_the_charger_answers_ongoing_false() {
        Played p = play(Scenarios.STILL_DELIVERING, new ScenarioParams(null, null, null, null, null, null, null,
                false, null));

        Transaction t = tx(p.id());
        assertThat(t.reconciliation().reconciledAt()).isNull();
        assertThat(t.reconciliation().reviewReason()).isEqualTo(ReviewReason.ENERGY_STILL_INCREASING);
        assertThat(t.closeSource()).isEqualTo(CloseSource.REAL);
        assertThat(counter("ocpp.transactions.reconciled")).isZero();
    }

    @Test
    void an_omitted_ongoing_indicator_is_not_read_as_false() {
        // ongoingIndicator is optional in OCPP 2.0.1. Without an explicit false the session goes to a person.
        Played p = play(Scenarios.STILL_DELIVERING);

        Transaction t = tx(p.id());
        assertThat(t.reconciliation().answer().ongoingIndicator()).isNull();
        assertThat(t.reconciliation().reconciledAt()).isNull();
        assertThat(t.reconciliation().reviewReason()).isEqualTo(ReviewReason.ONGOING_NOT_REPORTED);
        assertThat(counter("ocpp.transactions.reconciled")).isZero();
    }

    @Test
    void two_equal_samples_taken_seconds_apart_do_not_allow_reconciliation() {
        // A lost Ended, a charger that says nothing is pending, energy flat over the last two samples, but the
        // samples are 5 s apart: that proves nothing about the session having stopped.
        Played p = play(Scenarios.LOST_ENDED, new ScenarioParams(null, 5, null, null, null, null, null, null, null));

        Transaction t = tx(p.id());
        assertThat(t.state()).isEqualTo(TxState.CHARGING);
        assertThat(t.reconciliation().reconciledAt()).isNull();
        assertThat(t.reconciliation().reviewReason()).isEqualTo(ReviewReason.SAMPLES_TOO_CLOSE);
        assertThat(t.invoice().status()).isEqualTo(InvoiceStatus.NONE);
        assertThat(counter("ocpp.transactions.reconciled")).isZero();
    }

    @Test
    void a_newer_transaction_on_the_same_evse_is_skipped_and_flagged() {
        Played p = play(Scenarios.NEWER_TRANSACTION);

        Transaction old = tx(p.id());
        assertThat(old.state()).isEqualTo(TxState.CHARGING);
        assertThat(old.reconciliation().reconciledAt()).isNull();
        assertThat(old.reconciliation().reviewReason()).isEqualTo(ReviewReason.NEWER_TRANSACTION);
        assertThat(old.invoice().status()).isEqualTo(InvoiceStatus.NONE);

        Transaction newer = tx(p.secondId());
        assertThat(newer.closeSource()).isEqualTo(CloseSource.REAL);
        assertThat(newer.invoice().status()).isEqualTo(InvoiceStatus.CONFIRMED);
        assertThat(counter("ocpp.transactions.flagged", "reason", "newer_transaction")).isEqualTo(1.0);
    }

    @Test
    void a_charger_clock_stepped_back_between_two_transactions_does_not_hide_the_newer_one() {
        String old = "TX-BEFORE-STEP";
        String newer = "TX-AFTER-STEP";
        clock.set(T0.plusSeconds(1900));
        try (SimulatedCharger second = reconnectAfter(old, StatusAnswerSpec.NOTHING_PENDING, first -> {
            send(first, old, TransactionEventType.Started, 0, T0, 0.0);
            send(first, old, TransactionEventType.Updated, 1, T0.plusSeconds(600), 5000.0);
            send(first, old, TransactionEventType.Updated, 2, T0.plusSeconds(1200), 5000.0);
        })) {
            // The charger's clock is corrected two hours back, then it starts the next transaction on the same EVSE.
            // That Started arrives later but carries an earlier timestamp than the old one.
            clock.set(T0.plusSeconds(1900 + 30));
            send(second, newer, TransactionEventType.Started, 0, T0.minusSeconds(7200), 0.0);
            clock.set(T0.plusSeconds(1900 + 60));

            assertThat(tx(newer).startedAt()).isBefore(tx(old).startedAt());
            assertThat(reconciliation.sweep(STATION)).isZero();
            Transaction skipped = tx(old);
            assertThat(skipped.state()).isEqualTo(TxState.CHARGING);
            assertThat(skipped.reconciliation().reconciledAt()).isNull();
            assertThat(skipped.reconciliation().reviewReason()).isEqualTo(ReviewReason.NEWER_TRANSACTION);
            assertThat(counter("ocpp.transactions.flagged", "reason", "newer_transaction")).isEqualTo(1.0);
            assertThat(counter("ocpp.transactions.reconciled")).isZero();
        }
    }

    // ---- duplicates, queues, late Ended ----------------------------------------------------------------------

    @Test
    void a_duplicate_ended_is_applied_once_and_charged_once() {
        Played p = play(Scenarios.DUPLICATE_ENDED);

        Transaction t = tx(p.id());
        assertThat(t.closeSource()).isEqualTo(CloseSource.REAL);
        assertThat(t.invoice().status()).isEqualTo(InvoiceStatus.CONFIRMED);
        assertThat(t.invoice().chargesIssued()).isEqualTo(1);
        assertThat(counter("ocpp.events.duplicate")).isEqualTo(1.0);
        long endedRows = jdbc.sql("select count(*) from transaction_event where transaction_id = :id "
                + "and event_type = 'Ended'").param("id", p.id()).query(Long.class).single();
        assertThat(endedRows).isEqualTo(1);
    }

    @Test
    void queued_messages_make_the_backend_wait_and_the_Ended_then_closes_the_session() {
        Played p = play(Scenarios.QUEUED_MESSAGES);

        // The Ended arrives five minutes after Available, long after the 60 s grace period.
        Transaction t = tx(p.id());
        assertThat(t.closeSource()).isEqualTo(CloseSource.REAL);
        assertThat(t.invoice().status()).isEqualTo(InvoiceStatus.CONFIRMED);
        assertThat(t.reconciliation().reconciledAt()).isNull();
        assertThat(t.reconciliation().answer().messagesInQueue()).isTrue();
        assertThat(counter("ocpp.transactions.reconciled")).isZero();
        assertThat(counter("ocpp.ended.late.applied", "after", "evse_available")).isEqualTo(1.0);
    }

    @Test
    void a_late_Ended_after_a_provisional_close_adjusts_the_invoice_once_and_never_charges_twice() {
        Played p = play(Scenarios.VERY_LATE_ENDED, new ScenarioParams(null, null, null, null, null, null, 400.0,
                null, null));

        Transaction t = tx(p.id());
        assertThat(t.closeSource()).isEqualTo(CloseSource.REAL);
        assertThat(t.stopReason()).isEqualTo("EVDisconnected");
        assertThat(t.stoppedAt()).isEqualTo(p.anchor().plusSeconds(8));
        assertThat(t.reconciliation().reconciledAt()).as("it was reconciled first").isNotNull();
        assertThat(t.invoice().status()).isEqualTo(InvoiceStatus.ADJUSTED);
        assertThat(t.invoice().energyWh()).isEqualTo(18820.0);
        assertThat(t.invoice().amountCents()).isEqualTo(847); // 18.82 kWh at 45 c
        assertThat(t.invoice().chargesIssued()).isEqualTo(1);
        assertThat(counter("ocpp.transactions.reconciled")).isEqualTo(1.0);
        assertThat(counter("ocpp.ended.late.applied", "after", "provisional_close")).isEqualTo(1.0);
    }

    @Test
    void a_late_Ended_with_the_same_energy_confirms_the_provisional_invoice() {
        Played p = play(Scenarios.VERY_LATE_ENDED);

        Transaction t = tx(p.id());
        assertThat(t.invoice().status()).isEqualTo(InvoiceStatus.CONFIRMED);
        assertThat(t.invoice().chargesIssued()).isEqualTo(1);
    }

    // ---- ordering and sequence gaps --------------------------------------------------------------------------

    @Test
    void events_are_applied_by_seqNo_not_by_arrival_order() {
        clock.set(T0.plusSeconds(600));
        String id = "TX-ORDER";
        try (SimulatedCharger charger = driver.newCharger(STATION)) {
            charger.connect();
            // Arrival order: Ended (3), Updated (1), Updated (2), Started (0).
            send(charger, id, TransactionEventType.Ended, 3, T0.plusSeconds(300), 5000.0);
            send(charger, id, TransactionEventType.Updated, 1, T0.plusSeconds(100), 2000.0);
            send(charger, id, TransactionEventType.Updated, 2, T0.plusSeconds(200), 4000.0);
            send(charger, id, TransactionEventType.Started, 0, T0, 0.0);
        }

        Transaction t = tx(id);
        assertThat(t.state()).isEqualTo(TxState.ENDED);
        assertThat(t.startedAt()).isEqualTo(T0);
        assertThat(t.stoppedAt()).isEqualTo(T0.plusSeconds(300));
        assertThat(t.meter().samples()).isEqualTo(4);
        assertThat(t.meter().previousWh()).isEqualTo(4000.0);
        assertThat(t.meter().lastWh()).isEqualTo(5000.0);
        assertThat(t.lastSeqNo()).isEqualTo(3);
        assertThat(t.firstMissingSeqNo()).isNull();
        assertThat(t.invoice().status()).isEqualTo(InvoiceStatus.CONFIRMED);
        assertThat(t.invoice().energyWh()).isEqualTo(5000.0);
        assertThat(t.invoice().needsReview()).isFalse();
    }

    @Test
    void a_charger_clock_moved_backwards_still_gives_started_updated_ended_in_seqNo_order() {
        clock.set(T0.plusSeconds(3600));
        String id = "TX-CLOCK";
        try (SimulatedCharger charger = driver.newCharger(STATION)) {
            charger.connect();
            // The charger's clock is corrected 8 minutes back after the Started: seq 1 and 2 carry earlier
            // timestamps than seq 0. Ordered by timestamp the Ended would come first and the Started be lost.
            send(charger, id, TransactionEventType.Started, 0, T0.plusSeconds(600), 0.0);
            send(charger, id, TransactionEventType.Updated, 1, T0.plusSeconds(120), 2000.0);
            send(charger, id, TransactionEventType.Ended, 2, T0.plusSeconds(300), 5000.0);
        }

        Transaction t = tx(id);
        assertThat(t.state()).isEqualTo(TxState.ENDED);
        assertThat(t.startedAt()).isEqualTo(T0.plusSeconds(600));
        assertThat(t.stoppedAt()).isEqualTo(T0.plusSeconds(300));
        assertThat(t.meter().samples()).isEqualTo(3);
        assertThat(t.meter().previousWh()).isEqualTo(2000.0);
        assertThat(t.meter().lastWh()).isEqualTo(5000.0);
        assertThat(t.invoice().status()).isEqualTo(InvoiceStatus.CONFIRMED);
    }

    @Test
    void a_sequence_gap_blocks_reconciliation_and_flags_the_transaction_until_the_gap_is_filled() {
        String id = "TX-GAP";
        clock.set(T0.plusSeconds(1900));
        SimulatedCharger first = driver.newCharger(STATION);
        first.connect();
        // seqNo 2 is lost on the way. The last two samples that did arrive are flat and 20 minutes apart.
        send(first, id, TransactionEventType.Started, 0, T0, 0.0);
        send(first, id, TransactionEventType.Updated, 1, T0.plusSeconds(600), 5000.0);
        send(first, id, TransactionEventType.Updated, 3, T0.plusSeconds(1800), 5000.0);
        first.drop();
        first.close();

        try (SimulatedCharger second = driver.newCharger(STATION)) {
            second.connect();
            awaitStatusAnswer(id);
            clock.set(T0.plusSeconds(1900 + 60));
            reconciliation.sweep(STATION);

            Transaction flagged = tx(id);
            assertThat(flagged.firstMissingSeqNo()).isEqualTo(2);
            assertThat(flagged.state()).isEqualTo(TxState.CHARGING);
            assertThat(flagged.reconciliation().reconciledAt()).isNull();
            assertThat(flagged.reconciliation().reviewReason()).isEqualTo(ReviewReason.SEQUENCE_GAP);
            assertThat(counter("ocpp.transactions.reconciled")).isZero();

            // The missing event arrives. With the gap closed the policy reconciles.
            send(second, id, TransactionEventType.Updated, 2, T0.plusSeconds(1200), 5000.0);
            reconciliation.sweep(STATION);

            Transaction reconciled = tx(id);
            assertThat(reconciled.firstMissingSeqNo()).isNull();
            assertThat(reconciled.closeSource()).isEqualTo(CloseSource.RECONCILED);
            assertThat(counter("ocpp.transactions.reconciled")).isEqualTo(1.0);
        }
    }

    @Test
    void a_charger_that_keeps_one_counter_across_transactions_is_not_flagged_for_a_gap() {
        String id = "TX-COUNTER";
        clock.set(T0.plusSeconds(1900));
        // OCPP 2.0.1 does not require a transaction to start at 0: this one starts at 57.
        try (SimulatedCharger second = reconnectAfter(id, StatusAnswerSpec.NOTHING_PENDING, first -> {
            send(first, id, TransactionEventType.Started, 57, T0, 0.0);
            send(first, id, TransactionEventType.Updated, 58, T0.plusSeconds(600), 5000.0);
            send(first, id, TransactionEventType.Updated, 59, T0.plusSeconds(1200), 5000.0);
        })) {
            clock.set(T0.plusSeconds(1900 + 60));
            reconciliation.sweep(STATION);

            Transaction t = tx(id);
            assertThat(t.firstMissingSeqNo()).isNull();
            assertThat(t.reconciliation().reviewReason()).isNull();
            assertThat(t.closeSource()).isEqualTo(CloseSource.RECONCILED);
        }
    }

    @Test
    void a_real_gap_after_a_Started_that_does_not_carry_seqNo_zero_blocks_reconciliation_until_filled() {
        String id = "TX-COUNTER-GAP";
        clock.set(T0.plusSeconds(1900));
        try (SimulatedCharger second = reconnectAfter(id, StatusAnswerSpec.NOTHING_PENDING, first -> {
            send(first, id, TransactionEventType.Started, 57, T0, 0.0);
            send(first, id, TransactionEventType.Updated, 58, T0.plusSeconds(600), 5000.0);
            send(first, id, TransactionEventType.Updated, 60, T0.plusSeconds(1800), 5000.0);
        })) {
            clock.set(T0.plusSeconds(1900 + 60));
            reconciliation.sweep(STATION);

            Transaction flagged = tx(id);
            assertThat(flagged.firstMissingSeqNo()).isEqualTo(59);
            assertThat(flagged.state()).isEqualTo(TxState.CHARGING);
            assertThat(flagged.reconciliation().reviewReason()).isEqualTo(ReviewReason.SEQUENCE_GAP);

            send(second, id, TransactionEventType.Updated, 59, T0.plusSeconds(1200), 5000.0);
            reconciliation.sweep(STATION);

            assertThat(tx(id).firstMissingSeqNo()).isNull();
            assertThat(tx(id).closeSource()).isEqualTo(CloseSource.RECONCILED);
        }
    }

    @Test
    void a_transaction_whose_Started_never_arrived_goes_to_a_person_instead_of_being_closed() {
        String id = "TX-NO-START";
        clock.set(T0.plusSeconds(1900));
        // Flat, recent, spaced samples, nothing pending: everything but the Started says "stopped".
        try (SimulatedCharger second = reconnectAfter(id, StatusAnswerSpec.NOTHING_PENDING, first -> {
            send(first, id, TransactionEventType.Updated, 1, T0.plusSeconds(600), 5000.0);
            send(first, id, TransactionEventType.Updated, 2, T0.plusSeconds(1200), 5000.0);
        })) {
            clock.set(T0.plusSeconds(1900 + 60));
            reconciliation.sweep(STATION);

            Transaction t = tx(id);
            assertThat(t.state()).isEqualTo(TxState.CHARGING);
            assertThat(t.reconciliation().reconciledAt()).isNull();
            assertThat(t.reconciliation().reviewReason()).isEqualTo(ReviewReason.STARTED_NOT_RECEIVED);
            assertThat(counter("ocpp.transactions.reconciled")).isZero();
        }
    }

    // ---- the per-station flag --------------------------------------------------------------------------------

    @Test
    void the_sweeper_skips_a_station_whose_flag_is_off_even_with_an_open_transaction_past_the_grace_period() {
        String id = "TX-FLAG";
        clock.set(T0.plusSeconds(1900));
        try (SimulatedCharger second = reconnectAfter(id, StatusAnswerSpec.NOTHING_PENDING, first -> {
            send(first, id, TransactionEventType.Started, 0, T0, 0.0);
            send(first, id, TransactionEventType.Updated, 1, T0.plusSeconds(600), 5000.0);
            send(first, id, TransactionEventType.Updated, 2, T0.plusSeconds(1200), 5000.0);
        })) {
            // The station reconnected with the flag on, so the transaction is a candidate. Then the flag goes off.
            stations.setFixEnabled(STATION, false, clock.instant());
            clock.set(T0.plusSeconds(1900 + 3 * 60));

            assertThat(reconciliation.sweep(STATION)).isZero();
            assertThat(reconciliation.sweep()).isZero();
            Transaction untouched = tx(id);
            assertThat(untouched.state()).isEqualTo(TxState.CHARGING);
            assertThat(untouched.reconciliation().reconciledAt()).isNull();
            assertThat(untouched.reconciliation().reviewReason()).isNull();
            assertThat(counter("ocpp.transactions.reconciled")).isZero();

            // The same transaction is reconciled as soon as the flag is back on: the skip was the flag, not the data.
            stations.setFixEnabled(STATION, true, clock.instant());
            assertThat(reconciliation.sweep(STATION)).isEqualTo(1);
            assertThat(tx(id).closeSource()).isEqualTo(CloseSource.RECONCILED);
        }
    }

    // ---- identity --------------------------------------------------------------------------------------------

    @Test
    void two_stations_can_use_the_same_transactionId_and_seqNo_without_touching_each_other() {
        clock.set(T0.plusSeconds(600));
        String id = "1"; // OCPP transactionIds are only unique per station; small counters collide in practice
        try (SimulatedCharger a = driver.newCharger("CP-A-01"); SimulatedCharger b = driver.newCharger("CP-B-01")) {
            a.connect();
            b.connect();
            send(a, id, TransactionEventType.Started, 0, T0, 0.0);
            send(b, id, TransactionEventType.Started, 0, T0.plusSeconds(10), 0.0);
            send(a, id, TransactionEventType.Updated, 1, T0.plusSeconds(100), 1000.0);
            send(b, id, TransactionEventType.Updated, 1, T0.plusSeconds(110), 2500.0);
            send(a, id, TransactionEventType.Ended, 2, T0.plusSeconds(200), 3000.0);
            send(b, id, TransactionEventType.Ended, 2, T0.plusSeconds(210), 7000.0);
        }

        Transaction a = tx("CP-A-01", id);
        Transaction b = tx("CP-B-01", id);
        assertThat(a.startedAt()).isEqualTo(T0);
        assertThat(b.startedAt()).isEqualTo(T0.plusSeconds(10));
        assertThat(a.invoice().energyWh()).isEqualTo(3000.0);
        assertThat(b.invoice().energyWh()).isEqualTo(7000.0);
        assertThat(a.invoice().chargesIssued()).isEqualTo(1);
        assertThat(b.invoice().chargesIssued()).isEqualTo(1);
        assertThat(counter("ocpp.events.duplicate")).as("no event is dropped as a duplicate").isZero();
        long events = jdbc.sql("select count(*) from transaction_event where transaction_id = :id")
                .param("id", id).query(Long.class).single();
        assertThat(events).isEqualTo(6);
    }

    // ---- billing ---------------------------------------------------------------------------------------------

    @Test
    void an_Ended_without_a_meter_value_gives_a_provisional_invoice_for_review() {
        clock.set(T0.plusSeconds(600));
        String id = "TX-NOMETER";
        try (SimulatedCharger charger = driver.newCharger(STATION)) {
            charger.connect();
            send(charger, id, TransactionEventType.Started, 0, T0, 0.0);
            send(charger, id, TransactionEventType.Updated, 1, T0.plusSeconds(100), 2000.0);
            send(charger, id, TransactionEventType.Ended, 2, T0.plusSeconds(200), null);
        }

        Transaction t = tx(id);
        assertThat(t.closeSource()).isEqualTo(CloseSource.REAL);
        assertThat(t.invoice().status()).isEqualTo(InvoiceStatus.PROVISIONAL);
        assertThat(t.invoice().needsReview()).isTrue();
        assertThat(t.invoice().note()).contains("no meter value");
        assertThat(t.invoice().chargesIssued()).isEqualTo(1);
    }

    @Test
    void an_Ended_with_a_seqNo_missing_gives_a_provisional_invoice_until_the_gap_is_filled() {
        clock.set(T0.plusSeconds(600));
        String id = "TX-BILL-GAP";
        try (SimulatedCharger charger = driver.newCharger(STATION)) {
            charger.connect();
            send(charger, id, TransactionEventType.Started, 0, T0, 0.0);
            send(charger, id, TransactionEventType.Ended, 2, T0.plusSeconds(300), 5000.0);

            Transaction ended = tx(id);
            assertThat(ended.closeSource()).isEqualTo(CloseSource.REAL);
            assertThat(ended.firstMissingSeqNo()).isEqualTo(1);
            assertThat(ended.invoice().status()).isEqualTo(InvoiceStatus.PROVISIONAL);
            assertThat(ended.invoice().needsReview()).isTrue();
            assertThat(ended.invoice().note()).contains("seqNo 1 not received");
            assertThat(ended.invoice().chargesIssued()).isEqualTo(1);

            send(charger, id, TransactionEventType.Updated, 1, T0.plusSeconds(100), 2000.0);
        }

        Transaction t = tx(id);
        assertThat(t.firstMissingSeqNo()).isNull();
        assertThat(t.invoice().status()).isEqualTo(InvoiceStatus.CONFIRMED);
        assertThat(t.invoice().needsReview()).isFalse();
        assertThat(t.invoice().energyWh()).isEqualTo(5000.0);
        assertThat(t.invoice().chargesIssued()).isEqualTo(1);
    }

    @Test
    void a_gap_filled_by_a_different_Ended_adjusts_the_provisional_invoice_and_does_not_charge_again() {
        clock.set(T0.plusSeconds(600));
        String id = "TX-BILL-ADJUST";
        try (SimulatedCharger charger = driver.newCharger(STATION)) {
            charger.connect();
            send(charger, id, TransactionEventType.Started, 0, T0, 0.0);
            send(charger, id, TransactionEventType.Ended, 2, T0.plusSeconds(300), 5000.0);
            assertThat(tx(id).invoice().status()).isEqualTo(InvoiceStatus.PROVISIONAL);

            // The missing event turns out to be an earlier Ended. In seqNo order it closes the transaction.
            send(charger, id, TransactionEventType.Ended, 1, T0.plusSeconds(200), 4000.0);
        }

        Transaction t = tx(id);
        assertThat(t.stoppedAt()).isEqualTo(T0.plusSeconds(200));
        assertThat(t.invoice().status()).isEqualTo(InvoiceStatus.ADJUSTED);
        assertThat(t.invoice().energyWh()).isEqualTo(4000.0);
        assertThat(t.invoice().amountCents()).isEqualTo(180);
        assertThat(t.invoice().chargesIssued()).isEqualTo(1);
        assertThat(t.invoice().needsReview()).isFalse();
    }

    // ---- helpers ---------------------------------------------------------------------------------------------

    /**
     * A charger runs {@code firstSession} on one websocket, loses it, and reconnects with the given answer to
     * GetTransactionStatus. Returns the second connection once the backend has recorded that answer.
     */
    private SimulatedCharger reconnectAfter(String id, StatusAnswerSpec answer, Consumer<SimulatedCharger> firstSession) {
        SimulatedCharger first = driver.newCharger(STATION);
        first.connect();
        firstSession.accept(first);
        first.drop();
        first.close();
        SimulatedCharger second = driver.newCharger(STATION);
        second.statusAnswer(answer);
        second.connect();
        awaitStatusAnswer(id);
        return second;
    }
}
