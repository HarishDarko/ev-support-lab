package dev.evlab.ocpp;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class OcppFrameTest {

    @Test
    void a_CALL_round_trips() {
        String json = "[2,\"19223201\",\"Heartbeat\",{}]";

        OcppFrame frame = OcppFrame.parse(json);

        assertThat(frame).isInstanceOfSatisfying(OcppFrame.Call.class, c -> {
            assertThat(c.uniqueId()).isEqualTo("19223201");
            assertThat(c.action()).isEqualTo("Heartbeat");
        });
        assertThat(frame.toJson()).isEqualTo(json);
    }

    @Test
    void a_CALLRESULT_round_trips() {
        String json = "[3,\"19223201\",{\"messagesInQueue\":false}]";

        assertThat(OcppFrame.parse(json)).isInstanceOf(OcppFrame.CallResult.class);
        assertThat(OcppFrame.parse(json).toJson()).isEqualTo(json);
    }

    @Test
    void a_CALLERROR_carries_code_description_and_details() {
        OcppFrame frame = OcppFrame.parse("[4,\"x1\",\"NotImplemented\",\"no such action\",{}]");

        assertThat(frame).isInstanceOfSatisfying(OcppFrame.CallError.class, e -> {
            assertThat(e.errorCode()).isEqualTo("NotImplemented");
            assertThat(e.errorDescription()).isEqualTo("no such action");
        });
    }

    @Test
    void frames_that_are_not_OCPP_J_are_rejected() {
        assertThatThrownBy(() -> OcppFrame.parse("not json")).isInstanceOf(OcppProtocolException.class);
        assertThatThrownBy(() -> OcppFrame.parse("{\"a\":1}")).isInstanceOf(OcppProtocolException.class);
        assertThatThrownBy(() -> OcppFrame.parse("[2,\"id\",\"Heartbeat\"]")).isInstanceOf(OcppProtocolException.class);
        assertThatThrownBy(() -> OcppFrame.parse("[9,\"id\",{}]"))
                .isInstanceOfSatisfying(OcppProtocolException.class,
                        e -> assertThat(e.code()).isEqualTo(OcppErrorCode.MessageTypeNotSupported));
    }
}
