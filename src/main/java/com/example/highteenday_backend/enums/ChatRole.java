package com.example.highteenday_backend.enums;

public enum ChatRole {
    OWNER, ADMIN, MEMBER;

    public boolean canManageRoom() {
        return this == OWNER || this == ADMIN;
    }
}
