package dev.shoplab.shop;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/**
 * Optional log capture in the support desk's log format: [time ET, actor, detail]. Off unless an order is being
 * captured, so the experiment can record a few excerpts without logging every checkout. A line can carry the
 * moment it describes (an answer that arrives later than the call that asked for it); lines come back in time order.
 */
@Component
public class OrderTrace {

    public record Line(String time, String actor, String detail) {}

    private record Entry(Instant at, long seq, Line line) {}

    private static final DateTimeFormatter ET = DateTimeFormatter.ofPattern("HH:mm:ss.SSS")
            .withZone(ZoneId.of("America/New_York"));

    private final Clock clock;
    private final Map<String, List<Entry>> captured = new ConcurrentHashMap<>();
    private final java.util.concurrent.atomic.AtomicLong seq = new java.util.concurrent.atomic.AtomicLong();

    public OrderTrace(Clock clock) {
        this.clock = clock;
    }

    public void capture(String orderId) {
        captured.put(orderId, new ArrayList<>());
    }

    public boolean capturing(String orderId) {
        return captured.containsKey(orderId);
    }

    public List<Line> stop(String orderId) {
        List<Entry> entries = captured.remove(orderId);
        if (entries == null) {
            return List.of();
        }
        synchronized (entries) {
            return entries.stream().sorted(Comparator.comparing(Entry::at).thenComparing(Entry::seq))
                    .map(Entry::line).toList();
        }
    }

    public void line(String orderId, String actor, String detail) {
        lineAt(orderId, clock.instant(), actor, detail);
    }

    public void lineAt(String orderId, Instant at, String actor, String detail) {
        List<Entry> entries = captured.get(orderId);
        if (entries != null) {
            synchronized (entries) {
                entries.add(new Entry(at, seq.getAndIncrement(), new Line(ET.format(at), actor, detail)));
            }
        }
    }

    /** "£58.00" for 5800. */
    public static String money(int pence) {
        return String.format("£%d.%02d", pence / 100, pence % 100);
    }

    /** "10.1 s" for 10,100 ms. */
    public static String seconds(long millis) {
        return String.format(java.util.Locale.ROOT, "%.1f s", millis / 1000.0);
    }
}
