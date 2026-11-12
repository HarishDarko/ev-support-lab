package dev.saaslab.experiment;

import dev.saaslab.LabApplication;
import dev.saaslab.clock.MutableClock;
import dev.saaslab.delivery.DeliveryStore;
import dev.saaslab.delivery.DeliveryTrace;
import dev.saaslab.delivery.DeliveryWorker;
import dev.saaslab.delivery.TokenCache;
import dev.saaslab.support.ReplayService;
import java.time.Clock;
import java.time.Instant;
import org.springframework.boot.Banner;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * The delivery service inside this JVM with a scripted clock, for the experiment and the demo. Uses the JDBC URL
 * given, or starts a throw-away PostgreSQL with Testcontainers (needs Docker).
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
     * @param fixDefault value of lab.fix.enabled for workspaces without an override
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
                .web(WebApplicationType.NONE)
                .bannerMode(Banner.Mode.OFF)
                .initializers(c -> ((GenericApplicationContext) c)
                        .registerBean("scriptedClock", Clock.class, () -> clock, bd -> bd.setPrimary(true)))
                .run(
                        "--spring.datasource.url=" + url,
                        "--spring.datasource.username=" + user,
                        "--spring.datasource.password=" + password,
                        "--lab.fix.enabled=" + fixDefault,
                        "--logging.level.root=WARN",
                        "--logging.level.dev.saaslab=WARN");
        return new LabHarness(pg, ctx, clock);
    }

    public MutableClock clock() {
        return clock;
    }

    public <T> T bean(Class<T> type) {
        return context.getBean(type);
    }

    public DeliveryStore store() {
        return bean(DeliveryStore.class);
    }

    public DeliveryWorker worker() {
        return bean(DeliveryWorker.class);
    }

    public ReplayService replay() {
        return bean(ReplayService.class);
    }

    public DeliveryTrace trace() {
        return bean(DeliveryTrace.class);
    }

    public JdbcClient jdbc() {
        return bean(JdbcClient.class);
    }

    /** Empties every table and the token cache, for a fresh run in the same database. */
    public void reset(Instant at) {
        jdbc().sql("truncate delivery_attempt, token_request, endpoint_pause, event, endpoint, workspace cascade")
                .update();
        bean(TokenCache.class).clear();
        clock.reset(at);
    }

    @Override
    public void close() {
        context.close();
        if (postgres != null) {
            postgres.stop();
        }
    }
}
