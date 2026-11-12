package dev.shoplab.checkout;

import static org.assertj.core.api.Assertions.assertThat;

import dev.shoplab.checkout.CheckoutService.Outcome;
import dev.shoplab.checkout.CheckoutService.TimeoutView;
import dev.shoplab.shop.ShopStore.Attempt;
import dev.shoplab.simulator.ScenarioPlayer;
import dev.shoplab.support.AbstractLabIT;
import dev.shoplab.support.ReleaseHoldService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/** The fix must not change what already worked, and must not hide holds that have another cause. */
class CheckoutEdgeCasesTest extends AbstractLabIT {

    @Autowired
    private ReleaseHoldService releaseHold;

    @Test
    void aFastAnswerNeverRetriesOrLooksUp() {
        ScenarioPlayer.Outcome o = play("fast-pay", true);
        assertThat(o.attempts()).hasSize(1);
        assertThat(o.lookups()).isZero();
        assertThat(o.seen().answers()).containsExactly(Outcome.AUTHORIZED);
        assertThat(o.orderStatus()).isEqualTo("CONFIRMED");
    }

    @Test
    void aShopperWhoWaitsIsToldThePaymentIsStillProcessingAndTheOrderConfirms() {
        ScenarioPlayer.Outcome o = play("slow-web-wait", true);
        assertThat(o.seen().timeouts()).containsExactly(TimeoutView.STILL_PROCESSING);
        assertThat(o.lookups()).isEqualTo(1);
        assertThat(o.authorizations()).isEqualTo(1);
        assertThat(o.orderStatus()).isEqualTo("CONFIRMED");
    }

    @Test
    void onTheLegacyPathAShopperWhoWaitsSeesAnErrorButTheOrderStillConfirms() {
        ScenarioPlayer.Outcome o = play("slow-web-wait", false);
        assertThat(o.seen().timeouts()).containsExactly(TimeoutView.SOMETHING_WENT_WRONG);
        assertThat(o.authorizations()).isEqualTo(1);
        assertThat(o.orderStatus()).isEqualTo("CONFIRMED");
    }

    @Test
    void aNewCardAfterADeclineGetsANewKeyAndAuthorizesCorrectly() {
        ScenarioPlayer.Outcome o = play("decline-new-card", true);
        assertThat(o.attempts()).extracting(Attempt::outcome).containsExactly("declined", "authorized");
        assertThat(o.attempts()).extracting(Attempt::card).doesNotHaveDuplicates();
        assertThat(o.keys()).as("a new card makes a new key").hasSize(2);
        assertThat(o.processorAuthorizations()).isEqualTo(1);
        assertThat(o.captures()).isEqualTo(1);
        assertThat(o.orderStatus()).isEqualTo("CONFIRMED");
        assertThat(o.holdReason()).isNull();
    }

    @Test
    void aVerySlowAnswerIsLookedUpByKeyAndThePaymentAgainReturnsTheFirstAuthorization() {
        ScenarioPlayer.Outcome o = play("very-slow", true);
        assertThat(o.seen().timeouts()).containsExactly(TimeoutView.STILL_PROCESSING);
        assertThat(o.attempts()).extracting(Attempt::outcome).containsExactly("timed_out", "authorized");
        assertThat(o.keys()).hasSize(1);
        assertThat(o.processorAuthorizations()).isEqualTo(1);
        String first = jdbc.sql("select id from payment_authorization where order_id = ?").param("51400")
                .query(String.class).single();
        assertThat(o.attempts().get(1).authorizationId()).as("the second tap returned the first authorization")
                .isEqualTo(first);
        assertThat(o.orderStatus()).isEqualTo("CONFIRMED");
    }

    @Test
    void aWebhookThatNeverComesIsStillHeldWithTheFixOn() {
        ScenarioPlayer.Outcome o = play("capture-webhook-timeout", true);
        assertThat(o.keys()).hasSize(1);
        assertThat(o.authorizations()).isEqualTo(1);
        assertThat(o.captures()).isZero();
        assertThat(o.orderStatus()).isEqualTo("PAYMENT_PENDING");
        assertThat(o.holdReason()).isEqualTo("no authorization webhook");
    }

    @Test
    void aStoreWithTheFlagOffKeepsTheOldPath() {
        // The application default is on; this store's override is off.
        ScenarioPlayer.Outcome o = play("slow-web-repay", false);
        assertThat(o.authorizations()).isEqualTo(2);
        assertThat(o.orderStatus()).isEqualTo("PAYMENT_PENDING");
    }

    @Test
    void runbookRb21ReleasesAHeldOrderWithOneCaptureAndVoidsTheExtraAuthorization() {
        ReleaseHoldService.Result[] r = new ReleaseHoldService.Result[1];
        ScenarioPlayer.Outcome o = play("slow-web-repay", false, () -> r[0] = releaseHold.release("51102"));
        assertThat(r[0].released()).isTrue();
        assertThat(r[0].voided()).hasSize(1);
        assertThat(store.order("51102").status()).isEqualTo("CONFIRMED");
        assertThat(o.captures()).isEqualTo(1);
    }

    @Test
    void runbookRb21RefusesAnOrderCapturedTwice() {
        play("app-race", false);
        ReleaseHoldService.Result r = releaseHold.release("51209");
        assertThat(r.released()).isFalse();
        assertThat(r.reason()).contains("2 captures");
        assertThat(store.order("51209").status()).isEqualTo("PAYMENT_PENDING");
    }
}
