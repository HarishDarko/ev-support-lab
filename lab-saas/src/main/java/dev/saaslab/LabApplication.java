package dev.saaslab;

import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

/** The SaaS lab: a webhook delivery service whose customer endpoints want an OAuth token. Synthetic. */
@SpringBootApplication
@ConfigurationPropertiesScan
public class LabApplication {}
