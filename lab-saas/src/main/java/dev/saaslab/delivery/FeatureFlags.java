package dev.saaslab.delivery;

import dev.saaslab.LabProperties;
import org.springframework.stereotype.Component;

/** The fix (ENG-5108) is on per workspace: the workspace override wins, else lab.fix.enabled. */
@Component
public class FeatureFlags {

    private final DeliveryStore store;
    private final LabProperties properties;

    public FeatureFlags(DeliveryStore store, LabProperties properties) {
        this.store = store;
        this.properties = properties;
    }

    public boolean sharedTokenRefresh(String workspaceId) {
        return store.fixOverride(workspaceId).orElse(properties.fix().enabled());
    }
}
