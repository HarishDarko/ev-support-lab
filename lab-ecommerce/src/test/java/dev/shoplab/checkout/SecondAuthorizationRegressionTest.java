package dev.shoplab.checkout;

import static org.assertj.core.api.Assertions.assertThat;

import dev.shoplab.simulator.ScenarioPlayer.Outcome;
import dev.shoplab.support.AbstractLabIT;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * The fix (ENG-5230) under the application default, lab.fix.enabled=true: the three slow checkouts of the
 * reproduction give one key, one authorization, one capture and a confirmed order. Forced off
 * ({@code -Dlab.fix.enabled=false}) this test fails on its assertions; CI checks that. It uses only {@code isEqualTo},
 * so an assertion failure is an {@code org.opentest4j.AssertionFailedError}.
 */
class SecondAuthorizationRegressionTest extends AbstractLabIT {

    @ParameterizedTest
    @ValueSource(strings = {"slow-web-repay", "slow-app-retry", "app-race"})
    void aRetryAfterASlowAnswerReturnsTheFirstAuthorization(String scenario) {
        Outcome o = play(scenario, null);

        assertThat(o.keys().size()).as("idempotency keys").isEqualTo(1);
        assertThat(o.processorAuthorizations()).as("authorizations at the processor").isEqualTo(1);
        assertThat(o.authorizations()).as("authorizations the shop saw").isEqualTo(1);
        assertThat(o.captures()).as("captures").isEqualTo(1);
        assertThat(o.orderStatus()).as("order").isEqualTo("CONFIRMED");
    }
}
