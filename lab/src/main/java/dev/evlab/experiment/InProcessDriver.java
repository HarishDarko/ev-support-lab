package dev.evlab.experiment;

import dev.evlab.reconciliation.ReconciliationService;
import dev.evlab.simulator.ConnectionProbe;
import dev.evlab.simulator.MutableClock;
import dev.evlab.simulator.ScenarioRun;
import dev.evlab.simulator.ScenarioRunner;
import dev.evlab.simulator.SimulatedCharger;
import java.time.Instant;
import java.util.function.Function;
import org.springframework.jdbc.core.simple.JdbcClient;

/**
 * Wires the simulator to a backend running in the same JVM: scripted clocks, the sweeper called by hand on each
 * scheduled tick, and websocket open/close counts read from the database. Used by the integration tests, the
 * experiment and the demo.
 */
public final class InProcessDriver {

    private final String wsBaseUrl;
    private final Function<String, MutableClock> clocks;
    private final JdbcClient jdbc;
    private final ReconciliationService reconciliation;

    /**
     * @param wsBaseUrl e.g. {@code ws://localhost:51234/ocpp}
     * @param clocks the scripted clock the backend uses for a given station
     */
    public InProcessDriver(String wsBaseUrl, Function<String, MutableClock> clocks, JdbcClient jdbc,
            ReconciliationService reconciliation) {
        this.wsBaseUrl = wsBaseUrl;
        this.clocks = clocks;
        this.jdbc = jdbc;
        this.reconciliation = reconciliation;
    }

    public SimulatedCharger newCharger(String stationId) {
        return new SimulatedCharger(wsBaseUrl, stationId);
    }

    public ConnectionProbe probe() {
        return new ConnectionProbe() {
            @Override
            public int count(String station, String kind) {
                return jdbc.sql("select count(*) from connection_log where station_id = :s and kind = :k")
                        .param("s", station).param("k", kind).query(Integer.class).single();
            }

            @Override
            public int unansweredStatusQueries(String station) {
                return jdbc.sql("""
                        select count(*) from transaction
                         where station_id = :s and state = 'CHARGING'
                           and reconnected_at is not null and status_answered_at is null
                        """).param("s", station).query(Integer.class).single();
            }
        };
    }

    /** A runner for one station's timeline: its clock, the sweeper on every tick, nothing to observe. */
    public ScenarioRunner runner(String stationId) {
        return runner(stationId, new ScenarioRunner.Hooks() {
            @Override
            public void tick(ScenarioRun run) {
                reconciliation.sweep(stationId);
            }

            @Override
            public void observe(String label, ScenarioRun run, Instant at) {
                // nothing to observe by default
            }
        });
    }

    public ScenarioRunner runner(String stationId, ScenarioRunner.Hooks hooks) {
        return new ScenarioRunner(clocks.apply(stationId)::set, probe(), hooks);
    }

    public MutableClock clock(String stationId) {
        return clocks.apply(stationId);
    }

    public void sweep(String stationId) {
        reconciliation.sweep(stationId);
    }
}
