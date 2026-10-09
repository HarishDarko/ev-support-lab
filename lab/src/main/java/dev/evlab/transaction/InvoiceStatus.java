package dev.evlab.transaction;

public enum InvoiceStatus {
    /** Transaction still open; nothing issued yet. */
    NONE,
    /**
     * Issued from the best reading we have because the Ended was lost, or arrived without a meter value.
     * Needs billing review.
     */
    PROVISIONAL,
    /** Matches the charger's own complete Ended. */
    CONFIRMED,
    /** A late, complete Ended replaced a provisional invoice and the energy differed. */
    ADJUSTED
}
