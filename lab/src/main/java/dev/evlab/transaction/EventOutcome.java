package dev.evlab.transaction;

public enum EventOutcome {
    APPLIED,
    /** (station, transactionId, seqNo) was seen before; acknowledged and ignored. */
    DUPLICATE,
    /** Legacy rule: an Ended arriving while the EVSE is Available is dropped as out of order. */
    IGNORED_OUT_OF_ORDER,
    IGNORED_UNKNOWN_TRANSACTION
}
