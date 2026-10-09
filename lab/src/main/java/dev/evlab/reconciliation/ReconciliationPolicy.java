package dev.evlab.reconciliation;

import dev.evlab.transaction.ReviewReason;
import dev.evlab.transaction.StatusAnswer;
import dev.evlab.transaction.Transaction;
import java.time.Duration;
import java.time.Instant;

/**
 * Decides what to do with one open transaction after its station reconnected. Pure function of the
 * transaction, the time and one fact about the EVSE; the caller performs the decision.
 *
 * <p>The policy closes a session on the backend's own authority only when every positive sign of "stopped" is
 * present and every sign of "maybe not" is absent. Anything unclear goes to a person. It cannot see energy it
 * was not told about, so a closure is a judgement on the data held, not proof.
 */
public final class ReconciliationPolicy {

    /**
     * Thresholds. Each one trades a missed automatic closure (a person looks) against a wrong one.
     *
     * @param grace wait this long after the charger answered GetTransactionStatus before treating the Ended as
     *     lost. A charger that reconnected usually replays its queue within seconds; a minute covers a slow
     *     replay without leaving idle fees running for long. Default 60 s.
     * @param maxQueueWait how long to wait for a charger that says it has queued messages. Long enough for a
     *     large offline backlog to drain over a slow link, short enough that a charger which never delivers is
     *     flagged within the shift. Default 15 min.
     * @param epsilonWh two energy readings closer than this are "the same". Meters report in Wh or finer and
     *     round, so a strict equality test would call a wobble of a fraction of a Wh "moving". Default 1 Wh.
     * @param minSampleSpacing the last two samples must be at least this far apart for flat energy to mean
     *     anything. With epsilon at 1 Wh, a flat reading over 60 s means an average power under about 60 W,
     *     while the lowest charging current most EVs accept (about 6 A, roughly 1.4 kW single-phase) would add
     *     over 20 Wh in that time. Two equal samples a few seconds apart show nothing: a meter that updates
     *     slowly repeats its value. Default 60 s.
     * @param maxMeterAge the last sample must be no older than this at decision time. A flat reading from long
     *     ago says nothing about what the session did since; it only tells us we have been blind for that long.
     *     Chargers typically sample every few minutes, so 30 minutes is several missed samples. Default 30 min.
     * @param maxClockSkew how far ahead of the backend's clock the last sample may be and still count as recent.
     *     Charger and backend clocks are never exactly equal, so a sample a few seconds "in the future" is normal;
     *     one further ahead than this has a timestamp we cannot use to judge its age, and goes to a person.
     *     Default 2 min.
     */
    public record Settings(Duration grace, Duration maxQueueWait, double epsilonWh, Duration minSampleSpacing,
            Duration maxMeterAge, Duration maxClockSkew) {

        public static Settings defaults() {
            return new Settings(Duration.ofSeconds(60), Duration.ofMinutes(15), 1.0, Duration.ofSeconds(60),
                    Duration.ofMinutes(30), Duration.ofMinutes(2));
        }
    }

    public sealed interface Decision {
        /** Nothing to do yet. */
        record Wait(String why) implements Decision {}

        /** Leave the transaction open and ask a person to look. */
        record Flag(ReviewReason reason) implements Decision {}

        /** The Ended is lost: close at the transaction's own last meter value and timestamp. */
        record Reconcile(Instant stopAt, double energyWh, String reason) implements Decision {}
    }

    private final Settings settings;

    public ReconciliationPolicy(Settings settings) {
        this.settings = settings;
    }

    public Decision decide(Transaction tx, Instant now, boolean newerTransactionOnEvse) {
        if (!tx.isOpen()) {
            return new Decision.Wait("transaction is not open");
        }
        Instant reconnectedAt = tx.reconciliation().reconnectedAt();
        if (reconnectedAt == null) {
            return new Decision.Wait("station has not reconnected since the transaction opened");
        }
        // A newer transaction on the same EVSE means the picture is more complicated than "Ended lost".
        if (newerTransactionOnEvse) {
            return new Decision.Flag(ReviewReason.NEWER_TRANSACTION);
        }
        StatusAnswer answer = tx.reconciliation().answer();
        if (answer == null) {
            return elapsed(reconnectedAt, now).compareTo(settings.grace()) < 0
                    ? new Decision.Wait("GetTransactionStatus not answered yet")
                    : new Decision.Flag(ReviewReason.NO_STATUS_ANSWER);
        }
        if (Boolean.TRUE.equals(answer.ongoingIndicator())) {
            // A running transaction can have events the charger has not delivered yet, so ongoing with
            // messagesInQueue is valid. While the charger says it is running the transaction is active: nothing
            // to close and nothing for a person to do. The answer is a snapshot; the next reconnect asks again.
            return new Decision.Wait("charger reports the transaction ongoing");
        }
        if (answer.messagesInQueue()) {
            return elapsed(answer.answeredAt(), now).compareTo(settings.maxQueueWait()) < 0
                    ? new Decision.Wait("charger has queued messages")
                    : new Decision.Flag(ReviewReason.QUEUE_NOT_DELIVERED);
        }
        if (elapsed(answer.answeredAt(), now).compareTo(settings.grace()) < 0) {
            return new Decision.Wait("inside the grace period for the Ended to arrive");
        }
        if (answer.ongoingIndicator() == null) {
            // Optional in OCPP 2.0.1. Silence is not "false": only an explicit false allows reconciliation.
            return new Decision.Flag(ReviewReason.ONGOING_NOT_REPORTED);
        }
        if (!tx.startReceived()) {
            // Without the Started there is no first seqNo to count from, so we cannot tell that nothing is missing.
            return new Decision.Flag(ReviewReason.STARTED_NOT_RECEIVED);
        }
        if (tx.hasSequenceGap()) {
            // A missing event may be the one that shows energy still moving, or the Ended itself.
            return new Decision.Flag(ReviewReason.SEQUENCE_GAP);
        }
        if (tx.meter().samples() < 2) {
            // With one sample we cannot tell flat from moving, so we do not guess.
            return new Decision.Flag(ReviewReason.INSUFFICIENT_METER_SAMPLES);
        }
        if (tx.meter().energyMoving(settings.epsilonWh())) {
            return new Decision.Flag(ReviewReason.ENERGY_STILL_INCREASING);
        }
        Duration spacing = tx.meter().spacing();
        if (spacing == null || spacing.compareTo(settings.minSampleSpacing()) < 0) {
            return new Decision.Flag(ReviewReason.SAMPLES_TOO_CLOSE);
        }
        Duration age = elapsed(tx.meter().lastAt(), now);
        if (age.compareTo(settings.maxMeterAge()) > 0) {
            return new Decision.Flag(ReviewReason.METER_STALE);
        }
        if (age.negated().compareTo(settings.maxClockSkew()) > 0) {
            return new Decision.Flag(ReviewReason.METER_IN_FUTURE);
        }
        return new Decision.Reconcile(
                tx.meter().lastAt(),
                tx.meter().lastWh(),
                "Ended not received: none within " + settings.grace().toSeconds()
                        + "s of GetTransactionStatus (ongoingIndicator=false, messagesInQueue=false); energy flat "
                        + "over the last two meter samples, " + spacing.toSeconds() + "s apart");
    }

    private static Duration elapsed(Instant from, Instant to) {
        return Duration.between(from, to);
    }
}
