package dev.saaslab.delivery;

import static org.assertj.core.api.Assertions.assertThat;

import dev.saaslab.simulator.ScenarioPlayer.Outcome;
import dev.saaslab.support.AbstractLabIT;
import org.junit.jupiter.api.Test;

/** The fix must not hide real failures, and must not change what already worked. */
class DeliveryEdgeCasesTest extends AbstractLabIT {

    @Test
    void quietExpiryRefreshesOnceBeforeTheTokenExpires() {
        Outcome o = play("quiet-expiry", true);
        assertThat(o.tokenRequests()).isEqualTo(2);
        assertThat(o.delivered()).isEqualTo(3);
        assertThat(o.log()).noneSatisfy(l -> assertThat(l.detail()).contains("401"));
    }

    @Test
    void quietExpiryOnTheLegacyPathCostsExtraTokensButNoPause() {
        Outcome o = play("quiet-expiry", false);
        assertThat(o.tokenRequests()).isGreaterThan(2);
        assertThat(o.delivered()).isEqualTo(3);
        assertThat(o.pauses()).isZero();
    }

    @Test
    void aRateLimitedTokenRequestMakesDeliveriesWaitNotFail() {
        Outcome o = play("idp-rate-limited", true);
        assertThat(o.failed()).as("failed").isZero();
        assertThat(o.delivered()).as("delivered after Retry-After").isEqualTo(11);
        assertThat(jdbc.sql("select count(*) from delivery_attempt where outcome = 'waited'")
                .query(Integer.class).single()).isEqualTo(10);
    }

    @Test
    void theLegacyPathFailsTheSameRateLimitedBurst() {
        Outcome o = play("idp-rate-limited", false);
        assertThat(o.failed()).isEqualTo(10);
    }

    @Test
    void aRevokedClientStillFailsAndCounts() {
        Outcome o = play("revoked-client", true);
        assertThat(o.failed()).isEqualTo(5);
        assertThat(jdbc.sql("select count(*) from delivery_attempt where detail like '%invalid_client%'")
                .query(Integer.class).single()).isEqualTo(5);
    }

    @Test
    void aRealOutageStillPausesTheEndpointWithTheFixOn() {
        Outcome o = play("endpoint-down", true);
        assertThat(o.failed()).isEqualTo(20);
        assertThat(o.pauses()).isEqualTo(1);
    }

    @Test
    void hmacEndpointsSendNoTokenRequests() {
        Outcome o = play("hmac-endpoint", true);
        assertThat(o.tokenRequests()).isZero();
        assertThat(o.delivered()).isEqualTo(33);
    }

    @Test
    void aRotatedSigningSecretStillFails() {
        Outcome o = play("secret-rotated", true);
        assertThat(o.delivered()).isZero();
        assertThat(o.failed()).isEqualTo(6);
    }

    @Test
    void aWorkspaceWithTheFlagOffKeepsTheOldPath() {
        Outcome o = play("burst-at-expiry", false);
        assertThat(o.pauses()).isEqualTo(1);
    }
}
