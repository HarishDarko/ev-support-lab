package dev.evlab.ocpp;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import tools.jackson.databind.JsonNode;

/**
 * Answers to the backend's own CALLs: a CALLRESULT whose handler fails does not escape to the websocket (which
 * would close it), and a CALLERROR clears the pending CALL. No Spring, no database.
 */
class OcppGatewayCallAnswerTest {

    private final WebSocketSession session = mock(WebSocketSession.class);
    private final OcppConnection connection = new OcppConnection("CP-UNIT-01", session);
    private final OcppGateway gateway = new OcppGateway(null, null, null, null, null, null, null, null);

    @Test
    void a_result_whose_handler_fails_is_logged_and_the_connection_carries_on() throws Exception {
        List<JsonNode> seen = new ArrayList<>();
        connection.call("GetTransactionStatus", Map.of("transactionId", "TX-1"), payload -> {
            seen.add(payload);
            throw new IllegalArgumentException("malformed GetTransactionStatus result");
        });
        String id = sentUniqueId();

        assertThatCode(() -> gateway.onText(connection, "[3,\"" + id + "\",{\"messagesInQueue\":\"maybe\"}]"))
                .doesNotThrowAnyException();
        assertThat(seen).hasSize(1);
        assertThat(connection.pendingCalls()).isZero();
    }

    @Test
    void a_CALLERROR_clears_the_pending_call_and_a_later_result_for_it_is_ignored() throws Exception {
        List<JsonNode> seen = new ArrayList<>();
        connection.call("GetTransactionStatus", Map.of("transactionId", "TX-2"), seen::add);
        String id = sentUniqueId();
        assertThat(connection.pendingCalls()).isEqualTo(1);

        gateway.onText(connection, "[4,\"" + id + "\",\"InternalError\",\"charger busy\",{}]");
        assertThat(connection.pendingCalls()).isZero();

        gateway.onText(connection, "[3,\"" + id + "\",{\"messagesInQueue\":false}]");
        assertThat(seen).isEmpty();
    }

    private String sentUniqueId() throws Exception {
        ArgumentCaptor<TextMessage> sent = ArgumentCaptor.forClass(TextMessage.class);
        verify(session).sendMessage(sent.capture());
        return switch (OcppFrame.parse(sent.getValue().getPayload())) {
            case OcppFrame.Call call -> call.uniqueId();
            default -> throw new IllegalStateException("expected a CALL");
        };
    }
}
