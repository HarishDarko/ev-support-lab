package dev.shoplab.experiment;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import tools.jackson.databind.json.JsonMapper;

/**
 * The experiment's scripted inputs (src/main/resources/experiment/inputs.json). Outcomes are computed by reading
 * the database after the run; nothing in the output is written by hand.
 *
 * @param start day 0, 00:00 ET, as an instant (January, so no clock change inside the run)
 * @param days length of each window
 * @param firstHour regular checkouts are spread evenly from this hour (ET) ...
 * @param lastHour ... to this hour
 * @param channels the channel of the n-th regular checkout of a store's day, cycled
 * @param amountsPence order amounts, cycled
 * @param answerMillis the processor's answer time for regular checkouts, cycled (all under the 8 s timeout)
 * @param canary the stores that get the flag in the "after" window
 * @param control the stores that never get it
 */
public record ExperimentInputs(String start, int days, int firstHour, int lastHour, List<Store> stores,
        List<String> canary, List<String> control, List<String> channels, List<Integer> amountsPence,
        List<Long> answerMillis, List<Window> windows, Map<String, Integer> expectedStory) {

    public record Store(String id, String name, int checkoutsPerDay) {}

    /** {@code fixOnCanary}: whether the canary stores have the flag on in this window. */
    public record Window(String name, boolean fixOnCanary, List<Scripted> shoppers) {}

    /**
     * A scripted checkout on top of the regular ones.
     *
     * @param time ET time of day, e.g. "14:02:11.200"
     * @param answerMillis the processor's delay for the 1st, 2nd, ... new authorization of the order
     * @param repayAfterMillis web: the shopper pays again this long after the timeout; null waits
     * @param declineFirst the first card declines; the shopper enters a new card 20 s later
     * @param dropWebhooks the processor's webhooks for this order never arrive
     * @param title if set, the order's log is recorded under this title
     */
    public record Scripted(String store, int day, String time, String order, String channel, int amountPence,
            List<Long> answerMillis, Long repayAfterMillis, boolean declineFirst, boolean dropWebhooks,
            String title) {}

    public static final JsonMapper MAPPER = JsonMapper.builder().build();

    public static ExperimentInputs load(Path path) throws IOException {
        if (path != null) {
            return MAPPER.readValue(Files.readString(path), ExperimentInputs.class);
        }
        try (InputStream in = ExperimentInputs.class.getResourceAsStream("/experiment/inputs.json")) {
            if (in == null) {
                throw new IOException("experiment/inputs.json is not on the classpath");
            }
            return MAPPER.readValue(in, ExperimentInputs.class);
        }
    }
}
