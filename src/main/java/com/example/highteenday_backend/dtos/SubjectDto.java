package com.example.highteenday_backend.dtos;


import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

@Builder
@AllArgsConstructor
@Data
public class SubjectDto {
    private Long id;
    private String subjectName;
    private Integer HoursPerWeek;
}
