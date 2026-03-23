package com.example.highteenday_backend.dtos;

import com.example.highteenday_backend.domain.schools.UserTimetables.UserTimetable;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.DayOfWeek;

@Builder
@NoArgsConstructor
@AllArgsConstructor
@Data
public class UserTimetableDto {
    private Long id;
    private SubjectDto subjectDto;
    private DayOfWeek day;
    private String period;

    public static UserTimetableDto fromEntity(UserTimetable timetable) {
        return UserTimetableDto.builder()
                .id(timetable.getId())
                .subjectDto(SubjectDto.fromEntity(timetable.getSubject()))
                .day(timetable.getDay())
                .period(timetable.getPeriod())
                .build();
    }
}
