package dev.saaslab.delivery;

import dev.saaslab.LabProperties;
import java.time.Clock;
import java.time.Instant;
import org.springframework.stereotype.Component;

/** The pause rule: after too many failed attempts in the window, an endpoint is paused until support replays it. */
@Component
public class EndpointHealth {

    private final DeliveryStore store;
    private final DeliveryTrace trace;
    private final LabProperties.Pause rule;
    private final Clock clock;

    public EndpointHealth(DeliveryStore store, DeliveryTrace trace, LabProperties properties, Clock clock) {
        this.store = store;
        this.trace = trace;
        this.rule = properties.pause();
        this.clock = clock;
    }

    public void delivered(String endpointId, String eventId, String detail) {
        Instant now = clock.instant();
        store.attempt(eventId, endpointId, now, "delivered", detail, false);
        store.delivered(eventId, now);
    }

    /** A failed attempt that counts toward the pause; the event is given up. */
    public void failed(String endpointId, String eventId, String detail) {
        Instant now = clock.instant();
        store.attempt(eventId, endpointId, now, "failed", detail, true);
        store.failed(eventId);
        if (!store.paused(endpointId)
                && store.failuresSince(endpointId, now.minus(rule.window())) >= rule.failures()) {
            String reason = rule.failures() + " failures in " + rule.window().toMinutes() + " min";
            store.pause(endpointId, now, reason);
            trace.line(endpointId, "endpoint-health", "endpoint paused (" + reason + ")");
            trace.line(endpointId, "notifier", "\"Webhook endpoint paused\" email to workspace admins");
        }
    }

    /** An attempt that waited: it does not count toward the pause, and the event stays pending. */
    public void waited(String endpointId, String eventId, String detail, Instant until) {
        store.attempt(eventId, endpointId, clock.instant(), "waited", detail, false);
        store.deferUntil(eventId, until);
    }

    public boolean paused(String endpointId) {
        return store.paused(endpointId);
    }
}
