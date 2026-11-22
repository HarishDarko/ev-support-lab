package dev.evlab.ocpp;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
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
    void a_CALLERROR_whose_code_or_description_is_not_text_is_rejected_as_malformed() {
        for (String frame : List.of("[4,\"id\",{},\"x\"]", "[4,\"id\",\"E\",{}]", "[4,\"id\",500,\"x\"]",
                "[4,\"id\",\"E\",[1]]", "[4,\"id\",null]")) {
            assertThatThrownBy(() -> OcppFrame.parse(frame)).as(frame)
                    .isInstanceOfSatisfying(OcppProtocolException.class, e -> {
                        assertThat(e.code()).isEqualTo(OcppErrorCode.RpcFrameworkError);
                        assertThat(e.uniqueId()).isEqualTo("id");
                    });
        }
    }

    @Test
    void a_message_type_that_is_not_a_whole_number_is_rejected() {
        for (String frame : List.of("[2.5,\"id\",\"Heartbeat\",{}]", "[2.0,\"id\",\"Heartbeat\",{}]",
                "[\"2\",\"id\",\"Heartbeat\",{}]", "[4294967298,\"id\",\"Heartbeat\",{}]")) {
            assertThatThrownBy(() -> OcppFrame.parse(frame)).as(frame)
                    .isInstanceOfSatisfying(OcppProtocolException.class,
                            e -> assertThat(e.code()).isEqualTo(OcppErrorCode.RpcFrameworkError));
        }
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
