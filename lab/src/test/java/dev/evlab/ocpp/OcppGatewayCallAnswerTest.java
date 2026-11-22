package dev.evlab.ocpp;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import dev.evlab.observability.GatewayTrace;
import dev.evlab.ocpp.messages.GetTransactionStatusResponse;
import dev.evlab.persistence.ConnectionLogRepository;
import dev.evlab.reconciliation.ReconciliationService;
import dev.evlab.station.FeatureFlags;
import dev.evlab.station.StationRepository;
import dev.evlab.station.StationTime;
import java.time.Instant;

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

    @Test
    void a_malformed_GetTransactionStatus_answer_is_dropped_and_never_reaches_reconciliation() throws Exception {
        ReconciliationService reconciliation = reconnectingGateway();
        String id = sentUniqueId();

        assertThatCode(() -> wired.onText(connection, "[3,\"" + id + "\",{\"messagesInQueue\":\"maybe\"}]"))
                .doesNotThrowAnyException();
        verify(reconciliation, never()).onStatusAnswer(anyString(), anyString(), any());
    }

    @Test
    void a_backend_failure_while_recording_a_valid_answer_does_not_close_the_connection() throws Exception {
        ReconciliationService reconciliation = reconnectingGateway();
        doThrow(new IllegalStateException("database unavailable")).when(reconciliation)
                .onStatusAnswer(eq("CP-UNIT-01"), eq("TX-9"), any(GetTransactionStatusResponse.class));
        String id = sentUniqueId();

        assertThatCode(() -> wired.onText(connection,
                "[3,\"" + id + "\",{\"messagesInQueue\":false,\"ongoingIndicator\":false}]"))
                .doesNotThrowAnyException();
        verify(reconciliation).onStatusAnswer(eq("CP-UNIT-01"), eq("TX-9"), any(GetTransactionStatusResponse.class));
        assertThat(connection.pendingCalls()).isZero();
    }

    private OcppGateway wired;

    /** A gateway whose station reconnects with one open transaction, TX-9, so it sends one GetTransactionStatus. */
    private ReconciliationService reconnectingGateway() {
        ReconciliationService reconciliation = mock(ReconciliationService.class);
        FeatureFlags flags = mock(FeatureFlags.class);
        StationTime time = mock(StationTime.class);
        when(flags.transactionAwareReconciliation("CP-UNIT-01")).thenReturn(true);
        when(reconciliation.onStationReconnected("CP-UNIT-01")).thenReturn(List.of("TX-9"));
        when(time.now("CP-UNIT-01")).thenReturn(Instant.parse("2026-03-02T10:00:00Z"));
        wired = new OcppGateway(mock(StationRepository.class), null, mock(ConnectionLogRepository.class), null,
                reconciliation, flags, mock(GatewayTrace.class), time);
        wired.onOpen(connection);
        return reconciliation;
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
