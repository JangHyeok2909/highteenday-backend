package com.example.highteenday_backend.enums;

public enum MediaOwner {
    POST("post"),COMMENT("comment"),PROFILE("profile");

    private final String field;
    MediaOwner(String field) {
        this.field = field;
    }
    public String getField(){
        return field;
    }


}
