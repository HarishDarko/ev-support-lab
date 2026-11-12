package dev.shoplab.checkout;

import static org.assertj.core.api.Assertions.assertThat;

import dev.shoplab.simulator.ScenarioPlayer.Outcome;
import dev.shoplab.support.AbstractLabIT;
import org.junit.jupiter.api.Test;

/**
 * With the fix off, a slow payment answer makes a second authorization: the web shopper pays again, or the app
 * retries by itself, each time with a new idempotency key. The order is held in Payment pending; when the two
 * webhooks arrive together, the order is captured twice.
 */
class SecondAuthorizationReproductionTest extends AbstractLabIT {

    @Test
    void aWebShopperWhoPaysAgainAfterTheErrorLeavesTheOrderInPaymentPending() {
        Outcome o = play("slow-web-repay", false);

        assertThat(o.seen().timeouts()).first().hasToString("SOMETHING_WENT_WRONG");
        assertThat(o.keys()).as("idempotency keys").hasSize(2);
        assertThat(o.processorAuthorizations()).as("authorizations at the processor").isEqualTo(2);
        assertThat(o.authorizations()).as("authorizations the shop saw").isEqualTo(2);
        assertThat(o.captures()).isEqualTo(1);
        // Reproduces: second authorization, order held.
        assertThat(o.orderStatus()).isEqualTo("PAYMENT_PENDING");
        assertThat(o.holdReason()).startsWith("extra authorization");
    }

    @Test
    void theAppsAutomaticRetryLeavesTheOrderInPaymentPending() {
        Outcome o = play("slow-app-retry", false);

        assertThat(o.attempts()).extracting(a -> a.sentAt().toEpochMilli() - o.attempts().getFirst().sentAt()
                .toEpochMilli()).containsExactly(0L, 8_500L);
        assertThat(o.keys()).hasSize(2);
        assertThat(o.authorizations()).isEqualTo(2);
        assertThat(o.captures()).isEqualTo(1);
        assertThat(o.orderStatus()).isEqualTo("PAYMENT_PENDING");
    }

    @Test
    void whenBothWebhooksArriveTogetherTheOrderIsCapturedTwice() {
        Outcome o = play("app-race", false);

        assertThat(o.races()).hasSize(1);
        assertThat(o.authorizations()).isEqualTo(2);
        assertThat(o.captures()).as("captures in the shop").isEqualTo(2);
        assertThat(o.processorCaptures()).as("settled charges at the processor").isEqualTo(2);
        assertThat(o.orderStatus()).isEqualTo("PAYMENT_PENDING");
        assertThat(o.holdReason()).isEqualTo("two captures");
        assertThat(o.log()).anySatisfy(l -> assertThat(l.detail()).contains("two captures -> hold: Payment pending"));
    }
}
