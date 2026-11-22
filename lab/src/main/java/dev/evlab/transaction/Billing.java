package dev.evlab.transaction;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Invoice transitions. Pure; the caller persists the result. */
public final class Billing {

    private static final String REPORTED_AFTER_CLOSE = "after the provisional close the charger reported";
    private static final Pattern REPORTED_WH = Pattern.compile(Pattern.quote(REPORTED_AFTER_CLOSE) + " ([0-9.]+) Wh");

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

    /**
     * The transaction is still provisionally closed and the charger has since reported {@code reportedWh}, for
     * example in an Updated it sent late. More energy than the provisional invoice is not billed: the invoice keeps
     * its amount and stays for review, and its note says what the charger reported. Only the highest reading is
     * kept in the note.
     */
    public Invoice reportedAfterProvisionalClose(Invoice current, double reportedWh) {
        if (current.status() != InvoiceStatus.PROVISIONAL || reportedWh - current.energyWh() <= epsilonWh) {
            return current;
        }
        String note = current.note() == null ? "" : current.note();
        Matcher noted = REPORTED_WH.matcher(note);
        if (noted.find() && Double.parseDouble(noted.group(1)) >= reportedWh) {
            return current; // the note already gives a reading at least this high
        }
        int earlier = note.indexOf(REPORTED_AFTER_CLOSE);
        if (earlier >= 0) {
            note = note.substring(0, earlier).replaceAll("[; ]+$", "");
        }
        String reported = String.format(Locale.ROOT, REPORTED_AFTER_CLOSE + " %.1f Wh, billed %.1f Wh", reportedWh,
                current.energyWh());
        return new Invoice(current.status(), current.energyWh(), current.amountCents(), current.chargesIssued(), true,
                note.isEmpty() ? reported : note + "; " + reported);
    }

    private Invoice settled(InvoiceStatus status, double energyWh, int chargesIssued) {
        return new Invoice(status, energyWh, tariff.amountCents(energyWh), chargesIssued, false, null);
    }

    private boolean differs(double billedWh, double replayedWh) {
        return Math.abs(replayedWh - billedWh) > epsilonWh;
    }
}
