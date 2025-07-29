package com.example.highteenday_backend.dtos;


import com.example.highteenday_backend.enums.Grade;
import com.example.highteenday_backend.enums.Semester;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

@AllArgsConstructor
@Builder
@Data
public class TimetableTemplateDto {
    private Long id;
    private String templateName;
    private Grade grade;
    private Semester semester;
}
