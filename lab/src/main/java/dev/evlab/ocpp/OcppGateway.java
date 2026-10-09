package dev.evlab.ocpp;

import dev.evlab.observability.GatewayTrace;
import dev.evlab.ocpp.messages.BootNotificationRequest;
import dev.evlab.ocpp.messages.BootNotificationResponse;
import dev.evlab.ocpp.messages.GetTransactionStatusRequest;
import dev.evlab.ocpp.messages.GetTransactionStatusResponse;
import dev.evlab.ocpp.messages.HeartbeatResponse;
import dev.evlab.ocpp.messages.StatusNotificationRequest;
import dev.evlab.ocpp.messages.TransactionEventRequest;
import dev.evlab.ocpp.messages.TransactionEventType;
import dev.evlab.persistence.ConnectionLogRepository;
import dev.evlab.reconciliation.ReconciliationService;
import dev.evlab.station.EvseStatusRepository;
import dev.evlab.station.FeatureFlags;
import dev.evlab.station.StationRepository;
import dev.evlab.station.StationTime;
import dev.evlab.transaction.EventOutcome;
import dev.evlab.transaction.TransactionEventService;
import dev.evlab.transaction.TxEvent;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;

/** The OCPP protocol layer: frames in, domain calls out. Transport-agnostic apart from {@link OcppConnection}. */
@Component
public class OcppGateway {

    private static final Logger log = LoggerFactory.getLogger(OcppGateway.class);

    /** Websocket close code for "closed without a close frame". */
    public static final int ABNORMAL_CLOSE = 1006;

    private final StationRepository stations;
    private final EvseStatusRepository evseStatus;
    private final ConnectionLogRepository connectionLog;
    private final TransactionEventService transactionEvents;
    private final ReconciliationService reconciliation;
    private final FeatureFlags flags;
    private final GatewayTrace trace;
    private final StationTime time;
    private final Map<String, OcppConnection> current = new ConcurrentHashMap<>();

    public OcppGateway(StationRepository stations, EvseStatusRepository evseStatus,
            ConnectionLogRepository connectionLog, TransactionEventService transactionEvents,
            ReconciliationService reconciliation, FeatureFlags flags, GatewayTrace trace, StationTime time) {
        this.stations = stations;
        this.evseStatus = evseStatus;
        this.connectionLog = connectionLog;
        this.transactionEvents = transactionEvents;
        this.reconciliation = reconciliation;
        this.flags = flags;
        this.trace = trace;
        this.time = time;
    }

    public void onOpen(OcppConnection connection) {
        String station = connection.stationId();
        Instant now = time.now(station);
        current.put(station, connection);
        stations.markConnected(station, now);
        log.info("event=websocket_opened station={}", station);
        trace.record(station, now, "gateway", () -> "websocket opened  " + station);

        if (flags.transactionAwareReconciliation(station)) {
            for (String transactionId : reconciliation.onStationReconnected(station)) {
                connection.call("GetTransactionStatus", new GetTransactionStatusRequest(transactionId),
                        result -> reconciliation.onStatusAnswer(station, transactionId,
                                OcppJson.fromNode(result, GetTransactionStatusResponse.class)));
            }
        }
        // Last on purpose: once "opened" is visible, the reconnect has been noted and the queries are sent.
        connectionLog.opened(station, now);
    }

    public void onClose(OcppConnection connection, int closeCode) {
        String station = connection.stationId();
        Instant now = time.now(station);
        // A late close of an old session must not mark a newer session's station as disconnected.
        if (current.remove(station, connection)) {
            stations.markDisconnected(station, now);
        }
        connectionLog.closed(station, now, closeCode);
        log.info("event=websocket_closed station={} code={}", station, closeCode);
        trace.record(station, now, "gateway", () -> closeCode == ABNORMAL_CLOSE
                ? "connection lost (websocket 1006, no close frame)"
                : "websocket closed (code " + closeCode + ")");
    }

    public void onText(OcppConnection connection, String text) {
        OcppFrame frame;
        try {
            frame = OcppFrame.parse(text);
        } catch (OcppProtocolException e) {
            connection.send(new OcppFrame.CallError(e.uniqueId(), e.code().name(), e.getMessage(),
                    OcppJson.MAPPER.createObjectNode()));
            return;
        }
        switch (frame) {
            case OcppFrame.Call call -> handleCall(connection, call);
            case OcppFrame.CallResult result -> {
                var callback = connection.takePending(result.uniqueId());
                if (callback != null) {
                    callback.accept(result.payload());
                }
            }
            case OcppFrame.CallError error -> log.warn("event=call_error station={} code={} description={}",
                    connection.stationId(), error.errorCode(), error.errorDescription());
        }
    }

    private void handleCall(OcppConnection connection, OcppFrame.Call call) {
        String station = connection.stationId();
        Instant now = time.now(station);
        trace.record(station, now, station + " → " + call.action(),
                () -> FrameSummary.of(call.action(), call.payload()));
        try {
            JsonNode response = dispatch(station, call, now);
            connection.send(new OcppFrame.CallResult(call.uniqueId(), response));
        } catch (OcppProtocolException e) {
            connection.send(new OcppFrame.CallError(call.uniqueId(), e.code().name(), e.getMessage(),
                    OcppJson.MAPPER.createObjectNode()));
        } catch (RuntimeException e) {
            log.error("event=call_failed station={} action={}", station, call.action(), e);
            connection.send(new OcppFrame.CallError(call.uniqueId(), OcppErrorCode.InternalError.name(),
                    "internal error", OcppJson.MAPPER.createObjectNode()));
        }
    }

    private JsonNode dispatch(String station, OcppFrame.Call call, Instant now) {
        return switch (call.action()) {
            case "BootNotification" -> {
                var request = OcppJson.fromNode(call.payload(), BootNotificationRequest.class);
                if (request.chargingStation() != null && request.chargingStation().firmwareVersion() != null) {
                    stations.setFirmware(station, request.chargingStation().firmwareVersion());
                }
                yield OcppJson.toNode(new BootNotificationResponse(now, 30, "Accepted"));
            }
            case "Heartbeat" -> OcppJson.toNode(new HeartbeatResponse(now));
            case "StatusNotification" -> {
                var request = OcppJson.fromNode(call.payload(), StatusNotificationRequest.class);
                if (request.timestamp() == null || request.connectorStatus() == null) {
                    throw new OcppProtocolException(OcppErrorCode.FormationViolation,
                            "StatusNotification requires timestamp and connectorStatus");
                }
                evseStatus.upsert(station, request.evseId(), request.connectorStatus(), request.timestamp());
                yield OcppJson.MAPPER.createObjectNode();
            }
            case "TransactionEvent" -> {
                var request = OcppJson.fromNode(call.payload(), TransactionEventRequest.class);
                TxEvent event = TransactionEventMapper.toDomain(request);
                if (event.type() == TransactionEventType.Started && event.evseId() == null) {
                    throw new OcppProtocolException(OcppErrorCode.FormationViolation,
                            "Started requires evse.id");
                }
                if (event.type() == TransactionEventType.Ended) {
                    trace.noteEndedReceived(station, event.transactionId());
                }
                EventOutcome outcome = transactionEvents.handle(station, event);
                if (outcome == EventOutcome.IGNORED_OUT_OF_ORDER) {
                    trace.record(station, now, station + " ← TransactionEventResponse", () -> "(empty payload)");
                }
                yield OcppJson.MAPPER.createObjectNode();
            }
            default -> throw new OcppProtocolException(OcppErrorCode.NotImplemented,
                    call.action() + " is not implemented");
        };
    }
}
