package dev.evlab.reconciliation;

import dev.evlab.observability.GatewayTrace;
import dev.evlab.observability.LabMetrics;
import dev.evlab.ocpp.messages.GetTransactionStatusResponse;
import dev.evlab.reconciliation.ReconciliationPolicy.Decision;
import dev.evlab.station.EvseStatusRepository;
import dev.evlab.station.FeatureFlags;
import dev.evlab.station.StationTime;
import dev.evlab.transaction.Billing;
import dev.evlab.transaction.StatusAnswer;
import dev.evlab.transaction.Transaction;
import dev.evlab.transaction.TransactionRepository;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Runs the reconciliation flow: note the reconnect, record the charger answer, sweep, decide, act. */
@Service
public class ReconciliationService {

    private static final Logger log = LoggerFactory.getLogger(ReconciliationService.class);

    private final TransactionRepository transactions;
    private final EvseStatusRepository evseStatus;
    private final FeatureFlags flags;
    private final ReconciliationPolicy policy;
    private final Billing billing;
    private final LabMetrics metrics;
    private final GatewayTrace trace;
    private final StationTime time;
    private final TransactionTemplate tx;

    public ReconciliationService(TransactionRepository transactions, EvseStatusRepository evseStatus,
            FeatureFlags flags, ReconciliationPolicy policy, Billing billing, LabMetrics metrics, GatewayTrace trace,
            StationTime time, PlatformTransactionManager txManager) {
        this.transactions = transactions;
        this.evseStatus = evseStatus;
        this.flags = flags;
        this.policy = policy;
        this.billing = billing;
        this.metrics = metrics;
        this.trace = trace;
        this.time = time;
        this.tx = new TransactionTemplate(txManager);
    }

    /** A new websocket session opened. Returns the open transactions the backend must ask the charger about. */
    public List<String> onStationReconnected(String stationId) {
        Instant now = time.now(stationId);
        return tx.execute(status -> transactions.findOpenByStation(stationId).stream()
                .map(open -> {
                    Transaction locked = transactions.lock(stationId, open.id()).orElseThrow();
                    if (!locked.isOpen()) {
                        return null;
                    }
                    transactions.save(locked.withReconciliation(locked.reconciliation().reconnectedAt(now)));
                    return locked.id();
                })
                .filter(Objects::nonNull)
                .toList());
    }

    public void onStatusAnswer(String stationId, String transactionId, GetTransactionStatusResponse response) {
        Instant now = time.now(stationId);
        tx.executeWithoutResult(status -> transactions.lock(stationId, transactionId).filter(Transaction::isOpen).ifPresent(t -> {
            StatusAnswer answer = new StatusAnswer(now, response.messagesInQueue(), response.ongoingIndicator());
            transactions.save(t.withReconciliation(t.reconciliation().answered(answer)));
            log.info("event=status_answer station={} transactionId={} messagesInQueue={} ongoingIndicator={}",
                    t.stationId(), t.id(), response.messagesInQueue(), response.ongoingIndicator());
        }));
    }

    /** One pass over all open transactions awaiting a decision. Returns how many were closed provisionally. */
    public int sweep() {
        return sweep(transactions.awaitingReconciliation());
    }

    /** The same pass restricted to one station, for callers that give each station its own time. */
    public int sweep(String stationId) {
        return sweep(transactions.awaitingReconciliation(stationId));
    }

    private int sweep(List<TransactionRepository.Ref> candidates) {
        int reconciled = 0;
        for (TransactionRepository.Ref ref : candidates) {
            if (!flags.transactionAwareReconciliation(ref.stationId())) {
                continue; // the flag may have been turned off after the reconnect that made this a candidate
            }
            Instant now = time.now(ref.stationId());
            Boolean closed = tx.execute(status -> reconcileOne(ref, now));
            if (Boolean.TRUE.equals(closed)) {
                reconciled++;
            }
        }
        return reconciled;
    }

    private boolean reconcileOne(TransactionRepository.Ref ref, Instant now) {
        // Lock order: EVSE first, then the transaction row (see EvseStatusRepository.lockEvse). With the EVSE
        // locked, no newer transaction can start between the check below and the close.
        evseStatus.lockEvse(ref.stationId(), ref.evseId());
        Transaction t = transactions.lock(ref.stationId(), ref.id()).filter(Transaction::isOpen).orElse(null);
        if (t == null || t.evseId() != ref.evseId()) {
            return false; // closed meanwhile, or moved to another EVSE: the next sweep lists it again
        }
        // Waiting for the locks can take a while, and the flag may have been turned off in the meantime. This is the
        // last look before deciding: off now means no decision at all, not even a review flag. Reconciliations
        // already made stay as they are.
        if (!flags.transactionAwareReconciliation(ref.stationId())) {
            return false;
        }
        boolean newer = transactions.existsNewerOnEvse(t);
        switch (policy.decide(t, now, newer)) {
            case Decision.Wait w -> {
                return false;
            }
            case Decision.Flag f -> {
                if (t.reconciliation().reviewReason() != f.reason()) {
                    transactions.save(t.withReconciliation(t.reconciliation().flagged(f.reason(), now)));
                    metrics.flagged(f.reason());
                    log.warn("event=flagged_for_review station={} transactionId={} reason={}", t.stationId(), t.id(),
                            f.reason());
                }
                return false;
            }
            case Decision.Reconcile r -> {
                Transaction closed = t.reconciled(now, r.reason(), billing);
                transactions.save(closed);
                metrics.reconciled();
                log.info("event=reconciled station={} transactionId={} stopAt={} energyWh={} invoice={}",
                        t.stationId(), t.id(), r.stopAt(), r.energyWh(), closed.invoice().status());
                trace.record(t.stationId(), now, "session-svc", () -> "transactionId=" + t.id()
                        + " reconciled at last meter value " + String.format("%.2f", r.energyWh() / 1000.0)
                        + " kWh, invoice PROVISIONAL");
                return true;
            }
        }
    }
}
