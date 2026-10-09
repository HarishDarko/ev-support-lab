package dev.evlab.transaction;

import dev.evlab.station.FeatureFlags;
import org.springframework.stereotype.Service;

/** Routes each event to the legacy or the transaction-aware handler according to the station flag. */
@Service
public class TransactionEventService {

    private final FeatureFlags flags;
    private final LegacyTransactionEventHandler legacy;
    private final TransactionAwareEventHandler aware;

    public TransactionEventService(FeatureFlags flags, LegacyTransactionEventHandler legacy,
            TransactionAwareEventHandler aware) {
        this.flags = flags;
        this.legacy = legacy;
        this.aware = aware;
    }

    public EventOutcome handle(String stationId, TxEvent event) {
        TransactionEventHandler handler = flags.transactionAwareReconciliation(stationId) ? aware : legacy;
        return handler.handle(stationId, event);
    }
}
