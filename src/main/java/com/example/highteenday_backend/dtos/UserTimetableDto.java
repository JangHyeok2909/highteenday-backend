package com.example.highteenday_backend.dtos;


import com.example.highteenday_backend.domain.schools.subjects.Subject;
import com.example.highteenday_backend.domain.schools.timetableTamplates.TimetableTemplate;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.time.DayOfWeek;

@Builder
@Data
@AllArgsConstructor
public class UserTimetableDto {
    private Long id;
    private SubjectDto subjectDto;
    private DayOfWeek day;
    private String period;
}
