package dev.shoplab.shop;

import dev.shoplab.LabProperties;
import org.springframework.stereotype.Component;

/** The fix (ENG-5230) is on per store: the store override wins, else lab.fix.enabled. */
@Component
public class FeatureFlags {

    private final ShopStore store;
    private final LabProperties properties;

    public FeatureFlags(ShopStore store, LabProperties properties) {
        this.store = store;
        this.properties = properties;
    }

    public boolean idempotentCheckout(String storeId) {
        return store.fixOverride(storeId).orElse(properties.fix().enabled());
    }
}
