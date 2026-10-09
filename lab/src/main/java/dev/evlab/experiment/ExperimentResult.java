package dev.evlab.experiment;

import java.util.List;
import java.util.Map;

/** What the experiment computed. Every number here is read back from the backend after the run. */
public record ExperimentResult(
        int inputsVersion,
        long seed,
        String note,
        Map<String, Map<String, GroupMetrics>> windows,
        Map<String, Double> meters,
        List<LogExcerpt> gatewayLogs,
        List<Comparison> storyComparison) {

    public ExperimentResult withComparison(List<Comparison> comparison) {
        return new ExperimentResult(inputsVersion, seed, note, windows, meters, gatewayLogs, comparison);
    }

    /**
     * Metrics for one station group over one window, counting transactions that started in the window.
     *
     * @param stuck open, EVSE reports Available, nobody flagged
     * @param openFlaggedForReview open and flagged for a person; not counted as stuck
     * @param reconciliations transactions closed provisionally by the backend
     * @param lateEndedAppliedAfterProvisional real Ended applied to a provisionally closed transaction
     * @param falseClosures reconciliations done while the scripted charger was still delivering energy
     * @param duplicateCharges transactions that were charged more than once
     * @param carriedOverReconciled transactions from earlier windows that were reconciled during this one
     * @param carriedOverFlagged transactions from earlier windows that were flagged for review during this one
     */
    public record GroupMetrics(
            int stations,
            int sessions,
            int dropsNearUnplug,
            int dropsElsewhere,
            int stuck,
            int openFlaggedForReview,
            int reconciliations,
            int lateEndedAppliedAfterProvisional,
            int newerTransactionSkips,
            int falseClosures,
            int duplicateCharges,
            int invoicesProvisionalIssued,
            int invoicesStillProvisional,
            int invoicesConfirmedAfterProvisional,
            int invoicesAdjusted,
            Map<String, Integer> flaggedByReason,
            int carriedOverReconciled,
            int carriedOverFlagged) {}

    /** Lines are {@code [HH:MM:SS, actor, message]}, UTC. */
    public record LogExcerpt(String label, String title, String scenario, List<List<String>> lines) {}

    public record Comparison(String metric, Object expected, Object computed, boolean matches) {}
}
