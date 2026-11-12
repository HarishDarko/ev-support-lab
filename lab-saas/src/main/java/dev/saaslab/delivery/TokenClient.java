package dev.saaslab.delivery;

import dev.saaslab.delivery.DeliveryStore.Endpoint;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Clock;
import java.time.Instant;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

/** Asks a customer's identity provider for an access token (OAuth client credentials), and records every request. */
@Component
public class TokenClient {

    /** The identity provider's answer. {@code token} is null unless status is 200. */
    public record Answer(int status, Token token, long retryAfterSeconds, String error) {
        public boolean ok() {
            return status == 200 && token != null;
        }
    }

    public record Token(String value, Instant expiresAt) {}

    private static final Pattern TOKEN = Pattern.compile("\"access_token\"\\s*:\\s*\"([^\"]+)\"");
    private static final Pattern EXPIRES = Pattern.compile("\"expires_in\"\\s*:\\s*(\\d+)");
    private static final Pattern ERROR = Pattern.compile("\"error\"\\s*:\\s*\"([^\"]+)\"");

    private final HttpClient http;
    private final DeliveryStore store;
    private final Clock clock;

    public TokenClient(HttpClient http, DeliveryStore store, Clock clock) {
        this.http = http;
        this.store = store;
        this.clock = clock;
    }

    public Answer request(Endpoint endpoint) {
        Instant at = clock.instant();
        HttpRequest request = HttpRequest.newBuilder(URI.create(endpoint.tokenUrl()))
                .header("Content-Type", "application/x-www-form-urlencoded")
                .POST(HttpRequest.BodyPublishers.ofString(
                        "grant_type=client_credentials&client_id=" + endpoint.clientId()))
                .build();
        try {
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            store.tokenRequest(endpoint.id(), at, response.statusCode());
            String body = response.body();
            if (response.statusCode() == 200) {
                Matcher token = TOKEN.matcher(body);
                Matcher expires = EXPIRES.matcher(body);
                if (token.find() && expires.find()) {
                    return new Answer(200, new Token(token.group(1),
                            at.plusSeconds(Long.parseLong(expires.group(1)))), 0, null);
                }
                return new Answer(200, null, 0, "malformed token answer");
            }
            long retryAfter = response.headers().firstValueAsLong("Retry-After").orElse(0);
            Matcher error = ERROR.matcher(body);
            return new Answer(response.statusCode(), null, retryAfter, error.find() ? error.group(1) : null);
        } catch (IOException e) {
            store.tokenRequest(endpoint.id(), at, 0);
            return new Answer(0, null, 0, "unreachable");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(e);
        }
    }
}
