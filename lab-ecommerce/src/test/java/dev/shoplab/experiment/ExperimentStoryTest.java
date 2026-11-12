package dev.shoplab.experiment;

import static org.assertj.core.api.Assertions.assertThat;

import dev.shoplab.experiment.ExperimentResult.Comparison;
import dev.shoplab.experiment.ExperimentResult.Group;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

/**
 * The experiment, run with the committed inputs, yields the story values (inputs.json, expectedStory) that the
 * support desk shows, and exactly the committed experiment.json. It starts its own PostgreSQL (Docker) and takes a
 * few minutes.
 */
class ExperimentStoryTest {

    @Test
    void theCommittedInputsYieldTheStoryValuesAndTheCommittedOutput() throws Exception {
        ExperimentInputs inputs = ExperimentInputs.load(null);
        ExperimentResult result = new ExperimentRunner(inputs, null).run();
        String computed = ExperimentInputs.MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(result)
                .replace("\r\n", "\n") + "\n";
        // Kept for a look when the story changes; CI prints it when the job fails.
        Files.createDirectories(Path.of("build"));
        Files.writeString(Path.of("build/experiment-computed.json"), computed);

        assertThat(result.storyComparison()).hasSize(inputs.expectedStory().size());
        assertThat(result.storyComparison()).allSatisfy(c -> assertThat(c.computed())
                .as(c.metric()).isEqualTo(c.expected()));
        assertThat(result.storyComparison()).allMatch(Comparison::matches);

        Group canaryBefore = result.windows().get("before").get("canary");
        Group canaryAfter = result.windows().get("after").get("canary");
        Group controlAfter = result.windows().get("after").get("control");
        // The shape of the story, independent of the exact numbers.
        assertThat(canaryBefore.secondAuthorization()).isPositive();
        assertThat(canaryAfter.slowFirstAnswer()).isPositive();
        assertThat(canaryAfter.secondAuthorization()).isZero();
        assertThat(canaryAfter.stuck()).isZero();
        assertThat(canaryAfter.bothCaptured()).isZero();
        assertThat(canaryAfter.newCardAfterDecline()).isPositive();
        assertThat(controlAfter.secondAuthorization()).isPositive();
        assertThat(controlAfter.bothCaptured()).isPositive();
        assertThat(result.logs()).extracting(ExperimentResult.Log::title)
                .anySatisfy(t -> assertThat(t).contains("T-4002"))
                .anySatisfy(t -> assertThat(t).contains("T-4010"))
                .anySatisfy(t -> assertThat(t).contains("H-4109"));

        // The published output (lab-ecommerce/experiment.json) is exactly this run's output.
        String committed = Files.readString(Path.of("experiment.json")).replace("\r\n", "\n");
        assertThat(computed).isEqualTo(committed);
    }
}
