package dev.evlab.ocpp;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import org.springframework.web.socket.SubProtocolCapable;

/** Endpoint {@code /ocpp/{stationId}}, subprotocol {@code ocpp2.0.1}. All logic lives in {@link OcppGateway}. */
@Component
public class OcppWebSocketHandler extends TextWebSocketHandler implements SubProtocolCapable {

    public static final String SUBPROTOCOL = "ocpp2.0.1";

    private final OcppGateway gateway;
    private final Map<String, OcppConnection> connections = new ConcurrentHashMap<>();

    public OcppWebSocketHandler(OcppGateway gateway) {
        this.gateway = gateway;
    }

    @Override
    public List<String> getSubProtocols() {
        return List.of(SUBPROTOCOL);
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession raw) {
        WebSocketSession session = new ConcurrentWebSocketSessionDecorator(raw, 10_000, 1 << 20);
        String path = raw.getUri() == null ? "" : raw.getUri().getPath();
        String stationId = path.substring(path.lastIndexOf('/') + 1);
        OcppConnection connection = new OcppConnection(stationId, session);
        connections.put(raw.getId(), connection);
        gateway.onOpen(connection);
    }

    @Override
    protected void handleTextMessage(WebSocketSession raw, TextMessage message) {
        OcppConnection connection = connections.get(raw.getId());
        if (connection != null) {
            gateway.onText(connection, message.getPayload());
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession raw, CloseStatus status) {
        OcppConnection connection = connections.remove(raw.getId());
        if (connection != null) {
            gateway.onClose(connection, status.getCode());
        }
    }
}
