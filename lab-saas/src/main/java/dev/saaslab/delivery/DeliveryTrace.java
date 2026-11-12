package dev.saaslab.delivery;

import java.time.Clock;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/**
 * Optional log capture in the support desk's log format: [time ET, actor, detail]. Off unless an endpoint is
 * being captured, so the experiment can record a few excerpts without logging every delivery. The worker writes
 * one summary line per step of a burst, not one line per delivery.
 */
@Component
public class DeliveryTrace {

    public record Line(String time, String actor, String detail) {}

    private static final DateTimeFormatter ET = DateTimeFormatter.ofPattern("HH:mm:ss")
            .withZone(ZoneId.of("America/New_York"));

    private final Clock clock;
    private final Map<String, List<Line>> captured = new ConcurrentHashMap<>();

    public DeliveryTrace(Clock clock) {
        this.clock = clock;
    }

    public void capture(String endpointId) {
        captured.put(endpointId, new ArrayList<>());
    }

    public List<Line> stop(String endpointId) {
        List<Line> lines = captured.remove(endpointId);
        return lines == null ? List.of() : lines;
    }

    public void line(String endpointId, String actor, String detail) {
        List<Line> lines = captured.get(endpointId);
        if (lines != null) {
            synchronized (lines) {
                lines.add(new Line(ET.format(clock.instant()), actor, detail));
            }
        }
    }
}
