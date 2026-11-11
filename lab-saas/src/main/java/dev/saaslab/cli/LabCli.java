package dev.saaslab.cli;

import dev.saaslab.LabApplication;
import dev.saaslab.experiment.ExperimentInputs;
import dev.saaslab.experiment.ExperimentResult;
import dev.saaslab.experiment.ExperimentRunner;
import dev.saaslab.experiment.LabHarness;
import dev.saaslab.simulator.ScenarioPlayer;
import dev.saaslab.simulator.ScenarioPlayer.Outcome;
import dev.saaslab.simulator.Scenarios;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import org.springframework.boot.SpringApplication;

/**
 * Command line entry point.
 *
 * <pre>
 * serve [--fix on|off]                          run the service (needs PostgreSQL, see LAB_DB_URL)
 * demo --scenario NAME [--fix on|off]           play one scenario against an in-process service and show the result
 * experiment [--out FILE] [--inputs FILE] [--jdbc-url URL]
 *                                               run the before/after experiment
 * </pre>
 */
public final class LabCli {

    private LabCli() {}

    public static void main(String[] args) throws Exception {
        if (args.length == 0) {
            usage();
            System.exit(2);
        }
        Map<String, String> options = new HashMap<>();
        for (int i = 1; i + 1 < args.length; i += 2) {
            options.put(args[i].replaceFirst("^--", ""), args[i + 1]);
        }
        switch (args[0]) {
            case "serve" -> SpringApplication.run(LabApplication.class,
                    "--lab.fix.enabled=" + !"off".equals(options.get("fix")));
            case "demo" -> demo(options);
            case "experiment" -> experiment(options);
            default -> {
                usage();
                System.exit(2);
            }
        }
    }

    private static void demo(Map<String, String> options) {
        String name = options.getOrDefault("scenario", "burst-at-expiry");
        boolean fix = !"off".equals(options.get("fix"));
        try (LabHarness lab = LabHarness.start(null, fix, Instant.parse("2026-03-02T05:00:00Z"))) {
            Outcome o = new ScenarioPlayer(lab.store(), lab.worker(), lab.trace(), lab.jdbc(), lab.clock())
                    .play(Scenarios.named(name), null);
            System.out.println("scenario " + name + ", fix " + (fix ? "on" : "off"));
            o.log().forEach(l -> System.out.println("  " + l.time() + "  " + l.actor() + "  " + l.detail()));
            System.out.printf("delivered %d, failed %d, pending %d, token requests %d, pauses %d, delivered twice %d%n",
                    o.delivered(), o.failed(), o.pending(), o.tokenRequests(), o.pauses(), o.deliveredTwice());
        }
    }

    private static void experiment(Map<String, String> options) throws IOException {
        ExperimentInputs inputs = ExperimentInputs.load(options.containsKey("inputs") ? Path.of(options.get("inputs")) : null);
        long t0 = System.nanoTime();
        ExperimentResult result = new ExperimentRunner(inputs, options.get("jdbc-url")).run();
        Path out = Path.of(options.getOrDefault("out", "build/experiment.json"));
        if (out.getParent() != null) {
            Files.createDirectories(out.getParent());
        }
        Files.writeString(out, ExperimentInputs.MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(result));
        result.windows().forEach((w, groups) -> groups.forEach((g, v) -> System.out.printf(
                "%-6s %-7s events %6d  token requests %6d  storms %2d  pauses %2d (real outages %d)  replayed %4d  lost %d  twice %d%n",
                w, g, v.events(), v.tokenRequests(), v.storms(), v.pauses(), v.realOutagePauses(), v.replayed(), v.lost(),
                v.deliveredTwice())));
        result.storyComparison().forEach(c -> System.out.printf("  %s expected %d computed %d %s%n",
                c.metric(), c.expected(), c.computed(), c.matches() ? "" : "(differs)"));
        System.out.printf("wrote %s in %.0f s%n", out, (System.nanoTime() - t0) / 1e9);
    }

    private static void usage() {
        System.err.println("usage: serve [--fix on|off] | demo --scenario NAME [--fix on|off] | experiment [--out FILE]");
        System.err.println("scenarios: " + Scenarios.names());
    }
}
