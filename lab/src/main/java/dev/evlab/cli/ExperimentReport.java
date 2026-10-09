package dev.evlab.cli;

import dev.evlab.experiment.ExperimentResult;
import java.nio.file.Path;

/** Console summary of an experiment result. */
final class ExperimentReport {

    private ExperimentReport() {}

    static void print(ExperimentResult r, Path out) {
        System.out.println();
        System.out.printf("%-10s %-8s %8s %6s %7s %6s %8s %7s %5s %5s%n", "window", "group", "sessions", "drops",
                "elsewh.", "stuck", "flagged", "reconc.", "late", "skips");
        r.windows().forEach((window, groups) -> groups.forEach((group, m) -> System.out.printf(
                "%-10s %-8s %8d %6d %7d %6d %8d %7d %5d %5d%n", window, group, m.sessions(), m.dropsNearUnplug(),
                m.dropsElsewhere(), m.stuck(), m.openFlaggedForReview(), m.reconciliations(),
                m.lateEndedAppliedAfterProvisional(), m.newerTransactionSkips())));
        System.out.println();
        System.out.printf("%-26s %9s %9s%n", "story value", "expected", "computed");
        r.storyComparison().forEach(c -> System.out.printf("%-26s %9s %9s  %s%n", c.metric(), c.expected(),
                c.computed(), c.matches() ? "" : "<-- differs"));
        System.out.println();
        r.gatewayLogs().forEach(log -> {
            System.out.println(log.title() + "  [" + log.scenario() + "]");
            log.lines().forEach(l -> System.out.println("  " + l.get(0) + "  " + l.get(1) + "  " + l.get(2)));
            System.out.println();
        });
        System.out.println("written to " + out);
    }
}
