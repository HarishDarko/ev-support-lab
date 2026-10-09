package dev.evlab.ocpp.messages;

public record BootNotificationRequest(String reason, ChargingStation chargingStation) {

    public record ChargingStation(String model, String vendorName, String firmwareVersion) {}
}
