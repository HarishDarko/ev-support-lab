package dev.evlab.simulator;

import java.time.Duration;

/** An action at an offset from the scenario anchor (the unplug for drop scenarios). May be negative. */
public record Step(Duration at, Action action) {}
