package com.example.highteenday_backend.dtos;

import com.example.highteenday_backend.domain.schools.SchoolMeal;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.util.List;
import java.util.stream.Collectors;

@Getter
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class SchoolMealDto {
    private LocalDate date;
    private String dishName;
    private String category;
    private int calorie;

    public static SchoolMealDto fromEntity(SchoolMeal meal) {
        return SchoolMealDto.builder()
                .date(meal.getDate())
                .dishName(meal.getDishName())
                .category(meal.getCategory().name())
                .calorie(meal.getCalorie())
                .build();
    }

    public static List<SchoolMealDto> fromEntities(List<SchoolMeal> meals) {
        return meals.stream()
                .map(SchoolMealDto::fromEntity)
                .collect(Collectors.toList());
    }
}