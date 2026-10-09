package dev.evlab.station;

import static dev.evlab.persistence.Sql.ts;

import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class StationRepository {

    /** Overrides are read on every event, so they are cached briefly; changes made here invalidate at once. */
    private static final long CACHE_TTL_NANOS = TimeUnit.SECONDS.toNanos(5);

    private record Cached(Optional<Boolean> value, long loadedAtNanos) {}

    private final Map<String, Cached> overrides = new ConcurrentHashMap<>();
    private final JdbcClient jdbc;

    public StationRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Stations register themselves on first connect; the per-station flag is left untouched. */
    public void markConnected(String stationId, Instant now) {
        jdbc.sql("""
                insert into station (station_id, connected, first_seen_at, last_seen_at)
                values (:id, true, :now, :now)
                on conflict (station_id) do update set connected = true, last_seen_at = :now
                """).param("id", stationId).param("now", ts(now)).update();
    }

    public void markDisconnected(String stationId, Instant now) {
        jdbc.sql("update station set connected = false, last_seen_at = :now where station_id = :id")
                .param("id", stationId).param("now", ts(now)).update();
    }

    public void setFirmware(String stationId, String firmware) {
        jdbc.sql("update station set firmware = :fw where station_id = :id")
                .param("fw", firmware).param("id", stationId).update();
    }

    /** Turns the fix on or off for one station. Null removes the override. */
    public void setFixEnabled(String stationId, Boolean enabled, Instant now) {
        overrides.remove(stationId);
        jdbc.sql("""
                insert into station (station_id, fix_enabled, first_seen_at, last_seen_at)
                values (:id, :enabled, :now, :now)
                on conflict (station_id) do update set fix_enabled = :enabled
                """).param("id", stationId).param("enabled", enabled).param("now", ts(now)).update();
    }

    public Optional<Boolean> fixOverride(String stationId) {
        Cached cached = overrides.get(stationId);
        if (cached != null && System.nanoTime() - cached.loadedAtNanos() < CACHE_TTL_NANOS) {
            return cached.value();
        }
        Optional<Boolean> loaded = loadFixOverride(stationId);
        overrides.put(stationId, new Cached(loaded, System.nanoTime()));
        return loaded;
    }

    private Optional<Boolean> loadFixOverride(String stationId) {
        String value = jdbc.sql("""
                select case when fix_enabled is null then 'default' when fix_enabled then 'on' else 'off' end
                  from station where station_id = :id
                """).param("id", stationId).query(String.class).optional().orElse("default");
        return switch (value) {
            case "on" -> Optional.of(true);
            case "off" -> Optional.of(false);
            default -> Optional.empty();
        };
    }
}
