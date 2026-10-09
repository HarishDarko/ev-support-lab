package dev.evlab.simulator;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * One scenario instance: which charger plays it, when (the anchor), and which transaction ids and EVSE it uses.
 * {@code extraSteps} lets a harness add its own Observe steps.
 */
public record ScenarioRun(SimulatedCharger charger, Scenario scenario, Instant anchor, List<String> transactionIds,
        int evseId, List<Step> extraSteps) {

    public ScenarioRun {
        if (transactionIds.size() < scenario.slots()) {
            throw new IllegalArgumentException(scenario.name() + " needs " + scenario.slots() + " transaction ids");
        }
    }

    public static ScenarioRun of(SimulatedCharger charger, Scenario scenario, Instant anchor,
            List<String> transactionIds, int evseId) {
        return new ScenarioRun(charger, scenario, anchor, transactionIds, evseId, List.of());
    }

    public ScenarioRun withExtra(Step... steps) {
        List<Step> all = new ArrayList<>(extraSteps);
        all.addAll(List.of(steps));
        return new ScenarioRun(charger, scenario, anchor, transactionIds, evseId, all);
    }

    public Instant at(Duration offset) {
        return anchor.plus(offset);
    }

    public Instant start() {
        return at(allSteps().stream().map(Step::at).min(Duration::compareTo).orElse(Duration.ZERO));
    }

    public Instant end() {
        return at(allSteps().stream().map(Step::at).max(Duration::compareTo).orElse(Duration.ZERO));
    }

    public List<Step> allSteps() {
        List<Step> all = new ArrayList<>(scenario.steps());
        all.addAll(extraSteps);
        return all;
    }

    public String transactionId(int slot) {
        return transactionIds.get(slot);
    }
}
