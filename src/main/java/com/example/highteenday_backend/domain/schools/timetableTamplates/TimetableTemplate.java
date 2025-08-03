package com.example.highteenday_backend.domain.schools.timetableTamplates;

import com.example.highteenday_backend.domain.schools.UserTimetables.UserTimetable;
import com.example.highteenday_backend.domain.schools.subjects.Subject;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.TimetableTemplateDto;
import com.example.highteenday_backend.enums.Grade;
import com.example.highteenday_backend.enums.Semester;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.List;

@Builder
@Getter
@AllArgsConstructor
@NoArgsConstructor
@Table(name= "timetables_templates")
@Entity
public class TimetableTemplate {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "TTT_id")
    private Long id;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "USR_id", nullable = false)
    private User user;
    @Column(name = "TTT_template_name")
    private String templateName;
    @Column(name = "TTT_grade", nullable = false)
    private Grade grade;
    @Column(name = "TTT_semester", nullable = false)
    private Semester semester;
    @OneToMany(mappedBy = "timetableTemplate", fetch = FetchType.LAZY, cascade = CascadeType.REMOVE)
    private List<UserTimetable> timetables;
    @OneToMany(mappedBy = "timetableTemplate", fetch = FetchType.LAZY, cascade = CascadeType.REMOVE)
    private List<Subject> subjects;
    @Builder.Default
    @Column(name = "TTT_is_default", nullable = false)
    private boolean isDefault = false;

    public TimetableTemplateDto toDto(){
        return TimetableTemplateDto.builder()
                .id(id)
                .templateName(templateName)
                .grade(grade)
                .semester(semester)
                .isDefault(isDefault)
                .build();
    }

    public void updateTemplateName(String templateName){
        this.templateName = templateName;
    }

    public void updateGrade(Grade grade){
        this.grade = grade;
    }
    public void updateSemester(Semester semester){
        this.semester = semester;
    }
    public void updateDefault(boolean isDefault){
        this.isDefault = isDefault;
    }
}
