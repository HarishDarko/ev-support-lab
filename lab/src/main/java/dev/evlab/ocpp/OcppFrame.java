package dev.evlab.ocpp;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.JsonNodeFactory;

/**
 * OCPP-J message frames.
 *
 * <pre>
 * CALL       [2, uniqueId, action, payload]
 * CALLRESULT [3, uniqueId, payload]
 * CALLERROR  [4, uniqueId, errorCode, errorDescription, errorDetails]
 * </pre>
 */
public sealed interface OcppFrame {

    int CALL = 2;
    int CALL_RESULT = 3;
    int CALL_ERROR = 4;

    String uniqueId();

    record Call(String uniqueId, String action, JsonNode payload) implements OcppFrame {}

    record CallResult(String uniqueId, JsonNode payload) implements OcppFrame {}

    record CallError(String uniqueId, String errorCode, String errorDescription, JsonNode errorDetails)
            implements OcppFrame {}

    static OcppFrame parse(String text) {
        JsonNode root;
        try {
            root = OcppJson.MAPPER.readTree(text);
        } catch (RuntimeException e) {
            throw new OcppProtocolException(OcppErrorCode.RpcFrameworkError, "frame is not valid JSON");
        }
        if (!root.isArray() || root.size() < 3 || !root.get(0).isNumber() || !root.get(1).isString()) {
            throw new OcppProtocolException(OcppErrorCode.RpcFrameworkError, "frame is not an OCPP-J array");
        }
        String id = root.get(1).asString();
        return switch (root.get(0).asInt()) {
            case CALL -> {
                if (root.size() != 4 || !root.get(2).isString()) {
                    throw new OcppProtocolException(OcppErrorCode.RpcFrameworkError, "malformed CALL", id);
                }
                yield new Call(id, root.get(2).asString(), root.get(3));
            }
            case CALL_RESULT -> new CallResult(id, root.get(2));
            case CALL_ERROR -> new CallError(id, root.get(2).asString(),
                    root.size() > 3 ? root.get(3).asString() : "",
                    root.size() > 4 ? root.get(4) : JsonNodeFactory.instance.objectNode());
            default -> throw new OcppProtocolException(OcppErrorCode.MessageTypeNotSupported,
                    "unknown message type", id);
        };
    }

    default String toJson() {
        ArrayNode a = JsonNodeFactory.instance.arrayNode();
        switch (this) {
            case Call c -> a.add(CALL).add(c.uniqueId()).add(c.action()).add(c.payload());
            case CallResult r -> a.add(CALL_RESULT).add(r.uniqueId()).add(r.payload());
            case CallError e -> a.add(CALL_ERROR).add(e.uniqueId()).add(e.errorCode())
                    .add(e.errorDescription()).add(e.errorDetails());
        }
        return a.toString();
    }
}
