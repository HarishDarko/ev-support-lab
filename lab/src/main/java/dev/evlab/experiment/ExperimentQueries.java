package dev.evlab.experiment;

import static dev.evlab.persistence.Sql.instant;
import static dev.evlab.persistence.Sql.ts;

import dev.evlab.experiment.ExperimentResult.GroupMetrics;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import org.springframework.jdbc.core.simple.JdbcClient;

/** Reads the experiment's numbers out of the database. Nothing here knows what the scripts intended. */
final class ExperimentQueries {

    private final JdbcClient jdbc;

    ExperimentQueries(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * @param truthDeliveryEnd per "station/transactionId", the scripted moment the charger really stopped delivering
     */
    GroupMetrics metrics(List<String> stations, Instant from, Instant to, int dropWindowSec,
            Map<String, Instant> truthDeliveryEnd) {
        String started = " station_id in (:st) and started_at >= :from and started_at < :to ";
        int sessions = count("select count(*) from transaction where" + started, stations, from, to);
        int stuck = count("""
                select count(*) from transaction t
                  join evse_status e on e.station_id = t.station_id and e.evse_id = t.evse_id
                 where t.station_id in (:st) and t.started_at >= :from and t.started_at < :to
                   and t.state = 'CHARGING' and e.connector_status = 'Available' and t.review_reason is null
                """, stations, from, to);
        int openFlagged = count("select count(*) from transaction where" + started
                + "and state = 'CHARGING' and review_reason is not null", stations, from, to);
        int reconciled = count("select count(*) from transaction where" + started
                + "and reconciled_at is not null", stations, from, to);
        int lateApplied = count("select count(*) from transaction where" + started
                + "and reconciled_at is not null and close_source = 'REAL'", stations, from, to);
        int skips = count("select count(*) from transaction where" + started
                + "and review_reason = 'NEWER_TRANSACTION'", stations, from, to);
        int dupCharges = count("select count(*) from transaction where" + started + "and charges_issued > 1",
                stations, from, to);
        int stillProvisional = count("select count(*) from transaction where" + started
                + "and invoice_status = 'PROVISIONAL'", stations, from, to);
        int confirmedAfter = count("select count(*) from transaction where" + started
                + "and reconciled_at is not null and invoice_status = 'CONFIRMED'", stations, from, to);
        int adjusted = count("select count(*) from transaction where" + started + "and invoice_status = 'ADJUSTED'",
                stations, from, to);
        int carriedOver = count("""
                select count(*) from transaction
                 where station_id in (:st) and started_at < :from
                   and reconciled_at >= :from and reconciled_at < :to
                """, stations, from, to);

        int carriedOverFlagged = count("""
                select count(*) from transaction
                 where station_id in (:st) and started_at < :from
                   and review_flagged_at >= :from and review_flagged_at < :to
                """, stations, from, to);

        int near = jdbc.sql("""
                select count(*) from connection_log c
                 where c.station_id in (:st) and c.kind = 'CLOSED' and c.close_code = 1006
                   and c.at >= :from and c.at < :to
                   and exists (select 1 from transaction t
                                where t.station_id = c.station_id
                                  and t.comm_lost_at between c.at - make_interval(secs => :win) and c.at)
                """).param("st", stations).param("from", ts(from)).param("to", ts(to))
                .param("win", (double) dropWindowSec).query(Integer.class).single();
        int allDrops = count("""
                select count(*) from connection_log
                 where station_id in (:st) and kind = 'CLOSED' and close_code = 1006 and at >= :from and at < :to
                """, stations, from, to);

        int falseClosures = (int) jdbc.sql("select station_id, transaction_id, reconciled_at from transaction where" + started
                + "and reconciled_at is not null")
                .param("st", stations).param("from", ts(from)).param("to", ts(to))
                .query((rs, i) -> new Object[] {rs.getString(1) + "/" + rs.getString(2), instant(rs, "reconciled_at")})
                .list().stream()
                .filter(r -> {
                    Instant truth = truthDeliveryEnd.get((String) r[0]);
                    return truth != null && ((Instant) r[1]).isBefore(truth);
                }).count();

        Map<String, Integer> byReason = new TreeMap<>();
        jdbc.sql("select review_reason, count(*) from transaction where" + started
                + "and review_reason is not null group by review_reason")
                .param("st", stations).param("from", ts(from)).param("to", ts(to))
                .query((rs, i) -> {
                    byReason.put(rs.getString(1), rs.getInt(2));
                    return 0;
                }).list();

        return new GroupMetrics(stations.size(), sessions, near, allDrops - near, stuck, openFlagged, reconciled,
                lateApplied, skips, falseClosures, dupCharges, reconciled, stillProvisional, confirmedAfter,
                adjusted, byReason, carriedOver, carriedOverFlagged);
    }

    private int count(String sql, List<String> stations, Instant from, Instant to) {
        return jdbc.sql(sql).param("st", stations).param("from", ts(from)).param("to", ts(to))
                .query(Integer.class).single();
    }
}
