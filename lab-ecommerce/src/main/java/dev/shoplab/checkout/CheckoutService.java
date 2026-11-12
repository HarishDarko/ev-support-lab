package dev.shoplab.checkout;

import static dev.shoplab.shop.OrderTrace.money;
import static dev.shoplab.shop.OrderTrace.seconds;

import dev.shoplab.LabProperties;
import dev.shoplab.payment.ProcessorClient;
import dev.shoplab.payment.ProcessorClient.Answer;
import dev.shoplab.shop.FeatureFlags;
import dev.shoplab.shop.OrderTrace;
import dev.shoplab.shop.ShopStore;
import dev.shoplab.shop.ShopStore.Attempt;
import dev.shoplab.shop.ShopStore.Checkout;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import org.springframework.stereotype.Service;

/**
 * Checkout: asks the processor for an authorization and tells the shopper what happened.
 *
 * <p>Legacy path: every attempt gets a new idempotency key, and an answer later than the timeout shows "Something
 * went wrong". A shopper who pays again (or the app, which retries by itself) sends a second request with a new key,
 * so the processor makes a second authorization.
 *
 * <p>Fix (ENG-5230), per store: the key is made once per checkout and reused on every retry, so a retry returns the
 * first authorization; a new key only when the card or the amount changes; on a timeout, checkout asks the processor
 * for the payment by its key before it shows anything.
 */
@Service
public class CheckoutService {

    public enum Outcome { AUTHORIZED, DECLINED, TIMED_OUT }

    /** What the shopper is shown when the timeout passes with no answer. */
    public enum TimeoutView { SOMETHING_WENT_WRONG, STILL_PROCESSING, CONFIRMED, DECLINED }

    /**
     * One authorization request and its result as checkout saw it.
     *
     * @param seenAt when the shopper sees the result: the answer's time, or the timeout
     */
    public record PayResult(long attemptId, int attemptNo, String idempotencyKey, Outcome outcome,
            String authorizationId, Instant sentAt, Instant seenAt) {}

    private final ShopStore store;
    private final FeatureFlags flags;
    private final ProcessorClient processor;
    private final OrderTrace trace;
    private final Clock clock;
    private final Duration timeout;
    private final Duration webhookWait;

    public CheckoutService(ShopStore store, FeatureFlags flags, ProcessorClient processor, OrderTrace trace,
            Clock clock, LabProperties properties) {
        this.store = store;
        this.flags = flags;
        this.processor = processor;
        this.trace = trace;
        this.clock = clock;
        this.timeout = properties.checkout().timeout();
        this.webhookWait = properties.orders().webhookWait();
    }

    public void start(String checkoutId, String storeId, String orderId, String channel, int amountPence) {
        store.addCheckoutAndOrder(checkoutId, storeId, orderId, channel, amountPence, clock.instant());
    }

    /** The shopper taps Pay (or the app retries) with this card. */
    public PayResult pay(String checkoutId, String card) {
        Checkout c = store.checkout(checkoutId);
        int attemptNo = store.nextAttempt(checkoutId);
        String key = flags.idempotentCheckout(c.storeId()) ? keyForCheckout(c, card) : keyForAttempt(c, attemptNo);
        String url = store.processorUrl(c.storeId());
        Instant sent = clock.instant();
        trace.line(c.orderId(), actor(c), "POST /authorizations  order=#" + c.orderId() + "  "
                + money(c.amountPence()) + "  idem_key=" + key);

        Answer a = processor.authorize(url, key, c.orderId(), c.amountPence(), card);
        Instant deadline = sent.plus(timeout);
        if (a.answeredAt() == null || a.answeredAt().isAfter(deadline)) {
            // The client stopped waiting at the deadline; a later answer is never read.
            long id = store.addAttempt(checkoutId, c.orderId(), attemptNo, key, card, sent, "timed_out", null, null);
            return new PayResult(id, attemptNo, key, Outcome.TIMED_OUT, null, sent, deadline);
        }
        String took = seconds(Duration.between(sent, a.answeredAt()).toMillis());
        if (!a.authorized()) {
            long id = store.addAttempt(checkoutId, c.orderId(), attemptNo, key, card, sent, "declined",
                    a.authorizationId(), a.answeredAt());
            trace.lineAt(c.orderId(), a.answeredAt(), actor(c), "declined in " + took + " -> shows \"Card declined\"");
            return new PayResult(id, attemptNo, key, Outcome.DECLINED, a.authorizationId(), sent, a.answeredAt());
        }
        long id = store.addAttempt(checkoutId, c.orderId(), attemptNo, key, card, sent, "authorized",
                a.authorizationId(), a.answeredAt());
        store.sawAuthorization(a.authorizationId(), c.orderId(), key, c.amountPence(), a.answeredAt());
        store.setWebhookDue(c.orderId(), a.answeredAt().plus(webhookWait));
        trace.lineAt(c.orderId(), a.answeredAt(), actor(c), "authorized " + a.authorizationId() + " in " + took
                + " -> shows the order confirmation");
        return new PayResult(id, attemptNo, key, Outcome.AUTHORIZED, a.authorizationId(), sent, a.answeredAt());
    }

