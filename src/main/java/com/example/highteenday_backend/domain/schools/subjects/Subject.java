package com.example.highteenday_backend.domain.schools.subjects;

import com.example.highteenday_backend.domain.schools.UserTimetables.UserTimetable;
import com.example.highteenday_backend.domain.schools.timetableTamplates.TimetableTemplate;
import com.example.highteenday_backend.dtos.SubjectDto;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Builder
@Getter
@AllArgsConstructor
@NoArgsConstructor
@Table(name= "subjects")
@Entity
public class Subject {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "SBJ_id")
    private Long id;
    @Column(name = "SBJ_name", nullable = false)
    private String subjectName;
    @Builder.Default
    @Column(name="SBJ_hours_per_Week")
    private Integer hoursPerWeek=0;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "TTT_id", nullable = false)
    private TimetableTemplate timetableTemplate;
    @OneToMany(mappedBy = "subject", fetch = FetchType.LAZY,cascade = CascadeType.REMOVE)
    private java.util.List<UserTimetable> userTimetables;



    public SubjectDto toDto(){
        return SubjectDto.builder()
                .id(id)
                .subjectName(subjectName)
                .HoursPerWeek(hoursPerWeek)
                .build();
    }
    public void updateName(String name){
        this.subjectName = name;
    }
    public void updateHoursPerWeek(Integer changeAmount){
        this.hoursPerWeek+=changeAmount;
    }

}
