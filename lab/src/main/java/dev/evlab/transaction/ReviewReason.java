package dev.evlab.transaction;

/** Why the backend left an open transaction alone and asked a person to look. */
public enum ReviewReason {
    NEWER_TRANSACTION,
    ENERGY_STILL_INCREASING,
    /** The charger answered GetTransactionStatus without ongoingIndicator (optional in OCPP 2.0.1). */
    ONGOING_NOT_REPORTED,
    /** Events are missing from the seqNo sequence, so the meter trail may not be what the charger last sent. */
    SEQUENCE_GAP,
    /** No Started was received, so there is no start of the sequence to tell whether events are missing. */
    STARTED_NOT_RECEIVED,
    INSUFFICIENT_METER_SAMPLES,
    /** The last two samples are too close together, or out of order, to show that energy stopped. */
    SAMPLES_TOO_CLOSE,
    /** The last sample is too old to say anything about what the session did since. */
    METER_STALE,
    /** The last sample is later than the backend's clock allows for, so its age cannot be trusted. */
    METER_IN_FUTURE,
    NO_STATUS_ANSWER,
    QUEUE_NOT_DELIVERED
}
