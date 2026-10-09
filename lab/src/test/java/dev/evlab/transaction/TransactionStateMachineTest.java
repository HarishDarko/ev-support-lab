package dev.evlab.transaction;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import dev.evlab.ocpp.messages.TransactionEventType;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

/** The state machine and billing transitions, without Spring or a database. */
class TransactionStateMachineTest {

    private static final Instant T0 = Instant.parse("2026-03-02T10:00:00Z");
    private static final Billing BILLING = new Billing(Tariff.DEFAULT, 1.0);

    private static TxEvent event(TransactionEventType type, int seq, int atSec, Double wh) {
        Instant at = T0.plusSeconds(atSec);
        return new TxEvent("TX-1", seq, type, at, "MeterValuePeriodic", false,
                type == TransactionEventType.Ended ? "Local" : null, 1, wh, wh == null ? null : at);
    }

    private static Transaction open() {
        return Transaction.open("TX-1", "CP-1", 1);
    }

    @Test
    void started_updated_ended_walks_the_transaction_to_ended() {
        Transaction t = open()
                .apply(event(TransactionEventType.Started, 0, 0, 0.0))
                .apply(event(TransactionEventType.Updated, 1, 60, 500.0))
                .apply(event(TransactionEventType.Ended, 2, 120, 900.0));

        assertThat(t.state()).isEqualTo(TxState.ENDED);
        assertThat(t.closeSource()).isEqualTo(CloseSource.REAL);
        assertThat(t.startedAt()).isEqualTo(T0);
        assertThat(t.stoppedAt()).isEqualTo(T0.plusSeconds(120));
        assertThat(t.stopReason()).isEqualTo("Local");
        assertThat(t.meter().lastWh()).isEqualTo(900.0);
        assertThat(t.meter().previousWh()).isEqualTo(500.0);
        assertThat(t.lastSeqNo()).isEqualTo(2);
    }

    @Test
    void events_after_the_Ended_do_not_change_the_outcome() {
        Transaction ended = open()
                .apply(event(TransactionEventType.Started, 0, 0, 0.0))
                .apply(event(TransactionEventType.Ended, 1, 60, 700.0));

        Transaction after = ended.apply(event(TransactionEventType.Updated, 2, 90, 9999.0));

        assertThat(after.stoppedAt()).isEqualTo(ended.stoppedAt());
        assertThat(after.meter()).isEqualTo(ended.meter());
        assertThat(after.lastSeqNo()).isEqualTo(2);
    }

    @Test
    void the_communication_lost_trigger_is_remembered() {
        Transaction t = open().apply(new TxEvent("TX-1", 3, TransactionEventType.Updated, T0.plusSeconds(30),
                TxEvent.EV_COMMUNICATION_LOST, false, null, 1, null, null));

        assertThat(t.commLostAt()).isEqualTo(T0.plusSeconds(30));
        assertThat(t.isOpen()).isTrue();
    }

    @Test
    void replay_sorts_by_seqNo_whatever_the_arrival_order() {
        List<TxEvent> arrival = List.of(
                event(TransactionEventType.Ended, 3, 300, 5000.0),
                event(TransactionEventType.Updated, 2, 200, 4000.0),
                event(TransactionEventType.Updated, 1, 100, 1000.0),
                event(TransactionEventType.Started, 0, 0, 0.0));

        Transaction t = Transaction.replay("TX-1", "CP-1", 1, arrival);

        assertThat(t.state()).isEqualTo(TxState.ENDED);
        assertThat(t.startedAt()).isEqualTo(T0);
        assertThat(t.meter().samples()).isEqualTo(4);
        assertThat(t.meter().previousWh()).isEqualTo(4000.0);
        assertThat(t.meter().lastWh()).isEqualTo(5000.0);
        assertThat(t.firstMissingSeqNo()).isNull();
    }

