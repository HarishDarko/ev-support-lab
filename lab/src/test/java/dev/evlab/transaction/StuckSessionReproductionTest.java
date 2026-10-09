package dev.evlab.transaction;

import static org.assertj.core.api.Assertions.assertThat;

import dev.evlab.simulator.Scenarios;
import dev.evlab.support.AbstractLabIT;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.TestPropertySource;

/**
 * Flag off everywhere: the legacy behaviour. These tests assert that the bug exists, so they are the
 * reproduction, not the fix. If one of them starts to fail, the bug is gone (or the legacy path was changed).
 */
@TestPropertySource(properties = "lab.fix.enabled=false")
class StuckSessionReproductionTest extends AbstractLabIT {

    @Test
    void reproduces_session_stays_open_when_the_Ended_arrives_after_Available() {
        Played p = play(Scenarios.LATE_ENDED);

        Transaction t = tx(p.id());
        assertThat(t.state()).isEqualTo(TxState.CHARGING);
        assertThat(t.closeSource()).isNull();
        assertThat(t.invoice().status()).isEqualTo(InvoiceStatus.NONE);
        assertThat(transactions.countStuck()).isEqualTo(1);
    }

    @Test
    void reproduces_session_stays_open_when_the_Ended_never_arrives() {
        Played p = play(Scenarios.LOST_ENDED);

        Transaction t = tx(p.id());
        assertThat(t.state()).isEqualTo(TxState.CHARGING);
        assertThat(t.invoice().status()).isEqualTo(InvoiceStatus.NONE);
        assertThat(t.reconciliation().reconciledAt()).isNull();
        assertThat(transactions.countStuck()).isEqualTo(1);
    }
}
