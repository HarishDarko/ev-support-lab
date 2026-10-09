package dev.evlab.transaction;

/** Who closed the transaction: the charger's own Ended, or the backend's provisional reconciliation. */
public enum CloseSource {
    REAL,
    RECONCILED
}
