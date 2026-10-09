package dev.evlab.ocpp;

import com.fasterxml.jackson.annotation.JsonInclude;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** One mapper for both ends of the wire. OCPP-J has no nulls: absent optional fields are omitted. */
public final class OcppJson {

    public static final JsonMapper MAPPER = JsonMapper.builder()
            .changeDefaultPropertyInclusion(v -> v.withValueInclusion(JsonInclude.Include.NON_NULL))
            .build();

    private OcppJson() {}

    public static JsonNode toNode(Object payload) {
        return MAPPER.valueToTree(payload);
    }

    public static <T> T fromNode(JsonNode node, Class<T> type) {
        try {
            return MAPPER.treeToValue(node, type);
        } catch (RuntimeException e) {
            throw new OcppProtocolException(OcppErrorCode.FormationViolation,
                    "payload does not match " + type.getSimpleName());
        }
    }
}
