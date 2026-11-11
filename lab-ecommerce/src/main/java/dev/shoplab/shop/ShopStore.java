package dev.shoplab.shop;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Stores, checkouts, orders, payment attempts, authorizations and captures, in PostgreSQL. */
@Repository
public class ShopStore {

    public record Store(String id, String name, String processorUrl) {}

    public record Checkout(String id, String storeId, String orderId, String channel, int amountPence,
            String idempotencyKey, String keyCard, Integer keyAmount, int keySeq) {
        public boolean app() {
            return !"web".equals(channel);
        }
    }

    public record Order(String id, String storeId, String checkoutId, int amountPence, String status,
            String holdReason) {}

    public record Attempt(long id, String checkoutId, String orderId, int attemptNo, String idempotencyKey,
            String card, Instant sentAt, String outcome, String authorizationId) {}

    public record Authorization(String id, String orderId, String idempotencyKey, int amountPence, String status) {}

    public record Capture(String orderId, String authorizationId, int amountPence, Instant capturedAt) {}

    public static final String AWAITING_PAYMENT = "AWAITING_PAYMENT";
    public static final String CONFIRMED = "CONFIRMED";
    public static final String PAYMENT_PENDING = "PAYMENT_PENDING";

    private final JdbcClient jdbc;

    public ShopStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    private static Timestamp ts(Instant t) {
        return Timestamp.from(t);
    }

    // ---- stores ----

    public void addStore(String id, String name, String processorUrl, Boolean fixOverride) {
        jdbc.sql("insert into store (id, name, processor_url, fix_override) values (?, ?, ?, ?)")
                .params(id, name, processorUrl, fixOverride).update();
    }

    public void setFixOverride(String storeId, Boolean fixOverride) {
        jdbc.sql("update store set fix_override = ? where id = ?").params(fixOverride, storeId).update();
    }

    public Optional<Boolean> fixOverride(String storeId) {
        return jdbc.sql("select fix_override from store where id = ?").param(storeId)
                .query((rs, n) -> (Boolean) rs.getObject(1)).optional();
    }

    public String processorUrl(String storeId) {
        return jdbc.sql("select processor_url from store where id = ?").param(storeId).query(String.class).single();
    }

    // ---- checkouts and orders ----

    public void addCheckoutAndOrder(String checkoutId, String storeId, String orderId, String channel,
            int amountPence, Instant at) {
        jdbc.sql("""
                insert into checkout (id, store_id, order_id, channel, amount_pence, created_at)
                values (?, ?, ?, ?, ?, ?)""").params(checkoutId, storeId, orderId, channel, amountPence, ts(at))
                .update();
        jdbc.sql("""
                insert into orders (id, store_id, checkout_id, amount_pence, status, created_at, updated_at)
                values (?, ?, ?, ?, 'AWAITING_PAYMENT', ?, ?)""")
                .params(orderId, storeId, checkoutId, amountPence, ts(at), ts(at)).update();
    }

    public Checkout checkout(String id) {
        return jdbc.sql("""
                select id, store_id, order_id, channel, amount_pence, idempotency_key, key_card, key_amount, key_seq
                from checkout where id = ?""").param(id)
                .query((rs, n) -> new Checkout(rs.getString(1), rs.getString(2), rs.getString(3), rs.getString(4),
                        rs.getInt(5), rs.getString(6), rs.getString(7), (Integer) rs.getObject(8), rs.getInt(9)))
                .single();
    }

    /** Counts one more attempt for the checkout and returns its number (1 for the first). */
    public int nextAttempt(String checkoutId) {
        return jdbc.sql("update checkout set attempts = attempts + 1 where id = ? returning attempts")
                .param(checkoutId).query(Integer.class).single();
    }

    public void setCheckoutKey(String checkoutId, String key, String card, int amountPence, int seq) {
        jdbc.sql("update checkout set idempotency_key = ?, key_card = ?, key_amount = ?, key_seq = ? where id = ?")
                .params(key, card, amountPence, seq, checkoutId).update();
    }

    public Order order(String id) {
        return jdbc.sql("""
                select id, store_id, checkout_id, amount_pence, status, hold_reason from orders where id = ?""")
                .param(id)
                .query((rs, n) -> new Order(rs.getString(1), rs.getString(2), rs.getString(3), rs.getInt(4),
                        rs.getString(5), rs.getString(6)))
                .optional().orElse(null);
    }

