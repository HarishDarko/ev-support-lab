package dev.evlab.transaction;

import java.util.Locale;

/** Invoice transitions. Pure; the caller persists the result. */
public final class Billing {

    private final Tariff tariff;
    private final double epsilonWh;

    public Billing(Tariff tariff, double epsilonWh) {
        this.tariff = tariff;
        this.epsilonWh = epsilonWh;
    }

    /** First and only charge, issued from the best reading we have. Always needs review. */
    public Invoice provisional(double energyWh, String why) {
        return new Invoice(InvoiceStatus.PROVISIONAL, energyWh, tariff.amountCents(energyWh), 1, true, why);
    }

    /**
     * The transaction has a real Ended. {@code finalEnergyWh} is the last reading we hold; {@code incompleteReason}
     * is non-null when that reading cannot be trusted as the final energy (the Ended carried no meter value).
     */
    public Invoice onRealEnd(Invoice current, double finalEnergyWh, String incompleteReason) {
        return switch (current.status()) {
            case NONE -> incompleteReason != null
                    ? provisional(finalEnergyWh, incompleteReason)
                    : settled(InvoiceStatus.CONFIRMED, finalEnergyWh, 1);
            case PROVISIONAL -> {
                if (incompleteReason != null) {
                    yield current; // still no trustworthy final reading; stays for review
                }
                yield settled(differs(current.energyWh(), finalEnergyWh)
                        ? InvoiceStatus.ADJUSTED : InvoiceStatus.CONFIRMED, finalEnergyWh, current.chargesIssued());
            }
            case CONFIRMED, ADJUSTED -> differs(current.energyWh(), finalEnergyWh)
                    // Replay now says something else. Never re-bill silently: keep the charge, ask for review.
                    ? current.flaggedForReview(String.format(Locale.ROOT,
                            "replay after settlement gives %.1f Wh, billed %.1f Wh", finalEnergyWh,
                            current.energyWh()))
                    : current;
        };
    }

    private Invoice settled(InvoiceStatus status, double energyWh, int chargesIssued) {
        return new Invoice(status, energyWh, tariff.amountCents(energyWh), chargesIssued, false, null);
    }

    private boolean differs(double billedWh, double replayedWh) {
        return Math.abs(replayedWh - billedWh) > epsilonWh;
    }
}