    /** The timeout of this attempt has passed with no answer: decide what the shopper sees. */
    public TimeoutView onTimeout(long attemptId) {
        Attempt attempt = store.attempt(attemptId);
        Checkout c = store.checkout(attempt.checkoutId());
        String waited = "no answer after " + seconds(timeout.toMillis());
        if (!flags.idempotentCheckout(c.storeId())) {
            trace.line(c.orderId(), actor(c), waited + " -> shows \"Something went wrong\"");
            return TimeoutView.SOMETHING_WENT_WRONG;
        }
        Answer a = processor.lookup(store.processorUrl(c.storeId()), attempt.idempotencyKey());
        String answer = a.httpStatus() == 404 ? "not_found" : a.status();
        store.addLookup(c.orderId(), attempt.idempotencyKey(), clock.instant(), answer);
        String asked = waited + " -> GET /authorizations?idempotency_key=" + attempt.idempotencyKey() + " -> "
                + answer;
        return switch (answer) {
            case "processing" -> {
                trace.line(c.orderId(), actor(c), asked + " -> shows \"Your payment is still processing\"");
                yield TimeoutView.STILL_PROCESSING;
            }
            case "authorized" -> {
                store.sawAuthorization(a.authorizationId(), c.orderId(), attempt.idempotencyKey(), c.amountPence(),
                        clock.instant());
                store.setWebhookDue(c.orderId(), clock.instant().plus(webhookWait));
                trace.line(c.orderId(), actor(c), asked + " " + a.authorizationId() + " -> shows the confirmation");
                yield TimeoutView.CONFIRMED;
            }
            case "declined" -> {
                trace.line(c.orderId(), actor(c), asked + " -> shows \"Card declined\"");
                yield TimeoutView.DECLINED;
            }
            default -> {
                // Nothing reached the processor, so paying again with the same key is safe.
                trace.line(c.orderId(), actor(c), asked + " -> shows \"Something went wrong\"");
                yield TimeoutView.SOMETHING_WENT_WRONG;
            }
        };
    }

    /** Legacy: a new key for every attempt. */
    private static String keyForAttempt(Checkout c, int attemptNo) {
        return "ck_" + c.orderId() + "_a" + attemptNo;
    }

    /** Fix: one key per checkout, renewed only when the card or the amount changes. */
    private String keyForCheckout(Checkout c, String card) {
        boolean same = c.idempotencyKey() != null && card.equals(c.keyCard()) && c.keyAmount() != null
                && c.keyAmount() == c.amountPence();
        if (same) {
            return c.idempotencyKey();
        }
        int seq = c.keySeq() + 1;
        String key = "ck_" + c.orderId() + "_k" + seq;
        store.setCheckoutKey(c.id(), key, card, c.amountPence(), seq);
        return key;
    }

    private static String actor(Checkout c) {
        return c.app() ? "checkout-app" : "checkout-web";
    }
}
