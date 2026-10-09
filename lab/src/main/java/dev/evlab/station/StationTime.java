package dev.evlab.station;

import java.time.Clock;
import java.time.Instant;
import org.springframework.stereotype.Component;

/**
 * The backend reads time through here, always on behalf of a station. In production every station sees the
 * same {@link Clock}. The experiment replaces this bean to give each simulated station its own scripted time,
 * so that stations can be played in parallel without sharing a clock.
 */
@Component
public class StationTime {

    private final Clock clock;

    public StationTime(Clock clock) {
        this.clock = clock;
    }

    public Instant now(String stationId) {
        return clock.instant();
    }
}
