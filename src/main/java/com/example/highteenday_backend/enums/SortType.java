package com.example.highteenday_backend.enums;

public enum SortType {
    LIKE("likeCount"), VIEW("viewCount"), RECENT("created");

    private final String field;

    SortType(String field) {
        this.field = field;
    }
    public String getField() { return field; }
}
