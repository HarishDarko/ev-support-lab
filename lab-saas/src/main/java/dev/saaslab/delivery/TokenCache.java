package dev.saaslab.delivery;

import dev.saaslab.delivery.DeliveryStore.Endpoint;
import dev.saaslab.delivery.TokenClient.Answer;
import dev.saaslab.delivery.TokenClient.Token;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.stereotype.Component;

/**
 * The access token per endpoint. Two ways to replace one:
 * <ul>
 * <li>{@link #refreshOwn}: the legacy path. The caller asks the identity provider itself, whatever other threads
 * are doing.</li>
 * <li>{@link #refreshShared}: the fix. One refresh per endpoint at a time; a caller that waited for another's
 * refresh uses its result instead of asking again: its token, or its failure. After a 429 nobody asks again until
 * Retry-After has passed.</li>
 * </ul>
 */
@Component
public class TokenCache {

    /**
     * The last shared refresh of an endpoint that failed.
     *
     * @param attempt how many shared refreshes of the endpoint had finished, this one included
     * @param retryAt for a 429, when the identity provider allows the next request; null otherwise
     * @param tokenThen the endpoint's stored token when the refresh failed; a different one since makes it stale
     */
    private record Failure(Answer answer, long attempt, Instant retryAt, Token tokenThen) {}

    private final TokenClient client;
    private final Clock clock;
    private final Map<String, Token> tokens = new ConcurrentHashMap<>();
    private final Map<String, Object> locks = new ConcurrentHashMap<>();
    /** Shared refreshes finished per endpoint, counted when each one has its answer. */
    private final Map<String, AtomicLong> finished = new ConcurrentHashMap<>();
    private final Map<String, Failure> failures = new ConcurrentHashMap<>();

    public TokenCache(TokenClient client, Clock clock) {
        this.client = client;
        this.clock = clock;
    }

    public Token get(String endpointId) {
        return tokens.get(endpointId);
    }

    public void clear() {
        tokens.clear();
        failures.clear();
    }

    /** Legacy: every caller refreshes on its own. */
    public Answer refreshOwn(Endpoint endpoint) {
        Answer answer = client.request(endpoint);
        if (answer.ok()) {
            tokens.put(endpoint.id(), answer.token());
        }
        return answer;
    }

    /**
     * Fix: refresh unless another caller already did it while this one waited for the lock. A caller that waited
     * gets the other caller's result, a new token or a failure, so a refused or unreachable identity provider is
     * asked once for all of them. After a 429 every caller gets that 429, with the seconds left, until Retry-After
     * has passed; after that the next caller asks again, even one that waited for the refresh that got the 429. A
     * failure is forgotten once a token has been stored since it, by either path.
     *
     * @param seen the token the caller found too old or was refused with (null if it had none)
     */
    public Answer refreshShared(Endpoint endpoint, Token seen) {
        AtomicLong done = finished.computeIfAbsent(endpoint.id(), k -> new AtomicLong());
        // Read before waiting for the lock: a failure counted after this was in flight while this caller waited.
        long doneBefore = done.get();
        synchronized (locks.computeIfAbsent(endpoint.id(), k -> new Object())) {
            Token current = tokens.get(endpoint.id());
            if (current != null && !Objects.equals(current, seen)) {
                return new Answer(200, current, 0, null);
            }
            Failure last = failures.get(endpoint.id());
            if (last != null && !Objects.equals(last.tokenThen(), current)) {
                failures.remove(endpoint.id());
                last = null;
            }
            boolean share = last != null && (last.retryAt() != null
                    ? clock.instant().isBefore(last.retryAt())
                    : last.attempt() > doneBefore);
            if (share) {
                return shared(last);
            }
            Answer answer = refreshOwn(endpoint);
            long attempt = done.incrementAndGet();
            if (answer.ok()) {
                failures.remove(endpoint.id());
            } else {
                Instant retryAt = answer.status() == 429
                        ? clock.instant().plusSeconds(Math.max(1, answer.retryAfterSeconds()))
                        : null;
                failures.put(endpoint.id(), new Failure(answer, attempt, retryAt, tokens.get(endpoint.id())));
            }
            return answer;
        }
    }

    /** A failure handed to a caller that did not ask: for a 429, the seconds of Retry-After still left. */
    private Answer shared(Failure f) {
        if (f.retryAt() == null) {
            return f.answer();
        }
        long left = Math.max(1, (Duration.between(clock.instant(), f.retryAt()).toMillis() + 999) / 1000);
        return new Answer(f.answer().status(), null, left, f.answer().error());
    }
}
