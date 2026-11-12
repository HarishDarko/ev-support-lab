package dev.saaslab.delivery;

import dev.saaslab.LabProperties;
import dev.saaslab.delivery.DeliveryStore.Endpoint;
import dev.saaslab.delivery.TokenClient.Answer;
import dev.saaslab.delivery.TokenClient.Token;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * Delivers webhook events. The worker's thread pool is modelled in rounds: the events of a burst are in flight
 * together, and in each round every delivery still in flight makes one attempt, in a fixed order, so a run is
 * repeatable. (SingleFlightRefreshIT checks the refresh lock itself with real threads.)
 *
 * <p>Legacy path: a delivery refused with 401 asks the identity provider for a token on its own and retries at
 * once, with no backoff, up to lab.delivery.max-attempts. When the identity provider keeps one active token per
 * client, each new token revokes the one before, so in each round only the last delivery to refresh gets through.
 *
 * <p>Fix (ENG-5108), per workspace: refresh before the token expires (lab.delivery.refresh-margin, minus a
 * per-endpoint jitter), one shared refresh per endpoint, one retry after a 401, and a rate-limited token request
 * makes deliveries wait for Retry-After instead of failing.
 */
@Component
public class DeliveryWorker {

    private final DeliveryStore store;
    private final TokenCache tokens;
    private final FeatureFlags flags;
    private final EndpointHealth health;
    private final DeliveryTrace trace;
    private final HttpClient http;
    private final Clock clock;
    private final LabProperties.Delivery settings;

    public DeliveryWorker(DeliveryStore store, TokenCache tokens, FeatureFlags flags, EndpointHealth health,
            DeliveryTrace trace, HttpClient http, Clock clock, LabProperties properties) {
        this.store = store;
        this.tokens = tokens;
        this.flags = flags;
        this.health = health;
        this.trace = trace;
        this.http = http;
        this.clock = clock;
        this.settings = properties.delivery();
    }

    /** Delivers these events of one endpoint, in flight together at the current instant. */
    public void deliverTogether(String endpointId, List<String> eventIds) {
        if (eventIds.isEmpty()) {
            return;
        }
        Endpoint endpoint = store.endpoint(endpointId);
        if (health.paused(endpointId)) {
            Instant now = clock.instant();
            for (String id : eventIds) {
                store.attempt(id, endpointId, now, "failed", "endpoint paused", false);
                store.failed(id);
            }
            return;
        }
        if (!endpoint.oauth()) {
            Map<Integer, Integer> statuses = new LinkedHashMap<>();
            for (String id : eventIds) {
                int status = send(endpoint, id, null);
                statuses.merge(status, 1, Integer::sum);
                finish(endpoint, id, status, "");
            }
            statuses.forEach((status, n) -> trace.line(endpoint.id(), "webhook-worker",
                    n + " deliveries (HMAC signature, no token) -> HTTP " + status));
        } else if (flags.sharedTokenRefresh(endpoint.workspaceId())) {
            shared(endpoint, eventIds);
        } else {
            legacy(endpoint, eventIds);
        }
    }

    /** Delivers the events that waited (for Retry-After) and are now due. */
    public void deliverDue(String endpointId) {
        deliverTogether(endpointId, store.due(endpointId, clock.instant()));
    }

    // ---- legacy ----

    private void legacy(Endpoint endpoint, List<String> eventIds) {
        Map<String, Token> held = new LinkedHashMap<>();
        Token cached = tokens.get(endpoint.id());
        if (cached != null && !cached.expiresAt().isAfter(clock.instant())) {
            trace.line(endpoint.id(), "token-cache", "access token expired (lifetime 3600 s); the cache does not check");
        }
        for (String id : eventIds) {
            held.put(id, cached);
        }
        int tokenRequests = 0;
        boolean limited = false;
        for (int attempt = 1; !held.isEmpty(); attempt++) {
            List<String> refused = new ArrayList<>();
            for (Map.Entry<String, Token> e : held.entrySet()) {
                int status = send(endpoint, e.getKey(), e.getValue());
                if (status == 401) {
                    refused.add(e.getKey());
                } else {
                    finish(endpoint, e.getKey(), status, "");
                }
            }
            if (refused.isEmpty()) {
                break;
            }
            trace.line(endpoint.id(), "webhook-worker", attempt == 1
                    ? refused.size() + " deliveries in flight -> 401 Unauthorized (token expired)"
                    : refused.size() + " retries at once, 0 ms backoff -> 401 (token revoked by a newer one)");
            if (attempt == settings.maxAttempts()) {
                for (String id : refused) {
                    health.failed(endpoint.id(), id, "401 after " + attempt + " attempts");
                }
                break;
            }
            trace.line(endpoint.id(), "webhook-worker",
                    refused.size() + " threads each request a new token (no shared refresh)");
            Map<String, Token> next = new LinkedHashMap<>();
            for (String id : refused) {
                Answer answer = tokens.refreshOwn(endpoint);
                tokenRequests++;
                if (answer.ok()) {
                    next.put(id, answer.token());
                } else {
                    if (answer.status() == 429 && !limited) {
                        limited = true;
                        trace.line(endpoint.id(), "customer-idp", "POST /oauth/token -> 429 Too Many Requests");
                    }
                    health.failed(endpoint.id(), id, "token refresh failed (" + answer.status() + ")");
                }
            }
            held = next;
        }
        if (tokenRequests > 0) {
            trace.line(endpoint.id(), "webhook-worker", tokenRequests + " token requests for "
                    + eventIds.size() + " deliveries");
        }
    }

