package com.example.highteenday_backend.enums;

public enum SchoolMealCategory {
    BREAKFAST, LUNCH, DINNER;

    public static SchoolMealCategory fromString(String value) {
        return switch (value) {
            case "조식" -> BREAKFAST;
            case "중식" -> LUNCH;
            case "석식" -> DINNER;
            default -> throw new IllegalArgumentException("Unknown meal type: " + value);
        };
    }
}
