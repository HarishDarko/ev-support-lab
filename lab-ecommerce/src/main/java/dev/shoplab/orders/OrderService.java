package dev.shoplab.orders;

import static dev.shoplab.shop.OrderTrace.money;

import dev.shoplab.payment.ProcessorClient;
import dev.shoplab.shop.FeatureFlags;
import dev.shoplab.shop.OrderTrace;
import dev.shoplab.shop.ShopStore;
import dev.shoplab.shop.ShopStore.Capture;
import dev.shoplab.shop.ShopStore.Order;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The order service: the processor's {@code authorization.succeeded} webhook arrives on one of several workers,
 * and the worker captures the payment and confirms the order.
 *
 * <p>The hold rule, by design: an extra authorization on an order that is already captured holds the order in
 * Payment pending for a person to look at. So does a second capture.
 *
 * <p>Legacy path: "is there a capture yet?" and "capture" are separate steps, so two webhooks for one order that
 * arrive together can both pass the check and both capture. Fix (ENG-5230), per store: the worker takes a per-order
 * lock first, so the second worker waits and then sees the first capture.
 */
@Service
public class OrderService {

    private final ShopStore store;
    private final FeatureFlags flags;
    private final ProcessorClient processor;
    private final OrderTrace trace;
    private final CaptureGate gate;
    private final Clock clock;
    private final TransactionTemplate tx;

    public OrderService(ShopStore store, FeatureFlags flags, ProcessorClient processor, OrderTrace trace,
            CaptureGate gate, Clock clock, PlatformTransactionManager txManager) {
        this.store = store;
        this.flags = flags;
        this.processor = processor;
        this.trace = trace;
        this.gate = gate;
        this.clock = clock;
        this.tx = new TransactionTemplate(txManager);
    }

    public void onAuthorizationSucceeded(String authorizationId, String orderId, String idempotencyKey,
            int amountPence) {
        Order order = store.order(orderId);
        if (order == null) {
            return;
        }
        if (flags.idempotentCheckout(order.storeId())) {
            tx.executeWithoutResult(s -> {
                store.lockOrder(orderId);
                handle(order, authorizationId, idempotencyKey, amountPence);
            });
        } else {
            handle(order, authorizationId, idempotencyKey, amountPence);
        }
    }

    private void handle(Order order, String authorizationId, String idempotencyKey, int amountPence) {
        String id = order.id();
        store.sawAuthorization(authorizationId, id, idempotencyKey, amountPence, clock.instant());
        List<Capture> captures = store.capturesFor(id);
        if (captures.stream().anyMatch(c -> c.authorizationId().equals(authorizationId))) {
            return; // the same webhook again
        }
        if (!captures.isEmpty()) {
            hold(id, "extra authorization " + authorizationId + " on a captured order");
            return;
        }
        gate.pass(id);
        processor.capture(store.processorUrl(order.storeId()), authorizationId);
        Instant now = clock.instant();
        store.addCapture(id, authorizationId, amountPence, now);
        store.setAuthorizationStatus(authorizationId, "captured");
        trace.line(id, "order-svc", "#" + id + " captured " + authorizationId + " " + money(amountPence));
        if (store.capturesFor(id).size() > 1) {
            hold(id, "two captures");
            return;
        }
        Order current = store.order(id);
        if (ShopStore.AWAITING_PAYMENT.equals(current.status())) {
            store.setOrderStatus(id, ShopStore.CONFIRMED, null, now);
        }
    }

    /** An order whose checkout saw an authorization, but whose webhook never came, is held too. */
    public boolean holdIfNoWebhook(String orderId) {
        Order order = store.order(orderId);
        Instant due = store.webhookDue(orderId).orElse(null);
        if (order == null || due == null || !ShopStore.AWAITING_PAYMENT.equals(order.status())
                || clock.instant().isBefore(due) || !store.capturesFor(orderId).isEmpty()) {
            return false;
        }
        store.setOrderStatus(orderId, ShopStore.PAYMENT_PENDING, "no authorization webhook", clock.instant());
        trace.line(orderId, "order-svc", "#" + orderId + " authorization webhook not received in 30 s -> hold: "
                + "Payment pending");
        return true;
    }

    private void hold(String orderId, String reason) {
        store.setOrderStatus(orderId, ShopStore.PAYMENT_PENDING, reason, clock.instant());
        trace.line(orderId, "order-svc", "#" + orderId + " " + reason + " -> hold: Payment pending");
    }
}
