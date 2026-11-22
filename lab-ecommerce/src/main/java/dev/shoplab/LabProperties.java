package dev.shoplab;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties(prefix = "lab")
public record LabProperties(@DefaultValue Fix fix, @DefaultValue Checkout checkout, @DefaultValue Orders orders,
        @DefaultValue Http http) {

    /** {@code enabled} is the default for stores that have no per-store override. */
    public record Fix(@DefaultValue("true") boolean enabled) {}

    /** Checkout stops waiting for the processor's answer after {@code timeout}. */
    public record Checkout(@DefaultValue("8s") Duration timeout) {}

    /** An order whose checkout saw an authorization is held if no webhook arrived within {@code webhookWait}. */
    public record Orders(@DefaultValue("30s") Duration webhookWait) {}

    /**
     * A request to the processor gives up after {@code requestTimeout} and is treated like an unreachable processor,
     * so one that stops answering fails the call instead of hanging it. Checkout's own 8 s timeout is scripted
     * through the processor's {@code Answered-At} stamp, so this real timeout sits above it.
     */
    public record Http(@DefaultValue("10s") Duration requestTimeout) {}
}
