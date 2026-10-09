package dev.evlab.experiment;

import dev.evlab.experiment.ExperimentInputs.CaptureSpec;
import dev.evlab.experiment.ExperimentInputs.DropSpec;
import dev.evlab.experiment.ExperimentInputs.ProbeSpec;
import dev.evlab.experiment.ExperimentInputs.StationSpec;
import dev.evlab.experiment.ExperimentInputs.WindowSpec;
import dev.evlab.experiment.ExperimentResult.Comparison;
import dev.evlab.experiment.ExperimentResult.GroupMetrics;
import dev.evlab.experiment.ExperimentResult.LogExcerpt;
import dev.evlab.observability.GatewayTrace;
import dev.evlab.ocpp.messages.BootNotificationRequest;
import dev.evlab.ocpp.messages.ConnectorStatus;
import dev.evlab.reconciliation.ReconciliationService;
import dev.evlab.simulator.Action;
import dev.evlab.simulator.MutableClock;
import dev.evlab.simulator.Scenario;
import dev.evlab.simulator.ScenarioParams;
import dev.evlab.simulator.ScenarioRun;
import dev.evlab.simulator.ScenarioRunner;
import dev.evlab.simulator.Scenarios;
import dev.evlab.simulator.SimulatedCharger;
import dev.evlab.simulator.Step;
import dev.evlab.station.EvseStatusRepository;
import dev.evlab.transaction.Transaction;
import dev.evlab.transaction.TransactionRepository;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Random;
import java.util.TreeMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.function.Function;

/**
 * Runs the seeded synthetic fleet through the backend, window by window, and reads the outcome back from the
 * database. The inputs are scripts; the outcomes are whatever the backend did with them.
 */
public final class ExperimentRunner {

    private static final String NOTE = "Inputs are scripted (experiment/inputs.json). Every metric below was "
            + "computed from the backend state after the run; none is hard-coded.";
    private static final long FIRST_TRANSACTION_ID = 90_000;
    private static final Duration CELL = Duration.ofMinutes(30);
    private static final int CELLS_PER_DAY = 48;
    private static final Duration BUSY_PADDING = Duration.ofMinutes(15);

    private final ExperimentInputs inputs;
    private final String jdbcUrl;

    private LabHarness harness;
    private final Map<String, SimulatedCharger> chargers = new LinkedHashMap<>();
    private final Map<String, Instant> truthDeliveryEnd = new HashMap<>();
    private final Map<String, Capture> captures = new LinkedHashMap<>();
    private final Map<String, List<Interval>> busy = new HashMap<>();
    private long nextTransactionId = FIRST_TRANSACTION_ID;

    /** @param jdbcUrl database to use, or null to start PostgreSQL with Testcontainers */
    public ExperimentRunner(ExperimentInputs inputs, String jdbcUrl) {
        this.inputs = inputs;
        this.jdbcUrl = jdbcUrl;
    }

    private record Interval(Instant from, Instant to) {}

    private static final class Capture {
        final String label;
        final String title;
        final String scenario;
        final String station;
        final String transactionId;
        final int evse;
        List<GatewayTrace.Line> lines = List.of();

        Capture(String label, String title, String scenario, String station, String transactionId, int evse) {
            this.label = label;
            this.title = title;
            this.scenario = scenario;
            this.station = station;
            this.transactionId = transactionId;
            this.evse = evse;
        }
    }

    public ExperimentResult run() {
        Instant firstStart = inputs.windows().getFirst().start();
        try (LabHarness h = LabHarness.start(jdbcUrl, false, firstStart.minus(Duration.ofHours(1)))) {
            this.harness = h;
            try {
                return execute();
            } finally {
                chargers.values().forEach(SimulatedCharger::close);
                chargers.clear();
            }
        }
    }

    private ExperimentResult execute() {
        connectStations();
        Map<String, Map<String, GroupMetrics>> windows = new LinkedHashMap<>();
        Map<String, Double> meters = new LinkedHashMap<>();
        for (WindowSpec window : inputs.windows()) {
            windows.put(window.name(), runWindow(window));
            meters.putAll(snapshotMeters(window.name()));
        }
        List<LogExcerpt> logs = captures.values().stream()
                .map(c -> new LogExcerpt(c.label, c.title, c.scenario, c.lines.stream()
                        .map(l -> List.of(l.format().substring(0, 8), l.actor(), l.message())).toList()))
                .toList();
        ExperimentResult computed = new ExperimentResult(inputs.version(), inputs.seed(), NOTE, windows, meters,
                logs, List.of());
        return computed.withComparison(compare(computed));
    }

