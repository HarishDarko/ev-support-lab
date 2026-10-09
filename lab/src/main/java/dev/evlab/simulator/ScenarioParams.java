package dev.evlab.simulator;

import java.util.Objects;

/**
 * Knobs a scenario can be tuned with. Null fields take the scenario default.
 *
 * @param updates periodic meter updates before the unplug (the last two carry the same value)
 * @param updateIntervalSec seconds between periodic updates
 * @param energyWh energy at the end of charging
 * @param unplugToDropSec seconds from the EVCommunicationLost event to the websocket drop
 * @param reconnectDelaySec seconds from the drop to the new websocket session
 * @param endedDelaySec seconds from StatusNotification Available to the (replayed) Ended
 * @param endExtraWh energy the Ended reports beyond the last periodic sample
 * @param ongoingIndicator what GetTransactionStatus answers for ongoingIndicator (null: omitted)
 * @param heartbeatAfterStatusSec send a Heartbeat this long after Available (null: none)
 */
public record ScenarioParams(Integer updates, Integer updateIntervalSec, Double energyWh, Integer unplugToDropSec,
        Integer reconnectDelaySec, Integer endedDelaySec, Double endExtraWh, Boolean ongoingIndicator,
        Integer heartbeatAfterStatusSec) {

    public static final ScenarioParams NONE =
            new ScenarioParams(null, null, null, null, null, null, null, null, null);

    int updates(int fallback) {
        return Objects.requireNonNullElse(updates, fallback);
    }

    int updateIntervalSec(int fallback) {
        return Objects.requireNonNullElse(updateIntervalSec, fallback);
    }

    double energyWh(double fallback) {
        return Objects.requireNonNullElse(energyWh, fallback);
    }

    int unplugToDropSec(int fallback) {
        return Objects.requireNonNullElse(unplugToDropSec, fallback);
    }

    int reconnectDelaySec(int fallback) {
        return Objects.requireNonNullElse(reconnectDelaySec, fallback);
    }

    int endedDelaySec(int fallback) {
        return Objects.requireNonNullElse(endedDelaySec, fallback);
    }

    double extraWh() {
        return Objects.requireNonNullElse(endExtraWh, 0.0);
    }
}
