package com.example.highteenday_backend.enums;

public enum SchoolCategory {
    HIGH;

    public static SchoolCategory fromString(String value) {
        return switch (value) {
            case "고등학교" -> HIGH;
            default -> throw new IllegalArgumentException("Unknown school category: " + value);
        };
    }
}