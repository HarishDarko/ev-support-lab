package dev.evlab.simulator;

import dev.evlab.ocpp.messages.ConnectorStatus;
import dev.evlab.ocpp.messages.TransactionEventType;
import dev.evlab.transaction.TxEvent;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

/**
 * The scenario catalogue. Each scenario is a list of timed {@link Step}s; nothing here says what the backend
 * will do with them. Offsets are seconds from the anchor: the EVCommunicationLost event for drop scenarios,
 * the Ended for {@code normal}, the websocket drop for {@code still-delivering}.
 */
public final class Scenarios {

    public static final String NORMAL = "normal";
    public static final String LATE_ENDED = "late-ended";
    public static final String LOST_ENDED = "lost-ended";
    public static final String STILL_DELIVERING = "still-delivering";
    public static final String NEWER_TRANSACTION = "newer-transaction";
    public static final String DUPLICATE_ENDED = "duplicate-ended";
    public static final String QUEUED_MESSAGES = "queued-messages";
    /** The Ended arrives after the backend already reconciled: the late-Ended-after-provisional-close case. */
    public static final String VERY_LATE_ENDED = "very-late-ended";

    public static final List<String> NAMES = List.of(NORMAL, LATE_ENDED, LOST_ENDED, STILL_DELIVERING,
            NEWER_TRANSACTION, DUPLICATE_ENDED, QUEUED_MESSAGES, VERY_LATE_ENDED);

    private static final int TICK_SEC = 30;
    /** The charger stops delivering about this long before the driver unplugs. */
    private static final int TAPER_SEC = 45;
    private static final int ENDED_AFTER_UNPLUG_SEC = 8;

    private Scenarios() {}

    public static Scenario named(String name, ScenarioParams p) {
        return switch (name) {
            case NORMAL -> normal(p);
            case LATE_ENDED -> dropScenario(name, p, Ended.AFTER_AVAILABLE, 21, 240,
                    "Unplug, websocket drop, reconnect, Available, then the queued Ended seconds later (FW-A like).");
            case LOST_ENDED -> dropScenario(name, p, Ended.NEVER, 0, 600,
                    "Unplug, websocket drop, reconnect, Available; the Ended never arrives (FW-B like).");
            case VERY_LATE_ENDED -> dropScenario(name, p, Ended.AFTER_AVAILABLE, 600, 720,
                    "As lost-ended, but the Ended turns up minutes later, after a provisional close.");
            case QUEUED_MESSAGES -> dropScenario(name, p, Ended.AFTER_AVAILABLE, 300, 420,
                    "The charger says messagesInQueue=true and delivers the Ended after the grace period.");
            case DUPLICATE_ENDED -> dropScenario(name, p, Ended.TWICE, 5, 240,
                    "The Ended is replayed before Available and sent again after it.");
            case NEWER_TRANSACTION -> newerTransaction(p);
            case STILL_DELIVERING -> stillDelivering(p);
            default -> throw new IllegalArgumentException("unknown scenario " + name + ", expected one of " + NAMES);
        };
    }

    private enum Ended { NEVER, AFTER_AVAILABLE, TWICE }

    private static Scenario normal(ScenarioParams p) {
        int n = p.updates(2);
        int interval = p.updateIntervalSec(450);
        double energy = p.energyWh(11800);
        Script s = new Script();
        int seq = s.charge(0, n, interval, energy, false);
        s.at(0, new Action.Event(0, TransactionEventType.Ended, seq, Duration.ZERO, "EVDeparted", false, "Local",
                energy));
        s.at(1, new Action.Status(0, ConnectorStatus.Available));
        return new Scenario(NORMAL, "Plug in, charge, unplug, Ended in order.", 1,
                StatusAnswerSpec.NOTHING_PENDING, Duration.ZERO, s.steps);
    }

    private static Scenario dropScenario(String name, ScenarioParams p, Ended ended, int defaultEndedDelay,
            int tickSpan, String description) {
        int n = p.updates(3);
        int interval = p.updateIntervalSec(600);
        double energy = p.energyWh(18420);
        int drop = p.unplugToDropSec(30);
        int connect = drop + p.reconnectDelaySec(30);
        int available = connect + 1;
        int endedDelay = p.endedDelaySec(defaultEndedDelay);

        Script s = new Script();
        int seq = s.charge(0, n, interval, energy, true);
        int endedSeq = seq;
        s.at(drop, new Action.Drop());
        s.at(connect, new Action.Connect());
        Action.Event endedEvent = new Action.Event(0, TransactionEventType.Ended, endedSeq,
                Duration.ofSeconds(ENDED_AFTER_UNPLUG_SEC), "EVDeparted", true, "EVDisconnected",
                energy + p.extraWh());
        if (ended == Ended.TWICE) {
            s.at(connect, endedEvent);
        }
        s.at(available, new Action.Status(0, ConnectorStatus.Available));
        if (p.heartbeatAfterStatusSec() != null) {
            s.at(available + p.heartbeatAfterStatusSec(), new Action.Heartbeat());
        }
        long last = available;
        if (ended != Ended.NEVER) {
            s.at(available + endedDelay, endedEvent);
            last = available + endedDelay;
        }
        long tickEnd = Math.max(last, connect + tickSpan) + 60;
        s.ticks(connect, tickEnd);

        boolean queued = name.equals(QUEUED_MESSAGES);
        StatusAnswerSpec answer = new StatusAnswerSpec(queued, p.ongoingIndicator() != null ? p.ongoingIndicator()
                : Boolean.FALSE);
        return new Scenario(name, description, 1, answer, Duration.ZERO, s.steps);
    }

