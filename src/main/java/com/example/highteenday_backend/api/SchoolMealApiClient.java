package com.example.highteenday_backend.api;

import com.example.highteenday_backend.constants.MealFileConstants;
import com.example.highteenday_backend.domain.schools.School;
import com.example.highteenday_backend.domain.schools.SchoolRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

//API 호출 후 JSON 저장
@Service
@RequiredArgsConstructor
public class SchoolMealApiClient {

    private final SchoolRepository schoolRepository;
    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${neis.api.key}")
    private String apiKey;

    public void fetchAndSaveMeals(int year, int month) {
        List<Map<String, Object>> allMeals = new ArrayList<>();

        for (School school : schoolRepository.findAll()) {
            // 👉 기존 loadMealsForSchoolForMonth 로직을 가져와서
            //    DB save 대신 allMeals.add() 로 누적
        }

        try {
            String fileName = String.format("school_meal_%04d-%02d.json", year, month);
            Path path = Paths.get(MealFileConstants.MEAL_JSON_DIR, fileName);

            Files.createDirectories(path.getParent());
            objectMapper.writeValue(path.toFile(), allMeals);

            System.out.println("급식 JSON 저장 완료: " + path);

        } catch (Exception e) {
            throw new RuntimeException("급식 JSON 저장 실패", e);
        }
    }
}