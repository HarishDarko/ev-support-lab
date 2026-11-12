package dev.saaslab.support;

import dev.saaslab.delivery.DeliveryStore;
import dev.saaslab.delivery.DeliveryTrace;
import dev.saaslab.delivery.DeliveryWorker;
import java.time.Clock;
import java.util.List;
import org.springframework.stereotype.Service;

/**
 * What runbook RB-14 does: a test delivery first; only if it answers 2xx, resume the endpoint and replay its
 * failed events one at a time, marking each delivered only on a 2xx. It corrects the record; it does not change
 * why the deliveries failed.
 */
@Service
public class ReplayService {

    public record Result(int testStatus, int replayed, int delivered) {}

    private final DeliveryStore store;
    private final DeliveryWorker worker;
    private final DeliveryTrace trace;
    private final Clock clock;

    public ReplayService(DeliveryStore store, DeliveryWorker worker, DeliveryTrace trace, Clock clock) {
        this.store = store;
        this.worker = worker;
        this.trace = trace;
        this.clock = clock;
    }

    public Result replay(String endpointId) {
        int test = worker.testDelivery(endpointId);
        if (test / 100 != 2) {
            return new Result(test, 0, 0);
        }
        store.resume(endpointId, clock.instant());
        List<String> failed = store.failedEvents(endpointId);
        for (String id : failed) {
            store.reopen(id);
            worker.deliverTogether(endpointId, List.of(id));
        }
        int delivered = (int) failed.stream().filter(id -> "delivered".equals(store.event(id).status())).count();
        trace.line(endpointId, "support-tool", "RB-14: replayed " + failed.size() + " failed events, "
                + delivered + " delivered");
        return new Result(test, failed.size(), delivered);
    }
}
