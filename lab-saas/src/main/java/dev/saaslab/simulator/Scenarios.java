package dev.saaslab.simulator;

import java.util.List;
import java.util.Map;

/**
 * The scenarios, as data. Each one sets up one workspace and one endpoint, primes a token with one delivery at
 * 00:00:00, then plays its steps; offsets are seconds after the prime. A token lasts 3,600 s, so a step at 3,600
 * meets an expired token.
 */
public final class Scenarios {

    /** What a step does. */
    public enum Action {
        /** {@code n} events in flight together. */
        BURST,
        /** The identity provider revokes the client (401 invalid_client from then on). */
        REVOKE,
        /** The endpoint answers HTTP {@code n} for 40 minutes. */
        DOWN,
        /** Another system spends the client's token quota for this minute ({@code n} requests). */
        SPEND_QUOTA,
        /** Deliver the events that waited and are now due. */
        DUE
    }

    public record Step(long offsetSeconds, Action action, int n) {}

    /** {@code auth} is "oauth" or "hmac"; {@code signatureOk} false sets up an HMAC endpoint with a rotated secret. */
    public record Scenario(String name, String auth, boolean signatureOk, List<Step> steps) {}

    private static final Map<String, Scenario> ALL = Map.of(
            "burst-at-expiry", oauth("burst-at-expiry", new Step(3600, Action.BURST, 32)),
            "quiet-expiry", oauth("quiet-expiry", new Step(3600, Action.BURST, 2)),
            "idp-rate-limited", oauth("idp-rate-limited",
                    new Step(3600, Action.SPEND_QUOTA, 100), new Step(3600, Action.BURST, 10),
                    new Step(3660, Action.DUE, 0)),
            "revoked-client", oauth("revoked-client",
                    new Step(1800, Action.REVOKE, 0), new Step(3600, Action.BURST, 5)),
            "endpoint-down", oauth("endpoint-down",
                    new Step(3600, Action.DOWN, 503), new Step(3600, Action.BURST, 20)),
            "hmac-endpoint", new Scenario("hmac-endpoint", "hmac", true, List.of(new Step(3600, Action.BURST, 32))),
            "secret-rotated", new Scenario("secret-rotated", "hmac", false, List.of(new Step(3600, Action.BURST, 5))));

    private Scenarios() {}

    private static Scenario oauth(String name, Step... steps) {
        return new Scenario(name, "oauth", true, List.of(steps));
    }

    public static Scenario named(String name) {
        Scenario s = ALL.get(name);
        if (s == null) {
            throw new IllegalArgumentException("unknown scenario " + name + "; known: " + ALL.keySet());
        }
        return s;
    }

    public static List<String> names() {
        return ALL.keySet().stream().sorted().toList();
    }
}
