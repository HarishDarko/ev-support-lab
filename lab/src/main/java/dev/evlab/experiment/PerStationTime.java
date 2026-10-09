package dev.evlab.experiment;

import dev.evlab.simulator.MutableClock;
import dev.evlab.station.StationTime;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Gives every simulated station its own scripted clock. Stations do not interact, so each can run its own
 * timeline on its own thread; the backend still reads time through {@link StationTime} as usual.
 */
public final class PerStationTime extends StationTime {

    private final Map<String, MutableClock> clocks = new ConcurrentHashMap<>();
    private final Instant start;

    public PerStationTime(Instant start) {
        super(new MutableClock(start));
        this.start = start;
    }

    public MutableClock clockFor(String stationId) {
        return clocks.computeIfAbsent(stationId, s -> new MutableClock(start));
    }

    @Override
    public Instant now(String stationId) {
        return clockFor(stationId).instant();
    }
}
