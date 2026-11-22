package dev.saaslab.delivery;

import static org.assertj.core.api.Assertions.assertThat;

import dev.saaslab.LabProperties;
import dev.saaslab.delivery.DeliveryStore.Endpoint;
import dev.saaslab.delivery.TokenClient.Answer;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.http.HttpClient;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * A party that accepts the connection and never answers fails the request after lab.http.request-timeout instead
 * of hanging the worker. No database: the token request is recorded in a list.
 */
class RequestTimeoutTest {

    @Test
    void aTokenRequestToAnIdentityProviderThatNeverAnswersTimesOut() throws Exception {
        List<Integer> recorded = new ArrayList<>();
        DeliveryStore store = new DeliveryStore(null) {
            @Override
            public void tokenRequest(String endpointId, Instant at, int status) {
                recorded.add(status);
            }
        };
        LabProperties properties = new LabProperties(new LabProperties.Fix(true),
                new LabProperties.Delivery(5, Duration.ofMinutes(5)), new LabProperties.Pause(15, Duration.ofMinutes(60)),
                new LabProperties.Http(Duration.ofMillis(300)));
        // The operating system accepts the connection into the backlog; nothing ever reads or answers it.
        try (ServerSocket silent = new ServerSocket(0, 50, InetAddress.getLoopbackAddress())) {
            String url = "http://127.0.0.1:" + silent.getLocalPort() + "/oauth/token";
            TokenClient client = new TokenClient(HttpClient.newHttpClient(), store, Clock.systemUTC(), properties);

            long started = System.nanoTime();
            Answer answer = client.request(new Endpoint("ep-silent", "ws-silent", url, "oauth", "client-silent", url));
            Duration took = Duration.ofNanos(System.nanoTime() - started);

            assertThat(answer.ok()).isFalse();
            assertThat(answer.status()).isZero();
            assertThat(answer.error()).isEqualTo("timed out");
            assertThat(recorded).containsExactly(0);
            assertThat(took).isLessThan(Duration.ofSeconds(5));
        }
    }
}
