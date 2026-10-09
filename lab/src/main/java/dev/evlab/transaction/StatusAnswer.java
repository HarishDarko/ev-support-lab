package dev.evlab.transaction;

import java.time.Instant;

/** The charger's reply to GetTransactionStatus. {@code ongoingIndicator} is optional in OCPP 2.0.1. */
public record StatusAnswer(Instant answeredAt, boolean messagesInQueue, Boolean ongoingIndicator) {}
