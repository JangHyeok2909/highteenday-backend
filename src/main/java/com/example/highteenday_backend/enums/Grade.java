package com.example.highteenday_backend.enums;

public enum Grade {
    SOPHOMORE("1학년"),JUNIOR("2학년"),SENIOR("3학년");

    private final String field;
    Grade(String field) {
        this.field = field;
    }
    public String getField(){
        return field;
    }
}
