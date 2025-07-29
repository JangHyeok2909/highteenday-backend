package com.example.highteenday_backend.domain.schools.subjects;

import com.example.highteenday_backend.domain.schools.UserTimetables.UserTimetable;
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
    @Column(name = "SBJ_id", nullable = false)
    private Long id;
    @Column(name = "SBJ_name", nullable = false)
    private String subjectName;
    @OneToOne(fetch = FetchType.LAZY, cascade = CascadeType.ALL)
    @JoinColumn(name="UTT_id", nullable = false)
    private UserTimetable userTimetable;

    public SubjectDto toDto(){
        return SubjectDto.builder()
                    .id(id)
                    .subjectName(subjectName)
                    .build();
    }
    public void updateName(String name){
        this.subjectName = name;
    }
}
