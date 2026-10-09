package dev.evlab.observability;

import dev.evlab.transaction.ReviewReason;
import dev.evlab.transaction.TransactionRepository;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.stereotype.Component;

/**
 * Micrometer meters. Names are dotted; a Prometheus registry renders them as
 * {@code ocpp_transactions_reconciled_total} and so on.
 */
@Component
public class LabMetrics {

    private final MeterRegistry registry;

    public LabMetrics(MeterRegistry registry, TransactionRepository transactions) {
        this.registry = registry;
        Gauge.builder("ocpp.transactions.stuck", transactions, TransactionRepository::countStuck)
                .description("Open transactions on an EVSE that reports Available, not yet flagged for a person")
                .register(registry);
    }

    public void reconciled() {
        registry.counter("ocpp.transactions.reconciled").increment();
    }

    public void duplicateEvent() {
        registry.counter("ocpp.events.duplicate").increment();
    }

    /** A real Ended applied to a transaction that the legacy path would have left open. */
    public void lateEndedApplied(String after) {
        registry.counter("ocpp.ended.late.applied", "after", after).increment();
    }

    public void flagged(ReviewReason reason) {
        registry.counter("ocpp.transactions.flagged", "reason", reason.name().toLowerCase()).increment();
    }
}
