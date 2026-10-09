package dev.evlab;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties(prefix = "lab")
public record LabProperties(@DefaultValue Fix fix, @DefaultValue Reconciliation reconciliation) {

    /** {@code enabled} is the default for stations that have no per-station override. */
    public record Fix(@DefaultValue("true") boolean enabled) {}

    public record Reconciliation(
            @DefaultValue("60s") Duration grace,
            @DefaultValue("15m") Duration maxQueueWait,
            @DefaultValue("1.0") double epsilonWh,
            @DefaultValue("60s") Duration minSampleSpacing,
            @DefaultValue("30m") Duration maxMeterAge,
            @DefaultValue("2m") Duration maxClockSkew,
            @DefaultValue("true") boolean schedulerEnabled,
            @DefaultValue("5s") Duration sweepInterval) {}
}
