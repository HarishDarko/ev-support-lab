package dev.evlab.simulator;

/** How the scripted charger answers GetTransactionStatus. */
public record StatusAnswerSpec(boolean messagesInQueue, Boolean ongoingIndicator) {

    public static final StatusAnswerSpec NOTHING_PENDING = new StatusAnswerSpec(false, false);
}
