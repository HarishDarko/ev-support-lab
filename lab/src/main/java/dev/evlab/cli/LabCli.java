package dev.evlab.cli;

import dev.evlab.LabApplication;
import dev.evlab.experiment.ExperimentInputs;
import dev.evlab.experiment.ExperimentResult;
import dev.evlab.experiment.ExperimentRunner;
import dev.evlab.experiment.LabHarness;
import dev.evlab.ocpp.OcppJson;
import dev.evlab.simulator.Scenario;
import dev.evlab.simulator.ScenarioParams;
import dev.evlab.simulator.ScenarioRun;
import dev.evlab.simulator.ScenarioRunner;
import dev.evlab.simulator.Scenarios;
import dev.evlab.simulator.SimulatedCharger;
import dev.evlab.simulator.TimeControl;
import dev.evlab.transaction.Transaction;
import dev.evlab.transaction.TransactionRepository;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.boot.SpringApplication;

/**
 * Command line entry point.
 *
 * <pre>
 * serve [--fix on|off]                          run the backend (needs PostgreSQL, see LAB_DB_URL)
 * demo --scenario NAME [--fix on|off]           play one scenario against an in-process backend and show the result
 * simulate --scenario NAME --station ID [--url ws://localhost:8080/ocpp] [--speed N]
 *                                               play one scenario against a running backend, in real time
 * experiment [--out FILE] [--inputs FILE] [--jdbc-url URL]
 *                                               run the before/after experiment
 * </pre>
 */
public final class LabCli {

    private LabCli() {}

    public static void main(String[] args) throws Exception {
        quietContainerLogs();
        if (args.length == 0) {
            usage();
            System.exit(2);
        }
        Map<String, String> options = parseOptions(args);
        switch (args[0]) {
            case "serve" -> serve(options);
            case "demo" -> demo(options);
            case "simulate" -> simulate(options);
            case "experiment" -> experiment(options);
            default -> {
                usage();
                System.exit(2);
            }
        }
    }

    private static void serve(Map<String, String> options) {
        List<String> springArgs = new ArrayList<>();
        if (options.containsKey("fix")) {
            springArgs.add("--lab.fix.enabled=" + options.get("fix").equals("on"));
        }
        SpringApplication.run(LabApplication.class, springArgs.toArray(String[]::new));
    }

    private static void experiment(Map<String, String> options) throws IOException {
        ExperimentInputs inputs = ExperimentInputs.load(
                options.containsKey("inputs") ? Path.of(options.get("inputs")) : null);
        ExperimentResult result = new ExperimentRunner(inputs, options.get("jdbc-url")).run();
        Path out = Path.of(options.getOrDefault("out", "build/experiment.json"));
        if (out.getParent() != null) {
            Files.createDirectories(out.getParent());
        }
        Files.writeString(out, OcppJson.MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(result));
        ExperimentReport.print(result, out);
        System.exit(0);
    }

    private static void demo(Map<String, String> options) {
        String name = require(options, "scenario");
        boolean fix = !"off".equals(options.getOrDefault("fix", "on"));
        Instant unplug = Instant.parse("2026-06-01T22:41:52Z");
        try (LabHarness harness = LabHarness.start(options.get("jdbc-url"), fix, unplug.minusSeconds(7200))) {
            Scenario scenario = Scenarios.named(name, ScenarioParams.NONE);
            String station = "CP-DEMO-01";
            harness.stations().setFixEnabled(station, null, harness.time().now(station));
            try (SimulatedCharger charger = harness.driver().newCharger(station)) {
                charger.connect();
                List<String> ids = List.of("70001", "70002");
                ScenarioRun run = ScenarioRun.of(charger, scenario, unplug, ids, 1);
                harness.trace().begin(station);
                harness.driver().runner(station).run(List.of(run));
                System.out.println("scenario " + name + ", fix " + (fix ? "ON" : "OFF") + "\n");
                harness.trace().end(station).forEach(l -> System.out.println(l.format()));
                System.out.println();
                TransactionRepository repo = harness.bean(TransactionRepository.class);
                for (String id : ids.subList(0, scenario.slots())) {
                    Transaction t = repo.find(station, id).orElseThrow();
                    System.out.printf("transaction %s: state=%s closeSource=%s invoice=%s (%.0f Wh, %d charge) "
                                    + "reconciledAt=%s review=%s%n",
                            t.id(), t.state(), t.closeSource(), t.invoice().status(), t.invoice().energyWh(),
                            t.invoice().chargesIssued(), t.reconciliation().reconciledAt(),
                            t.reconciliation().reviewReason());
                }
            }
        }
        System.exit(0);
    }

    private static void simulate(Map<String, String> options) {
        String name = require(options, "scenario");
        String station = require(options, "station");
        String url = options.getOrDefault("url", "ws://localhost:8080/ocpp");
        double speed = Double.parseDouble(options.getOrDefault("speed", "1"));
        Scenario scenario = Scenarios.named(name, ScenarioParams.NONE);
        Instant anchor = Instant.now().minus(scenario.firstStep()).plusSeconds(2);
        String suffix = Long.toString(System.currentTimeMillis() % 100_000_000L);
        try (SimulatedCharger charger = new SimulatedCharger(url, station)) {
            ScenarioRun run = ScenarioRun.of(charger, scenario, anchor, List.of("sim-" + suffix, "sim-" + suffix + "b"), 1);
            charger.connect();
            new ScenarioRunner(TimeControl.realTime(speed), null, new ScenarioRunner.Hooks() {
                @Override
                public void tick(ScenarioRun run) {
                    // the remote backend runs its own sweeper
                }

                @Override
                public void observe(String label, ScenarioRun r, Instant at) {
                    // nothing to observe remotely
                }
            }).run(List.of(run));
            System.out.println("played " + name + " as " + station + " against " + url);
        }
        System.exit(0);
    }

    private static void quietContainerLogs() {
        for (String name : List.of("org.testcontainers", "tc", "com.github.dockerjava")) {
            if (org.slf4j.LoggerFactory.getLogger(name) instanceof ch.qos.logback.classic.Logger logger) {
                logger.setLevel(ch.qos.logback.classic.Level.WARN);
            }
        }
    }

    private static Map<String, String> parseOptions(String[] args) {
        Map<String, String> options = new HashMap<>();
        for (int i = 1; i < args.length; i++) {
            if (args[i].startsWith("--") && i + 1 < args.length) {
                options.put(args[i].substring(2), args[++i]);
            }
        }
        return options;
    }

    private static String require(Map<String, String> options, String key) {
        String v = options.get(key);
        if (v == null) {
            throw new IllegalArgumentException("missing --" + key);
        }
        return v;
    }

    private static void usage() {
        System.err.println("usage: serve | demo --scenario NAME | simulate --scenario NAME --station ID | "
                + "experiment [--out FILE]");
        System.err.println("scenarios: " + Scenarios.NAMES);
    }
}
