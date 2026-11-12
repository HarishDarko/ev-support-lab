package dev.saaslab.delivery;

import dev.saaslab.delivery.DeliveryStore.Endpoint;
import dev.saaslab.delivery.TokenClient.Answer;
import dev.saaslab.delivery.TokenClient.Token;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/**
 * The access token per endpoint. Two ways to replace one:
 * <ul>
 * <li>{@link #refreshOwn}: the legacy path. The caller asks the identity provider itself, whatever other threads
 * are doing.</li>
 * <li>{@link #refreshShared}: the fix. One refresh per endpoint at a time; a caller that waited for another's
 * refresh uses that token instead of asking again.</li>
 * </ul>
 */
@Component
public class TokenCache {

    private final TokenClient client;
    private final Map<String, Token> tokens = new ConcurrentHashMap<>();
    private final Map<String, Object> locks = new ConcurrentHashMap<>();

    public TokenCache(TokenClient client) {
        this.client = client;
    }

    public Token get(String endpointId) {
        return tokens.get(endpointId);
    }

    public void clear() {
        tokens.clear();
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
     * Fix: refresh unless another caller already replaced {@code seen} while this one waited for the lock.
     *
     * @param seen the token the caller found too old or was refused with (null if it had none)
     */
    public Answer refreshShared(Endpoint endpoint, Token seen) {
        synchronized (locks.computeIfAbsent(endpoint.id(), k -> new Object())) {
            Token current = tokens.get(endpoint.id());
            if (current != null && !Objects.equals(current, seen)) {
                return new Answer(200, current, 0, null);
            }
            return refreshOwn(endpoint);
        }
    }
}