    // ---- fix ----

    private void shared(Endpoint endpoint, List<String> eventIds) {
        Token token = tokens.get(endpoint.id());
        if (token == null || !token.expiresAt().minus(margin(endpoint)).isAfter(clock.instant())) {
            Answer answer = tokens.refreshShared(endpoint, token);
            if (!answer.ok()) {
                refreshFailed(endpoint, eventIds, answer);
                return;
            }
            if (token != null) {
                trace.line(endpoint.id(), "token-cache", "token refreshed before it expired: 1 shared token request");
            }
            token = answer.token();
        }
        List<String> refused = new ArrayList<>();
        for (String id : eventIds) {
            int status = send(endpoint, id, token);
            if (status == 401) {
                refused.add(id);
            } else {
                finish(endpoint, id, status, "");
            }
        }
        if (refused.isEmpty()) {
            return;
        }
        Answer answer = tokens.refreshShared(endpoint, token);
        if (!answer.ok()) {
            refreshFailed(endpoint, refused, answer);
            return;
        }
        for (String id : refused) {
            finish(endpoint, id, send(endpoint, id, answer.token()), " after one shared refresh");
        }
    }

    private void refreshFailed(Endpoint endpoint, List<String> eventIds, Answer answer) {
        if (answer.status() == 429) {
            Instant until = clock.instant().plusSeconds(Math.max(1, answer.retryAfterSeconds()));
            trace.line(endpoint.id(), "webhook-worker", eventIds.size()
                    + " deliveries wait for Retry-After (" + answer.retryAfterSeconds() + " s), not counted as failures");
            for (String id : eventIds) {
                health.waited(endpoint.id(), id, "token request rate-limited", until);
            }
            return;
        }
        String why = answer.error() == null ? String.valueOf(answer.status())
                : answer.status() + " " + answer.error();
        for (String id : eventIds) {
            health.failed(endpoint.id(), id, "token refresh failed (" + why + ")");
        }
    }

    /** Refresh this long before expiry: the margin minus up to 60 s of jitter, fixed per endpoint. */
    private Duration margin(Endpoint endpoint) {
        return settings.refreshMargin().minusSeconds(Math.floorMod(endpoint.id().hashCode(), 61));
    }

    // ---- shared ----

    private void finish(Endpoint endpoint, String eventId, int status, String suffix) {
        if (status / 100 == 2) {
            health.delivered(endpoint.id(), eventId, "HTTP " + status + suffix);
        } else {
            health.failed(endpoint.id(), eventId, (status == 0 ? "unreachable" : "HTTP " + status) + suffix);
        }
    }

    /** One POST to the endpoint. Returns the HTTP status, or 0 when the endpoint cannot be reached. */
    int send(Endpoint endpoint, String eventId, Token token) {
        HttpRequest.Builder request = HttpRequest.newBuilder(URI.create(endpoint.url()))
                .header("Content-Type", "application/json")
                .header("X-Event-Id", eventId)
                .POST(HttpRequest.BodyPublishers.ofString("{\"id\":\"" + eventId + "\"}"));
        if (endpoint.oauth()) {
            if (token != null) {
                request.header("Authorization", "Bearer " + token.value());
            }
        } else {
            request.header("X-Signature", "sig-" + endpoint.workspaceId());
        }
        try {
            return http.send(request.build(), HttpResponse.BodyHandlers.discarding()).statusCode();
        } catch (IOException e) {
            return 0;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(e);
        }
    }

    /** Support's test delivery: one request with the current token, one token request if it is refused. */
    public int testDelivery(String endpointId) {
        Endpoint endpoint = store.endpoint(endpointId);
        String id = "test-" + clock.instant().toEpochMilli();
        int status = send(endpoint, id, tokens.get(endpointId));
        if (status == 401 && endpoint.oauth()) {
            Answer answer = tokens.refreshOwn(endpoint);
            status = answer.ok() ? send(endpoint, id, answer.token()) : 401;
        }
        trace.line(endpointId, "support-tool", "test delivery -> " + status);
        return status;
    }
}
