package dev.evlab.transaction;

/**
 * The single charge for a transaction. {@code chargesIssued} must not exceed 1: a late Ended adjusts this
 * charge, it does not create another.
 *
 * @param needsReview a person should look at the billing: set on every PROVISIONAL invoice, and on a settled
 *     invoice whose transaction facts changed afterwards (the amount is left as it was)
 * @param note why, for the person doing the review; null when {@code needsReview} is false
 */
public record Invoice(InvoiceStatus status, double energyWh, long amountCents, int chargesIssued,
        boolean needsReview, String note) {

    public static final Invoice NONE = new Invoice(InvoiceStatus.NONE, 0, 0, 0, false, null);

    /** Same charge and amount, flagged for review. An earlier note is kept. */
    public Invoice flaggedForReview(String why) {
        return needsReview ? this : new Invoice(status, energyWh, amountCents, chargesIssued, true, why);
    }
}
