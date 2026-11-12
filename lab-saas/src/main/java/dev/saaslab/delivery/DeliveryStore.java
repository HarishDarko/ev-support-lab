package dev.saaslab.delivery;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Workspaces, endpoints, events, attempts, token requests and pauses, in PostgreSQL. */
@Repository
public class DeliveryStore {

    public record Endpoint(String id, String workspaceId, String url, String auth, String clientId, String tokenUrl) {
        public boolean oauth() {
            return "oauth".equals(auth);
        }
    }

    public record Event(String id, String endpointId, Instant createdAt, String status) {}

    private final JdbcClient jdbc;

    public DeliveryStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    private static Timestamp ts(Instant t) {
        return Timestamp.from(t);
    }

    // ---- setup ----

    public void addWorkspace(String id, String name, Boolean fixOverride) {
        jdbc.sql("insert into workspace (id, name, fix_override) values (?, ?, ?)")
                .params(id, name, fixOverride).update();
    }

    public void setFixOverride(String workspaceId, Boolean fixOverride) {
        jdbc.sql("update workspace set fix_override = ? where id = ?").params(fixOverride, workspaceId).update();
    }

    public Optional<Boolean> fixOverride(String workspaceId) {
        return jdbc.sql("select fix_override from workspace where id = ?").param(workspaceId)
                .query((rs, n) -> (Boolean) rs.getObject(1)).optional();
    }

    public void addEndpoint(Endpoint e) {
        jdbc.sql("insert into endpoint (id, workspace_id, url, auth, client_id, token_url) values (?, ?, ?, ?, ?, ?)")
                .params(e.id(), e.workspaceId(), e.url(), e.auth(), e.clientId(), e.tokenUrl()).update();
    }

    public Endpoint endpoint(String id) {
        return jdbc.sql("select id, workspace_id, url, auth, client_id, token_url from endpoint where id = ?")
                .param(id)
                .query((rs, n) -> new Endpoint(rs.getString(1), rs.getString(2), rs.getString(3), rs.getString(4),
                        rs.getString(5), rs.getString(6)))
                .single();
    }

    // ---- events ----

    public void addEvent(String id, String endpointId, Instant at) {
        jdbc.sql("insert into event (id, endpoint_id, created_at, status) values (?, ?, ?, 'pending')")
                .params(id, endpointId, ts(at)).update();
    }

    public Event event(String id) {
        return jdbc.sql("select id, endpoint_id, created_at, status from event where id = ?").param(id)
                .query((rs, n) -> new Event(rs.getString(1), rs.getString(2), rs.getTimestamp(3).toInstant(),
                        rs.getString(4)))
                .single();
    }

    public void delivered(String eventId, Instant at) {
        jdbc.sql("update event set status = 'delivered', delivered_at = ?, next_attempt_at = null where id = ?")
                .params(ts(at), eventId).update();
    }

    public void failed(String eventId) {
        jdbc.sql("update event set status = 'failed', next_attempt_at = null where id = ?").param(eventId).update();
    }

    /** Puts a failed event back in the queue, for a replay. */
    public void reopen(String eventId) {
        jdbc.sql("update event set status = 'pending', next_attempt_at = null where id = ?").param(eventId).update();
    }

    public void deferUntil(String eventId, Instant at) {
        jdbc.sql("update event set next_attempt_at = ? where id = ?").params(ts(at), eventId).update();
    }

    /** Pending events of this endpoint whose next attempt is due. */
    public List<String> due(String endpointId, Instant now) {
        return jdbc.sql("""
                select id from event where endpoint_id = ? and status = 'pending'
                and next_attempt_at is not null and next_attempt_at <= ? order by created_at, id""")
                .params(endpointId, ts(now)).query(String.class).list();
    }

    public List<String> failedEvents(String endpointId) {
        return jdbc.sql("select id from event where endpoint_id = ? and status = 'failed' order by created_at, id")
                .param(endpointId).query(String.class).list();
    }

    public void attempt(String eventId, String endpointId, Instant at, String outcome, String detail,
            boolean countsTowardPause) {
        jdbc.sql("""
                insert into delivery_attempt (event_id, endpoint_id, at, outcome, detail, counts_toward_pause)
                values (?, ?, ?, ?, ?, ?)""")
                .params(eventId, endpointId, ts(at), outcome, detail, countsTowardPause).update();
    }

    public int failuresSince(String endpointId, Instant since) {
        return jdbc.sql("""
                select count(*) from delivery_attempt
                where endpoint_id = ? and outcome = 'failed' and counts_toward_pause and at > ?""")
                .params(endpointId, ts(since)).query(Integer.class).single();
    }

    // ---- tokens and pauses ----

    public void tokenRequest(String endpointId, Instant at, int status) {
        jdbc.sql("insert into token_request (endpoint_id, at, status) values (?, ?, ?)")
                .params(endpointId, ts(at), status).update();
    }

    public boolean paused(String endpointId) {
        return jdbc.sql("select count(*) from endpoint_pause where endpoint_id = ? and resumed_at is null")
                .param(endpointId).query(Integer.class).single() > 0;
    }

    public void pause(String endpointId, Instant at, String reason) {
        jdbc.sql("insert into endpoint_pause (endpoint_id, paused_at, reason) values (?, ?, ?)")
                .params(endpointId, ts(at), reason).update();
    }

    public void resume(String endpointId, Instant at) {
        jdbc.sql("update endpoint_pause set resumed_at = ? where endpoint_id = ? and resumed_at is null")
                .params(ts(at), endpointId).update();
    }
}
