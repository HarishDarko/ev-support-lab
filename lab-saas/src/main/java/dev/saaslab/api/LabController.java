package dev.saaslab.api;

import dev.saaslab.delivery.DeliveryStore;
import dev.saaslab.delivery.DeliveryWorker;
import dev.saaslab.support.ReplayService;
import java.time.Clock;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** The service's small HTTP surface, for running it by hand (serve): send a burst of events, or replay (RB-14). */
@RestController
public class LabController {

    private final DeliveryStore store;
    private final DeliveryWorker worker;
    private final ReplayService replay;
    private final Clock clock;

    public LabController(DeliveryStore store, DeliveryWorker worker, ReplayService replay, Clock clock) {
        this.store = store;
        this.worker = worker;
        this.replay = replay;
        this.clock = clock;
    }

    /** {@code n} events for one endpoint, in flight together. */
    @PostMapping("/endpoints/{id}/events")
    public List<String> burst(@PathVariable String id, @RequestParam(defaultValue = "1") int n) {
        List<String> ids = IntStream.range(0, n).mapToObj(i -> "evt-" + UUID.randomUUID()).toList();
        ids.forEach(e -> store.addEvent(e, id, clock.instant()));
        worker.deliverTogether(id, ids);
        return ids;
    }

    @PostMapping("/support/endpoints/{id}/replay")
    public ReplayService.Result replay(@PathVariable String id) {
        return replay.replay(id);
    }
}
