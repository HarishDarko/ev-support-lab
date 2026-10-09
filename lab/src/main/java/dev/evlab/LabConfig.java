package dev.evlab;

import dev.evlab.reconciliation.ReconciliationPolicy;
import dev.evlab.transaction.Billing;
import dev.evlab.transaction.Tariff;
import java.time.Clock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class LabConfig {

    /** Tests and the experiment register a primary Clock of their own; this one is the production default. */
    @Bean
    Clock systemClock() {
        return Clock.systemUTC();
    }

    @Bean
    Billing billing(LabProperties properties) {
        return new Billing(Tariff.DEFAULT, properties.reconciliation().epsilonWh());
    }

    @Bean
    ReconciliationPolicy reconciliationPolicy(LabProperties properties) {
        LabProperties.Reconciliation r = properties.reconciliation();
        return new ReconciliationPolicy(
                new ReconciliationPolicy.Settings(r.grace(), r.maxQueueWait(), r.epsilonWh(), r.minSampleSpacing(),
                        r.maxMeterAge(), r.maxClockSkew()));
    }
}
