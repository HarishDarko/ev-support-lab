package dev.evlab.transaction;

/** Flat energy price. Enough to make "the invoice changed" visible; no idle fees, taxes or tiers. */
public record Tariff(long centsPerKwh) {

    public static final Tariff DEFAULT = new Tariff(45);

    public long amountCents(double energyWh) {
        return Math.round(energyWh / 1000.0 * centsPerKwh);
    }
}
