package com.example.highteenday_backend.domain.schools;


import com.example.highteenday_backend.domain.base.BaseEntity;
import com.example.highteenday_backend.enums.SchoolMealCategory;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

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

//   스케쥴링 하기전이라 문자열 길이 TEXT로 일시적 변경
    @Column(name = "SCH_ML_dish_name", columnDefinition = "TEXT", nullable = false)
    private String dishName;

    @Column(name = "SCH_ML_calorie", nullable = false)
    private int calorie = 0;
}
