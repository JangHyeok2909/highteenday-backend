package com.example.highteenday_backend.dtos;

import lombok.Builder;
import lombok.Getter;

import java.time.LocalDate;

@Getter
@Builder
public class SchoolScheduleResponseDto {
    private String subject;
    private Integer period;
    private LocalDate date;
    private String week;
    private String day;
}
