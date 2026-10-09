package dev.evlab.station;

import dev.evlab.LabProperties;
import org.springframework.stereotype.Component;

/** Transaction-aware reconciliation is on per station: the station override wins, else lab.fix.enabled. */
@Component
public class FeatureFlags {

    private final StationRepository stations;
    private final LabProperties properties;

    public FeatureFlags(StationRepository stations, LabProperties properties) {
        this.stations = stations;
        this.properties = properties;
    }

    public boolean transactionAwareReconciliation(String stationId) {
        return stations.fixOverride(stationId).orElse(properties.fix().enabled());
    }
}
