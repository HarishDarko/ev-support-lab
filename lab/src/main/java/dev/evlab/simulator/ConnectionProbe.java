package dev.evlab.simulator;

/**
 * Lets the runner wait until the server has finished handling a websocket open or close, so that the next
 * step happens at a well-defined point of simulated time. Implemented by the in-process harness.
 */
public interface ConnectionProbe {

    String OPENED = "OPENED";
    String CLOSED = "CLOSED";

    /** Number of OPENED or CLOSED events the server has recorded for the station. */
    int count(String stationId, String kind);

    /** Open transactions on the station whose GetTransactionStatus has been sent but not yet answered. */
    int unansweredStatusQueries(String stationId);
}
