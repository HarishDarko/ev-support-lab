package dev.evlab.simulator;

import java.time.Duration;
import java.util.List;

/**
 * A scripted charger session as data.
 *
 * @param slots how many transactions the script uses (the newer-transaction scenario uses two)
 * @param truthDeliveryEnd offset (from the anchor) of the last moment energy was really delivered on slot 0;
 *     the harness uses it to judge whether a reconciliation closed a session that was still delivering
 */
public record Scenario(String name, String description, int slots, StatusAnswerSpec statusAnswer,
        Duration truthDeliveryEnd, List<Step> steps) {

    public Duration firstStep() {
        return steps.stream().map(Step::at).min(Duration::compareTo).orElse(Duration.ZERO);
    }

    public Duration lastStep() {
        return steps.stream().map(Step::at).max(Duration::compareTo).orElse(Duration.ZERO);
    }
}
