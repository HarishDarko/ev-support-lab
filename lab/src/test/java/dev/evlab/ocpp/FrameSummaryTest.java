package dev.evlab.ocpp;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

/** The gateway writes a frame's trace line before it checks the frame, so a malformed one must still summarise. */
class FrameSummaryTest {

    private static JsonNode payload(String json) {
        return OcppJson.MAPPER.readTree(json);
    }

    @Test
    void a_well_formed_StatusNotification_is_summarised() {
        assertThat(FrameSummary.of("StatusNotification",
                payload("{\"evseId\":1,\"connectorStatus\":\"Available\",\"connectorId\":1}")))
                .isEqualTo("evseId=1  connectorStatus=Available");
    }

    @Test
    void a_StatusNotification_with_missing_or_wrong_fields_never_throws() {
        String[] payloads = {"{}", "{\"evseId\":1.5,\"connectorStatus\":3}", "{\"evseId\":\"x\"}", "[]"};
        for (String json : payloads) {
            assertThatCode(() -> FrameSummary.of("StatusNotification", payload(json))).as(json)
                    .doesNotThrowAnyException();
        }
    }

    @Test
    void a_TransactionEvent_without_transactionInfo_is_unreadable_not_an_exception() {
        assertThat(FrameSummary.of("TransactionEvent", payload("{\"eventType\":\"Started\"}")))
                .isEqualTo("(unreadable payload)");
    }

    @Test
    void a_null_payload_is_unreadable_not_an_exception() {
        assertThat(FrameSummary.of("StatusNotification", null)).isEqualTo("(unreadable payload)");
    }
}
