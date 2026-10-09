package dev.evlab.persistence;

import static dev.evlab.persistence.Sql.ts;

import java.time.Instant;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Websocket opens and closes, kept so a drop can be related to the unplug that preceded it. */
@Repository
public class ConnectionLogRepository {

    private final JdbcClient jdbc;

    public ConnectionLogRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public void opened(String stationId, Instant at) {
        jdbc.sql("insert into connection_log (station_id, kind, at) values (:s, 'OPENED', :at)")
                .param("s", stationId).param("at", ts(at)).update();
    }

    public void closed(String stationId, Instant at, int closeCode) {
        jdbc.sql("insert into connection_log (station_id, kind, at, close_code) values (:s, 'CLOSED', :at, :c)")
                .param("s", stationId).param("at", ts(at)).param("c", closeCode).update();
    }
}
