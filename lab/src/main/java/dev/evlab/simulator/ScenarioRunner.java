package dev.evlab.simulator;

import dev.evlab.ocpp.messages.StatusNotificationRequest;
import dev.evlab.ocpp.messages.TransactionEventRequest;
import dev.evlab.ocpp.messages.TransactionEventRequest.Evse;
import dev.evlab.ocpp.messages.TransactionEventRequest.MeterValue;
import dev.evlab.ocpp.messages.TransactionEventRequest.SampledValue;
import dev.evlab.ocpp.messages.TransactionEventRequest.TransactionInfo;
import dev.evlab.ocpp.messages.TransactionEventRequest.UnitOfMeasure;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

/**
 * Plays scenario runs against a backend. Steps from all runs are merged and executed in time order, one at a
 * time, so the outcome is deterministic. Time moves only through {@link TimeControl}.
 */
public final class ScenarioRunner {

    /** Callbacks for steps that are not a charger action. */
    public interface Hooks {

        /** The backend's reconciliation sweeper runs; {@code run} says for which station. */
        void tick(ScenarioRun run);

        void observe(String label, ScenarioRun run, Instant at);
    }

    /** Label prefix: observes sort before other steps at the same instant. */
    public static final String CAPTURE_START = "capture-start";

    private record Planned(Instant at, int priority, int order, ScenarioRun run, Step step) {}

    private static final long SERVER_WAIT_MILLIS = 10_000;

    private final TimeControl time;
    private final ConnectionProbe probe;
    private final Hooks hooks;

    /** @param probe may be null when the server is remote; the runner then pauses briefly instead of waiting */
    public ScenarioRunner(TimeControl time, ConnectionProbe probe, Hooks hooks) {
        this.time = time;
        this.probe = probe;
        this.hooks = hooks;
    }

    public void run(List<ScenarioRun> runs) {
        List<Planned> plan = new ArrayList<>();
        int order = 0;
        for (ScenarioRun run : runs) {
            for (Step step : run.allSteps()) {
                plan.add(new Planned(run.at(step.at()), priority(step.action()), order++, run, step));
            }
        }
        plan.sort(Comparator.comparing(Planned::at).thenComparingInt(Planned::priority)
                .thenComparingInt(Planned::order));
        for (Planned p : plan) {
            time.advanceTo(p.at());
            execute(p.run(), p.step().action(), p.at());
        }
    }

    private static int priority(Action action) {
        if (action instanceof Action.Observe o) {
            return o.label().startsWith(CAPTURE_START) ? -1 : 1;
        }
        return 0;
    }

    private void execute(ScenarioRun run, Action action, Instant now) {
        SimulatedCharger charger = run.charger();
        String station = charger.stationId();
        switch (action) {
            case Action.Connect c -> {
                charger.statusAnswer(run.scenario().statusAnswer());
                int expected = count(station, ConnectionProbe.OPENED) + 1;
                charger.connect();
                await(station, ConnectionProbe.OPENED, expected);
                awaitStatusAnswers(station);
            }
            case Action.Drop d -> {
                int expected = count(station, ConnectionProbe.CLOSED) + 1;
                charger.drop();
                await(station, ConnectionProbe.CLOSED, expected);
            }
            case Action.Status s -> charger.call("StatusNotification",
                    new StatusNotificationRequest(now, s.status(), run.evseId(), 1));
            case Action.Event e -> charger.call("TransactionEvent", toRequest(run, e));
            case Action.Heartbeat h -> charger.call("Heartbeat", Map.of());
            case Action.Tick t -> hooks.tick(run);
            case Action.Observe o -> hooks.observe(o.label(), run, now);
        }
    }

    private int count(String station, String kind) {
        return probe == null ? 0 : probe.count(station, kind);
    }

    private void await(String station, String kind, int expected) {
        if (probe == null) {
            sleep(200);
            return;
        }
        long deadline = System.currentTimeMillis() + SERVER_WAIT_MILLIS;
        while (probe.count(station, kind) < expected) {
            if (System.currentTimeMillis() > deadline) {
                throw new IllegalStateException("server did not record " + kind + " for " + station);
            }
            sleep(2);
        }
    }

    /** The charger answers GetTransactionStatus on its own thread; wait until the server has recorded it. */
    private void awaitStatusAnswers(String station) {
        if (probe == null) {
            return;
        }
        long deadline = System.currentTimeMillis() + SERVER_WAIT_MILLIS;
        while (probe.unansweredStatusQueries(station) > 0) {
            if (System.currentTimeMillis() > deadline) {
                throw new IllegalStateException("GetTransactionStatus not answered for " + station);
            }
            sleep(2);
        }
    }

    private static void sleep(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private static TransactionEventRequest toRequest(ScenarioRun run, Action.Event e) {
        Instant ts = run.at(e.eventAt());
        List<MeterValue> meter = e.meterWh() == null
                ? null
                : List.of(new MeterValue(ts, List.of(new SampledValue(e.meterWh(),
                        TransactionEventRequest.ENERGY_MEASURAND, new UnitOfMeasure("Wh")))));
        return new TransactionEventRequest(e.type(), ts, e.triggerReason(), e.seqNo(), e.offline() ? true : null,
                new TransactionInfo(run.transactionId(e.slot()), null, e.stoppedReason()),
                new Evse(run.evseId(), 1), meter);
    }
}
