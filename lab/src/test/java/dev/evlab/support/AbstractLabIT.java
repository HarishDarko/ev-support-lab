package dev.evlab.support;

import static org.assertj.core.api.Assertions.assertThat;

import dev.evlab.experiment.InProcessDriver;
import dev.evlab.ocpp.messages.TransactionEventRequest;
import dev.evlab.ocpp.messages.TransactionEventRequest.Evse;
import dev.evlab.ocpp.messages.TransactionEventRequest.MeterValue;
import dev.evlab.ocpp.messages.TransactionEventRequest.SampledValue;
import dev.evlab.ocpp.messages.TransactionEventRequest.TransactionInfo;
import dev.evlab.ocpp.messages.TransactionEventRequest.UnitOfMeasure;
import dev.evlab.ocpp.messages.TransactionEventType;
import dev.evlab.reconciliation.ReconciliationService;
import dev.evlab.simulator.MutableClock;
import dev.evlab.simulator.Scenario;
import dev.evlab.simulator.ScenarioParams;
import dev.evlab.simulator.ScenarioRun;
import dev.evlab.simulator.Scenarios;
import dev.evlab.simulator.SimulatedCharger;
import dev.evlab.station.StationRepository;
import dev.evlab.transaction.Transaction;
import dev.evlab.transaction.TransactionRepository;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Meter;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * Real backend (embedded Tomcat), real PostgreSQL (Testcontainers), real websocket client. Time is scripted: the
 * sweeper does not run on its own, scenarios call it on their scheduled ticks.
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"lab.reconciliation.scheduler-enabled=false", "logging.level.dev.evlab=WARN"})
@Import(AbstractLabIT.TestClockConfig.class)
public abstract class AbstractLabIT {

    protected static final String STATION = "CP-TEST-01";
    private static final Instant EPOCH = Instant.parse("2026-03-02T00:00:00Z");
    private static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine")
            .withCommand("postgres", "-c", "fsync=off", "-c", "synchronous_commit=off", "-c", "full_page_writes=off");
    private static final AtomicInteger IDS = new AtomicInteger(1000);

    static {
        POSTGRES.start();
    }

    @TestConfiguration
    static class TestClockConfig {
        @Bean
        @Primary
        MutableClock testClock() {
            return new MutableClock(EPOCH);
        }
    }

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @LocalServerPort
    protected int port;

    @Autowired
    protected MutableClock clock;
    @Autowired
    protected JdbcClient jdbc;
    @Autowired
    protected ReconciliationService reconciliation;
    @Autowired
    protected TransactionRepository transactions;
    @Autowired
    protected StationRepository stations;
    @Autowired
    protected MeterRegistry meters;

    protected InProcessDriver driver;
    private final Map<String, Double> meterBaseline = new HashMap<>();

    @BeforeEach
    void resetDatabaseAndClock() {
        jdbc.sql("truncate transaction_event, transaction, evse_status, connection_log, station cascade").update();
        clock.reset(EPOCH);
        // The context, and so the meter registry, is shared between tests; counters are read as deltas.
        meterBaseline.clear();
        meters.getMeters().stream().filter(m -> m instanceof Counter)
                .forEach(m -> meterBaseline.put(key(m.getId()), ((Counter) m).count()));
        driver = new InProcessDriver("ws://localhost:" + port + "/ocpp", station -> clock, jdbc, reconciliation);
    }

    /** A scenario that has been played and the ids it used. */
    protected record Played(ScenarioRun run) {
        public String id() {
            return run.transactionId(0);
        }

        public String secondId() {
            return run.transactionId(1);
        }

        /** Timestamp of the unplug (or of the drop for still-delivering). */
        public Instant anchor() {
            return run.anchor();
        }
    }

    protected Played play(String scenario) {
        return play(scenario, ScenarioParams.NONE);
    }

    protected Played play(String scenario, ScenarioParams params) {
        Scenario s = Scenarios.named(scenario, params);
        Instant anchor = clock.instant().minus(s.firstStep()).plusSeconds(120);
        try (SimulatedCharger charger = driver.newCharger(STATION)) {
            charger.connect();
            ScenarioRun run = ScenarioRun.of(charger, s, anchor,
                    List.of("TX-" + IDS.incrementAndGet(), "TX-" + IDS.incrementAndGet()), 1);
            driver.runner(STATION).run(List.of(run));
            return new Played(run);
        }
    }

    protected Transaction tx(String id) {
        return tx(STATION, id);
    }

    protected Transaction tx(String station, String id) {
        Transaction t = transactions.find(station, id).orElse(null);
        assertThat(t).as("transaction %s/%s exists", station, id).isNotNull();
        return t;
    }

    /** Sends one TransactionEvent with the energy register value {@code wh} (null: no meter value). */
    protected static void send(SimulatedCharger charger, String id, TransactionEventType type, int seq, Instant at,
            Double wh) {
        List<MeterValue> meter = wh == null
                ? null
                : List.of(new MeterValue(at, List.of(new SampledValue(wh, TransactionEventRequest.ENERGY_MEASURAND,
                        new UnitOfMeasure("Wh")))));
        charger.call("TransactionEvent", new TransactionEventRequest(type, at, "MeterValuePeriodic", seq, null,
                new TransactionInfo(id, null, type == TransactionEventType.Ended ? "Local" : null),
                new Evse(1, 1), meter));
    }

    /** Waits until the backend has recorded the charger's answer to GetTransactionStatus for this transaction. */
    protected void awaitStatusAnswer(String id) {
        long deadline = System.currentTimeMillis() + 10_000;
        while (tx(id).reconciliation().answer() == null) {
            if (System.currentTimeMillis() > deadline) {
                throw new IllegalStateException("GetTransactionStatus was not answered for " + id);
            }
            try {
                Thread.sleep(5);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException(e);
            }
        }
    }

    /** Counter increase since the start of the current test. */
    protected double counter(String name, String... tags) {
        Counter c = meters.find(name).tags(tags).counter();
        return c == null ? 0 : c.count() - meterBaseline.getOrDefault(key(c.getId()), 0.0);
    }

    private static String key(Meter.Id id) {
        return id.getName() + id.getTags();
    }
}
