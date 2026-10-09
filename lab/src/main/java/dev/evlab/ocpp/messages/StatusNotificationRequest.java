package dev.evlab.ocpp.messages;

import java.time.Instant;

public record StatusNotificationRequest(
        Instant timestamp, ConnectorStatus connectorStatus, int evseId, int connectorId) {}
