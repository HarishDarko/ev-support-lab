package dev.shoplab.experiment;

import dev.shoplab.LabApplication;
import dev.shoplab.LabProperties;
import dev.shoplab.checkout.CheckoutService;
import dev.shoplab.clock.MutableClock;
import dev.shoplab.orders.CaptureGate;
import dev.shoplab.orders.OrderService;
import dev.shoplab.shop.OrderTrace;
import dev.shoplab.shop.ShopStore;
import dev.shoplab.simulator.FakeProcessor;
import dev.shoplab.simulator.ScriptedWorld;
import java.time.Clock;
import java.time.Instant;
import org.springframework.boot.Banner;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * The checkout and order service inside this JVM, listening on a free local port for the processor's webhooks, with
 * a scripted clock, for the experiment and the demo. Uses the JDBC URL given, or starts a throw-away PostgreSQL with
 * Testcontainers (needs Docker).
 */
public final class LabHarness implements AutoCloseable {

    private static final String POSTGRES_IMAGE = "postgres:17-alpine";

    private final PostgreSQLContainer postgres;
    private final ConfigurableApplicationContext context;
    private final MutableClock clock;

    private LabHarness(PostgreSQLContainer postgres, ConfigurableApplicationContext context, MutableClock clock) {
        this.postgres = postgres;
        this.context = context;
        this.clock = clock;
    }

    /**
     * @param jdbcUrl database to use, or null to start PostgreSQL in Docker
     * @param fixDefault value of lab.fix.enabled for stores without an override
     */
    public static LabHarness start(String jdbcUrl, boolean fixDefault, Instant startAt) {
        PostgreSQLContainer pg = null;
        String url = jdbcUrl;
        String user = System.getenv().getOrDefault("LAB_DB_USER", "lab");
        String password = System.getenv().getOrDefault("LAB_DB_PASSWORD", "lab");
        if (url == null) {
            pg = new PostgreSQLContainer(POSTGRES_IMAGE).withCommand("postgres", "-c", "fsync=off",
                    "-c", "synchronous_commit=off", "-c", "full_page_writes=off");
            pg.start();
            url = pg.getJdbcUrl();
            user = pg.getUsername();
            password = pg.getPassword();
        }
        MutableClock clock = new MutableClock(startAt);
        ConfigurableApplicationContext ctx = new SpringApplicationBuilder(LabApplication.class)
                .bannerMode(Banner.Mode.OFF)
                .initializers(c -> ((GenericApplicationContext) c)
                        .registerBean("scriptedClock", Clock.class, () -> clock, bd -> bd.setPrimary(true)))
                .run(
                        "--spring.datasource.url=" + url,
                        "--spring.datasource.username=" + user,
                        "--spring.datasource.password=" + password,
                        "--lab.fix.enabled=" + fixDefault,
                        "--server.address=127.0.0.1",
                        "--server.port=0",
                        "--logging.level.root=WARN",
                        "--logging.level.dev.shoplab=WARN");
        return new LabHarness(pg, ctx, clock);
    }

    public MutableClock clock() {
        return clock;
    }

    public <T> T bean(Class<T> type) {
        return context.getBean(type);
    }

    public ShopStore store() {
        return bean(ShopStore.class);
    }

    public JdbcClient jdbc() {
        return bean(JdbcClient.class);
    }

    public OrderTrace trace() {
        return bean(OrderTrace.class);
    }

    /** Where the processor sends its webhooks. */
    public String webhookUrl() {
        return "http://127.0.0.1:" + context.getEnvironment().getProperty("local.server.port")
                + "/webhooks/processor";
    }

    public ScriptedWorld world(FakeProcessor processor) {
        return new ScriptedWorld(bean(CheckoutService.class), bean(OrderService.class), processor,
                bean(CaptureGate.class), jdbc(), trace(), clock, bean(LabProperties.class).orders().webhookWait());
    }

    @Override
    public void close() {
        context.close();
        if (postgres != null) {
            postgres.stop();
        }
    }
}
