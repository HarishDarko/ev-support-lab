package dev.shoplab.payment;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import dev.shoplab.LabProperties;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.http.HttpClient;
import java.time.Duration;
import org.junit.jupiter.api.Test;

/**
 * A processor that accepts the connection and never answers fails the call after lab.http.request-timeout, the way
 * an unreachable one does, instead of hanging it. No Spring, no database.
 */
class ProcessorClientTimeoutTest {

    @Test
    void aProcessorThatNeverAnswersFailsTheCallInsteadOfHangingIt() throws Exception {
        LabProperties properties = new LabProperties(new LabProperties.Fix(true),
                new LabProperties.Checkout(Duration.ofSeconds(8)), new LabProperties.Orders(Duration.ofSeconds(30)),
                new LabProperties.Http(Duration.ofMillis(300)));
        // The operating system accepts the connection into the backlog; nothing ever reads or answers it.
        try (ServerSocket silent = new ServerSocket(0, 50, InetAddress.getLoopbackAddress())) {
            ProcessorClient client = new ProcessorClient(HttpClient.newHttpClient(), properties);
            String url = "http://127.0.0.1:" + silent.getLocalPort();

            assertThatThrownBy(() -> client.capture(url, "au_8F01"))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("did not answer");
        }
    }
}
