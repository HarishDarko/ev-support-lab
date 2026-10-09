package dev.evlab.ocpp;

/** A request that cannot be served; becomes a CALLERROR frame. */
public class OcppProtocolException extends RuntimeException {

    private final OcppErrorCode code;
    private final String uniqueId;

    public OcppProtocolException(OcppErrorCode code, String description) {
        this(code, description, "-1");
    }

    public OcppProtocolException(OcppErrorCode code, String description, String uniqueId) {
        super(description);
        this.code = code;
        this.uniqueId = uniqueId;
    }

    public OcppErrorCode code() {
        return code;
    }

    public String uniqueId() {
        return uniqueId;
    }
}