    private void connectStations() {
        InProcessDriver driver = harness.driver();
        for (String group : inputs.stations().keySet()) {
            for (StationSpec s : inputs.stations().get(group)) {
                harness.stations().setFixEnabled(s.id(), null, harness.time().now(s.id()));
                SimulatedCharger charger = driver.newCharger(s.id());
                charger.connect();
                charger.call("BootNotification", new BootNotificationRequest("PowerUp",
                        new BootNotificationRequest.ChargingStation("SIM-1", "Synthetic", s.firmware())));
                chargers.put(s.id(), charger);
            }
        }
    }

    private Map<String, GroupMetrics> runWindow(WindowSpec window) {
        for (String id : inputs.stationIds(ExperimentInputs.CANARY)) {
            // The flag is a per-station override: on for the canary in the "after" window, untouched otherwise.
            harness.stations().setFixEnabled(id, window.fixOnCanary() ? Boolean.TRUE : null,
                    harness.time().now(id));
        }
        busy.clear();
        List<ScenarioRun> runs = new ArrayList<>(planDrops(window));
        runs.addAll(planBackground(window, new Random(inputs.seed() + window.name().hashCode())));

        playInParallel(runs);
        for (String station : chargers.keySet()) {
            MutableClock clock = harness.time().clockFor(station);
            clock.set(max(clock.instant(), window.end()));
            harness.driver().sweep(station);
        }

        ExperimentQueries queries = new ExperimentQueries(harness.jdbc());
        Map<String, GroupMetrics> byGroup = new LinkedHashMap<>();
        for (String group : inputs.stations().keySet()) {
            byGroup.put(group, queries.metrics(inputs.stationIds(group), window.start(), window.end(),
                    inputs.unplugDropWindowSec(), truthDeliveryEnd));
        }
        return byGroup;
    }

