package dev.evlab.transaction;

import java.time.Duration;
import java.time.Instant;

/** The last two energy samples seen for a transaction, in seqNo order, with the charger's sample times. */
public record MeterTrail(int samples, double previousWh, Instant previousAt, double lastWh, Instant lastAt) {

    public static final MeterTrail EMPTY = new MeterTrail(0, 0, null, 0, null);

    public MeterTrail with(double wh, Instant at) {
        return new MeterTrail(samples + 1, lastWh, lastAt, wh, at);
    }

    /** True when the last two samples differ by more than epsilon, i.e. energy was still moving. */
    public boolean energyMoving(double epsilonWh) {
        return samples >= 2 && Math.abs(lastWh - previousWh) > epsilonWh;
    }

    /**
     * Time between the last two samples; negative if the charger's clock stepped back between them. Null with
     * fewer than two samples or when a sample time is unknown.
     */
    public Duration spacing() {
        return samples >= 2 && previousAt != null && lastAt != null ? Duration.between(previousAt, lastAt) : null;
    }
}
