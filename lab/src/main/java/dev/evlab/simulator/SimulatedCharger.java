package dev.evlab.simulator;

import dev.evlab.ocpp.OcppFrame;
import dev.evlab.ocpp.OcppJson;
import dev.evlab.ocpp.messages.GetTransactionStatusRequest;
import dev.evlab.ocpp.messages.GetTransactionStatusResponse;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import tools.jackson.databind.JsonNode;

/**
 * A charger with a real websocket client. It speaks OCPP-J 2.0.1: it sends CALLs and waits for the result,
 * and answers the backend's GetTransactionStatus from a scripted {@link StatusAnswerSpec}.
 *
 * <p>All outgoing frames go through one single-threaded executor, so a reply to a backend CALL is always sent
 * before anything the script sends after it has been told the backend's answer.
 */
public class SimulatedCharger implements AutoCloseable {

    private static final long TIMEOUT_SEC = 20;

    private final String stationId;
    private final String baseUrl;
    private final HttpClient http = HttpClient.newHttpClient();
    private final ExecutorService sender = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "charger-send");
        t.setDaemon(true);
        return t;
    });
    private final Map<String, CompletableFuture<OcppFrame>> pending = new ConcurrentHashMap<>();
    private volatile WebSocket socket;
    private volatile StatusAnswerSpec statusAnswer = StatusAnswerSpec.NOTHING_PENDING;

    /** @param baseUrl e.g. {@code ws://localhost:8080/ocpp} */
    public SimulatedCharger(String baseUrl, String stationId) {
        this.baseUrl = baseUrl;
        this.stationId = stationId;
    }

    public String stationId() {
        return stationId;
    }

    public boolean connected() {
        return socket != null;
    }

    public void statusAnswer(StatusAnswerSpec spec) {
        this.statusAnswer = spec;
    }

    public void connect() {
        if (socket != null) {
            throw new IllegalStateException(stationId + " is already connected");
        }
        socket = http.newWebSocketBuilder()
                .subprotocols("ocpp2.0.1")
                .buildAsync(URI.create(baseUrl + "/" + stationId), new Listener())
                .orTimeout(TIMEOUT_SEC, TimeUnit.SECONDS)
                .join();
    }

    /** Kills the connection without a close frame, like a modem losing signal. The server sees code 1006. */
    public void drop() {
        WebSocket s = socket;
        socket = null;
        if (s != null) {
            s.abort();
        }
    }

    /** Sends a CALL and returns the CALLRESULT payload. A CALLERROR becomes an exception. */
    public JsonNode call(String action, Object payload) {
        String id = UUID.randomUUID().toString();
        CompletableFuture<OcppFrame> reply = new CompletableFuture<>();
        pending.put(id, reply);
        send(new OcppFrame.Call(id, action, OcppJson.toNode(payload)));
        OcppFrame frame = reply.orTimeout(TIMEOUT_SEC, TimeUnit.SECONDS).join();
        return switch (frame) {
            case OcppFrame.CallResult r -> r.payload();
            case OcppFrame.CallError e -> throw new IllegalStateException(
                    stationId + " " + action + " failed: " + e.errorCode() + " " + e.errorDescription());
            case OcppFrame.Call c -> throw new IllegalStateException("unexpected CALL as reply");
        };
    }

    private void send(OcppFrame frame) {
        WebSocket s = socket;
        if (s == null) {
            throw new IllegalStateException(stationId + " is not connected");
        }
        try {
            sender.submit(() -> s.sendText(frame.toJson(), true).join()).get(TIMEOUT_SEC, TimeUnit.SECONDS);
        } catch (Exception e) {
            throw new IllegalStateException(stationId + " send failed", e);
        }
    }

    @Override
    public void close() {
        WebSocket s = socket;
        socket = null;
        if (s != null) {
            s.sendClose(WebSocket.NORMAL_CLOSURE, "bye");
        }
        sender.shutdownNow();
    }

    private final class Listener implements WebSocket.Listener {

        private final StringBuilder partial = new StringBuilder();

        @Override
        public void onOpen(WebSocket ws) {
            ws.request(1);
        }

        @Override
        public CompletionStage<?> onText(WebSocket ws, CharSequence data, boolean last) {
            partial.append(data);
            if (last) {
                String text = partial.toString();
                partial.setLength(0);
                handle(ws, OcppFrame.parse(text));
            }
            ws.request(1);
            return null;
        }

        private void handle(WebSocket ws, OcppFrame frame) {
            switch (frame) {
                case OcppFrame.Call call -> answer(ws, call);
                case OcppFrame.CallResult r -> complete(r);
                case OcppFrame.CallError e -> complete(e);
            }
        }

        private void complete(OcppFrame frame) {
            CompletableFuture<OcppFrame> f = pending.remove(frame.uniqueId());
            if (f != null) {
                f.complete(frame);
            }
        }

        private void answer(WebSocket ws, OcppFrame.Call call) {
            OcppFrame reply;
            if ("GetTransactionStatus".equals(call.action())) {
                OcppJson.fromNode(call.payload(), GetTransactionStatusRequest.class);
                StatusAnswerSpec spec = statusAnswer;
                reply = new OcppFrame.CallResult(call.uniqueId(), OcppJson.toNode(
                        new GetTransactionStatusResponse(spec.ongoingIndicator(), spec.messagesInQueue())));
            } else {
                reply = new OcppFrame.CallError(call.uniqueId(), "NotImplemented", call.action(),
                        OcppJson.MAPPER.createObjectNode());
            }
            sender.execute(() -> ws.sendText(reply.toJson(), true).join());
        }

        @Override
        public void onError(WebSocket ws, Throwable error) {
            pending.values().forEach(f -> f.completeExceptionally(error));
        }
    }
}
