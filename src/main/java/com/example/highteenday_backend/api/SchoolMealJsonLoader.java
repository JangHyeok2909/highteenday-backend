package com.example.highteenday_backend.api;

import com.example.highteenday_backend.constants.MealFileConstants;
import com.example.highteenday_backend.domain.schools.SchoolMeal;
import com.example.highteenday_backend.domain.schools.SchoolMealRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Arrays;
import java.util.List;

//JSON 읽어서 DB 저장
@Service
@RequiredArgsConstructor
public class SchoolMealJsonLoader {

    private final SchoolMealRepository schoolMealRepository;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public void loadMealsFromJson(int year, int month) {
        try {
            String fileName = String.format("school_meal_%04d-%02d.json", year, month);
            Path path = Paths.get(MealFileConstants.MEAL_JSON_DIR, fileName);

            if (!Files.exists(path)) {
                System.out.println("급식 JSON 파일이 없음: " + path);
                return;
            }

            // 기존 데이터 삭제
            schoolMealRepository.deleteAll();

            // JSON 읽기
            List<SchoolMeal> meals = Arrays.asList(
                    objectMapper.readValue(path.toFile(), SchoolMeal[].class)
            );

            schoolMealRepository.saveAll(meals);
            System.out.println("급식 DB 저장 완료: " + meals.size());

        } catch (Exception e) {
            throw new RuntimeException("급식 JSON 로딩 실패", e);
        }
    }
}