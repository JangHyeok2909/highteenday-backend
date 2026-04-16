package com.example.highteenday_backend.dtos;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.DayOfWeek;

@Builder
@Data
@AllArgsConstructor
@NoArgsConstructor
public class RequestTimetableDto {
    private Long subjectId;
    private String period;
    private DayOfWeek day;
}
