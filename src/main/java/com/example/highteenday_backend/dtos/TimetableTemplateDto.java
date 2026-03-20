package com.example.highteenday_backend.dtos;

import com.example.highteenday_backend.domain.schools.timetableTamplates.TimetableTemplate;
import com.example.highteenday_backend.enums.Grade;
import com.example.highteenday_backend.enums.Semester;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@NoArgsConstructor
@AllArgsConstructor
@Builder
@Data
public class TimetableTemplateDto {
    private Long id;
    private String templateName;
    private Grade grade;
    private Semester semester;
    @Builder.Default
    private boolean isDefault = false;

    public static TimetableTemplateDto fromEntity(TimetableTemplate template) {
        return TimetableTemplateDto.builder()
                .id(template.getId())
                .templateName(template.getTemplateName())
                .grade(template.getGrade())
                .semester(template.getSemester())
                .isDefault(template.isDefault())
                .build();
    }
}
