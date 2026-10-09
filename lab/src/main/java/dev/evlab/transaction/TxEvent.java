package dev.evlab.transaction;

import dev.evlab.ocpp.messages.TransactionEventType;
import java.time.Instant;

/**
 * A TransactionEvent reduced to what the domain needs. {@code meterAt} is the sample time, which can
 * differ from {@code timestamp} for a replayed event.
 */
public record TxEvent(
        String transactionId,
        int seqNo,
        TransactionEventType type,
        Instant timestamp,
        String triggerReason,
        boolean offline,
        String stoppedReason,
        Integer evseId,
        Double meterWh,
        Instant meterAt) {

    public static final String EV_COMMUNICATION_LOST = "EVCommunicationLost";
}
