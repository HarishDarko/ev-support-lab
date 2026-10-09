package dev.evlab.ocpp.messages;

import java.time.Instant;
import java.util.List;

/** The subset of OCPP 2.0.1 TransactionEventRequest this lab reads and writes. */
public record TransactionEventRequest(
        TransactionEventType eventType,
        Instant timestamp,
        String triggerReason,
        Integer seqNo,
        Boolean offline,
        TransactionInfo transactionInfo,
        Evse evse,
        List<MeterValue> meterValue) {

    public static final String ENERGY_MEASURAND = "Energy.Active.Import.Register";

    public record TransactionInfo(String transactionId, String chargingState, String stoppedReason) {}

    public record Evse(int id, Integer connectorId) {}

    public record MeterValue(Instant timestamp, List<SampledValue> sampledValue) {}

    public record SampledValue(double value, String measurand, UnitOfMeasure unitOfMeasure) {}

    public record UnitOfMeasure(String unit) {}
}
