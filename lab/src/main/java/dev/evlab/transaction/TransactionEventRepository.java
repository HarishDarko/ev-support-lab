package dev.evlab.transaction;

import static dev.evlab.persistence.Sql.instant;
import static dev.evlab.persistence.Sql.nullableDouble;
import static dev.evlab.persistence.Sql.nullableInt;
import static dev.evlab.persistence.Sql.ts;

import dev.evlab.ocpp.messages.TransactionEventType;
import java.time.Instant;
import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** The idempotency record: one row per (station, transactionId, seqNo) ever received. */
@Repository
public class TransactionEventRepository {

    private final JdbcClient jdbc;

    public TransactionEventRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Returns false when (station, transactionId, seqNo) was already recorded, i.e. a duplicate. */
    public boolean insertIfAbsent(String stationId, TxEvent e, Instant receivedAt) {
        int inserted = jdbc.sql("""
                insert into transaction_event (station_id, transaction_id, seq_no, event_type, event_timestamp,
                                               trigger_reason, offline, stopped_reason, evse_id, meter_wh, meter_at,
                                               received_at)
                values (:station, :tx, :seq, :type, :ts, :trigger, :offline, :stopped, :evse, :wh, :whAt, :received)
                on conflict (station_id, transaction_id, seq_no) do nothing
                """)
                .param("station", stationId).param("tx", e.transactionId()).param("seq", e.seqNo()).param("type", e.type().name())
                .param("ts", ts(e.timestamp())).param("trigger", e.triggerReason()).param("offline", e.offline())
                .param("stopped", e.stoppedReason()).param("evse", e.evseId()).param("wh", e.meterWh())
                .param("whAt", ts(e.meterAt())).param("received", ts(receivedAt))
                .update();
        return inserted == 1;
    }

    public List<TxEvent> findAll(String stationId, String transactionId) {
        return jdbc.sql("""
                select transaction_id, seq_no, event_type, event_timestamp, trigger_reason, offline,
                       stopped_reason, evse_id, meter_wh, meter_at
                  from transaction_event where station_id = :station and transaction_id = :tx order by id
                """).param("station", stationId).param("tx", transactionId)
                .query((rs, i) -> new TxEvent(
                        rs.getString("transaction_id"), rs.getInt("seq_no"),
                        TransactionEventType.valueOf(rs.getString("event_type")),
                        instant(rs, "event_timestamp"), rs.getString("trigger_reason"), rs.getBoolean("offline"),
                        rs.getString("stopped_reason"), nullableInt(rs, "evse_id"), nullableDouble(rs, "meter_wh"),
                        instant(rs, "meter_at")))
                .list();
    }
}
