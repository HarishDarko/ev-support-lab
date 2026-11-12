package dev.shoplab;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties(prefix = "lab")
public record LabProperties(@DefaultValue Fix fix, @DefaultValue Checkout checkout, @DefaultValue Orders orders) {

    /** {@code enabled} is the default for stores that have no per-store override. */
    public record Fix(@DefaultValue("true") boolean enabled) {}

    /** Checkout stops waiting for the processor's answer after {@code timeout}. */
    public record Checkout(@DefaultValue("8s") Duration timeout) {}

    /** An order whose checkout saw an authorization is held if no webhook arrived within {@code webhookWait}. */
    public record Orders(@DefaultValue("30s") Duration webhookWait) {}
}
