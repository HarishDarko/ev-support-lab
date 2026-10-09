package dev.evlab.simulator;

import dev.evlab.ocpp.messages.ConnectorStatus;
import dev.evlab.ocpp.messages.TransactionEventType;
import java.time.Duration;

/** One thing a scripted charger does. Pure data; {@link ScenarioRunner} performs it. */
public sealed interface Action {

    /** Opens a new websocket session. */
    record Connect() implements Action {}

    /** Kills the socket without a close frame; the server sees code 1006. */
    record Drop() implements Action {}

    record Status(int slot, ConnectorStatus status) implements Action {}

    /**
     * A TransactionEvent. {@code eventAt} is the event timestamp relative to the scenario anchor; it can be
     * earlier than the time the step is sent, which is how a queued offline event is replayed.
     */
    record Event(int slot, TransactionEventType type, int seqNo, Duration eventAt, String triggerReason,
            boolean offline, String stoppedReason, Double meterWh) implements Action {}

    record Heartbeat() implements Action {}

    /** The backend's reconciliation sweeper runs (its scheduler tick). */
    record Tick() implements Action {}

    /** A hook for the harness, e.g. to capture a log excerpt or inspect a session. */
    record Observe(String label) implements Action {}
}
