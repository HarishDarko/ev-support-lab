package dev.evlab.experiment;

import dev.evlab.LabApplication;
import dev.evlab.observability.GatewayTrace;
import dev.evlab.reconciliation.ReconciliationService;
import dev.evlab.station.StationTime;
import dev.evlab.station.StationRepository;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Instant;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.web.server.context.WebServerApplicationContext;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * The backend running inside this JVM with a scripted clock, for the experiment and the demo. Uses the JDBC URL
 * given, or starts a throw-away PostgreSQL with Testcontainers (needs Docker).
 */
public final class LabHarness implements AutoCloseable {

    private static final String POSTGRES_IMAGE = "postgres:17-alpine";

    private final PostgreSQLContainer postgres;
    private final ConfigurableApplicationContext context;
    private final PerStationTime time;
    private final InProcessDriver driver;

    private LabHarness(PostgreSQLContainer postgres, ConfigurableApplicationContext context, PerStationTime time) {
        this.postgres = postgres;
        this.context = context;
        this.time = time;
        int port = ((WebServerApplicationContext) context).getWebServer().getPort();
        this.driver = new InProcessDriver("ws://localhost:" + port + "/ocpp", time::clockFor,
                context.getBean(JdbcClient.class), context.getBean(ReconciliationService.class));
    }

    /**
     * @param jdbcUrl database to use, or null to start PostgreSQL in Docker
     * @param fixDefault value of lab.fix.enabled for stations without an override
     * @param startAt first instant of every station clock
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
        PerStationTime time = new PerStationTime(startAt);
        ConfigurableApplicationContext ctx = new SpringApplicationBuilder(LabApplication.class)
                .web(WebApplicationType.SERVLET)
                .bannerMode(org.springframework.boot.Banner.Mode.OFF)
                .initializers(c -> ((org.springframework.context.support.GenericApplicationContext) c)
                        .registerBean("perStationTime", StationTime.class, () -> time, bd -> bd.setPrimary(true)))
                .run(
                        "--server.port=0",
                        "--spring.datasource.url=" + url,
                        "--spring.datasource.username=" + user,
                        "--spring.datasource.password=" + password,
                        "--lab.fix.enabled=" + fixDefault,
                        "--lab.reconciliation.scheduler-enabled=false",
                        "--spring.datasource.hikari.maximum-pool-size=32",
                        "--logging.level.root=WARN",
                        "--logging.level.dev.evlab=WARN");
        return new LabHarness(pg, ctx, time);
    }

    public InProcessDriver driver() {
        return driver;
    }

    public PerStationTime time() {
        return time;
    }

    public <T> T bean(Class<T> type) {
        return context.getBean(type);
    }

    public JdbcClient jdbc() {
        return context.getBean(JdbcClient.class);
    }

    public StationRepository stations() {
        return context.getBean(StationRepository.class);
    }

    public GatewayTrace trace() {
        return context.getBean(GatewayTrace.class);
    }

    public MeterRegistry meters() {
        return context.getBean(MeterRegistry.class);
    }

    @Override
    public void close() {
        context.close();
        if (postgres != null) {
            postgres.stop();
        }
    }
}
