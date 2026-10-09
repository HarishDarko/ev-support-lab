package dev.evlab.ocpp;

import dev.evlab.ocpp.messages.TransactionEventRequest;
import dev.evlab.ocpp.messages.TransactionEventRequest.MeterValue;
import dev.evlab.ocpp.messages.TransactionEventRequest.SampledValue;
import dev.evlab.transaction.TxEvent;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;

/** Wire message to domain event. Rejects requests missing a required OCPP field. */
final class TransactionEventMapper {

    private TransactionEventMapper() {}

    static TxEvent toDomain(TransactionEventRequest r) {
        if (r.eventType() == null || r.timestamp() == null || r.triggerReason() == null || r.seqNo() == null
                || r.transactionInfo() == null || r.transactionInfo().transactionId() == null) {
            throw new OcppProtocolException(OcppErrorCode.FormationViolation,
                    "TransactionEvent requires eventType, timestamp, triggerReason, seqNo, transactionInfo.transactionId");
        }
        Sample sample = latestEnergySample(r.meterValue());
        return new TxEvent(
                r.transactionInfo().transactionId(),
                r.seqNo(),
                r.eventType(),
                r.timestamp(),
                r.triggerReason(),
                Boolean.TRUE.equals(r.offline()),
                r.transactionInfo().stoppedReason(),
                r.evse() == null ? null : r.evse().id(),
                sample == null ? null : sample.wh(),
                sample == null ? null : sample.at());
    }

    private record Sample(double wh, Instant at) {}

    private static Sample latestEnergySample(List<MeterValue> meterValues) {
        if (meterValues == null) {
            return null;
        }
        return meterValues.stream()
                .filter(mv -> mv.sampledValue() != null)
                .flatMap(mv -> mv.sampledValue().stream()
                        .filter(sv -> sv.measurand() == null
                                || TransactionEventRequest.ENERGY_MEASURAND.equals(sv.measurand()))
                        .map(sv -> new Sample(toWh(sv), mv.timestamp())))
                .filter(s -> s.at() != null)
                .max(Comparator.comparing(Sample::at))
                .orElse(null);
    }

    private static double toWh(SampledValue sv) {
        String unit = sv.unitOfMeasure() == null ? null : sv.unitOfMeasure().unit();
        if (unit == null || Objects.equals(unit, "Wh")) {
            return sv.value();
        }
        if (unit.equals("kWh")) {
            return sv.value() * 1000.0;
        }
        throw new OcppProtocolException(OcppErrorCode.FormationViolation, "unsupported energy unit " + unit);
    }
}
