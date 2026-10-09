package dev.evlab.experiment;

import static org.assertj.core.api.Assertions.assertThat;

import dev.evlab.experiment.ExperimentResult.LogExcerpt;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/**
 * Runs the whole experiment with the committed inputs against a throw-away PostgreSQL. Takes about two minutes:
 * roughly 9,000 sessions go through a real websocket and a real database.
 */
class ExperimentStoryTest {

    private static ExperimentResult result;

    @BeforeAll
    static void runExperiment() {
        result = new ExperimentRunner(ExperimentInputs.load(null), null).run();
    }

    @Test
    void the_committed_inputs_produce_the_story_values() {
        Map<String, Integer> v = ExperimentRunner.storyValues(result);
        assertThat(v).containsEntry("canaryStuckBefore", 5)
                .containsEntry("canaryStuckAfter", 0)
                .containsEntry("controlStuckBefore", 4)
                .containsEntry("controlStuckAfter", 4)
                .containsEntry("reconciliations", 5)
                .containsEntry("lateEndedAppliedOnce", 3)
                .containsEntry("newerTransactionSkips", 1)
                .containsEntry("falseClosures", 0)
                .containsEntry("duplicateCharges", 0)
                .containsEntry("invoicesAdjusted", 1)
                .containsEntry("canarySessionsAfter", 2140);

        // The story says 5 drops near an unplug in the canary "after" window. The scripted inputs contain 6:
        // 5 that get reconciled plus the newer-transaction case, which also drops within 90 s of its unplug.
        assertThat(v).containsEntry("canaryDropsBefore", 6)
                .containsEntry("canaryDropsAfter", 6)
                .containsEntry("controlDropsBefore", 5)
                .containsEntry("controlDropsAfter", 6);

        // The policy flagged two canary sessions for a person: a newer transaction on the EVSE, and a charger
        // that omitted ongoingIndicator while its energy was rising (the indicator is checked before the meter
        // rule). A charger that answered ongoingIndicator=true used to be flagged too; an ongoing session is now
        // simply left alone, so it is not in this list. It still ended by its own Ended, as before.
        assertThat(result.windows().get("after").get("canary").flaggedByReason())
                .containsOnlyKeys("NEWER_TRANSACTION", "ONGOING_NOT_REPORTED")
                .containsEntry("NEWER_TRANSACTION", 1)
                .containsEntry("ONGOING_NOT_REPORTED", 1);

        // The control group does not get the fix, so it does not reconcile or flag anything.
        assertThat(result.windows().get("after").get("control").reconciliations()).isZero();
        assertThat(result.windows().get("after").get("control").openFlaggedForReview()).isZero();
    }

    @Test
    void the_gateway_excerpts_come_from_real_traffic_in_the_support_desk_format() {
        List<LogExcerpt> logs = result.gatewayLogs();
        assertThat(logs).extracting(LogExcerpt::scenario).containsExactly("lost-ended", "lost-ended", "late-ended");
        for (LogExcerpt log : logs) {
            assertThat(log.lines()).isNotEmpty().allSatisfy(l -> {
                assertThat(l.get(0)).matches("[0-9]{2}:[0-9]{2}:[0-9]{2}");
                assertThat(l.get(1)).isNotBlank();
            });
        }
        List<String> late = logs.get(2).lines().stream().map(l -> l.get(2)).toList();
        assertThat(late).anyMatch(m -> m.contains("ignored: connector already Available (out of order)"));
        assertThat(logs.get(0).lines().getLast().get(2)).contains("idle fee accruing");
        assertThat(logs.get(1).lines().getLast().get(2)).contains("'In use'");
    }
}
