package com.example.highteenday_backend.enums;

public enum PostSortType {
    LIKE("likeCount"), VIEW("viewCount"), RECENT("createAt");

    private final String field;

    PostSortType(String field) {
        this.field = field;
    }
    public String getField() { return field; }
}
