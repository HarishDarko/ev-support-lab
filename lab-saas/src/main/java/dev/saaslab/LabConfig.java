package dev.saaslab;

import java.net.http.HttpClient;
import java.time.Clock;
import java.time.Duration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class LabConfig {

    /** Tests and the experiment register a primary scripted Clock of their own; this one is the production default. */
    @Bean
    Clock systemClock() {
        return Clock.systemUTC();
    }

    /** One HTTP/1.1 client for token requests and deliveries. */
    @Bean
    HttpClient httpClient() {
        return HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(5))
                .build();
    }
}
