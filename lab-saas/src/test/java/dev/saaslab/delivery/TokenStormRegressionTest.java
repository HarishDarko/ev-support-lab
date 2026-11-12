package dev.saaslab.delivery;

import static org.assertj.core.api.Assertions.assertThat;

import dev.saaslab.simulator.ScenarioPlayer.Outcome;
import dev.saaslab.support.AbstractLabIT;
import org.junit.jupiter.api.Test;

/**
 * The fix (ENG-5108) under the application default, lab.fix.enabled=true: one token request per expiry, every
 * event delivered once, no pause. Forced off ({@code -Dlab.fix.enabled=false}) this test fails; CI checks that.
 */
class TokenStormRegressionTest extends AbstractLabIT {

    @Test
    void burstAtExpiryNeedsOneTokenAndDeliversEverything() {
        Outcome o = play("burst-at-expiry", null);

        // One token for the prime, one shared refresh before the burst.
        assertThat(o.tokenRequests()).as("token requests").isEqualTo(2);
        assertThat(o.delivered()).as("delivered").isEqualTo(33);
        assertThat(o.failed()).as("failed").isZero();
        assertThat(o.pauses()).as("pauses").isZero();
        assertThat(o.deliveredTwice()).as("delivered twice").isZero();
    }
}
