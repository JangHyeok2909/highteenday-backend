package com.example.highteenday_backend.enums;

public enum SchoolCategory {
    ELEMENTARY,
    MIDDLE,
    HIGH;

    public static SchoolCategory fromString(String value) {
        return switch (value) {
            case "초등학교" -> ELEMENTARY;
            case "중학교" -> MIDDLE;
            case "고등학교" -> HIGH;
            default -> throw new IllegalArgumentException("Unknown school category: " + value);
        };
    }
}