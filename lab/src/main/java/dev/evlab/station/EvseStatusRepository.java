package dev.evlab.station;

import static dev.evlab.persistence.Sql.ts;

import dev.evlab.ocpp.messages.ConnectorStatus;
import java.time.Instant;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class EvseStatusRepository {

    private final JdbcClient jdbc;

    public EvseStatusRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Keeps the newest status by message timestamp; an older message never overwrites a newer one. */
    public void upsert(String stationId, int evseId, ConnectorStatus status, Instant at) {
        jdbc.sql("""
                insert into evse_status (station_id, evse_id, connector_status, status_at)
                values (:station, :evse, :status, :at)
                on conflict (station_id, evse_id) do update
                   set connector_status = excluded.connector_status, status_at = excluded.status_at
                 where evse_status.status_at <= excluded.status_at
                """)
                .param("station", stationId).param("evse", evseId)
                .param("status", status.name()).param("at", ts(at)).update();
    }

    /**
     * Serializes everything that decides or changes which transaction is the newest on one EVSE, until the
     * database transaction ends. An advisory lock, not a lock on the evse_status row: a Started can arrive before
     * any StatusNotification, when there is no row to lock. Lock order, everywhere: this lock first, then the
     * transaction row. Never ask for it while holding a transaction row, or two callers can wait on each other.
     * Two EVSEs whose key hashes collide only wait for each other; no one ever holds two of these locks.
     */
    public void lockEvse(String stationId, int evseId) {
        jdbc.sql("select pg_advisory_xact_lock(hashtext(:s), :e)")
                .param("s", stationId).param("e", evseId).query().singleRow();
    }

    public Optional<ConnectorStatus> find(String stationId, int evseId) {
        return jdbc.sql("select connector_status from evse_status where station_id = :s and evse_id = :e")
                .param("s", stationId).param("e", evseId)
                .query((rs, i) -> ConnectorStatus.valueOf(rs.getString(1)))
                .optional();
    }
}
