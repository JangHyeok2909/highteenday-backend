package com.example.highteenday_backend.enums;

public enum Semester {
    FIRST("1학기"),SECOND("2학기");

    private final String field;
    Semester(String field) {
        this.field = field;
    }
    public String getField(){
        return field;
    }
}
