package dev.evlab.ocpp.messages;

import java.time.Instant;

public record HeartbeatResponse(Instant currentTime) {}
