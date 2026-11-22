package dev.shoplab.checkout;

import static org.assertj.core.api.Assertions.assertThat;

import dev.shoplab.checkout.CheckoutService.Outcome;
import dev.shoplab.checkout.CheckoutService.PayResult;
import dev.shoplab.checkout.CheckoutService.TimeoutView;
import dev.shoplab.payment.ProcessorClient;
import dev.shoplab.shop.FeatureFlags;
import dev.shoplab.shop.ShopStore;
import dev.shoplab.shop.ShopStore.Attempt;
import dev.shoplab.simulator.FakeProcessor;
import dev.shoplab.simulator.ScenarioPlayer;
import dev.shoplab.support.AbstractLabIT;
import dev.shoplab.support.ReleaseHoldService;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;

/** The fix must not change what already worked, and must not hide holds that have another cause. */
class CheckoutEdgeCasesTest extends AbstractLabIT {

    @Autowired
    private ReleaseHoldService releaseHold;
    @Autowired
    private FeatureFlags flags;

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
    void theSameCardAfterADeclineGetsANewKeySoItCanAuthorizeOnceTheDeclineClears() {
        try (FakeProcessor processor = new FakeProcessor(clock, 1200)) {
            store.addStore("store-soft", "Soft decline store (synthetic)", processor.url(), true);
            checkout.start("co-51310", "store-soft", "51310", "web", 2999);
            processor.declines("card-51310");

            PayResult declined = checkout.pay("co-51310", "card-51310");
            assertThat(declined.outcome()).isEqualTo(Outcome.DECLINED);

            // The shopper's bank clears the decline and the shopper taps Pay again with the same card.
            processor.approves("card-51310");
            clock.advance(Duration.ofSeconds(20));
            PayResult retried = checkout.pay("co-51310", "card-51310");

            assertThat(retried.idempotencyKey()).as("a declined key is not reused")
                    .isNotEqualTo(declined.idempotencyKey());
            assertThat(retried.outcome()).isEqualTo(Outcome.AUTHORIZED);
            assertThat(processor.authorizations("51310")).isEqualTo(1);
        }
    }

    @ParameterizedTest
    @CsvSource({"200, processing", "500, error"})
    void anAnswerThatIsNeitherAuthorizedNorDeclinedKeepsTheKeySoARetryCannotAuthorizeTwice(int httpStatus,
            String status) {
        // A processor that answers in time, but with neither an authorization nor a decline.
        ProcessorClient undecided = new ProcessorClient(java.net.http.HttpClient.newHttpClient(), properties) {
            @Override
            public Answer authorize(String processorUrl, String idempotencyKey, String orderId, int amountPence,
                    String card) {
                return new Answer(httpStatus, status, null, clock.instant().plusSeconds(1));
            }
        };
        CheckoutService service = new CheckoutService(store, flags, undecided, trace, clock, properties);
        store.addStore("store-undecided", "Undecided processor store (synthetic)", "http://127.0.0.1:9", true);
        service.start("co-51350", "store-undecided", "51350", "web", 2999);

        PayResult first = service.pay("co-51350", "card-51350");
        clock.advance(Duration.ofSeconds(20));
        PayResult retried = service.pay("co-51350", "card-51350");

        assertThat(first.outcome()).isNotEqualTo(Outcome.AUTHORIZED);
        assertThat(retried.idempotencyKey()).as("the same key, so the processor returns the first payment")
                .isEqualTo(first.idempotencyKey());
        assertThat(store.checkout("co-51350").keySeq()).isEqualTo(1);
    }

    @Test
    void aDeclineFoundByTheLookupAfterATimeoutAlsoRetiresTheKey() {
        try (FakeProcessor processor = new FakeProcessor(clock, 1200)) {
            store.addStore("store-soft", "Soft decline store (synthetic)", processor.url(), true);
            checkout.start("co-51320", "store-soft", "51320", "web", 2999);
            processor.plan("51320", new FakeProcessor.Plan(List.of(9_000L, 1_200L), false));
            processor.declines("card-51320");

            PayResult timedOut = checkout.pay("co-51320", "card-51320");
            assertThat(timedOut.outcome()).isEqualTo(Outcome.TIMED_OUT);
            clock.advance(Duration.ofSeconds(10));
            assertThat(checkout.onTimeout(timedOut.attemptId())).isEqualTo(TimeoutView.DECLINED);

            processor.approves("card-51320");
            PayResult retried = checkout.pay("co-51320", "card-51320");
            assertThat(retried.idempotencyKey()).isNotEqualTo(timedOut.idempotencyKey());
            assertThat(retried.outcome()).isEqualTo(Outcome.AUTHORIZED);
        }
    }

    @Test
    void aCaptureTheProcessorRefusesIsNotRecordedAndTheOrderIsHeld() {
        try (FakeProcessor processor = new FakeProcessor(clock, 1200)) {
            store.addStore("store-refuse", "Refusing processor store (synthetic)", processor.url(), true);
            checkout.start("co-51330", "store-refuse", "51330", "web", 2999);

            // An authorization the processor does not know: it answers the capture with 409.
            orders.onAuthorizationSucceeded("au_FFFF", "51330", "ck_51330_k1", 2999);

            assertThat(store.capturesFor("51330")).isEmpty();
            assertThat(processor.captures("51330")).isZero();
            ShopStore.Order order = store.order("51330");
            assertThat(order.status()).isEqualTo("PAYMENT_PENDING");
            assertThat(order.holdReason()).contains("refused by the processor").contains("409");
        }
    }

    @Test
    void runbookRb21KeepsTheHoldWhenTheProcessorRefusesAVoid() {
        try (FakeProcessor processor = new FakeProcessor(clock, 1200)) {
            store.addStore("store-refuse", "Refusing processor store (synthetic)", processor.url(), true);
            checkout.start("co-51340", "store-refuse", "51340", "web", 2999);
            // One capture and an extra authorization the processor does not know, so it answers the void with 404.
            store.sawAuthorization("au_EEE1", "51340", "ck_51340_k1", 2999, clock.instant());
            store.addCapture("51340", "au_EEE1", 2999, clock.instant());
            store.setAuthorizationStatus("au_EEE1", "captured");
            store.sawAuthorization("au_EEE2", "51340", "ck_51340_k2", 2999, clock.instant());
            store.setOrderStatus("51340", ShopStore.PAYMENT_PENDING, "extra authorization", clock.instant());

            ReleaseHoldService.Result r = releaseHold.release("51340");

            assertThat(r.released()).isFalse();
            assertThat(r.voided()).isEmpty();
            assertThat(r.reason()).contains("au_EEE2").contains("404");
            assertThat(store.order("51340").status()).isEqualTo("PAYMENT_PENDING");
            assertThat(store.authorizationsFor("51340")).filteredOn(a -> a.id().equals("au_EEE2"))
                    .extracting(ShopStore.Authorization::status).containsExactly("authorized");
        }
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
