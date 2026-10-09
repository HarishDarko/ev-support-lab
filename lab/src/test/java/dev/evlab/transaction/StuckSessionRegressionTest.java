package dev.evlab.transaction;

import static org.assertj.core.api.Assertions.assertThat;

import dev.evlab.simulator.Scenarios;
import dev.evlab.support.AbstractLabIT;
import java.time.Duration;
import org.junit.jupiter.api.Test;

/**
 * The same two scenarios as the reproduction test, with the fix on. This class deliberately does not set
 * lab.fix.enabled: it takes the application default (true), so running the suite with
 * {@code -Dlab.fix.enabled=false} turns this test into a failing reproduction of the bug.
 */
class StuckSessionRegressionTest extends AbstractLabIT {

    @Test
    void late_ended_is_applied_and_closes_the_session_with_a_confirmed_invoice() {
        Played p = play(Scenarios.LATE_ENDED);

        Transaction t = tx(p.id());
        assertThat(t.state()).isEqualTo(TxState.ENDED);
        assertThat(t.closeSource()).isEqualTo(CloseSource.REAL);
        assertThat(t.stopReason()).isEqualTo("EVDisconnected");
        assertThat(t.invoice().status()).isEqualTo(InvoiceStatus.CONFIRMED);
        assertThat(t.invoice().chargesIssued()).isEqualTo(1);
        assertThat(t.reconciliation().reconciledAt()).isNull();
        assertThat(transactions.countStuck()).isZero();
    }

    @Test
    void lost_ended_is_reconciled_provisionally_at_the_last_meter_value() {
        Played p = play(Scenarios.LOST_ENDED);

        Transaction t = tx(p.id());
        assertThat(t.state()).isEqualTo(TxState.ENDED);
        assertThat(t.closeSource()).isEqualTo(CloseSource.RECONCILED);
        // The last periodic sample is sent 45 s before the unplug.
        assertThat(t.stoppedAt()).isEqualTo(p.anchor().minus(Duration.ofSeconds(45)));
        assertThat(t.invoice().status()).isEqualTo(InvoiceStatus.PROVISIONAL);
        assertThat(t.invoice().energyWh()).isEqualTo(18420.0);
        assertThat(t.invoice().chargesIssued()).isEqualTo(1);
        assertThat(t.reconciliation().reconciledAt()).isNotNull();
        assertThat(t.reconciliation().reason()).contains("Ended not received");
        assertThat(transactions.countStuck()).isZero();
        assertThat(counter("ocpp.transactions.reconciled")).isEqualTo(1.0);
    }
}
