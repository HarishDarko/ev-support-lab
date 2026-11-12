package dev.shoplab.support;

import dev.shoplab.LabProperties;
import dev.shoplab.checkout.CheckoutService;
import dev.shoplab.clock.MutableClock;
import dev.shoplab.orders.CaptureGate;
import dev.shoplab.orders.OrderService;
import dev.shoplab.shop.OrderTrace;
import dev.shoplab.shop.ShopStore;
import dev.shoplab.simulator.ScenarioPlayer;
import dev.shoplab.simulator.ScenarioPlayer.Outcome;
import dev.shoplab.simulator.Scenarios;
import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
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
 * The real checkout and order service (Spring context, listening on a free port for webhooks), real PostgreSQL
 * (Testcontainers), and real HTTP to and from the scripted processor. Time is scripted.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"logging.level.dev.shoplab=WARN", "server.address=127.0.0.1"})
@Import(AbstractLabIT.TestClockConfig.class)
public abstract class AbstractLabIT {

    /** 14:02:11.200 ET on a weekday in January, so log times read like the story's. */
    protected static final Instant EPOCH = Instant.parse("2026-01-08T19:02:11.200Z");
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

    @Value("${local.server.port}")
    protected int port;
    @Autowired
    protected MutableClock clock;
    @Autowired
    protected JdbcClient jdbc;
    @Autowired
    protected ShopStore store;
    @Autowired
    protected CheckoutService checkout;
    @Autowired
    protected OrderService orders;
    @Autowired
    protected CaptureGate gate;
    @Autowired
    protected OrderTrace trace;
    @Autowired
    protected LabProperties properties;

    @BeforeEach
    void resetDatabaseAndClock() {
        jdbc.sql("truncate capture, payment_authorization, payment_lookup, payment_attempt, orders, checkout, store "
                + "cascade").update();
        clock.reset(EPOCH);
    }

    protected String webhookUrl() {
        return "http://127.0.0.1:" + port + "/webhooks/processor";
    }

    /**
     * Plays a scenario.
     *
     * @param fixOverride the store's flag, or null to follow lab.fix.enabled
     */
    protected Outcome play(String scenario, Boolean fixOverride) {
        return play(scenario, fixOverride, () -> {});
    }

    /** Plays a scenario, then runs {@code whileProcessorRuns} before the scripted processor stops. */
    protected Outcome play(String scenario, Boolean fixOverride, Runnable whileProcessorRuns) {
        return new ScenarioPlayer(checkout, orders, store, gate, jdbc, trace, clock, webhookUrl(),
                properties.orders().webhookWait()).play(Scenarios.named(scenario), fixOverride, whileProcessorRuns);
    }
}
