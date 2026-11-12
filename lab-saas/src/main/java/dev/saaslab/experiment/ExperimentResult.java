package dev.saaslab.experiment;

import java.util.List;
import java.util.Map;

/** What the experiment computed. Every number is read from the database or the scripted parties after the run. */
public record ExperimentResult(Map<String, Map<String, Group>> windows, List<Log> logs, List<Comparison> storyComparison,
        Map<String, Object> settings) {

    /**
     * One group (canary or control) in one window.
     *
     * @param events events the hourly job created
     * @param tokenRequests token requests sent to the customers' identity providers
     * @param storms endpoint-minutes with more token requests than the storm threshold
     * @param pauses endpoint pauses
     * @param realOutagePauses pauses whose last counted failure was an HTTP 5xx from the endpoint itself
     * @param failedAttempts attempts that failed and counted toward a pause
     * @param waited attempts that waited for Retry-After instead of failing
     * @param replayed events that failed and were delivered later by a replay (RB-14)
     * @param lost events still failed at the end of the window
     * @param deliveredTwice events the endpoint received more than once
     */
    public record Group(int endpoints, int events, int tokenRequests, int storms, int pauses, int realOutagePauses,
            int failedAttempts, int waited, int replayed, int lost, long deliveredTwice) {}

    public record Log(String title, List<List<String>> lines) {}

    public record Comparison(String metric, int expected, int computed, boolean matches) {}
}