    @Test
    void a_charger_clock_moved_backwards_still_replays_started_updated_ended_in_seqNo_order() {
        // The charger's clock was corrected 10 minutes back after the Started: the later events carry earlier
        // timestamps. Ordered by timestamp, the Ended would be applied first and the Started dropped.
        List<TxEvent> events = List.of(
                event(TransactionEventType.Ended, 2, 100, 5000.0),
                event(TransactionEventType.Updated, 1, 50, 2000.0),
                event(TransactionEventType.Started, 0, 600, 0.0));

        Transaction t = Transaction.replay("TX-1", "CP-1", 1, events);

        assertThat(t.startedAt()).isEqualTo(T0.plusSeconds(600));
        assertThat(t.stoppedAt()).isEqualTo(T0.plusSeconds(100));
        assertThat(t.state()).isEqualTo(TxState.ENDED);
        assertThat(t.meter().samples()).isEqualTo(3);
        assertThat(t.meter().previousWh()).isEqualTo(2000.0);
        assertThat(t.meter().lastWh()).isEqualTo(5000.0);
        assertThat(t.hasSequenceGap()).isFalse();
    }

    @Test
    void replay_reports_the_first_seqNo_that_is_missing_after_the_Started() {
        TxEvent started = event(TransactionEventType.Started, 0, 0, 0.0);
        TxEvent u1 = event(TransactionEventType.Updated, 1, 60, 100.0);
        TxEvent u2 = event(TransactionEventType.Updated, 2, 120, 200.0);
        TxEvent u4 = event(TransactionEventType.Updated, 4, 240, 400.0);

        assertThat(Transaction.replay("TX-1", "CP-1", 1, List.of(started, u1, u2)).firstMissingSeqNo()).isNull();
        assertThat(Transaction.replay("TX-1", "CP-1", 1, List.of(started, u1, u4)).firstMissingSeqNo()).isEqualTo(2);
        assertThat(Transaction.replay("TX-1", "CP-1", 1, List.of(u4, u1, started)).firstMissingSeqNo()).isEqualTo(2);
    }

    @Test
    void a_Started_that_does_not_carry_seqNo_zero_is_not_a_gap() {
        // One counter that only ever increases is allowed: this transaction simply starts at 57.
        Transaction t = Transaction.replay("TX-1", "CP-1", 1, List.of(
                event(TransactionEventType.Started, 57, 0, 0.0),
                event(TransactionEventType.Updated, 58, 60, 100.0),
                event(TransactionEventType.Updated, 59, 120, 200.0)));

        assertThat(t.firstMissingSeqNo()).isNull();
        assertThat(t.hasSequenceGap()).isFalse();
        assertThat(t.sequenceIncompleteReason()).isNull();
    }

    @Test
    void a_real_gap_after_a_Started_that_does_not_carry_seqNo_zero_is_found() {
        Transaction t = Transaction.replay("TX-1", "CP-1", 1, List.of(
                event(TransactionEventType.Started, 57, 0, 0.0),
                event(TransactionEventType.Updated, 58, 60, 100.0),
                event(TransactionEventType.Updated, 60, 180, 300.0)));

        assertThat(t.firstMissingSeqNo()).isEqualTo(59);
        assertThat(t.sequenceIncompleteReason()).contains("59");
    }

    @Test
    void events_numbered_below_the_Started_are_not_counted_as_part_of_the_sequence() {
        Transaction t = Transaction.replay("TX-1", "CP-1", 1, List.of(
                event(TransactionEventType.Updated, 3, 10, 50.0),
                event(TransactionEventType.Started, 5, 20, 0.0),
                event(TransactionEventType.Updated, 6, 60, 100.0)));

        assertThat(t.firstMissingSeqNo()).isNull();
    }

    @Test
    void without_a_Started_the_start_of_the_sequence_is_unknown_so_the_transaction_counts_as_incomplete() {
        // We cannot tell whether 1 is the first event or the 40th, so no gap is reported but nothing is vouched for.
        Transaction t = Transaction.replay("TX-1", "CP-1", 1, List.of(
                event(TransactionEventType.Updated, 1, 60, 100.0),
                event(TransactionEventType.Updated, 2, 120, 200.0)));

        assertThat(t.firstMissingSeqNo()).isNull();
        assertThat(t.startReceived()).isFalse();
        assertThat(t.sequenceIncompleteReason()).contains("Started not received");
    }

