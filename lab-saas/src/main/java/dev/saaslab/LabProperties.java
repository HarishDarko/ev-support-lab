package dev.saaslab;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties(prefix = "lab")
public record LabProperties(@DefaultValue Fix fix, @DefaultValue Delivery delivery, @DefaultValue Pause pause) {

    /** {@code enabled} is the default for workspaces that have no per-workspace override. */
    public record Fix(@DefaultValue("true") boolean enabled) {}

    public record Delivery(@DefaultValue("5") int maxAttempts, @DefaultValue("5m") Duration refreshMargin) {}

    /** An endpoint is paused after {@code failures} failed attempts within {@code window}. */
    public record Pause(@DefaultValue("15") int failures, @DefaultValue("60m") Duration window) {}
}
