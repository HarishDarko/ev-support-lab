package dev.evlab.ocpp;

/** The subset of OCPP-J RPC error codes this lab can produce. */
public enum OcppErrorCode {
    FormationViolation,
    MessageTypeNotSupported,
    NotImplemented,
    InternalError,
    ProtocolError,
    RpcFrameworkError
}
