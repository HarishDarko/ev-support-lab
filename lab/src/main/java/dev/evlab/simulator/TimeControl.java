package dev.evlab.simulator;

import java.time.Duration;
import java.time.Instant;

/** How a run moves time forward before each step. */
public interface TimeControl {

    /** Moves the world clock to {@code t}. Never called with a time earlier than the previous call. */
    void advanceTo(Instant t);

    /** Real time: the first step runs immediately, later ones wait, scaled by {@code speedup}. */
    static TimeControl realTime(double speedup) {
        return new TimeControl() {
            private Instant virtualStart;
            private long wallStartNanos;

            @Override
            public void advanceTo(Instant t) {
                if (virtualStart == null) {
                    virtualStart = t;
                    wallStartNanos = System.nanoTime();
                    return;
                }
                long virtualNanos = Duration.between(virtualStart, t).toNanos();
                long waitNanos = wallStartNanos + (long) (virtualNanos / speedup) - System.nanoTime();
                if (waitNanos > 0) {
                    try {
                        Thread.sleep(waitNanos / 1_000_000, (int) (waitNanos % 1_000_000));
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    }
                }
            }
        };
    }
}
