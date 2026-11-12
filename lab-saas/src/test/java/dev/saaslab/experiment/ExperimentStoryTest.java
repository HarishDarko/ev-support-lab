package dev.saaslab.experiment;

import static org.assertj.core.api.Assertions.assertThat;

import dev.saaslab.experiment.ExperimentResult.Comparison;
import dev.saaslab.experiment.ExperimentResult.Group;
import org.junit.jupiter.api.Test;

/**
 * The experiment, run with the committed inputs, yields the story values (inputs.json, expectedStory) that the
 * support desk shows. It starts its own PostgreSQL (Docker) and takes a few minutes.
 */
class ExperimentStoryTest {

    @Test
    void theCommittedInputsYieldTheStoryValues() throws Exception {
        ExperimentInputs inputs = ExperimentInputs.load(null);
        ExperimentResult result = new ExperimentRunner(inputs, null).run();

        assertThat(result.storyComparison()).hasSize(inputs.expectedStory().size());
        assertThat(result.storyComparison()).allSatisfy(c -> assertThat(c.computed())
                .as(c.metric()).isEqualTo(c.expected()));
        assertThat(result.storyComparison()).allMatch(Comparison::matches);

        Group canaryBefore = result.windows().get("before").get("canary");
        Group canaryAfter = result.windows().get("after").get("canary");
        Group controlAfter = result.windows().get("after").get("control");
        // The shape of the story, independent of the exact numbers.
        assertThat(canaryBefore.storms()).isPositive();
        assertThat(canaryAfter.storms()).isZero();
        assertThat(canaryAfter.pauses()).isEqualTo(canaryAfter.realOutagePauses());
        assertThat(controlAfter.storms()).isPositive();
        assertThat(canaryAfter.deliveredTwice()).isZero();
        assertThat(result.logs()).extracting(ExperimentResult.Log::title)
                .anySatisfy(t -> assertThat(t).contains("T-3004"))
                .anySatisfy(t -> assertThat(t).contains("T-3024"))
                .anySatisfy(t -> assertThat(t).contains("H-3111"));
    }
}
