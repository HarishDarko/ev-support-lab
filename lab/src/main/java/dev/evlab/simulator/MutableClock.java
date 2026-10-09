package dev.evlab.simulator;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

/** A clock that only moves when told to. Backend and runner share one instance, so time is scripted. */
public class MutableClock extends Clock {

    private volatile Instant now;

    public MutableClock(Instant start) {
        this.now = start;
    }

    public void set(Instant t) {
        if (t.isBefore(now)) {
            throw new IllegalArgumentException("clock cannot go back: " + now + " -> " + t);
        }
        this.now = t;
    }

    /** For tests that reuse one clock across cases; not used by the backend. */
    public void reset(Instant t) {
        this.now = t;
    }

    public void advance(Duration d) {
        set(now.plus(d));
    }

    @Override
    public ZoneId getZone() {
        return ZoneOffset.UTC;
    }

    @Override
    public Clock withZone(ZoneId zone) {
        return this;
    }

    @Override
    public Instant instant() {
        return now;
    }
}
