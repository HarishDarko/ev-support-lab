package dev.evlab.reconciliation;

import static org.assertj.core.api.Assertions.assertThat;

import dev.evlab.reconciliation.ReconciliationPolicy.Decision;
import dev.evlab.transaction.MeterTrail;
import dev.evlab.transaction.ReviewReason;
import dev.evlab.transaction.StatusAnswer;
import dev.evlab.transaction.Transaction;
import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.Test;

/** The reconciliation rules as a pure function. No Spring, no database, no websocket. */
class ReconciliationPolicyTest {

    private static final Instant RECONNECT = Instant.parse("2026-03-02T22:00:00Z");
    private static final Instant SAMPLE_AT = Instant.parse("2026-03-02T21:40:00Z");
    private static final ReconciliationPolicy POLICY = new ReconciliationPolicy(
            new ReconciliationPolicy.Settings(Duration.ofSeconds(60), Duration.ofMinutes(15), 1.0,
                    Duration.ofSeconds(60), Duration.ofMinutes(30), Duration.ofMinutes(2)));

    /** Open transaction, started long ago, reconnected at RECONNECT, answered at RECONNECT with the given answer. */
    private static Transaction tx(MeterTrail meter, StatusAnswer answer) {
        Transaction t = Transaction.open("TX-1", "CP-1", 1).copy().meter(meter)
                .startedAt(SAMPLE_AT.minusSeconds(3600)).build();
        t = t.withReconciliation(t.reconciliation().reconnectedAt(RECONNECT));
        return answer == null ? t : t.withReconciliation(t.reconciliation().answered(answer));
    }

    /** Two equal samples, ten minutes apart, the last one 20 minutes before the reconnect. */
    private static MeterTrail flat() {
        return new MeterTrail(3, 18420, SAMPLE_AT.minusSeconds(600), 18420, SAMPLE_AT);
    }

    private static MeterTrail flatEndingAt(Instant lastAt) {
        return new MeterTrail(3, 18420, lastAt.minusSeconds(600), 18420, lastAt);
    }

    private static MeterTrail flatWithSpacing(long seconds) {
        return new MeterTrail(3, 18420, SAMPLE_AT.minusSeconds(seconds), 18420, SAMPLE_AT);
    }

    private static StatusAnswer nothingPending() {
        return new StatusAnswer(RECONNECT, false, false);
    }

    private static Instant after(long seconds) {
        return RECONNECT.plusSeconds(seconds);
    }

    @Test
    void reconciles_at_the_last_meter_value_once_the_grace_period_has_passed() {
        Decision d = POLICY.decide(tx(flat(), nothingPending()), after(60), false);

        assertThat(d).isInstanceOfSatisfying(Decision.Reconcile.class, r -> {
            assertThat(r.stopAt()).isEqualTo(SAMPLE_AT);
            assertThat(r.energyWh()).isEqualTo(18420);
            assertThat(r.reason()).contains("Ended not received");
        });
    }

    @Test
    void waits_inside_the_grace_period() {
        assertThat(POLICY.decide(tx(flat(), nothingPending()), after(59), false)).isInstanceOf(Decision.Wait.class);
    }

    @Test
    void waits_while_the_charger_has_queued_messages() {
        Transaction t = tx(flat(), new StatusAnswer(RECONNECT, true, false));

        assertThat(POLICY.decide(t, after(600), false)).isInstanceOf(Decision.Wait.class);
    }

    @Test
    void waits_for_queued_messages_when_the_ongoing_indicator_is_omitted() {
        Transaction t = tx(flat(), new StatusAnswer(RECONNECT, true, null));

        assertThat(POLICY.decide(t, after(600), false)).isInstanceOf(Decision.Wait.class);
    }

    @Test
    void flags_queued_messages_that_never_arrive() {
        Transaction t = tx(flat(), new StatusAnswer(RECONNECT, true, false));

        assertThat(POLICY.decide(t, after(15 * 60), false)).isEqualTo(new Decision.Flag(ReviewReason.QUEUE_NOT_DELIVERED));
    }

