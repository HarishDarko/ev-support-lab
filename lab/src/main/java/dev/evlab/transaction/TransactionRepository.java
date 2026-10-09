package dev.evlab.transaction;

import static dev.evlab.persistence.Sql.instant;
import static dev.evlab.persistence.Sql.nullableBoolean;
import static dev.evlab.persistence.Sql.nullableDouble;
import static dev.evlab.persistence.Sql.nullableInt;
import static dev.evlab.persistence.Sql.ts;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class TransactionRepository {

    private static final String COLUMNS = """
            station_id, transaction_id, evse_id, state, started_at, started_received_at, stopped_at, stop_reason,
            last_seq_no, first_missing_seq_no, last_meter_wh, last_meter_at, previous_meter_wh, previous_meter_at,
            meter_samples, end_meter_reported, comm_lost_at, close_source,
            invoice_status, billed_energy_wh, amount_cents, charges_issued, invoice_needs_review, invoice_review_note,
            reconnected_at, status_answered_at, messages_in_queue, ongoing_indicator,
            reconciled_at, reconciliation_reason, review_reason, review_flagged_at
            """;

    private static final RowMapper<Transaction> MAPPER = TransactionRepository::map;

    private final JdbcClient jdbc;

    public TransactionRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Creates the row if it is missing and returns it locked, in one round trip. The no-op update on conflict is
     * what takes the row lock; {@code insert ... do nothing} would return no row.
     */
    public Transaction lockOrCreate(String stationId, String id, int evseId, Instant now) {
        return jdbc.sql("""
                insert into transaction (station_id, transaction_id, evse_id, state, created_at)
                values (:station, :id, :evse, 'CHARGING', :now)
                on conflict (station_id, transaction_id) do update set evse_id = transaction.evse_id
                """ + " returning " + COLUMNS)
                .param("id", id).param("station", stationId).param("evse", evseId).param("now", ts(now))
                .query(MAPPER).single();
    }

    /** Row lock: events for one transaction are applied one at a time. */
    public Optional<Transaction> lock(String stationId, String id) {
        return jdbc.sql("select " + COLUMNS
                + " from transaction where station_id = :station and transaction_id = :id for update")
                .param("station", stationId).param("id", id).query(MAPPER).optional();
    }

    public Optional<Transaction> find(String stationId, String id) {
        return jdbc.sql("select " + COLUMNS
                + " from transaction where station_id = :station and transaction_id = :id")
                .param("station", stationId).param("id", id).query(MAPPER).optional();
    }

    public List<Transaction> findOpenByStation(String stationId) {
        return jdbc.sql("select " + COLUMNS + " from transaction where station_id = :s and state = 'CHARGING'")
                .param("s", stationId).query(MAPPER).list();
    }

    /** {@code evseId} is what the row said when it was listed; it is checked again once the row is locked. */
    public record Ref(String stationId, String id, int evseId) {}

    /** Open transactions whose station reconnected and that have not been resolved yet. */
    public List<Ref> awaitingReconciliation() {
        return jdbc.sql("""
                select station_id, transaction_id, evse_id from transaction
                 where state = 'CHARGING' and reconnected_at is not null
                 order by reconnected_at, station_id, transaction_id
                """).query((rs, i) -> new Ref(rs.getString(1), rs.getString(2), rs.getInt(3))).list();
    }

    public List<Ref> awaitingReconciliation(String stationId) {
        return jdbc.sql("""
                select station_id, transaction_id, evse_id from transaction
                 where state = 'CHARGING' and reconnected_at is not null and station_id = :s
                 order by reconnected_at, transaction_id
                """).param("s", stationId)
                .query((rs, i) -> new Ref(rs.getString(1), rs.getString(2), rs.getInt(3))).list();
    }

    /**
     * Another transaction started on the same EVSE after this one. Only reliable while the caller holds the EVSE
     * lock ({@link dev.evlab.station.EvseStatusRepository#lockEvse}); otherwise one can start right after the answer.
     *
     * <p>"After" is the order in which the backend received the Starteds, not the charger's start timestamps. A
     * Started takes the EVSE lock and reads the backend clock under it, so receipt order on one EVSE is monotonic.
     * The charger clock is not: it can be corrected backwards between two transactions, and the newer one would
     * then look older. A transaction whose Started was never received has no place in that order: it is neither
     * newer than another nor has anything newer than it (the policy sends it to a person as STARTED_NOT_RECEIVED).
     */
    public boolean existsNewerOnEvse(Transaction tx) {
        if (tx.startedReceivedAt() == null) {
            return false;
        }
        return jdbc.sql("""
                select exists (select 1 from transaction
                                where station_id = :s and evse_id = :e and transaction_id <> :id
                                  and started_received_at > :receivedAt)
                """).param("s", tx.stationId()).param("e", tx.evseId()).param("id", tx.id())
                .param("receivedAt", ts(tx.startedReceivedAt())).query(Boolean.class).single();
    }

    public void save(Transaction t) {
        Reconciliation r = t.reconciliation();
        StatusAnswer a = r.answer();
        jdbc.sql("""
                update transaction set
                    evse_id = :evse, state = :state,
                    started_at = :startedAt, started_received_at = :startedReceivedAt, stopped_at = :stoppedAt, stop_reason = :stopReason,
                    last_seq_no = :lastSeq, first_missing_seq_no = :firstMissing,
                    last_meter_wh = :lastWh, last_meter_at = :lastAt,
                    previous_meter_wh = :prevWh, previous_meter_at = :prevAt,
                    meter_samples = :samples, end_meter_reported = :endMeter,
                    comm_lost_at = :commLost, close_source = :closeSource,
                    invoice_status = :invStatus, billed_energy_wh = :invWh, amount_cents = :invCents,
                    charges_issued = :charges, invoice_needs_review = :invReview, invoice_review_note = :invNote,
                    reconnected_at = :reconnectedAt, status_answered_at = :answeredAt,
                    messages_in_queue = :queue, ongoing_indicator = :ongoing,
                    reconciled_at = :reconciledAt, reconciliation_reason = :reconReason,
                    review_reason = :reviewReason, review_flagged_at = :reviewAt
                 where station_id = :station and transaction_id = :id
                """)
                .param("id", t.id()).param("station", t.stationId()).param("evse", t.evseId())
                .param("state", t.state().name())
                .param("startedAt", ts(t.startedAt())).param("startedReceivedAt", ts(t.startedReceivedAt()))
                .param("stoppedAt", ts(t.stoppedAt()))
                .param("stopReason", t.stopReason()).param("lastSeq", t.lastSeqNo())
                .param("firstMissing", t.firstMissingSeqNo())
                .param("lastWh", t.meter().samples() == 0 ? null : t.meter().lastWh())
                .param("lastAt", ts(t.meter().lastAt()))
                .param("prevWh", t.meter().samples() < 2 ? null : t.meter().previousWh())
                .param("prevAt", ts(t.meter().previousAt()))
                .param("samples", t.meter().samples()).param("endMeter", t.endMeterReported())
                .param("commLost", ts(t.commLostAt()))
                .param("closeSource", t.closeSource() == null ? null : t.closeSource().name())
                .param("invStatus", t.invoice().status().name()).param("invWh", t.invoice().energyWh())
                .param("invCents", t.invoice().amountCents()).param("charges", t.invoice().chargesIssued())
                .param("invReview", t.invoice().needsReview()).param("invNote", t.invoice().note())
                .param("reconnectedAt", ts(r.reconnectedAt()))
                .param("answeredAt", a == null ? null : ts(a.answeredAt()))
                .param("queue", a == null ? null : a.messagesInQueue())
                .param("ongoing", a == null ? null : a.ongoingIndicator())
                .param("reconciledAt", ts(r.reconciledAt())).param("reconReason", r.reason())
                .param("reviewReason", r.reviewReason() == null ? null : r.reviewReason().name())
                .param("reviewAt", ts(r.reviewFlaggedAt()))
                .update();
    }

    /** Open transaction whose EVSE reports Available and that nobody has been asked to look at. */
    public long countStuck() {
        return jdbc.sql("""
                select count(*) from transaction t
                  join evse_status e on e.station_id = t.station_id and e.evse_id = t.evse_id
                 where t.state = 'CHARGING' and e.connector_status = 'Available' and t.review_reason is null
                """).query(Long.class).single();
    }

    private static Transaction map(ResultSet rs, int row) throws SQLException {
        Double lastWh = nullableDouble(rs, "last_meter_wh");
        Double prevWh = nullableDouble(rs, "previous_meter_wh");
        int samples = rs.getInt("meter_samples");
        MeterTrail meter = samples == 0
                ? MeterTrail.EMPTY
                : new MeterTrail(samples, prevWh == null ? 0 : prevWh, instant(rs, "previous_meter_at"),
                        lastWh == null ? 0 : lastWh, instant(rs, "last_meter_at"));
        Instant answeredAt = instant(rs, "status_answered_at");
        StatusAnswer answer = answeredAt == null
                ? null
                : new StatusAnswer(answeredAt, Boolean.TRUE.equals(nullableBoolean(rs, "messages_in_queue")),
                        nullableBoolean(rs, "ongoing_indicator"));
        String review = rs.getString("review_reason");
        Reconciliation recon = new Reconciliation(
                instant(rs, "reconnected_at"), answer, instant(rs, "reconciled_at"),
                rs.getString("reconciliation_reason"),
                review == null ? null : ReviewReason.valueOf(review), instant(rs, "review_flagged_at"));
        Invoice invoice = new Invoice(InvoiceStatus.valueOf(rs.getString("invoice_status")),
                rs.getDouble("billed_energy_wh"), rs.getLong("amount_cents"), rs.getInt("charges_issued"),
                rs.getBoolean("invoice_needs_review"), rs.getString("invoice_review_note"));
        String closeSource = rs.getString("close_source");
        return new Transaction(
                rs.getString("transaction_id"), rs.getString("station_id"), rs.getInt("evse_id"),
                TxState.valueOf(rs.getString("state")), instant(rs, "started_at"), instant(rs, "started_received_at"),
                instant(rs, "stopped_at"), rs.getString("stop_reason"), rs.getInt("last_seq_no"), meter,
                instant(rs, "comm_lost_at"),
                closeSource == null ? null : CloseSource.valueOf(closeSource), recon, invoice,
                rs.getBoolean("end_meter_reported"), nullableInt(rs, "first_missing_seq_no"));
    }
}