    @Test
    void an_open_transaction_closes_provisionally_at_its_last_meter_sample() {
        Transaction t = open()
                .apply(event(TransactionEventType.Started, 0, 0, 0.0))
                .apply(event(TransactionEventType.Updated, 1, 60, 2000.0))
                .apply(event(TransactionEventType.Updated, 2, 120, 2000.0));

        Transaction closed = t.reconciled(T0.plusSeconds(500), "lost", BILLING);

        assertThat(closed.state()).isEqualTo(TxState.ENDED);
        assertThat(closed.closeSource()).isEqualTo(CloseSource.RECONCILED);
        assertThat(closed.stoppedAt()).isEqualTo(T0.plusSeconds(120));
        assertThat(closed.stopReason()).isEqualTo(Transaction.PROVISIONAL_STOP_REASON);
        assertThat(closed.reconciliation().reconciledAt()).isEqualTo(T0.plusSeconds(500));
        assertThat(closed.invoice()).isEqualTo(new Invoice(InvoiceStatus.PROVISIONAL, 2000.0, 90, 1, true, "lost"));
    }

    @Test
    void a_closed_transaction_cannot_be_reconciled_again() {
        Transaction ended = open().apply(event(TransactionEventType.Ended, 1, 60, 100.0));

        assertThatThrownBy(() -> ended.reconciled(T0, "again", BILLING)).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void a_real_Ended_after_a_provisional_close_replaces_the_values_and_adjusts_the_invoice() {
        List<TxEvent> events = List.of(
                event(TransactionEventType.Started, 0, 0, 0.0),
                event(TransactionEventType.Updated, 1, 60, 2000.0),
                event(TransactionEventType.Updated, 2, 120, 2000.0));
        Transaction stored = Transaction.replay("TX-1", "CP-1", 1, events)
                .reconciled(T0.plusSeconds(300), "lost", BILLING);

        List<TxEvent> withEnded = new java.util.ArrayList<>(events);
        withEnded.add(event(TransactionEventType.Ended, 3, 130, 2400.0));
        Transaction rebased = stored.rebase(Transaction.replay("TX-1", "CP-1", 1, withEnded), BILLING);

        assertThat(rebased.closeSource()).isEqualTo(CloseSource.REAL);
        assertThat(rebased.stoppedAt()).isEqualTo(T0.plusSeconds(130));
        assertThat(rebased.stopReason()).isEqualTo("Local");
        assertThat(rebased.reconciliation().reconciledAt()).isEqualTo(T0.plusSeconds(300));
        assertThat(rebased.invoice().status()).isEqualTo(InvoiceStatus.ADJUSTED);
        assertThat(rebased.invoice().energyWh()).isEqualTo(2400.0);
        assertThat(rebased.invoice().chargesIssued()).isEqualTo(1);
    }

    @Test
    void a_real_Ended_with_the_same_energy_confirms_the_provisional_invoice() {
        Transaction stored = open()
                .apply(event(TransactionEventType.Started, 0, 0, 0.0))
                .apply(event(TransactionEventType.Updated, 1, 60, 2000.0))
                .reconciled(T0.plusSeconds(300), "lost", BILLING);
        Transaction replayed = Transaction.replay("TX-1", "CP-1", 1, List.of(
                event(TransactionEventType.Started, 0, 0, 0.0),
                event(TransactionEventType.Updated, 1, 60, 2000.0),
                event(TransactionEventType.Ended, 2, 70, 2000.0)));

        Transaction rebased = stored.rebase(replayed, BILLING);

        assertThat(rebased.invoice().status()).isEqualTo(InvoiceStatus.CONFIRMED);
        assertThat(rebased.invoice().chargesIssued()).isEqualTo(1);
    }

    @Test
    void further_events_for_a_provisionally_closed_transaction_keep_the_provisional_close() {
        Transaction stored = open()
                .apply(event(TransactionEventType.Started, 0, 0, 0.0))
                .apply(event(TransactionEventType.Updated, 1, 60, 2000.0))
                .reconciled(T0.plusSeconds(300), "lost", BILLING);
        Transaction replayed = Transaction.replay("TX-1", "CP-1", 1, List.of(
                event(TransactionEventType.Started, 0, 0, 0.0),
                event(TransactionEventType.Updated, 1, 60, 2000.0),
                event(TransactionEventType.Updated, 2, 90, 2100.0)));

        Transaction rebased = stored.rebase(replayed, BILLING);

        assertThat(rebased.closeSource()).isEqualTo(CloseSource.RECONCILED);
        assertThat(rebased.invoice()).isEqualTo(stored.invoice());
        assertThat(rebased.lastSeqNo()).isEqualTo(2);
    }

    @Test
    void a_second_real_Ended_never_changes_a_settled_invoice() {
        Invoice settled = new Invoice(InvoiceStatus.CONFIRMED, 1000.0, 45, 1, false, null);

        assertThat(BILLING.onRealEnd(settled, 1000.0, null)).isEqualTo(settled);
    }

    @Test
    void an_Ended_without_a_meter_value_gives_a_provisional_invoice_not_a_confirmed_one_at_zero() {
        Transaction replayed = Transaction.replay("TX-1", "CP-1", 1, List.of(
                event(TransactionEventType.Started, 0, 0, null),
                event(TransactionEventType.Ended, 1, 60, null)));

        Transaction stored = open().rebase(replayed, BILLING);

        assertThat(stored.state()).isEqualTo(TxState.ENDED);
        assertThat(stored.invoice().status()).isEqualTo(InvoiceStatus.PROVISIONAL);
        assertThat(stored.invoice().needsReview()).isTrue();
        assertThat(stored.invoice().note()).contains("no meter value");
        assertThat(stored.invoice().energyWh()).isZero();
        assertThat(stored.invoice().chargesIssued()).isEqualTo(1);
    }

    @Test
    void an_Ended_without_a_meter_value_does_not_confirm_an_earlier_reading() {
        Transaction replayed = Transaction.replay("TX-1", "CP-1", 1, List.of(
                event(TransactionEventType.Started, 0, 0, 0.0),
                event(TransactionEventType.Updated, 1, 30, 2000.0),
                event(TransactionEventType.Ended, 2, 60, null)));

        Transaction stored = open().rebase(replayed, BILLING);

        assertThat(stored.invoice().status()).isEqualTo(InvoiceStatus.PROVISIONAL);
        assertThat(stored.invoice().energyWh()).isEqualTo(2000.0);
        assertThat(stored.invoice().needsReview()).isTrue();
    }

    @Test
    void an_Ended_applied_while_a_seqNo_is_missing_gives_a_provisional_invoice_until_the_gap_is_filled() {
        Transaction stored = open().rebase(Transaction.replay("TX-1", "CP-1", 1, List.of(
                event(TransactionEventType.Started, 0, 0, 0.0),
                event(TransactionEventType.Ended, 2, 300, 5000.0))), BILLING);

        assertThat(stored.state()).isEqualTo(TxState.ENDED);
        assertThat(stored.invoice().status()).isEqualTo(InvoiceStatus.PROVISIONAL);
        assertThat(stored.invoice().needsReview()).isTrue();
        assertThat(stored.invoice().note()).contains("seqNo 1 not received");
        assertThat(stored.invoice().chargesIssued()).isEqualTo(1);

        Transaction filled = stored.rebase(Transaction.replay("TX-1", "CP-1", 1, List.of(
                event(TransactionEventType.Started, 0, 0, 0.0),
                event(TransactionEventType.Updated, 1, 100, 2000.0),
                event(TransactionEventType.Ended, 2, 300, 5000.0))), BILLING);

        assertThat(filled.invoice().status()).isEqualTo(InvoiceStatus.CONFIRMED);
        assertThat(filled.invoice().needsReview()).isFalse();
        assertThat(filled.invoice().chargesIssued()).isEqualTo(1);
    }

    @Test
    void an_Ended_of_a_transaction_that_starts_at_a_non_zero_seqNo_is_confirmed_when_nothing_is_missing() {
        Transaction stored = open().rebase(Transaction.replay("TX-1", "CP-1", 1, List.of(
                event(TransactionEventType.Started, 57, 0, 0.0),
                event(TransactionEventType.Updated, 58, 100, 2000.0),
                event(TransactionEventType.Ended, 59, 300, 5000.0))), BILLING);

        assertThat(stored.invoice().status()).isEqualTo(InvoiceStatus.CONFIRMED);
        assertThat(stored.invoice().needsReview()).isFalse();
    }

    @Test
    void an_Ended_without_a_Started_gives_a_provisional_invoice() {
        Transaction stored = open().rebase(Transaction.replay("TX-1", "CP-1", 1, List.of(
                event(TransactionEventType.Updated, 1, 100, 2000.0),
                event(TransactionEventType.Ended, 2, 300, 5000.0))), BILLING);

        assertThat(stored.invoice().status()).isEqualTo(InvoiceStatus.PROVISIONAL);
        assertThat(stored.invoice().note()).contains("Started not received");
    }

    @Test
    void the_invoice_note_gives_every_reason_the_final_reading_is_not_trusted() {
        Transaction stored = open().rebase(Transaction.replay("TX-1", "CP-1", 1, List.of(
                event(TransactionEventType.Started, 0, 0, 0.0),
                event(TransactionEventType.Ended, 2, 300, null))), BILLING);

        assertThat(stored.invoice().note()).contains("no meter value").contains("seqNo 1 not received");
    }

    @Test
    void a_replay_that_changes_a_confirmed_transaction_flags_billing_and_never_re_bills() {
        Transaction confirmed = open().rebase(Transaction.replay("TX-1", "CP-1", 1, List.of(
                event(TransactionEventType.Started, 0, 0, 0.0),
                event(TransactionEventType.Updated, 1, 100, 2000.0),
                event(TransactionEventType.Ended, 2, 300, 5000.0))), BILLING);
        assertThat(confirmed.invoice().status()).isEqualTo(InvoiceStatus.CONFIRMED);
        assertThat(confirmed.invoice().needsReview()).isFalse();

        // Defence in depth: a replay that disagrees with a settled invoice. A complete sequence cannot produce
        // this from the wire (the only way to a lower Ended was a gap, and a gap is never CONFIRMED).
        Transaction replayed = Transaction.replay("TX-1", "CP-1", 1, List.of(
                event(TransactionEventType.Started, 0, 0, 0.0),
                event(TransactionEventType.Ended, 1, 200, 4000.0),
                event(TransactionEventType.Ended, 2, 300, 5000.0)));
        Transaction after = confirmed.rebase(replayed, BILLING);

        assertThat(after.stoppedAt()).isEqualTo(T0.plusSeconds(200)); // the facts follow the replay ...
        assertThat(after.invoice().status()).isEqualTo(InvoiceStatus.CONFIRMED); // ... the charge does not
        assertThat(after.invoice().energyWh()).isEqualTo(5000.0);
        assertThat(after.invoice().amountCents()).isEqualTo(confirmed.invoice().amountCents());
        assertThat(after.invoice().chargesIssued()).isEqualTo(1);
        assertThat(after.invoice().needsReview()).isTrue();
        assertThat(after.invoice().note()).contains("4000.0 Wh").contains("5000.0 Wh");
    }

    @Test
    void a_replay_that_gives_the_same_energy_leaves_a_confirmed_invoice_unflagged() {
        Transaction confirmed = open().rebase(Transaction.replay("TX-1", "CP-1", 1, List.of(
                event(TransactionEventType.Started, 0, 0, 0.0),
                event(TransactionEventType.Updated, 1, 100, 2000.0),
                event(TransactionEventType.Ended, 2, 300, 5000.0))), BILLING);

        Transaction after = confirmed.rebase(Transaction.replay("TX-1", "CP-1", 1, List.of(
                event(TransactionEventType.Started, 0, 0, 0.0),
                event(TransactionEventType.Updated, 1, 100, 2000.0),
                event(TransactionEventType.Ended, 2, 300, 5000.0))), BILLING);

        assertThat(after.invoice()).isEqualTo(confirmed.invoice());
    }

    @Test
    void the_meter_trail_reports_moving_energy_only_with_two_samples_that_differ() {
        MeterTrail one = MeterTrail.EMPTY.with(100, T0);
        MeterTrail flat = one.with(100.4, T0.plusSeconds(60));
        MeterTrail moving = one.with(150, T0.plusSeconds(60));

        assertThat(one.energyMoving(1.0)).isFalse();
        assertThat(flat.energyMoving(1.0)).isFalse();
        assertThat(moving.energyMoving(1.0)).isTrue();
        assertThat(one.spacing()).isNull();
        assertThat(flat.spacing()).isEqualTo(java.time.Duration.ofSeconds(60));
    }
}
