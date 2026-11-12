package dev.shoplab.experiment;

import java.util.List;
import java.util.Map;

/** What the experiment computed. Every number is read from the database after the run. */
public record ExperimentResult(Map<String, Map<String, Group>> windows, List<Log> logs, List<Comparison> storyComparison,
        Map<String, Object> settings) {

    /**
     * One group of stores (canary or control) in one window.
     *
     * @param checkouts checkouts (one order each)
     * @param slowFirstAnswer checkouts whose first answer came after the 8 s timeout
     * @param retriedWithNewKey orders with a timed-out attempt that were retried with a different idempotency key
     * @param secondAuthorization orders with two or more successful authorizations
     * @param stuck orders held in Payment pending by an extra authorization on a captured order
     * @param bothCaptured orders captured twice (the customer is charged twice)
     * @param doubleChargedPence what the second captures took, in pence
     * @param heldOther orders held in Payment pending for another reason (a webhook that never came)
     * @param confirmed orders confirmed
     * @param newCardAfterDecline orders whose first card declined and whose new card authorized once and confirmed
     * @param lookups payments looked up by key after a timeout (the fix)
     * @param detectorHits orders the support detector would flag: in Payment pending with authorizations from two
     *     or more keys within 60 s
     */
    public record Group(int stores, int checkouts, int slowFirstAnswer, int retriedWithNewKey,
            int secondAuthorization, int stuck, int bothCaptured, int doubleChargedPence, int heldOther,
            int confirmed, int newCardAfterDecline, int lookups, int detectorHits) {}

    public record Log(String title, List<List<String>> lines) {}

    public record Comparison(String metric, int expected, int computed, boolean matches) {}
}
