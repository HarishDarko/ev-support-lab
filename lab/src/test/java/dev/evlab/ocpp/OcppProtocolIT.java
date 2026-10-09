package dev.evlab.ocpp;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import dev.evlab.ocpp.messages.BootNotificationRequest;
import dev.evlab.ocpp.messages.BootNotificationResponse;
import dev.evlab.simulator.SimulatedCharger;
import dev.evlab.support.AbstractLabIT;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

/** The OCPP-J endpoint over a real websocket. */
class OcppProtocolIT extends AbstractLabIT {

    @Test
    void negotiates_the_ocpp_2_0_1_subprotocol_and_answers_BootNotification_and_Heartbeat() throws Exception {
        CompletableFuture<String> subprotocol = new CompletableFuture<>();
        WebSocket ws = HttpClient.newHttpClient().newWebSocketBuilder().subprotocols("ocpp2.0.1")
                .buildAsync(URI.create("ws://localhost:" + port + "/ocpp/" + STATION), new WebSocket.Listener() {
                    @Override
                    public void onOpen(WebSocket webSocket) {
                        subprotocol.complete(webSocket.getSubprotocol());
                    }
                }).get(10, TimeUnit.SECONDS);
        assertThat(subprotocol.get(5, TimeUnit.SECONDS)).isEqualTo("ocpp2.0.1");
        ws.abort();

        try (SimulatedCharger charger = driver.newCharger("CP-TEST-02")) {
            charger.connect();
            JsonNode boot = charger.call("BootNotification", new BootNotificationRequest("PowerUp",
                    new BootNotificationRequest.ChargingStation("SIM-1", "Synthetic", "FW-B 4.2.1")));
            assertThat(OcppJson.fromNode(boot, BootNotificationResponse.class).status()).isEqualTo("Accepted");
            assertThat(charger.call("Heartbeat", Map.of()).has("currentTime")).isTrue();
        }
    }

    @Test
    void an_unknown_action_gets_a_NotImplemented_CALLERROR() {
        try (SimulatedCharger charger = driver.newCharger(STATION)) {
            charger.connect();
            assertThatThrownBy(() -> charger.call("DataTransfer", Map.of()))
                    .hasMessageContaining("NotImplemented");
        }
    }

    @Test
    void a_TransactionEvent_missing_required_fields_gets_a_FormationViolation() {
        try (SimulatedCharger charger = driver.newCharger(STATION)) {
            charger.connect();
            assertThatThrownBy(() -> charger.call("TransactionEvent", Map.of("eventType", "Started")))
                    .hasMessageContaining("FormationViolation");
        }
    }

    @Test
    void an_abnormal_close_is_recorded_as_1006() {
        try (SimulatedCharger charger = driver.newCharger(STATION)) {
            charger.connect();
            charger.drop();
            org.awaitility.Awaitility.await().atMost(5, TimeUnit.SECONDS).untilAsserted(() ->
                    assertThat(jdbc.sql("select close_code from connection_log where station_id = :s and kind = 'CLOSED'")
                            .param("s", STATION).query(Integer.class).list()).containsExactly(1006));
        }
    }
}
