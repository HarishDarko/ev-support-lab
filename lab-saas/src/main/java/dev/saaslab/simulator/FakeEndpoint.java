package dev.saaslab.simulator;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.time.Clock;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Customer webhook endpoints, scripted: POST /hooks/{endpointId}. An OAuth endpoint wants a bearer token its
 * identity provider still accepts (401 otherwise); an HMAC endpoint wants the signature it was set up with. An
 * endpoint can be scripted down (an HTTP status until a time). Every event id received is counted, so a delivery
 * that arrived twice shows. Synthetic.
 */
public final class FakeEndpoint implements AutoCloseable {

    private record Down(int status, Instant until) {}

    private final Clock clock;
    private final HttpServer server;
    private final Map<String, String> oauthClients = new ConcurrentHashMap<>();
    private final Map<String, String> signatures = new ConcurrentHashMap<>();
    private final Map<String, FakeIdentityProvider> providers = new ConcurrentHashMap<>();
    private final Map<String, Down> down = new ConcurrentHashMap<>();
    private final Map<String, AtomicInteger> received = new ConcurrentHashMap<>();

    public FakeEndpoint(Clock clock) {
        this.clock = clock;
        try {
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
        server.createContext("/hooks/", this::hook);
        server.setExecutor(Executors.newVirtualThreadPerTaskExecutor());
        server.start();
    }

    public String url(String endpointId) {
        return "http://127.0.0.1:" + server.getAddress().getPort() + "/hooks/" + endpointId;
    }

    public void oauth(String endpointId, FakeIdentityProvider provider, String clientId) {
        providers.put(endpointId, provider);
        oauthClients.put(endpointId, clientId);
    }

    public void hmac(String endpointId, String expectedSignature) {
        signatures.put(endpointId, expectedSignature);
    }

    public void down(String endpointId, int status, Instant until) {
        down.put(endpointId, new Down(status, until));
    }

    /** How many distinct events arrived more than once (test deliveries excluded). */
    public long deliveredTwice() {
        return received.entrySet().stream()
                .filter(e -> !e.getKey().contains("|test-") && e.getValue().get() > 1).count();
    }

    /** Events of these endpoints whose id starts with {@code prefix} that arrived more than once. */
    public long deliveredTwice(java.util.List<String> endpointIds, String prefix) {
        return received.entrySet().stream().filter(e -> e.getValue().get() > 1).filter(e -> {
            int bar = e.getKey().indexOf('|');
            return endpointIds.contains(e.getKey().substring(0, bar)) && e.getKey().startsWith(prefix, bar + 1);
        }).count();
    }

    public int received(String endpointId) {
        return (int) received.keySet().stream().filter(k -> k.startsWith(endpointId + "|")).count();
    }

    private void hook(HttpExchange exchange) throws IOException {
        exchange.getRequestBody().readAllBytes();
        String endpointId = exchange.getRequestURI().getPath().substring("/hooks/".length());
        Down d = down.get(endpointId);
        if (d != null && clock.instant().isBefore(d.until())) {
            FakeIdentityProvider.send(exchange, d.status(), "{\"error\":\"unavailable\"}", null);
            return;
        }
        if (oauthClients.containsKey(endpointId)) {
            String auth = exchange.getRequestHeaders().getFirst("Authorization");
            String token = auth != null && auth.startsWith("Bearer ") ? auth.substring(7) : null;
            if (token == null || !providers.get(endpointId).accepts(oauthClients.get(endpointId), token)) {
                FakeIdentityProvider.send(exchange, 401, "{\"error\":\"invalid_token\"}", null);
                return;
            }
        } else if (signatures.containsKey(endpointId)
                && !signatures.get(endpointId).equals(exchange.getRequestHeaders().getFirst("X-Signature"))) {
            FakeIdentityProvider.send(exchange, 401, "{\"error\":\"invalid signature\"}", null);
            return;
        }
        String eventId = exchange.getRequestHeaders().getFirst("X-Event-Id");
        received.computeIfAbsent(endpointId + "|" + eventId, k -> new AtomicInteger()).incrementAndGet();
        FakeIdentityProvider.send(exchange, 200, "", null);
    }

    @Override
    public void close() {
        server.stop(0);
    }
}
