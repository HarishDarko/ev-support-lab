package dev.evlab.ocpp;

import java.io.IOException;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import tools.jackson.databind.JsonNode;

/** One websocket session with one station, plus the backend-initiated CALLs waiting for an answer. */
public class OcppConnection {

    private final String stationId;
    private final WebSocketSession session;
    private final Map<String, Consumer<JsonNode>> pendingCalls = new ConcurrentHashMap<>();

    public OcppConnection(String stationId, WebSocketSession session) {
        this.stationId = stationId;
        this.session = session;
    }

    public String stationId() {
        return stationId;
    }

    public void send(OcppFrame frame) {
        try {
            session.sendMessage(new TextMessage(frame.toJson()));
        } catch (IOException e) {
            throw new IllegalStateException("send to " + stationId + " failed", e);
        }
    }

    /** Sends a CALL; {@code onResult} runs when the matching CALLRESULT arrives. */
    public void call(String action, Object payload, Consumer<JsonNode> onResult) {
        String id = UUID.randomUUID().toString();
        pendingCalls.put(id, onResult);
        send(new OcppFrame.Call(id, action, OcppJson.toNode(payload)));
    }

    Consumer<JsonNode> takePending(String uniqueId) {
        return pendingCalls.remove(uniqueId);
    }
}
