package com.example.highteenday_backend.dtos;

import com.example.highteenday_backend.enums.Grade;

public record SchoolIdDto(String schoolId, Grade grade, Integer userClass) {
}
