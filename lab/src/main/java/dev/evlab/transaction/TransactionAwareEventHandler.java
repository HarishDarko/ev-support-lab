package dev.evlab.transaction;

import dev.evlab.observability.LabMetrics;
import dev.evlab.ocpp.messages.ConnectorStatus;
import dev.evlab.ocpp.messages.TransactionEventType;
import dev.evlab.station.EvseStatusRepository;
import dev.evlab.station.StationTime;
import java.time.Instant;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Idempotent, ordered event handling. Every event is recorded under (station, transactionId, seqNo); the
 * transaction is rebuilt from its events sorted by seqNo, so arrival order and EVSE status do not matter.
 */
@Service
public class TransactionAwareEventHandler implements TransactionEventHandler {

    private static final Logger log = LoggerFactory.getLogger(TransactionAwareEventHandler.class);

    private final TransactionRepository transactions;
    private final TransactionEventRepository events;
    private final EvseStatusRepository evseStatus;
    private final Billing billing;
    private final LabMetrics metrics;
    private final StationTime time;

    public TransactionAwareEventHandler(TransactionRepository transactions, TransactionEventRepository events,
            EvseStatusRepository evseStatus, Billing billing, LabMetrics metrics, StationTime time) {
        this.transactions = transactions;
        this.events = events;
        this.evseStatus = evseStatus;
        this.billing = billing;
        this.metrics = metrics;
        this.time = time;
    }

    @Override
    @Transactional
    public EventOutcome handle(String stationId, TxEvent e) {
        if (e.type() == TransactionEventType.Started && e.evseId() != null) {
            // Lock order: EVSE first, then the transaction row. Reconciliation decides "no newer transaction" under
            // the same EVSE lock, so a Started cannot slip in between its check and its close.
            evseStatus.lockEvse(stationId, e.evseId());
        }
        // Read after the EVSE lock: the receipt time of a Started is what orders transactions on an EVSE, so it must
        // not be taken before waiting for the lock, or two Starteds could be stamped in the opposite order.
        Instant now = time.now(stationId);
        Transaction stored = transactions.lockOrCreate(stationId, e.transactionId(),
                e.evseId() == null ? 0 : e.evseId(), now);

        if (!events.insertIfAbsent(stationId, e, now)) {
            metrics.duplicateEvent();
            log.info("event=duplicate_ignored station={} transactionId={} seqNo={}", stationId, e.transactionId(),
                    e.seqNo());
            return EventOutcome.DUPLICATE;
        }

        List<TxEvent> all = events.findAll(stationId, e.transactionId());
        Transaction replayed = Transaction.replay(stored.id(), stored.stationId(), stored.evseId(), all);
        Transaction next = stored.rebase(replayed, billing);
        if (e.type() == TransactionEventType.Started) {
            next = next.startedReceived(now);
        }

        if (stored.isOpen() && next.closeSource() == CloseSource.REAL) {
            boolean evseAvailable = evseStatus.find(next.stationId(), next.evseId()).orElse(null)
                    == ConnectorStatus.Available;
            if (evseAvailable) {
                metrics.lateEndedApplied("evse_available");
            }
        } else if (stored.closeSource() == CloseSource.RECONCILED && next.closeSource() == CloseSource.REAL) {
            metrics.lateEndedApplied("provisional_close");
            log.info("event=late_ended_applied station={} transactionId={} invoice={} provisionalWh={} finalWh={}",
                    stationId, next.id(), next.invoice().status(), stored.invoice().energyWh(),
                    next.invoice().energyWh());
        }
        transactions.save(next);
        return EventOutcome.APPLIED;
    }
}
