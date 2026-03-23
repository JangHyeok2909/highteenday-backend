package com.example.highteenday_backend.dtos;

import com.example.highteenday_backend.domain.schools.subjects.Subject;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Builder
@NoArgsConstructor
@AllArgsConstructor
@Data
public class SubjectDto {
    private Long id;
    private String subjectName;
    private Integer HoursPerWeek;

    public static SubjectDto fromEntity(Subject subject) {
        return SubjectDto.builder()
                .id(subject.getId())
                .subjectName(subject.getSubjectName())
                .HoursPerWeek(subject.getHoursPerWeek())
                .build();
    }
}
