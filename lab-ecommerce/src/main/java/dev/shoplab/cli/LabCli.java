package dev.shoplab.cli;

import dev.shoplab.LabApplication;
import dev.shoplab.LabProperties;
import dev.shoplab.checkout.CheckoutService;
import dev.shoplab.experiment.ExperimentInputs;
import dev.shoplab.experiment.ExperimentResult;
import dev.shoplab.experiment.ExperimentRunner;
import dev.shoplab.experiment.LabHarness;
import dev.shoplab.orders.CaptureGate;
import dev.shoplab.orders.OrderService;
import dev.shoplab.shop.OrderTrace;
import dev.shoplab.simulator.ScenarioPlayer;
import dev.shoplab.simulator.ScenarioPlayer.Outcome;
import dev.shoplab.simulator.Scenarios;
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
        String name = options.getOrDefault("scenario", "slow-web-repay");
        boolean fix = !"off".equals(options.get("fix"));
        try (LabHarness lab = LabHarness.start(null, fix, Instant.parse("2026-01-08T19:02:11.200Z"))) {
            Outcome o = new ScenarioPlayer(lab.bean(CheckoutService.class), lab.bean(OrderService.class),
                    lab.store(), lab.bean(CaptureGate.class), lab.jdbc(), lab.bean(OrderTrace.class), lab.clock(),
                    lab.webhookUrl(), lab.bean(LabProperties.class).orders().webhookWait())
                    .play(Scenarios.named(name), null);
            System.out.println("scenario " + name + ", fix " + (fix ? "on" : "off"));
            o.log().forEach(l -> System.out.println("  " + l.time() + "  " + l.actor() + "  " + l.detail()));
            System.out.printf("order %s%s, authorizations %d, captures %d, keys %s, lookups %d%n", o.orderStatus(),
                    o.holdReason() == null ? "" : " (" + o.holdReason() + ")", o.authorizations(), o.captures(),
                    o.keys(), o.lookups());
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
        // Line feeds only, so the file is the same on every system.
        Files.writeString(out, ExperimentInputs.MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(result)
                .replace("\r\n", "\n") + "\n");
        result.windows().forEach((w, groups) -> groups.forEach((g, v) -> System.out.printf(
                "%-6s %-7s checkouts %5d  slow %2d  retried new key %2d  second auth %2d  stuck %2d  both captured %d"
                        + "  held other %d  new card after decline %d  lookups %2d  detector %2d%n",
                w, g, v.checkouts(), v.slowFirstAnswer(), v.retriedWithNewKey(), v.secondAuthorization(), v.stuck(),
                v.bothCaptured(), v.heldOther(), v.newCardAfterDecline(), v.lookups(), v.detectorHits())));
        result.storyComparison().forEach(c -> System.out.printf("  %s expected %d computed %d %s%n",
                c.metric(), c.expected(), c.computed(), c.matches() ? "" : "(differs)"));
        System.out.printf("wrote %s in %.0f s%n", out, (System.nanoTime() - t0) / 1e9);
    }

    private static void usage() {
        System.err.println("usage: serve [--fix on|off] | demo --scenario NAME [--fix on|off] | experiment [--out FILE]");
        System.err.println("scenarios: " + Scenarios.names());
    }
}
