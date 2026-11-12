package dev.shoplab.payment;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

/**
 * Talks to the payment processor over HTTP: authorize (with an {@code Idempotency-Key}), look a payment up by its
 * key, capture, void.
 *
 * <p>Time in the lab is scripted, so the processor answers at once and stamps its answer with the scripted moment it
 * would have arrived ({@code Answered-At}). Checkout treats an answer stamped after its timeout as one it never
 * received, which is what a client that stopped waiting sees.
 */
@Component
public class ProcessorClient {

    /** The processor's answer. {@code status} is authorized, declined, processing, not_found or error. */
    public record Answer(int httpStatus, String status, String authorizationId, Instant answeredAt) {
        public boolean authorized() {
            return "authorized".equals(status);
        }
    }

    private static final Pattern ID = Pattern.compile("\"id\"\\s*:\\s*\"([^\"]+)\"");
    private static final Pattern STATUS = Pattern.compile("\"status\"\\s*:\\s*\"([^\"]+)\"");

    private final HttpClient http;

    public ProcessorClient(HttpClient http) {
        this.http = http;
    }

    public Answer authorize(String processorUrl, String idempotencyKey, String orderId, int amountPence, String card) {
        String body = "{\"orderId\":\"" + orderId + "\",\"amountPence\":" + amountPence + ",\"card\":\"" + card + "\"}";
        return send(HttpRequest.newBuilder(URI.create(processorUrl + "/v1/authorizations"))
                .header("Content-Type", "application/json")
                .header("Idempotency-Key", idempotencyKey)
                .POST(HttpRequest.BodyPublishers.ofString(body)).build());
    }

    public Answer lookup(String processorUrl, String idempotencyKey) {
        return send(HttpRequest.newBuilder(URI.create(processorUrl + "/v1/authorizations?idempotency_key="
                + URLEncoder.encode(idempotencyKey, StandardCharsets.UTF_8))).GET().build());
    }

    public Answer capture(String processorUrl, String authorizationId) {
        return send(HttpRequest.newBuilder(URI.create(processorUrl + "/v1/authorizations/" + authorizationId
                + "/capture")).POST(HttpRequest.BodyPublishers.noBody()).build());
    }

    public Answer voidAuthorization(String processorUrl, String authorizationId) {
        return send(HttpRequest.newBuilder(URI.create(processorUrl + "/v1/authorizations/" + authorizationId
                + "/void")).POST(HttpRequest.BodyPublishers.noBody()).build());
    }

    private Answer send(HttpRequest request) {
        try {
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            String body = response.body();
            Matcher id = ID.matcher(body);
            Matcher status = STATUS.matcher(body);
            Instant answeredAt = response.headers().firstValue("Answered-At").map(Instant::parse).orElse(null);
            return new Answer(response.statusCode(), status.find() ? status.group(1) : "error",
                    id.find() ? id.group(1) : null, answeredAt);
        } catch (IOException e) {
            throw new IllegalStateException("payment processor unreachable: " + request.uri(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(e);
        }
    }
}