    @Test
    void ongoing_with_queued_messages_is_valid_and_is_neither_flagged_nor_reconciled() {
        Transaction t = tx(flat(), new StatusAnswer(RECONNECT, true, true));

        // An active transaction can have undelivered events. Not at once, not after the 15 minute queue wait.
        assertThat(POLICY.decide(t, after(0), false)).isInstanceOf(Decision.Wait.class);
        assertThat(POLICY.decide(t, after(15 * 60), false)).isInstanceOf(Decision.Wait.class);
        assertThat(POLICY.decide(t, after(24 * 3600), false)).isInstanceOf(Decision.Wait.class);
    }

    @Test
    void stays_out_of_the_way_while_the_charger_says_the_transaction_is_ongoing() {
        Transaction t = tx(flat(), new StatusAnswer(RECONNECT, false, true));

        assertThat(POLICY.decide(t, after(3600), false)).isEqualTo(new Decision.Wait("charger reports the transaction ongoing"));
    }

    @Test
    void does_not_reconcile_when_energy_was_still_increasing_in_the_last_two_samples() {
        MeterTrail moving = new MeterTrail(3, 18000, SAMPLE_AT.minusSeconds(600), 18420, SAMPLE_AT);

        assertThat(POLICY.decide(tx(moving, nothingPending()), after(60), false))
                .isEqualTo(new Decision.Flag(ReviewReason.ENERGY_STILL_INCREASING));
    }

    @Test
    void an_omitted_ongoing_indicator_goes_to_a_person_after_the_grace_period() {
        Transaction t = tx(flat(), new StatusAnswer(RECONNECT, false, null));

        assertThat(POLICY.decide(t, after(30), false)).isInstanceOf(Decision.Wait.class);
        assertThat(POLICY.decide(t, after(60), false)).isEqualTo(new Decision.Flag(ReviewReason.ONGOING_NOT_REPORTED));
    }

    @Test
    void does_not_guess_from_a_single_meter_sample() {
        MeterTrail single = new MeterTrail(1, 0, null, 18420, SAMPLE_AT);

        assertThat(POLICY.decide(tx(single, nothingPending()), after(60), false))
                .isEqualTo(new Decision.Flag(ReviewReason.INSUFFICIENT_METER_SAMPLES));
    }

    @Test
    void two_equal_samples_taken_seconds_apart_do_not_allow_reconciliation() {
        assertThat(POLICY.decide(tx(flatWithSpacing(5), nothingPending()), after(60), false))
                .isEqualTo(new Decision.Flag(ReviewReason.SAMPLES_TOO_CLOSE));
    }

    @Test
    void the_samples_must_be_at_least_the_minimum_spacing_apart() {
        assertThat(POLICY.decide(tx(flatWithSpacing(59), nothingPending()), after(60), false))
                .isEqualTo(new Decision.Flag(ReviewReason.SAMPLES_TOO_CLOSE));
        assertThat(POLICY.decide(tx(flatWithSpacing(60), nothingPending()), after(60), false))
                .isInstanceOf(Decision.Reconcile.class);
    }

    @Test
    void samples_out_of_time_order_because_the_charger_clock_stepped_back_do_not_count_as_spaced() {
        MeterTrail stepped = new MeterTrail(3, 18420, SAMPLE_AT.plusSeconds(300), 18420, SAMPLE_AT);

        assertThat(POLICY.decide(tx(stepped, nothingPending()), after(60), false))
                .isEqualTo(new Decision.Flag(ReviewReason.SAMPLES_TOO_CLOSE));
    }

    @Test
    void a_stale_last_sample_goes_to_a_person() {
        // The sample is 20 minutes old at the reconnect; the limit is 30 minutes.
        assertThat(POLICY.decide(tx(flat(), nothingPending()), after(600), false)).isInstanceOf(Decision.Reconcile.class);
        assertThat(POLICY.decide(tx(flat(), nothingPending()), after(601), false))
                .isEqualTo(new Decision.Flag(ReviewReason.METER_STALE));
    }

