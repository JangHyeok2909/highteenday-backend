package com.example.highteenday_backend.dtos;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.time.DayOfWeek;

@Builder
@Data
@AllArgsConstructor
public class RequestTimetableDto {
    private Long subjectId;
    private String period;
    private DayOfWeek day;
}
