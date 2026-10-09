package dev.evlab.reconciliation;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Production trigger for the sweep. Tests and the experiment switch it off and call sweep() on their own clock. */
@Component
@ConditionalOnProperty(name = "lab.reconciliation.scheduler-enabled", havingValue = "true", matchIfMissing = true)
public class ReconciliationScheduler {

    private final ReconciliationService service;

    public ReconciliationScheduler(ReconciliationService service) {
        this.service = service;
    }

    @Scheduled(fixedDelayString = "${lab.reconciliation.sweep-interval:5s}")
    void sweep() {
        service.sweep();
    }
}
