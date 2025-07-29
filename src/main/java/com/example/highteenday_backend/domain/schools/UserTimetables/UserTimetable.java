package com.example.highteenday_backend.domain.schools.UserTimetables;


import com.example.highteenday_backend.domain.schools.subjects.Subject;
import com.example.highteenday_backend.domain.schools.timetableTamplates.TimetableTemplate;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.UserTimetableDto;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.DayOfWeek;

@Builder
@Getter
@AllArgsConstructor
@NoArgsConstructor
@Table(name= "users_timetables")
@Entity
public class UserTimetable {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "UTT_id")
    private Long id;
    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "SBJ_id")
    private Subject subject;

    @ManyToOne(fetch = FetchType.LAZY,cascade = CascadeType.ALL)
    @JoinColumn(name = "TTT_id", nullable = false)
    private TimetableTemplate timetableTemplate;

    @Column(name = "UTT_day")
    private DayOfWeek day;
    @Column(name = "UTT_period")
    private String period;

    public UserTimetableDto toDto(){
        return UserTimetableDto.builder()
                    .id(this.id)
                    .subjectDto(this.subject.toDto())
                    .day(this.day)
                    .period(this.period)
                    .build();
    }
}
