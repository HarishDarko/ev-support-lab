package dev.evlab.ocpp;

import dev.evlab.ocpp.messages.TransactionEventRequest;
import dev.evlab.transaction.TxEvent;
import java.util.Locale;
import tools.jackson.databind.JsonNode;

/** One-line summaries of frames for the gateway log. Summaries, not payload dumps. */
final class FrameSummary {

    private FrameSummary() {}

    static String of(String action, JsonNode payload) {
        try {
            return switch (action) {
                case "TransactionEvent" -> transactionEvent(OcppJson.fromNode(payload, TransactionEventRequest.class));
                case "StatusNotification" -> "evseId=" + payload.path("evseId").asInt()
                        + "  connectorStatus=" + payload.path("connectorStatus").asString();
                case "Heartbeat" -> "";
                default -> "";
            };
        } catch (OcppProtocolException e) {
            return "(unreadable payload)";
        }
    }

    private static String transactionEvent(TransactionEventRequest r) {
        StringBuilder sb = new StringBuilder("eventType=").append(r.eventType())
                .append("  transactionId=").append(r.transactionInfo().transactionId());
        if (Boolean.TRUE.equals(r.offline())) {
            sb.append("  offline=true");
        }
        sb.append("  seqNo=").append(r.seqNo());
        if (TxEvent.EV_COMMUNICATION_LOST.equals(r.triggerReason())) {
            sb.append("  triggerReason=").append(r.triggerReason());
        }
        if (r.transactionInfo().stoppedReason() != null) {
            sb.append("  stoppedReason=").append(r.transactionInfo().stoppedReason());
        }
        TxEvent e = TransactionEventMapper.toDomain(r);
        if (e.meterWh() != null && r.eventType() != dev.evlab.ocpp.messages.TransactionEventType.Ended) {
            sb.append("  meter=").append(String.format(Locale.ROOT, "%.2f kWh", e.meterWh() / 1000.0));
        }
        return sb.toString();
    }
}
