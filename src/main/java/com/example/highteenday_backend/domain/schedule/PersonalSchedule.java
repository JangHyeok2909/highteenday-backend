package com.example.highteenday_backend.domain.schedule;

import com.example.highteenday_backend.domain.base.BaseEntity;
import com.example.highteenday_backend.domain.users.User;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;

@Builder
@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
@Table(name= "personal_schedule")
@Entity
public class PersonalSchedule extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "PS_SD_id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "USR_id", nullable = false)
    private User user;

    @Column(name = "PS_SD_date", nullable = false)
    private LocalDate date;

    @Column(name = "PS_SD_content", columnDefinition = "TEXT", nullable = false)
    private String content;

    @Column(name = "PS_SD_is_finished", nullable = false)
    private Boolean isFinished = false;

    @Column(name = "PS_SD_month")
    private LocalDate month;

    @Column(name = "PS_SD_week")
    private LocalDate week;

    @Column(name = "PS_SD_day")
    private LocalDate day;
}
