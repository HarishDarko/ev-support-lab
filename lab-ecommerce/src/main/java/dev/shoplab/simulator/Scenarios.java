package dev.shoplab.simulator;

import java.util.List;
import java.util.Map;

/**
 * The scenarios, as data: one shopper, one checkout, one order. Delays are the processor's answer times for the
 * 1st and 2nd new authorization of the order; checkout's timeout is 8 s. The order numbers and times follow the
 * synthetic tickets they stand for.
 */
public final class Scenarios {

    /**
     * @param channel web, ios or android
     * @param answerMillis the processor's delay for each new authorization of the order
     * @param repayAfterMillis web only: the shopper pays again this long after the timeout; null waits
     * @param declineFirst the first card declines and the shopper enters a new one 20 s later
     * @param dropWebhooks the processor's webhooks for the order never arrive
     */
    public record Scenario(String name, String orderId, String channel, int amountPence, List<Long> answerMillis,
            Long repayAfterMillis, boolean declineFirst, boolean dropWebhooks) {}

    private static final Map<String, Scenario> ALL = Map.of(
            // A normal checkout: the answer comes in 1.4 s, nobody retries.
            "fast-pay", new Scenario("fast-pay", "50001", "web", 4200, List.of(1400L), null, false, false),
            // T-4002: the answer takes 10.1 s, the page shows an error, the shopper pays again 12 s later.
            "slow-web-repay", new Scenario("slow-web-repay", "51102", "web", 5800, List.of(10_100L, 1_500L),
                    12_000L, false, false),
            // The same slow answer, but the shopper waits: the late answer confirms the order.
            "slow-web-wait", new Scenario("slow-web-wait", "51150", "web", 5800, List.of(10_100L), null, false,
                    false),
            // T-4006: the app retries 0.5 s after the 8 s timeout; the first answer took 8.4 s.
            "slow-app-retry", new Scenario("slow-app-retry", "51151", "ios", 3650, List.of(8_400L, 1_500L), null,
                    false, false),
            // T-4010: the first answer takes 12.7 s, the app's retry answers 4.22 s after it was sent, so both
            // webhooks arrive 20 ms apart and two workers capture at once.
            "app-race", new Scenario("app-race", "51209", "ios", 3650, List.of(12_700L, 4_220L), null, false,
                    false),
            // A declined card, then a new card 20 s later: that second authorization is correct and must work.
            "decline-new-card", new Scenario("decline-new-card", "51300", "web", 2999, List.of(1_200L, 1_500L),
                    null, true, false),
            // The processor answers after 31 s; the shopper pays again 25 s after the timeout.
            "very-slow", new Scenario("very-slow", "51400", "web", 7450, List.of(31_000L, 1_500L), 25_000L, false,
                    false),
            // H-4109: one authorization, one key, but the processor's webhook never arrives: a different cause.
            "capture-webhook-timeout", new Scenario("capture-webhook-timeout", "48266", "web", 2450,
                    List.of(1_400L), null, false, true));

    private Scenarios() {}

    public static Scenario named(String name) {
        Scenario s = ALL.get(name);
        if (s == null) {
            throw new IllegalArgumentException("unknown scenario " + name + "; known: " + names());
        }
        return s;
    }

    public static List<String> names() {
        return ALL.keySet().stream().sorted().toList();
    }
}