    /** The per-order lock of the fix: held until the surrounding transaction ends. */
    public void lockOrder(String id) {
        jdbc.sql("select id from orders where id = ? for update").param(id).query(String.class).list();
    }

    public void setOrderStatus(String id, String status, String holdReason, Instant at) {
        jdbc.sql("update orders set status = ?, hold_reason = ?, updated_at = ? where id = ?")
                .params(status, holdReason, ts(at), id).update();
    }

    public void setWebhookDue(String orderId, Instant at) {
        jdbc.sql("update orders set webhook_due_at = ? where id = ? and webhook_due_at is null")
                .params(ts(at), orderId).update();
    }

    public Optional<Instant> webhookDue(String orderId) {
        return jdbc.sql("select webhook_due_at from orders where id = ?").param(orderId)
                .query((rs, n) -> rs.getTimestamp(1) == null ? null : rs.getTimestamp(1).toInstant())
                .optional();
    }

    // ---- payment attempts and lookups ----

    public long addAttempt(String checkoutId, String orderId, int attemptNo, String key, String card,
            Instant sentAt, String outcome, String authorizationId, Instant answeredAt) {
        return jdbc.sql("""
                insert into payment_attempt (checkout_id, order_id, attempt_no, idempotency_key, card, sent_at,
                                             outcome, authorization_id, answered_at)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?) returning id""")
                .params(checkoutId, orderId, attemptNo, key, card, ts(sentAt), outcome, authorizationId,
                        answeredAt == null ? null : ts(answeredAt))
                .query(Long.class).single();
    }

    public Attempt attempt(long id) {
        return attempts("where id = ?", id).getFirst();
    }

    public List<Attempt> attemptsFor(String orderId) {
        return attempts("where order_id = ?", orderId);
    }

    private List<Attempt> attempts(String where, Object param) {
        return jdbc.sql("""
                select id, checkout_id, order_id, attempt_no, idempotency_key, card, sent_at, outcome, authorization_id
                from payment_attempt""" + " " + where + " order by id").param(param)
                .query((rs, n) -> new Attempt(rs.getLong(1), rs.getString(2), rs.getString(3), rs.getInt(4),
                        rs.getString(5), rs.getString(6), rs.getTimestamp(7).toInstant(), rs.getString(8),
                        rs.getString(9)))
                .list();
    }

    public void addLookup(String orderId, String key, Instant at, String answer) {
        jdbc.sql("insert into payment_lookup (order_id, idempotency_key, at, answer) values (?, ?, ?, ?)")
                .params(orderId, key, ts(at), answer).update();
    }

    // ---- authorizations and captures ----

    /** Records an authorization the first time checkout or a webhook shows it; later sightings change nothing. */
    public void sawAuthorization(String id, String orderId, String key, int amountPence, Instant at) {
        jdbc.sql("""
                insert into payment_authorization (id, order_id, idempotency_key, amount_pence, status, first_seen_at)
                values (?, ?, ?, ?, 'authorized', ?) on conflict (id) do nothing""")
                .params(id, orderId, key, amountPence, ts(at)).update();
    }

    public void setAuthorizationStatus(String id, String status) {
        jdbc.sql("update payment_authorization set status = ? where id = ?").params(status, id).update();
    }

    public List<Authorization> authorizationsFor(String orderId) {
        return jdbc.sql("""
                select id, order_id, idempotency_key, amount_pence, status from payment_authorization
                where order_id = ? order by first_seen_at, id""").param(orderId)
                .query((rs, n) -> new Authorization(rs.getString(1), rs.getString(2), rs.getString(3), rs.getInt(4),
                        rs.getString(5)))
                .list();
    }

    public void addCapture(String orderId, String authorizationId, int amountPence, Instant at) {
        jdbc.sql("insert into capture (order_id, authorization_id, amount_pence, captured_at) values (?, ?, ?, ?)")
                .params(orderId, authorizationId, amountPence, ts(at)).update();
    }

    public List<Capture> capturesFor(String orderId) {
        return jdbc.sql("""
                select order_id, authorization_id, amount_pence, captured_at from capture where order_id = ?
                order by id""").param(orderId)
                .query((rs, n) -> new Capture(rs.getString(1), rs.getString(2), rs.getInt(3),
                        rs.getTimestamp(4).toInstant()))
                .list();
    }
}
