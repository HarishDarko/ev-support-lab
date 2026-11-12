package dev.shoplab.api;

import dev.shoplab.checkout.CheckoutService;
import dev.shoplab.orders.OrderService;
import dev.shoplab.support.ReleaseHoldService;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The service's HTTP surface: the processor's webhook (used by the scripted processor in every test and in the
 * experiment), and a small checkout and support surface for running it by hand (serve).
 */
@RestController
public class ShopController {

    /** The processor's {@code authorization.succeeded} webhook. */
    public record AuthorizationSucceeded(String type, String authorizationId, String orderId, String idempotencyKey,
            int amountPence) {}

    private final OrderService orders;
    private final CheckoutService checkout;
    private final ReleaseHoldService releaseHold;

    public ShopController(OrderService orders, CheckoutService checkout, ReleaseHoldService releaseHold) {
        this.orders = orders;
        this.checkout = checkout;
        this.releaseHold = releaseHold;
    }

    @PostMapping("/webhooks/processor")
    public String webhook(@RequestBody AuthorizationSucceeded event) {
        if ("authorization.succeeded".equals(event.type())) {
            orders.onAuthorizationSucceeded(event.authorizationId(), event.orderId(), event.idempotencyKey(),
                    event.amountPence());
        }
        return "ok";
    }

    @PostMapping("/checkouts/{id}")
    public String start(@PathVariable String id, @RequestParam String store, @RequestParam String order,
            @RequestParam(defaultValue = "web") String channel, @RequestParam int amountPence) {
        checkout.start(id, store, order, channel, amountPence);
        return id;
    }

    @PostMapping("/checkouts/{id}/pay")
    public CheckoutService.PayResult pay(@PathVariable String id, @RequestParam String card) {
        return checkout.pay(id, card);
    }

    @PostMapping("/support/orders/{id}/release-hold")
    public ReleaseHoldService.Result release(@PathVariable String id) {
        return releaseHold.release(id);
    }
}
