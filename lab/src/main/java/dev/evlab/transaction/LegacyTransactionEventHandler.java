package dev.evlab.transaction;

import dev.evlab.observability.GatewayTrace;
import dev.evlab.ocpp.messages.ConnectorStatus;
import dev.evlab.ocpp.messages.TransactionEventType;
import dev.evlab.station.EvseStatusRepository;
import dev.evlab.station.StationTime;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The behaviour before the fix, kept so the bug can be reproduced on demand: events apply in arrival
 * order, there is no idempotency key, and an Ended that arrives while the EVSE is Available is dropped.
 */
@Service
public class LegacyTransactionEventHandler implements TransactionEventHandler {

    private static final Logger log = LoggerFactory.getLogger(LegacyTransactionEventHandler.class);

    private final TransactionRepository transactions;
    private final EvseStatusRepository evseStatus;
    private final Billing billing;
    private final GatewayTrace trace;
    private final StationTime time;

    public LegacyTransactionEventHandler(TransactionRepository transactions, EvseStatusRepository evseStatus,
            Billing billing, GatewayTrace trace, StationTime time) {
        this.transactions = transactions;
        this.evseStatus = evseStatus;
        this.billing = billing;
        this.trace = trace;
        this.time = time;
    }

    @Override
    @Transactional
    public EventOutcome handle(String stationId, TxEvent e) {
        Instant now = time.now(stationId);
        Transaction tx = e.type() == TransactionEventType.Started
                ? transactions.lockOrCreate(stationId, e.transactionId(), e.evseId() == null ? 0 : e.evseId(), now)
                : transactions.lock(stationId, e.transactionId()).orElse(null);
        if (tx == null) {
            return EventOutcome.IGNORED_UNKNOWN_TRANSACTION;
        }
        if (e.type() == TransactionEventType.Ended && tx.isOpen()
                && evseStatus.find(tx.stationId(), tx.evseId()).orElse(null) == ConnectorStatus.Available) {
            log.warn("event=ended_ignored mode=legacy station={} transactionId={} seqNo={} reason=connector_available",
                    stationId, tx.id(), e.seqNo());
            trace.record(stationId, now, "session-svc", () -> "TransactionEvent Ended transactionId=" + tx.id()
                    + " ignored: connector already Available (out of order)");
            return EventOutcome.IGNORED_OUT_OF_ORDER;
        }
        Transaction next = tx.apply(e);
        if (e.type() == TransactionEventType.Started) {
            next = next.startedReceived(now); // kept so that a station switched to the fix later has the order
        }
        if (tx.isOpen() && !next.isOpen()) {
            next = next.copy().invoice(billing.onRealEnd(next.invoice(), next.meter().lastWh(), next.billingIncompleteReason())).build();
        }
        transactions.save(next);
        return EventOutcome.APPLIED;
    }
}
