package com.example.highteenday_backend.dtos;

import com.example.highteenday_backend.domain.schools.School;
import com.example.highteenday_backend.domain.schools.SchoolMeal;
import com.example.highteenday_backend.enums.SchoolMealCategory;
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
    private String schoolName;
    private String month;
    private String week;
    private String day;
    private LocalDate date;
    private String dishName;
    private String category;
    private int calorie;

    public static SchoolMealDto fromEntity(SchoolMeal meal) {
        return SchoolMealDto.builder()
                .schoolName(meal.getSchool().getName())
                .date(meal.getDate())
                .dishName(processDishName(meal.getDishName()))
                .category(meal.getCategory().name())
                .calorie(meal.getCalorie())
                .build();


    }

    public static List<SchoolMealDto> fromEntities(List<SchoolMeal> meals) {
        return meals.stream()
                .map(SchoolMealDto::fromEntity)
                .collect(Collectors.toList());
    }

    private static String processDishName(String dishName){
        return dishName.replaceAll("\\([^)]*\\)", ""); //( ) 내용 전부 제거
    }
}