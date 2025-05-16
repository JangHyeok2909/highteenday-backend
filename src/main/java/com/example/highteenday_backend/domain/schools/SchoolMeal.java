package com.example.highteenday_backend.domain.schools;


import com.example.highteenday_backend.domain.base.BaseEntity;
import com.example.highteenday_backend.enums.SchoolMealCategory;
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
@Table(name= "schools_meals")
@Entity
public class SchoolMeal extends BaseEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "SCH_ML_id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "SCH_id", nullable = false)
    private School school;

    @Column(name = "SCH_ML_month", length = 2, nullable = false)
    private String month;

    @Column(name = "SCH_ML_week", length = 1, nullable = false)
    private String week;

    @Column(name = "SCH_ML_day", length = 2, nullable = false)
    private String day;

    @Enumerated(EnumType.STRING)
    @Column(name = "SCH_ML_CAT", nullable = false)
    private SchoolMealCategory category;

//   모든 급식 메뉴가 나오기 때문에 문자열 길이 TEXT로 변경
    @Column(name = "SCH_ML_dish_name", columnDefinition = "TEXT", nullable = false)
    private String dishName;

//    현재 날짜 기준으로 30일씩 데이터 받기 위해 date 설정
    @Column(nullable = false)
    private LocalDate date;

    @Column(name = "SCH_ML_calorie", nullable = false)
    private int calorie = 0;
}
