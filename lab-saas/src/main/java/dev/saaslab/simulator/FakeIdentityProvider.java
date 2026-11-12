package dev.saaslab.simulator;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * A customer's identity provider, scripted: it issues client-credentials tokens that last {@code lifetimeSeconds},
 * keeps one active token per client (a new token revokes the one before, a common setting), and allows
 * {@code perMinute} token requests per client per minute of the scripted clock, then answers 429 with Retry-After.
 * A client can be revoked (401 invalid_client). Synthetic.
 */
public final class FakeIdentityProvider implements AutoCloseable {

    private record Issued(String value, Instant expiresAt) {}

    private final Clock clock;
    private final long lifetimeSeconds;
    private final int perMinute;
    private final HttpServer server;
    private final Map<String, Issued> active = new ConcurrentHashMap<>();
    private final Map<String, AtomicInteger> perMinuteCount = new ConcurrentHashMap<>();
    private final Set<String> revoked = ConcurrentHashMap.newKeySet();
    private final AtomicInteger issued = new AtomicInteger();
    private final AtomicInteger requests = new AtomicInteger();

    public FakeIdentityProvider(Clock clock, long lifetimeSeconds, int perMinute) {
        this.clock = clock;
        this.lifetimeSeconds = lifetimeSeconds;
        this.perMinute = perMinute;
        try {
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
        server.createContext("/oauth/token", this::token);
        server.setExecutor(Executors.newVirtualThreadPerTaskExecutor());
        server.start();
    }

    public String tokenUrl() {
        return "http://127.0.0.1:" + server.getAddress().getPort() + "/oauth/token";
    }

    public void revoke(String clientId) {
        revoked.add(clientId);
    }

    /** True if this is the client's current token and it has not expired. */
    public boolean accepts(String clientId, String token) {
        Issued current = active.get(clientId);
        return current != null && current.value().equals(token) && clock.instant().isBefore(current.expiresAt());
    }

    /** Token requests received so far, answered or not. */
    public int requests() {
        return requests.get();
    }

    private void token(HttpExchange exchange) throws IOException {
        requests.incrementAndGet();
        String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        String clientId = param(body, "client_id");
        if (clientId == null || revoked.contains(clientId)) {
            send(exchange, 401, "{\"error\":\"invalid_client\"}", null);
            return;
        }
        Instant now = clock.instant();
        long minute = now.getEpochSecond() / 60;
        int n = perMinuteCount.computeIfAbsent(clientId + "@" + minute, k -> new AtomicInteger()).incrementAndGet();
        if (n > perMinute) {
            send(exchange, 429, "{\"error\":\"rate_limited\"}", String.valueOf((minute + 1) * 60 - now.getEpochSecond()));
            return;
        }
        Issued token = new Issued(clientId + "-tok-" + issued.incrementAndGet(), now.plusSeconds(lifetimeSeconds));
        active.put(clientId, token);
        send(exchange, 200, "{\"access_token\":\"" + token.value() + "\",\"token_type\":\"Bearer\",\"expires_in\":"
                + lifetimeSeconds + "}", null);
    }

    private static String param(String form, String name) {
        for (String pair : form.split("&")) {
            int eq = pair.indexOf('=');
            if (eq > 0 && pair.substring(0, eq).equals(name)) {
                return URLDecoder.decode(pair.substring(eq + 1), StandardCharsets.UTF_8);
            }
        }
        return null;
    }

    static void send(HttpExchange exchange, int status, String body, String retryAfter) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        if (retryAfter != null) {
            exchange.getResponseHeaders().add("Retry-After", retryAfter);
        }
        exchange.sendResponseHeaders(status, bytes.length == 0 ? -1 : bytes.length);
        try (OutputStream out = exchange.getResponseBody()) {
            out.write(bytes);
        }
    }

    @Override
    public void close() {
        server.stop(0);
    }
}
