package dev.shoplab.support;

import dev.shoplab.payment.ProcessorClient;
import dev.shoplab.shop.OrderTrace;
import dev.shoplab.shop.ShopStore;
import dev.shoplab.shop.ShopStore.Authorization;
import dev.shoplab.shop.ShopStore.Capture;
import dev.shoplab.shop.ShopStore.Order;
import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;

/**
 * What support's runbook RB-21 does: "Release a stuck order hold and void the duplicate authorization". Its confirm
 * step is that the processor shows exactly one capture; with two captures it refuses, because that is a refund for
 * payments engineering, not a hold to release.
 */
@Service
public class ReleaseHoldService {

    public record Result(boolean released, List<String> voided, String reason) {}

    private final ShopStore store;
    private final ProcessorClient processor;
    private final OrderTrace trace;
    private final Clock clock;

    public ReleaseHoldService(ShopStore store, ProcessorClient processor, OrderTrace trace, Clock clock) {
        this.store = store;
        this.processor = processor;
        this.trace = trace;
        this.clock = clock;
    }

    public Result release(String orderId) {
        Order order = store.order(orderId);
        if (order == null || !ShopStore.PAYMENT_PENDING.equals(order.status())) {
            return new Result(false, List.of(), "order is not held");
        }
        List<Capture> captures = store.capturesFor(orderId);
        if (captures.size() != 1) {
            return new Result(false, List.of(), captures.size() + " captures: not RB-21, send to payments engineering");
        }
        String url = store.processorUrl(order.storeId());
        List<String> voided = new ArrayList<>();
        for (Authorization a : store.authorizationsFor(orderId)) {
            if ("authorized".equals(a.status())) {
                processor.voidAuthorization(url, a.id());
                store.setAuthorizationStatus(a.id(), "voided");
                voided.add(a.id());
            }
        }
        store.setOrderStatus(orderId, ShopStore.CONFIRMED, null, clock.instant());
        trace.line(orderId, "support-tool", "RB-21: one capture confirmed, voided " + voided + ", hold released");
        return new Result(true, voided, "released");
    }
}
