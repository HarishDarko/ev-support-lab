package dev.saaslab.experiment;

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
 * @param start day 0, 00:00 ET, as an instant
 * @param days length of each window
 * @param eventsPerHour events of the hourly recurring-task job per endpoint, on the hour
 * @param replayHour support replays paused endpoints at this hour and {@code replayMinute} ET, every day
 * @param tokenLifetimeSeconds lifetime of the customers' access tokens
 * @param tokenRequestsPerMinute the customers' identity provider limit per client per minute
 * @param stormThreshold a storm is more than this many token requests for one endpoint in one minute
 */
public record ExperimentInputs(String start, int days, int eventsPerHour, int replayHour, int replayMinute,
        long tokenLifetimeSeconds, int tokenRequestsPerMinute, int stormThreshold, List<String> canary,
        List<String> control, Hmac hmac, List<Window> windows, Map<String, Integer> expectedStory) {

    /** {@code fixOnCanary}: whether the canary workspaces have the flag on in this window. */
    public record Window(String name, boolean fixOnCanary, List<Burst> bursts, List<Outage> outages,
            List<Capture> captures) {}

    /** The hourly job sends {@code size} events instead of eventsPerHour at this day and hour (ET). */
    public record Burst(String endpoint, int day, int hour, int size) {}

    /** The endpoint answers {@code status} for {@code minutes} from this day and hour. */
    public record Outage(String endpoint, int day, int hour, int status, int minutes) {}

    /** Record a log excerpt from this burst until the endpoint's next replay. */
    public record Capture(String endpoint, int day, int hour, String title) {}

    /** An HMAC endpoint outside the two groups whose customer rotates the signing secret: the contrast case. */
    public record Hmac(String endpoint, int day, int hour, String title) {}

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