    @Test
    void a_last_sample_exactly_at_the_age_limit_is_still_fresh() {
        // Exactly at the limit is still fresh.
        MeterTrail atLimit = flatEndingAt(after(60).minus(Duration.ofMinutes(30)));
        MeterTrail pastLimit = flatEndingAt(after(60).minus(Duration.ofMinutes(30)).minusSeconds(1));

        assertThat(POLICY.decide(tx(atLimit, nothingPending()), after(60), false)).isInstanceOf(Decision.Reconcile.class);
        assertThat(POLICY.decide(tx(pastLimit, nothingPending()), after(60), false))
                .isEqualTo(new Decision.Flag(ReviewReason.METER_STALE));
    }

    @Test
    void a_last_sample_dated_in_the_future_goes_to_a_person() {
        Instant now = after(60);

        // Up to the clock-skew allowance (2 minutes) a charger that runs a little fast is normal ...
        assertThat(POLICY.decide(tx(flatEndingAt(now.plusSeconds(120)), nothingPending()), now, false))
                .isInstanceOf(Decision.Reconcile.class);
        // ... beyond it the sample's age cannot be trusted, however flat the energy is.
        assertThat(POLICY.decide(tx(flatEndingAt(now.plusSeconds(121)), nothingPending()), now, false))
                .isEqualTo(new Decision.Flag(ReviewReason.METER_IN_FUTURE));
        assertThat(POLICY.decide(tx(flatEndingAt(now.plus(Duration.ofDays(30))), nothingPending()), now, false))
                .isEqualTo(new Decision.Flag(ReviewReason.METER_IN_FUTURE));
    }

    @Test
    void a_sequence_gap_blocks_reconciliation_whatever_the_meter_says() {
        Transaction gap = tx(flat(), nothingPending()).copy().firstMissingSeqNo(2).build();

        assertThat(POLICY.decide(gap, after(60), false)).isEqualTo(new Decision.Flag(ReviewReason.SEQUENCE_GAP));
    }

    @Test
    void a_transaction_whose_Started_never_arrived_goes_to_a_person() {
        // With no Started there is no first seqNo to count from, so completeness cannot be shown.
        Transaction noStart = tx(flat(), nothingPending()).copy().startedAt(null).build();

        assertThat(POLICY.decide(noStart, after(60), false))
                .isEqualTo(new Decision.Flag(ReviewReason.STARTED_NOT_RECEIVED));
    }

    @Test
    void leaves_the_old_transaction_alone_when_a_newer_one_started_on_the_same_evse() {
        // Even inside the grace period: the picture is not "Ended lost" any more.
        assertThat(POLICY.decide(tx(flat(), nothingPending()), after(5), true))
                .isEqualTo(new Decision.Flag(ReviewReason.NEWER_TRANSACTION));
    }

    @Test
    void flags_a_charger_that_never_answers_GetTransactionStatus() {
        Transaction unanswered = tx(flat(), null);

        assertThat(POLICY.decide(unanswered, after(30), false)).isInstanceOf(Decision.Wait.class);
        assertThat(POLICY.decide(unanswered, after(60), false)).isEqualTo(new Decision.Flag(ReviewReason.NO_STATUS_ANSWER));
    }

    @Test
    void does_nothing_for_a_transaction_whose_station_has_not_reconnected() {
        Transaction t = Transaction.open("TX-1", "CP-1", 1).copy().meter(flat()).build();

        assertThat(POLICY.decide(t, after(3600), false)).isInstanceOf(Decision.Wait.class);
    }

    @Test
    void a_small_wobble_in_the_meter_is_not_movement() {
        MeterTrail wobble = new MeterTrail(3, 18420.0, SAMPLE_AT.minusSeconds(600), 18420.6, SAMPLE_AT);

        assertThat(POLICY.decide(tx(wobble, nothingPending()), after(60), false)).isInstanceOf(Decision.Reconcile.class);
    }
}