    private static Scenario newerTransaction(ScenarioParams p) {
        int n = p.updates(3);
        int interval = p.updateIntervalSec(600);
        double energy = p.energyWh(18420);
        int drop = p.unplugToDropSec(30);
        int connect = drop + p.reconnectDelaySec(30);
        int available = connect + 1;
        int secondStart = available + 20;

        Script s = new Script();
        s.charge(0, n, interval, energy, true);
        s.at(drop, new Action.Drop());
        s.at(connect, new Action.Connect());
        s.at(available, new Action.Status(0, ConnectorStatus.Available));
        // A second driver plugs into the same EVSE before the backend decides anything about the first.
        s.at(secondStart, new Action.Status(1, ConnectorStatus.Occupied));
        s.at(secondStart, new Action.Event(1, TransactionEventType.Started, 0, Duration.ofSeconds(secondStart),
                "CablePluggedIn", false, null, 0.0));
        s.at(secondStart + 300, new Action.Event(1, TransactionEventType.Updated, 1,
                Duration.ofSeconds(secondStart + 300), "MeterValuePeriodic", false, null, 2500.0));
        s.at(secondStart + 600, new Action.Event(1, TransactionEventType.Updated, 2,
                Duration.ofSeconds(secondStart + 600), "MeterValuePeriodic", false, null, 5000.0));
        s.at(secondStart + 900, new Action.Event(1, TransactionEventType.Ended, 3,
                Duration.ofSeconds(secondStart + 900), "EVDeparted", false, "Local", 5000.0));
        s.at(secondStart + 901, new Action.Status(1, ConnectorStatus.Available));
        s.ticks(connect, secondStart + 901 + 120);
        return new Scenario(NEWER_TRANSACTION,
                "Reconnect and Available, then a new transaction starts on the same EVSE before reconciliation.", 2,
                StatusAnswerSpec.NOTHING_PENDING, Duration.ZERO, s.steps);
    }

    private static Scenario stillDelivering(ScenarioParams p) {
        int before = p.updates(10);
        int interval = p.updateIntervalSec(60);
        int reconnectDelay = p.reconnectDelaySec(20);
        int after = 12;
        double rate = 150; // Wh per sample interval, still rising after the drop
        int connect = reconnectDelay;

        Script s = new Script();
        s.at(-(long) before * interval, new Action.Status(0, ConnectorStatus.Occupied));
        s.at(-(long) before * interval, new Action.Event(0, TransactionEventType.Started, 0,
                Duration.ofSeconds(-(long) before * interval), "CablePluggedIn", false, null, 0.0));
        for (int i = 1; i <= before; i++) {
            long t = -(long) (before - i) * interval;
            s.at(t, periodic(i, t, rate * i));
        }
        s.at(0, new Action.Drop());
        s.at(connect, new Action.Connect());
        s.at(connect + 1, new Action.Status(0, ConnectorStatus.Occupied));
        for (int j = 1; j <= after; j++) {
            long t = connect + 1 + (long) j * interval;
            s.at(t, periodic(before + j, t, rate * (before + j)));
        }
        long endAt = connect + 1 + (long) after * interval + 30;
        s.at(endAt, new Action.Event(0, TransactionEventType.Ended, before + after + 1, Duration.ofSeconds(endAt),
                "EVDeparted", false, "Local", rate * (before + after)));
        s.at(endAt + 1, new Action.Status(0, ConnectorStatus.Available));
        s.ticks(connect, endAt + 90);
        return new Scenario(STILL_DELIVERING,
                "The websocket drops mid-charge, there is no unplug, and energy keeps rising after reconnect.", 1,
                new StatusAnswerSpec(false, p.ongoingIndicator()), Duration.ofSeconds(endAt), s.steps);
    }

    private static Action.Event periodic(int seq, long atSec, double wh) {
        return new Action.Event(0, TransactionEventType.Updated, seq, Duration.ofSeconds(atSec),
                "MeterValuePeriodic", false, null, round(wh));
    }

    private static double round(double wh) {
        return Math.round(wh * 10.0) / 10.0;
    }

    /** Collects steps in definition order; equal offsets keep that order. */
    private static final class Script {
        final List<Step> steps = new ArrayList<>();

        void at(long sec, Action action) {
            steps.add(new Step(Duration.ofSeconds(sec), action));
        }

        void ticks(long fromSec, long toSec) {
            for (long t = fromSec + TICK_SEC; t <= toSec; t += TICK_SEC) {
                at(t, new Action.Tick());
            }
        }

        /**
         * Occupied, Started, then {@code n} periodic updates ending {@link #TAPER_SEC} before the anchor. The last
         * two carry the same value (energy flat). With {@code withCommLost}, adds the EVCommunicationLost update
         * at the anchor. Returns the next free seqNo.
         */
        int charge(int slot, int n, int intervalSec, double energyWh, boolean withCommLost) {
            long t0 = -(TAPER_SEC + (long) n * intervalSec);
            at(t0, new Action.Status(slot, ConnectorStatus.Occupied));
            at(t0, new Action.Event(slot, TransactionEventType.Started, 0, Duration.ofSeconds(t0),
                    "CablePluggedIn", false, null, 0.0));
            for (int i = 1; i <= n; i++) {
                long t = -(TAPER_SEC + (long) (n - i) * intervalSec);
                double wh = n == 1 ? energyWh : energyWh * Math.min(1.0, i / (n - 1.0));
                at(t, periodic(i, t, wh));
            }
            int seq = n + 1;
            if (withCommLost) {
                at(0, new Action.Event(slot, TransactionEventType.Updated, seq, Duration.ZERO,
                        TxEvent.EV_COMMUNICATION_LOST, false, null, null));
                seq++;
            }
            return seq;
        }
    }
}
