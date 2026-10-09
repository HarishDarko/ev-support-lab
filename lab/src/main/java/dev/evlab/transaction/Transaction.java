package dev.evlab.transaction;

import dev.evlab.ocpp.messages.TransactionEventType;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.OptionalInt;

/**
 * Immutable transaction state and its state machine. No Spring, no I/O, no clock.
 *
 * <p>{@link #apply} folds one charger event into the state. Callers choose the order: the legacy path
 * applies events as they arrive, the fixed path applies them sorted by seqNo ({@link #SEQ_ORDER}).
 *
 * <p>The identity of a transaction is {@code (stationId, id)}: OCPP transactionIds are only unique per station.
 */
public record Transaction(
        String id,
        String stationId,
        int evseId,
        TxState state,
        Instant startedAt,
        Instant startedReceivedAt,
        Instant stoppedAt,
        String stopReason,
        int lastSeqNo,
        MeterTrail meter,
        Instant commLostAt,
        CloseSource closeSource,
        Reconciliation reconciliation,
        Invoice invoice,
        boolean endMeterReported,
        Integer firstMissingSeqNo) {

    /** OCPP 2.0.1 ReasonEnumType has no "reconciled"; Other is the honest value for a provisional close. */
    public static final String PROVISIONAL_STOP_REASON = "Other";

    private static final String NO_END_METER = "Ended carried no meter value";

    /**
     * Replay order. The charger numbers the events of a transaction in the order it produced them, so seqNo is
     * the order. The timestamp comes from the charger's clock, which can be corrected backwards mid-session and
     * would then sort an Ended before its Started. It is only a tiebreak here; the database key
     * (station, transaction, seqNo) means two stored events never share a seqNo, so it matters only to callers
     * that replay events outside the database.
     */
    public static final Comparator<TxEvent> SEQ_ORDER =
            Comparator.comparingInt(TxEvent::seqNo).thenComparing(TxEvent::timestamp);

    public static Transaction open(String id, String stationId, int evseId) {
        return new Transaction(id, stationId, evseId, TxState.CHARGING, null, null, null, null, -1,
                MeterTrail.EMPTY, null, null, Reconciliation.NONE, Invoice.NONE, false, null);
    }

    /** Folds events in seqNo order, the way the fixed path rebuilds a transaction, and notes any sequence gap. */
    public static Transaction replay(String id, String stationId, int evseId, List<TxEvent> events) {
        List<TxEvent> ordered = events.stream().sorted(SEQ_ORDER).toList();
        Transaction t = open(id, stationId, evseId);
        for (TxEvent e : ordered) {
            t = t.apply(e);
        }
        return t.copy().firstMissingSeqNo(firstMissingSeqNo(ordered)).build();
    }

    /**
     * The lowest seqNo at or above the Started's that is absent, or null when none is missing up to the highest
     * seen. OCPP 2.0.1 does not say a transaction starts at 0 (a charger may keep one counter that only ever
     * increases), so completeness is measured from the transaction's own Started. Without a Started there is
     * no start to measure from and this is null; {@link #startReceived} tells that case apart.
     */
    private static Integer firstMissingSeqNo(List<TxEvent> orderedBySeq) {
        OptionalInt start = orderedBySeq.stream().filter(e -> e.type() == TransactionEventType.Started)
                .mapToInt(TxEvent::seqNo).min();
        if (start.isEmpty()) {
            return null;
        }
        int expected = start.getAsInt();
        for (TxEvent e : orderedBySeq) {
            if (e.seqNo() < expected) {
                continue; // numbered before the Started: not part of this sequence
            }
            if (e.seqNo() > expected) {
                return expected;
            }
            expected = e.seqNo() + 1;
        }
        return null;
    }

    public boolean hasSequenceGap() {
        return firstMissingSeqNo != null;
    }

    /** False until a Started has been applied: the start of the sequence is then unknown. */
    public boolean startReceived() {
        return startedAt != null;
    }

    /**
     * Why we cannot say the events held are all of them, or null. A gap, or no Started to count from, means the
     * meter trail and the Ended may not be what the charger really sent.
     */
    public String sequenceIncompleteReason() {
        if (!startReceived()) {
            return "Started not received, so the start of the sequence is unknown";
        }
        return hasSequenceGap() ? "seqNo " + firstMissingSeqNo + " not received" : null;
    }

    /**
     * Why the final energy of a real Ended cannot be trusted, or null. An Ended without a meter value leaves us
     * with the last earlier reading, or zero, neither of which is the session's final energy; an Ended that
     * arrived with events missing may not be the last word on the energy either.
     */
    public String billingIncompleteReason() {
        String sequence = sequenceIncompleteReason();
        if (endMeterReported) {
            return sequence;
        }
        return sequence == null ? NO_END_METER : NO_END_METER + "; " + sequence;
    }

    public boolean isOpen() {
        return state == TxState.CHARGING;
    }

    public Transaction apply(TxEvent e) {
        Transaction t = e.seqNo() > lastSeqNo ? copy().lastSeqNo(e.seqNo()).build() : this;
        if (!t.isOpen()) {
            return t; // events after the Ended are recorded elsewhere but do not change the outcome
        }
        Builder b = t.copy();
        if (e.evseId() != null) {
            b.evseId(e.evseId());
        }
        if (e.meterWh() != null) {
            b.meter(t.meter.with(e.meterWh(), e.meterAt() != null ? e.meterAt() : e.timestamp()));
        }
        switch (e.type()) {
            case Started -> b.startedAt(e.timestamp());
            case Updated -> {
                if (TxEvent.EV_COMMUNICATION_LOST.equals(e.triggerReason())) {
                    b.commLostAt(e.timestamp());
                }
            }
            case Ended -> b.state(TxState.ENDED).stoppedAt(e.timestamp()).stopReason(e.stoppedReason())
                    .closeSource(CloseSource.REAL).endMeterReported(e.meterWh() != null);
        }
        return b.build();
    }

    /**
     * Merges a freshly replayed transaction into the stored one: the replay owns the charger-side facts,
     * the stored row owns reconciliation and billing.
     */
    public Transaction rebase(Transaction replayed, Billing billing) {
        if (replayed.state == TxState.ENDED) {
            // A real Ended exists. It replaces any provisional close.
            Invoice inv = billing.onRealEnd(invoice, replayed.meter.lastWh(), replayed.billingIncompleteReason());
            return replayed.copy().startedReceivedAt(startedReceivedAt).reconciliation(reconciliation).invoice(inv)
                    .build();
        }
        if (closeSource == CloseSource.RECONCILED) {
            // Provisionally closed and still no Ended: keep the provisional close, only track the sequence.
            return copy().lastSeqNo(Math.max(lastSeqNo, replayed.lastSeqNo))
                    .firstMissingSeqNo(replayed.firstMissingSeqNo).build();
        }
        return replayed.copy().startedReceivedAt(startedReceivedAt).reconciliation(reconciliation).invoice(invoice)
                .build();
    }

    /** Provisional close at the transaction's own last meter value and timestamp. */
    public Transaction reconciled(Instant now, String why, Billing billing) {
        if (!isOpen()) {
            throw new IllegalStateException("transaction " + id + " is not open");
        }
        return copy()
                .state(TxState.ENDED)
                .stoppedAt(meter.lastAt())
                .stopReason(PROVISIONAL_STOP_REASON)
                .closeSource(CloseSource.RECONCILED)
                .reconciliation(reconciliation.reconciled(now, why))
                .invoice(billing.provisional(meter.lastWh(), why))
                .build();
    }

    /**
     * Notes when the backend received this transaction's Started, the first time only. {@link #startedAt} is the
     * charger's clock and says nothing reliable about which of two transactions came first.
     */
    public Transaction startedReceived(Instant at) {
        return startedReceivedAt != null ? this : copy().startedReceivedAt(at).build();
    }

    public Transaction withReconciliation(Reconciliation r) {
        return copy().reconciliation(r).build();
    }

    public Builder copy() {
        return new Builder(this);
    }

    public static final class Builder {
        private final String id;
        private final String stationId;
        private int evseId;
        private TxState state;
        private Instant startedAt;
        private Instant startedReceivedAt;
        private Instant stoppedAt;
        private String stopReason;
        private int lastSeqNo;
        private MeterTrail meter;
        private Instant commLostAt;
        private CloseSource closeSource;
        private Reconciliation reconciliation;
        private Invoice invoice;
        private boolean endMeterReported;
        private Integer firstMissingSeqNo;

        private Builder(Transaction t) {
            id = t.id;
            stationId = t.stationId;
            evseId = t.evseId;
            state = t.state;
            startedAt = t.startedAt;
            startedReceivedAt = t.startedReceivedAt;
            stoppedAt = t.stoppedAt;
            stopReason = t.stopReason;
            lastSeqNo = t.lastSeqNo;
            meter = t.meter;
            commLostAt = t.commLostAt;
            closeSource = t.closeSource;
            reconciliation = t.reconciliation;
            invoice = t.invoice;
            endMeterReported = t.endMeterReported;
            firstMissingSeqNo = t.firstMissingSeqNo;
        }

        public Builder evseId(int v) { evseId = v; return this; }
        public Builder state(TxState v) { state = v; return this; }
        public Builder startedAt(Instant v) { startedAt = v; return this; }
        public Builder startedReceivedAt(Instant v) { startedReceivedAt = v; return this; }
        public Builder stoppedAt(Instant v) { stoppedAt = v; return this; }
        public Builder stopReason(String v) { stopReason = v; return this; }
        public Builder lastSeqNo(int v) { lastSeqNo = v; return this; }
        public Builder meter(MeterTrail v) { meter = v; return this; }
        public Builder commLostAt(Instant v) { commLostAt = v; return this; }
        public Builder closeSource(CloseSource v) { closeSource = v; return this; }
        public Builder reconciliation(Reconciliation v) { reconciliation = v; return this; }
        public Builder invoice(Invoice v) { invoice = v; return this; }
        public Builder endMeterReported(boolean v) { endMeterReported = v; return this; }
        public Builder firstMissingSeqNo(Integer v) { firstMissingSeqNo = v; return this; }

        public Transaction build() {
            return new Transaction(id, stationId, evseId, state, startedAt, startedReceivedAt, stoppedAt, stopReason,
                    lastSeqNo, meter, commLostAt, closeSource, reconciliation, invoice, endMeterReported,
                    firstMissingSeqNo);
        }
    }
}
