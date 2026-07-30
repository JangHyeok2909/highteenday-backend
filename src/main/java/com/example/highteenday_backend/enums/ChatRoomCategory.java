package com.example.highteenday_backend.enums;

public enum ChatRoomCategory {
    PRIVATE, GROUP, SCHOOL, GRADE;

    public boolean isMultiParty() {
        return this != PRIVATE;
    }
}
