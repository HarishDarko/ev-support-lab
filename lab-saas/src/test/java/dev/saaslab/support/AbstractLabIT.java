package dev.saaslab.support;

import dev.saaslab.clock.MutableClock;
import dev.saaslab.delivery.DeliveryStore;
import dev.saaslab.delivery.DeliveryTrace;
import dev.saaslab.delivery.DeliveryWorker;
import dev.saaslab.delivery.TokenCache;
import dev.saaslab.simulator.ScenarioPlayer;
import dev.saaslab.simulator.ScenarioPlayer.Outcome;
import dev.saaslab.simulator.Scenarios;
import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * The real delivery service (Spring context), real PostgreSQL (Testcontainers), and real HTTP to the scripted
 * identity provider and endpoint. Time is scripted.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE,
        properties = {"logging.level.dev.saaslab=WARN"})
@Import(AbstractLabIT.TestClockConfig.class)
public abstract class AbstractLabIT {

    /** 01:00 ET on a weekday, so log times read like the story's. */
    protected static final Instant EPOCH = Instant.parse("2026-03-02T05:00:00Z");
    private static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine")
            .withCommand("postgres", "-c", "fsync=off", "-c", "synchronous_commit=off", "-c", "full_page_writes=off");

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

    @Autowired
    protected MutableClock clock;
    @Autowired
    protected JdbcClient jdbc;
    @Autowired
    protected DeliveryStore store;
    @Autowired
    protected DeliveryWorker worker;
    @Autowired
    protected DeliveryTrace trace;
    @Autowired
    protected TokenCache tokens;

    @BeforeEach
    void resetDatabaseAndClock() {
        jdbc.sql("truncate delivery_attempt, token_request, endpoint_pause, event, endpoint, workspace cascade")
                .update();
        tokens.clear();
        clock.reset(EPOCH);
    }

    /**
     * Plays a scenario.
     *
     * @param fixOverride the workspace's flag, or null to follow lab.fix.enabled
     */
    protected Outcome play(String scenario, Boolean fixOverride) {
        return new ScenarioPlayer(store, worker, trace, jdbc, clock).play(Scenarios.named(scenario), fixOverride);
    }
}
