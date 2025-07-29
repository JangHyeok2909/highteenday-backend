package com.example.highteenday_backend.domain.schools;


import com.example.highteenday_backend.domain.users.User;
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
@Table(name= "users_timetable")
@Entity
public class UserTimetable {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "UTT_id")
    private Long id;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "USR_id", nullable = false)
    private User user;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "SBJ_id", nullable = false)
    private Subject subject;
    @Column(name = "UTT_day")
    private DayOfWeek day;
    @Column(name = "UTT_period")
    private String period;
}
