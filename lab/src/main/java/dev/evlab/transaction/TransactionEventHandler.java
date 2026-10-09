package dev.evlab.transaction;

public interface TransactionEventHandler {

    EventOutcome handle(String stationId, TxEvent event);
}
