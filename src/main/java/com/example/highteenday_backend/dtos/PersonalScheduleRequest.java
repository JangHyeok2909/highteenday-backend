package com.example.highteenday_backend.dtos;

import lombok.Getter;
import java.time.LocalDate;

@Getter
public class PersonalScheduleRequest {
    private String content;
    private LocalDate date;
}