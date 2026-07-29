package com.example.highteenday_backend.dtos;

import com.example.highteenday_backend.domain.schools.timetableTamplates.TimetableTemplate;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.enums.Grade;
import com.example.highteenday_backend.enums.Semester;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@NoArgsConstructor
@AllArgsConstructor
@Builder
@Data
public class TimetableTemplateDetailDto {
    private Long id;
    private String templateName;
    private Grade grade;
    private Semester semester;
    @Builder.Default
    private boolean isDefault = false;
    private Long ownerId;
    private String ownerNickname;
    private String ownerProfileUrl;
    private List<SubjectDto> subjects;
    private List<UserTimetableDto> timetables;

    public static TimetableTemplateDetailDto fromEntity(TimetableTemplate template) {
        User owner = template.getUser();
        return TimetableTemplateDetailDto.builder()
                .id(template.getId())
                .templateName(template.getTemplateName())
                .grade(template.getGrade())
                .semester(template.getSemester())
                .isDefault(template.isDefault())
                .ownerId(owner.getId())
                .ownerNickname(owner.getNicknameValue())
                .ownerProfileUrl(owner.getProfileUrl())
                .subjects(template.getSubjects().stream().map(SubjectDto::fromEntity).toList())
                .timetables(template.getTimetables().stream().map(UserTimetableDto::fromEntity).toList())
                .build();
    }
}
