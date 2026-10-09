package dev.evlab.observability;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;
import org.springframework.stereotype.Component;

/**
 * Optional per-station capture of gateway traffic in the support-desk log format
 * ({@code HH:MM:SS  actor  message}, UTC). Off unless a capture is started, so it costs nothing in normal runs.
 */
@Component
public class GatewayTrace {

    public record Line(Instant at, String actor, String message) {

        private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("HH:mm:ss").withZone(ZoneOffset.UTC);

        public String format() {
            return TIME.format(at) + "  " + actor + (message.isEmpty() ? "" : "  " + message);
        }
    }

    private static final class Capture {
        final List<Line> lines = Collections.synchronizedList(new ArrayList<>());
        final Set<String> endedSeen = Collections.synchronizedSet(new HashSet<>());
    }

    private final Map<String, Capture> captures = new ConcurrentHashMap<>();

    public void begin(String stationId) {
        captures.put(stationId, new Capture());
    }

    public List<Line> end(String stationId) {
        Capture c = captures.remove(stationId);
        return c == null ? List.of() : List.copyOf(c.lines);
    }

    public boolean capturing(String stationId) {
        return captures.containsKey(stationId);
    }

    /** The message is built lazily so an idle trace does no formatting work. */
    public void record(String stationId, Instant at, String actor, Supplier<String> message) {
        Capture c = captures.get(stationId);
        if (c != null) {
            c.lines.add(new Line(at, actor, message.get()));
        }
    }

    public void noteEndedReceived(String stationId, String transactionId) {
        Capture c = captures.get(stationId);
        if (c != null) {
            c.endedSeen.add(transactionId);
        }
    }

    public boolean endedReceived(String stationId, String transactionId) {
        Capture c = captures.get(stationId);
        return c != null && c.endedSeen.contains(transactionId);
    }
}
