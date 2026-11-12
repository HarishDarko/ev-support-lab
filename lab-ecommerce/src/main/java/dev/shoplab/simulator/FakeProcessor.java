package dev.shoplab.simulator;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.URLDecoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * A payment processor, scripted, over HTTP. It honours {@code Idempotency-Key}: the same key returns the same
 * authorization, and only a new key makes a new one. Each new authorization answers after a scripted delay; cards
 * can be scripted to decline. For every new successful authorization it sends an {@code authorization.succeeded}
 * webhook to the shop at the moment it answers, unless the plan drops the order's webhooks. Synthetic.
 *
 * <p>Time is scripted, so the processor answers at once and stamps the answer with the moment it would arrive
 * ({@code Answered-At}). Its webhooks wait in {@link #takeScheduled()} until the scripted world delivers them at
 * their time with {@link #deliver(Webhook)}.
 */
public final class FakeProcessor implements AutoCloseable {

    /**
     * The script for one order.
     *
     * @param answerMillis how long the 1st, 2nd, ... new authorization for the order takes to answer (the last value
     *     repeats)
     * @param dropWebhooks the order's webhooks never arrive
     */
    public record Plan(List<Long> answerMillis, boolean dropWebhooks) {}

    /** A webhook due at {@code at}; {@code answeredInMillis} is how long the authorization took. */
    public record Webhook(Instant at, String authorizationId, String orderId, String idempotencyKey, int amountPence,
            long answeredInMillis) {}

    private record Auth(String id, String orderId, String key, int amountPence, String card, String status,
            Instant answeredAt) {}

    private static final Pattern ORDER = Pattern.compile("\"orderId\"\\s*:\\s*\"([^\"]+)\"");
    private static final Pattern AMOUNT = Pattern.compile("\"amountPence\"\\s*:\\s*(\\d+)");
    private static final Pattern CARD = Pattern.compile("\"card\"\\s*:\\s*\"([^\"]+)\"");

    private final Clock clock;
    private final long defaultAnswerMillis;
    private final HttpServer server;
    private final HttpClient http = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).build();
    private final Map<String, Auth> byKey = new ConcurrentHashMap<>();
    private final Map<String, Auth> byId = new ConcurrentHashMap<>();
    private final Map<String, Plan> plans = new ConcurrentHashMap<>();
    private final Map<String, AtomicInteger> newPerOrder = new ConcurrentHashMap<>();
    private final Map<String, AtomicInteger> capturesPerOrder = new ConcurrentHashMap<>();
    private final Set<String> decliningCards = ConcurrentHashMap.newKeySet();
    private final List<Webhook> scheduled = new ArrayList<>();
    private final AtomicInteger sequence = new AtomicInteger(0x8F00);
    private volatile String webhookUrl;

    public FakeProcessor(Clock clock, long defaultAnswerMillis) {
        this.clock = clock;
        this.defaultAnswerMillis = defaultAnswerMillis;
        try {
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
        server.createContext("/v1/authorizations", this::route);
        server.setExecutor(Executors.newVirtualThreadPerTaskExecutor());
        server.start();
    }

    public String url() {
        return "http://127.0.0.1:" + server.getAddress().getPort();
    }

    /** Where the shop receives webhooks. */
    public void webhookUrl(String url) {
        this.webhookUrl = url;
    }

    public void plan(String orderId, Plan plan) {
        plans.put(orderId, plan);
    }

    public void declines(String card) {
        decliningCards.add(card);
    }

    /** Successful authorizations the processor made for this order. */
    public int authorizations(String orderId) {
        return (int) byId.values().stream().filter(a -> a.orderId().equals(orderId) && "authorized".equals(a.status()))
                .count();
    }

    /** Captures (settled charges) the processor made for this order. */
    public int captures(String orderId) {
        AtomicInteger n = capturesPerOrder.get(orderId);
        return n == null ? 0 : n.get();
    }

    /** Webhooks that became due since the last call, in the order they were made. */
    public synchronized List<Webhook> takeScheduled() {
        List<Webhook> out = new ArrayList<>(scheduled);
        scheduled.clear();
        return out;
    }

    /** Sends one webhook to the shop now and waits for its answer. */
    public int deliver(Webhook w) {
        String body = "{\"type\":\"authorization.succeeded\",\"authorizationId\":\"" + w.authorizationId()
                + "\",\"orderId\":\"" + w.orderId() + "\",\"idempotencyKey\":\"" + w.idempotencyKey()
                + "\",\"amountPence\":" + w.amountPence() + "}";
        try {
            return http.send(HttpRequest.newBuilder(URI.create(webhookUrl)).header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.discarding())
                    .statusCode();
        } catch (IOException e) {
            throw new IllegalStateException("webhook not delivered to " + webhookUrl, e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(e);
        }
    }

    private void route(HttpExchange exchange) throws IOException {
        String path = exchange.getRequestURI().getPath();
        String method = exchange.getRequestMethod();
        if ("POST".equals(method) && path.equals("/v1/authorizations")) {
            authorize(exchange);
        } else if ("GET".equals(method) && path.equals("/v1/authorizations")) {
            lookup(exchange);
        } else if ("POST".equals(method) && path.endsWith("/capture")) {
            capture(exchange, path.split("/")[3]);
        } else if ("POST".equals(method) && path.endsWith("/void")) {
            voidAuthorization(exchange, path.split("/")[3]);
        } else {
            send(exchange, 404, "{\"status\":\"not_found\"}", null);
        }
    }

    private void authorize(HttpExchange exchange) throws IOException {
        String key = exchange.getRequestHeaders().getFirst("Idempotency-Key");
        String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        String orderId = group(ORDER, body);
        String card = group(CARD, body);
        String amountText = group(AMOUNT, body);
        if (key == null || orderId == null || card == null || amountText == null) {
            send(exchange, 400, "{\"status\":\"error\",\"error\":\"bad request\"}", null);
            return;
        }
        int amount = Integer.parseInt(amountText);
        Instant now = clock.instant();
        Auth auth;
        synchronized (this) {
            auth = byKey.get(key);
            if (auth != null && (auth.amountPence() != amount || !auth.card().equals(card))) {
                send(exchange, 422, "{\"status\":\"error\",\"error\":\"idempotency key reused with other details\"}",
                        null);
                return;
            }
            if (auth == null) {
                auth = create(key, orderId, amount, card, now);
            }
        }
        // The same key returns the first authorization, once it is ready.
        Instant answeredAt = auth.answeredAt().isAfter(now) ? auth.answeredAt() : now;
        send(exchange, 200, json(auth), answeredAt);
    }

    private Auth create(String key, String orderId, int amount, String card, Instant now) {
        Plan plan = plans.get(orderId);
        int n = newPerOrder.computeIfAbsent(orderId, k -> new AtomicInteger()).getAndIncrement();
        long delay = defaultAnswerMillis;
        if (plan != null && !plan.answerMillis().isEmpty()) {
            delay = plan.answerMillis().get(Math.min(n, plan.answerMillis().size() - 1));
        }
        String status = decliningCards.contains(card) ? "declined" : "authorized";
        Auth auth = new Auth(String.format("au_%04X", sequence.incrementAndGet()), orderId, key, amount, card, status,
                now.plus(Duration.ofMillis(delay)));
        byKey.put(key, auth);
        byId.put(auth.id(), auth);
        if ("authorized".equals(status) && (plan == null || !plan.dropWebhooks())) {
            scheduled.add(new Webhook(auth.answeredAt(), auth.id(), orderId, key, amount, delay));
        }
        return auth;
    }

    private void lookup(HttpExchange exchange) throws IOException {
        String query = exchange.getRequestURI().getRawQuery();
        String key = null;
        for (String pair : query == null ? new String[0] : query.split("&")) {
            if (pair.startsWith("idempotency_key=")) {
                key = URLDecoder.decode(pair.substring("idempotency_key=".length()), StandardCharsets.UTF_8);
            }
        }
        Auth auth = key == null ? null : byKey.get(key);
        Instant now = clock.instant();
        if (auth == null) {
            send(exchange, 404, "{\"status\":\"not_found\"}", now);
        } else if (now.isBefore(auth.answeredAt())) {
            send(exchange, 200, "{\"status\":\"processing\"}", now);
        } else {
            send(exchange, 200, json(auth), now);
        }
    }

    private void capture(HttpExchange exchange, String id) throws IOException {
        Auth auth = byId.get(id);
        if (auth == null || !"authorized".equals(auth.status())) {
            send(exchange, 409, "{\"status\":\"error\",\"error\":\"not capturable\"}", null);
            return;
        }
        capturesPerOrder.computeIfAbsent(auth.orderId(), k -> new AtomicInteger()).incrementAndGet();
        send(exchange, 200, "{\"id\":\"" + id + "\",\"status\":\"captured\"}", clock.instant());
    }

    private void voidAuthorization(HttpExchange exchange, String id) throws IOException {
        Auth auth = byId.get(id);
        if (auth == null) {
            send(exchange, 404, "{\"status\":\"not_found\"}", null);
            return;
        }
        send(exchange, 200, "{\"id\":\"" + id + "\",\"status\":\"voided\"}", clock.instant());
    }

    private static String json(Auth a) {
        return "{\"id\":\"" + a.id() + "\",\"status\":\"" + a.status() + "\",\"orderId\":\"" + a.orderId()
                + "\",\"amountPence\":" + a.amountPence() + "}";
    }

    private static String group(Pattern p, String s) {
        Matcher m = p.matcher(s);
        return m.find() ? m.group(1) : null;
    }

    private static void send(HttpExchange exchange, int status, String body, Instant answeredAt) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        if (answeredAt != null) {
            exchange.getResponseHeaders().add("Answered-At", answeredAt.toString());
        }
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream out = exchange.getResponseBody()) {
            out.write(bytes);
        }
    }

    @Override
    public void close() {
        server.stop(0);
    }
}