    /** Stations do not interact, so each plays its own timeline on its own thread with its own clock. */
    private void playInParallel(List<ScenarioRun> runs) {
        Map<String, List<ScenarioRun>> byStation = new LinkedHashMap<>();
        for (ScenarioRun run : runs) {
            byStation.computeIfAbsent(run.charger().stationId(), k -> new ArrayList<>()).add(run);
        }
        ScenarioRunner.Hooks hooks = hooks();
        ExecutorService pool = Executors.newFixedThreadPool(byStation.size());
        try {
            List<Future<?>> futures = new ArrayList<>();
            byStation.forEach((station, stationRuns) ->
                    futures.add(pool.submit(() -> harness.driver().runner(station, hooks).run(stationRuns))));
            for (Future<?> f : futures) {
                f.get();
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(e);
        } catch (ExecutionException e) {
            throw new IllegalStateException("a station timeline failed", e.getCause());
        } finally {
            pool.shutdownNow();
        }
    }

    // ---- planning -------------------------------------------------------------------------------------------

    private List<ScenarioRun> planDrops(WindowSpec window) {
        List<ScenarioRun> runs = new ArrayList<>();
        for (DropSpec drop : window.drops()) {
            Scenario scenario = Scenarios.named(drop.scenario(), drop.paramsOrNone());
            Instant anchor = window.start().plus(Duration.ofDays(drop.day()))
                    .plusSeconds(LocalTime.parse(drop.unplugTime()).toSecondOfDay());
            List<String> ids = new ArrayList<>();
            for (int slot = 0; slot < scenario.slots(); slot++) {
                ids.add(slot == 0 && drop.transactionId() != null ? drop.transactionId() : newTransactionId());
            }
            ScenarioRun run = ScenarioRun.of(chargers.get(drop.station()), scenario, anchor, ids,
                    drop.evseOrDefault());
            truthDeliveryEnd.put(drop.station() + "/" + ids.getFirst(), anchor.plus(scenario.truthDeliveryEnd()));
            Instant from = run.start();
            Instant to = run.end();
            CaptureSpec capture = drop.capture();
            if (capture != null) {
                captures.put(capture.label(), new Capture(capture.label(), capture.title(), scenario.name(),
                        drop.station(), ids.getFirst(), drop.evseOrDefault()));
                List<Step> extra = new ArrayList<>();
                extra.add(observe(capture.fromSec(), ScenarioRunner.CAPTURE_START + ":" + capture.label()));
                for (ProbeSpec probe : capture.probes()) {
                    extra.add(observe(probe.atSec(), "probe:" + probe.kind() + ":" + capture.label()));
                }
                extra.add(observe(capture.untilSec(), "capture-end:" + capture.label()));
                run = run.withExtra(extra.toArray(Step[]::new));
                from = min(from, anchor.plusSeconds(capture.fromSec()));
                to = max(to, anchor.plusSeconds(capture.untilSec()));
            }
            busy.computeIfAbsent(drop.station(), k -> new ArrayList<>())
                    .add(new Interval(from.minus(BUSY_PADDING), to.plus(BUSY_PADDING)));
            runs.add(run);
        }
        return runs;
    }

    /** Normal sessions on a 30-minute grid per station, skipping cells that a scripted incident occupies. */
    private List<ScenarioRun> planBackground(WindowSpec window, Random rng) {
        List<ScenarioRun> runs = new ArrayList<>();
        for (String group : inputs.stations().keySet()) {
            List<StationSpec> stations = inputs.stations().get(group);
            int total = window.backgroundSessions().getOrDefault(group, 0);
            for (int i = 0; i < stations.size(); i++) {
                int quota = total / stations.size() + (i < total % stations.size() ? 1 : 0);
                runs.addAll(planStationBackground(window, stations.get(i).id(), quota, rng));
            }
        }
        return runs;
    }

    private List<ScenarioRun> planStationBackground(WindowSpec window, String station, int quota, Random rng) {
        int days = window.days();
        boolean[][] taken = new boolean[days][CELLS_PER_DAY];
        for (Interval b : busy.getOrDefault(station, List.of())) {
            for (int d = 0; d < days; d++) {
                for (int c = 0; c < CELLS_PER_DAY; c++) {
                    Instant cellStart = window.start().plus(Duration.ofDays(d)).plus(CELL.multipliedBy(c));
                    if (cellStart.isBefore(b.to()) && cellStart.plus(CELL).isAfter(b.from())) {
                        taken[d][c] = true;
                    }
                }
            }
        }
        List<List<Integer>> freeCells = new ArrayList<>();
        for (int d = 0; d < days; d++) {
            List<Integer> free = new ArrayList<>();
            for (int c = 0; c < CELLS_PER_DAY; c++) {
                if (!taken[d][c]) {
                    free.add(c);
                }
            }
            freeCells.add(free);
        }
        // Spread the quota evenly over the days, skipping days with no room left (nights blocked by an incident).
        int[] perDay = new int[days];
        for (int n = 0, d = 0, misses = 0; n < quota; d = (d + 1) % days) {
            if (perDay[d] < freeCells.get(d).size()) {
                perDay[d]++;
                n++;
                misses = 0;
            } else if (++misses > days) {
                throw new IllegalStateException("no free slots left at " + station);
            }
        }
        List<ScenarioRun> runs = new ArrayList<>();
        SimulatedCharger charger = chargers.get(station);
        for (int d = 0; d < days; d++) {
            List<Integer> free = freeCells.get(d);
            for (int k = 0; k < perDay[d]; k++) {
                int cell = free.remove(rng.nextInt(free.size()));
                // The session fits in the cell: it starts at most ~16 minutes before its Ended.
                Instant anchor = window.start().plus(Duration.ofDays(d)).plus(CELL.multipliedBy(cell))
                        .plusSeconds(17 * 60 + rng.nextInt(12 * 60));
                double energy = 6_000 + rng.nextInt(24_000);
                Scenario scenario = Scenarios.named(Scenarios.NORMAL, new ScenarioParams(null, null, energy, null,
                        null, null, null, null, null));
                runs.add(ScenarioRun.of(charger, scenario, anchor, List.of(newTransactionId()),
                        1 + rng.nextInt(2)));
            }
        }
        return runs;
    }

    private String newTransactionId() {
        return Long.toString(nextTransactionId++);
    }

    private static Step observe(int offsetSec, String label) {
        return new Step(Duration.ofSeconds(offsetSec), new Action.Observe(label));
    }

    // ---- hooks ----------------------------------------------------------------------------------------------

    private ScenarioRunner.Hooks hooks() {
        ReconciliationService reconciliation = harness.bean(ReconciliationService.class);
        GatewayTrace trace = harness.trace();
        TransactionRepository transactions = harness.bean(TransactionRepository.class);
        EvseStatusRepository evse = harness.bean(EvseStatusRepository.class);
        return new ScenarioRunner.Hooks() {
            @Override
            public void tick(ScenarioRun run) {
                reconciliation.sweep(run.charger().stationId());
            }

            @Override
            public void observe(String label, ScenarioRun run, Instant at) {
                String[] parts = label.split(":");
                Capture capture = captures.get(parts[parts.length - 1]);
                if (capture == null) {
                    return;
                }
                switch (parts[0]) {
                    case "capture-start" -> trace.begin(capture.station);
                    case "capture-end" -> capture.lines = trace.end(capture.station);
                    case "probe" -> probe(parts[1], capture, at, trace, transactions, evse);
                    default -> throw new IllegalStateException("unknown observe label " + label);
                }
            }
        };
    }

    private void probe(String kind, Capture c, Instant at, GatewayTrace trace, TransactionRepository transactions,
            EvseStatusRepository evse) {
        Transaction tx = transactions.find(c.station, c.transactionId).orElseThrow();
        boolean noEnded = tx.isOpen() && !trace.endedReceived(c.station, c.transactionId);
        switch (kind) {
            case "session-state" -> trace.record(c.station, at, "session-svc", () -> "transactionId=" + tx.id()
                    + " state=" + stateName(tx) + "  last_meter=" + kwh(tx.meter().lastWh()) + " kWh"
                    + (noEnded ? "  (no TransactionEvent Ended received)" : ""));
            case "session-state-brief" -> trace.record(c.station, at, "session-svc", () -> "transactionId=" + tx.id()
                    + " state=" + stateName(tx) + (noEnded ? "  (no TransactionEvent Ended received)" : ""));
            case "session-open" -> trace.record(c.station, at, "session-svc", () -> {
                boolean available = evse.find(tx.stationId(), tx.evseId()).orElse(null) == ConnectorStatus.Available;
                long minutes = Math.round(Duration.between(tx.meter().lastAt(), at).toSeconds() / 60.0);
                return "transactionId=" + tx.id() + " open " + minutes / 60 + "h " + minutes % 60 + "m"
                        + (tx.isOpen() && available ? ", idle fee accruing" : "");
            });
            case "map" -> trace.record(c.station, at, "map-svc", () -> c.station + " shown "
                    + (transactions.findOpenByStation(c.station).stream().anyMatch(t -> t.evseId() == c.evse)
                            ? "'In use' (derived from open session)" : "'Available'"));
            default -> throw new IllegalStateException("unknown probe kind " + kind);
        }
    }

    private static String stateName(Transaction tx) {
        return tx.isOpen() ? "Charging" : "Ended";
    }

    private static String kwh(double wh) {
        return String.format(Locale.ROOT, "%.2f", wh / 1000.0);
    }

    // ---- results --------------------------------------------------------------------------------------------

    private Map<String, Double> snapshotMeters(String window) {
        Map<String, Double> out = new TreeMap<>();
        var registry = harness.meters();
        registry.getMeters().stream().filter(m -> m.getId().getName().startsWith("ocpp."))
                .filter(m -> m instanceof io.micrometer.core.instrument.Counter)
                .forEach(m -> {
                    String tags = m.getId().getTags().stream()
                            .map(t -> t.getKey() + "=" + t.getValue()).reduce((a, b) -> a + "," + b).orElse("");
                    String key = "endOf-" + window + ":" + m.getId().getName() + (tags.isEmpty() ? "" : "{" + tags + "}");
                    out.put(key, ((io.micrometer.core.instrument.Counter) m).count());
                });
        return out;
    }

    /** Values behind the numbers in the story, computed from the result. */
    public static Map<String, Integer> storyValues(ExperimentResult r) {
        Map<String, Integer> v = new LinkedHashMap<>();
        GroupMetrics cb = r.windows().get("before").get(ExperimentInputs.CANARY);
        GroupMetrics ca = r.windows().get("after").get(ExperimentInputs.CANARY);
        GroupMetrics kb = r.windows().get("before").get(ExperimentInputs.CONTROL);
        GroupMetrics ka = r.windows().get("after").get(ExperimentInputs.CONTROL);
        v.put("canaryStuckBefore", cb.stuck());
        v.put("canaryStuckAfter", ca.stuck());
        v.put("controlStuckBefore", kb.stuck());
        v.put("controlStuckAfter", ka.stuck());
        v.put("reconciliations", ca.reconciliations());
        v.put("lateEndedAppliedOnce", ca.lateEndedAppliedAfterProvisional());
        v.put("newerTransactionSkips", ca.newerTransactionSkips());
        v.put("falseClosures", sum(r, GroupMetrics::falseClosures));
        v.put("duplicateCharges", sum(r, GroupMetrics::duplicateCharges));
        v.put("invoicesAdjusted", ca.invoicesAdjusted());
        v.put("canaryDropsBefore", cb.dropsNearUnplug());
        v.put("canaryDropsAfter", ca.dropsNearUnplug());
        v.put("controlDropsBefore", kb.dropsNearUnplug());
        v.put("controlDropsAfter", ka.dropsNearUnplug());
        v.put("canarySessionsAfter", ca.sessions());
        return v;
    }

    private static int sum(ExperimentResult r, Function<GroupMetrics, Integer> f) {
        return r.windows().values().stream().flatMap(m -> m.values().stream()).mapToInt(f::apply).sum();
    }

    private List<Comparison> compare(ExperimentResult computed) {
        Map<String, Integer> actual = storyValues(computed);
        List<Comparison> out = new ArrayList<>();
        inputs.expectedStory().forEach((metric, expected) -> {
            Integer got = actual.get(metric);
            out.add(new Comparison(metric, expected, got, got != null && got.equals(expected)));
        });
        return out;
    }

    private static Instant max(Instant a, Instant b) {
        return a.isAfter(b) ? a : b;
    }

    private static Instant min(Instant a, Instant b) {
        return a.isBefore(b) ? a : b;
    }
}
