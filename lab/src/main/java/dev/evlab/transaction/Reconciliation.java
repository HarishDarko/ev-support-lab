package dev.evlab.transaction;

import java.time.Instant;

/** Everything the reconciliation flow records on a transaction. */
public record Reconciliation(
        Instant reconnectedAt,
        StatusAnswer answer,
        Instant reconciledAt,
        String reason,
        ReviewReason reviewReason,
        Instant reviewFlaggedAt) {

    public static final Reconciliation NONE = new Reconciliation(null, null, null, null, null, null);

    /** A new websocket session was seen; any earlier answer no longer applies. */
    public Reconciliation reconnectedAt(Instant at) {
        return new Reconciliation(at, null, reconciledAt, reason, reviewReason, reviewFlaggedAt);
    }

    public Reconciliation answered(StatusAnswer a) {
        return new Reconciliation(reconnectedAt, a, reconciledAt, reason, reviewReason, reviewFlaggedAt);
    }

    public Reconciliation reconciled(Instant at, String why) {
        return new Reconciliation(reconnectedAt, answer, at, why, reviewReason, reviewFlaggedAt);
    }

    public Reconciliation flagged(ReviewReason why, Instant at) {
        return new Reconciliation(reconnectedAt, answer, reconciledAt, reason, why, at);
    }
}
