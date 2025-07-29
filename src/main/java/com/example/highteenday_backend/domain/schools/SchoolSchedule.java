package com.example.highteenday_backend.domain.schools;


import com.example.highteenday_backend.domain.base.BaseEntity;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;

@Builder
@Getter
@AllArgsConstructor
@NoArgsConstructor
@Table(name= "schools_schedule")
@Entity
public class SchoolSchedule  {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "SCH_SD_id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "SCH_id", nullable = false)
    private School school;

    @Column(name = "SCH_SD_grade")
    private Integer grade;

    @Column(name = "SCH_SD_major", length = 100)
    private String major;

    @Column(name = "SCH_SD_class")
    private Integer classNumber;

    @Column(name = "SCH_SD_subject", length = 100, nullable = false)
    private String subject;

    @Column(name = "SCH_SD_period", nullable = false)
    private Integer period;

    @Column(name = "SCH_SD_date", nullable = false)
    private LocalDate date;

    @Column(name = "SCH_SD_week", length = 1, nullable = false)
    private String week;

    @Column(name = "SCH_SD_day", length = 2, nullable = false)
    private String day;

}
