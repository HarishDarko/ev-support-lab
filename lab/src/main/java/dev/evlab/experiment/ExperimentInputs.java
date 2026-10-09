package dev.evlab.experiment;

import dev.evlab.ocpp.OcppJson;
import dev.evlab.simulator.ScenarioParams;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/** The scripted inputs of the experiment, as read from {@code experiment/inputs.json}. */
public record ExperimentInputs(
        int version,
        long seed,
        int unplugDropWindowSec,
        Map<String, List<StationSpec>> stations,
        List<WindowSpec> windows,
        Map<String, Object> expectedStory) {

    public static final String CANARY = "canary";
    public static final String CONTROL = "control";
    public static final String RESOURCE = "/experiment/inputs.json";

    public record StationSpec(String id, String site, String firmware) {}

    /**
     * @param fixOnCanary whether the flag is on for the canary stations in this window
     * @param backgroundSessions normal sessions per group, on top of the scripted drops
     */
    public record WindowSpec(String name, Instant start, int days, boolean fixOnCanary,
            Map<String, Integer> backgroundSessions, List<DropSpec> drops) {

        public Instant end() {
            return start.plusSeconds(days * 86_400L);
        }
    }

    /**
     * One scripted incident. {@code unplugTime} is UTC. For {@code still-delivering} it is the time of the drop.
     */
    public record DropSpec(String scenario, String station, int day, String unplugTime, Integer evse,
            String transactionId, ScenarioParams params, CaptureSpec capture) {

        public int evseOrDefault() {
            return evse == null ? 1 : evse;
        }

        public ScenarioParams paramsOrNone() {
            return params == null ? ScenarioParams.NONE : params;
        }
    }

    /** A gateway log excerpt to record around an incident. Offsets are seconds from the anchor. */
    public record CaptureSpec(String label, String title, int fromSec, int untilSec, List<ProbeSpec> probes) {}

    /** {@code kind}: session-state, session-state-brief, session-open or map. */
    public record ProbeSpec(String kind, int atSec) {}

    public static ExperimentInputs load(Path file) {
        try (InputStream in = file == null
                ? ExperimentInputs.class.getResourceAsStream(RESOURCE)
                : Files.newInputStream(file)) {
            if (in == null) {
                throw new IllegalStateException("inputs not found: " + (file == null ? RESOURCE : file));
            }
            return OcppJson.MAPPER.readValue(in, ExperimentInputs.class);
        } catch (IOException e) {
            throw new IllegalStateException("cannot read experiment inputs", e);
        }
    }

    public List<String> stationIds(String group) {
        return stations.get(group).stream().map(StationSpec::id).toList();
    }

    public String groupOf(String stationId) {
        return stations.entrySet().stream()
                .filter(e -> e.getValue().stream().anyMatch(s -> s.id().equals(stationId)))
                .map(Map.Entry::getKey).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("station not in any group: " + stationId));
    }
}
