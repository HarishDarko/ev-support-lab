package dev.evlab.ocpp.messages;

public record GetTransactionStatusResponse(Boolean ongoingIndicator, boolean messagesInQueue) {}
