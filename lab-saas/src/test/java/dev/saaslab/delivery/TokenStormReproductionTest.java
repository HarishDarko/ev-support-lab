package dev.saaslab.delivery;

import static org.assertj.core.api.Assertions.assertThat;

import dev.saaslab.simulator.ScenarioPlayer.Outcome;
import dev.saaslab.support.AbstractLabIT;
import org.junit.jupiter.api.Test;

/** With the fix off, a burst that meets an expired token sets off a token storm and the endpoint is paused. */
class TokenStormReproductionTest extends AbstractLabIT {

    @Test
    void burstAtExpiryPausesAnEndpointThatIsUp() {
        Outcome o = play("burst-at-expiry", false);

        // The prime took 1 token; the burst of 32 then sent far more than one per expiry.
        assertThat(o.tokenRequests()).as("token requests").isGreaterThan(100);
        assertThat(o.log()).anySatisfy(l -> assertThat(l.detail()).contains("429 Too Many Requests"));
        assertThat(o.pauses()).as("pauses").isEqualTo(1);
        assertThat(o.failed()).as("failed deliveries").isGreaterThanOrEqualTo(15);
        // Reproduces: the endpoint was up the whole time; only the token handling failed.
        assertThat(o.log()).noneSatisfy(l -> assertThat(l.detail()).contains("HTTP 5"));
    }
}
