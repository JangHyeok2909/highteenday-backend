package com.example.highteenday_backend.enums;

public enum SchoolMealCategory {
    BREAKFAST, LUNCH, DINNER;

    public static SchoolMealCategory fromString(String name) {
        return switch (name.trim()) {
            case "조식" -> BREAKFAST;
            case "중식" -> LUNCH;
            case "석식" -> DINNER;
            default -> throw new IllegalArgumentException("Unknown meal type: " + name);
        };
    }
}
