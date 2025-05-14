package com.example.highteenday_backend.services.school;

import com.example.highteenday_backend.domain.schools.School;
import com.example.highteenday_backend.domain.schools.SchoolMeal;
import com.example.highteenday_backend.domain.schools.SchoolMealRepository;
import com.example.highteenday_backend.domain.schools.SchoolRepository;
import com.example.highteenday_backend.enums.SchoolMealCategory;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDate;
import java.time.temporal.WeekFields;
import java.util.Locale;

@Service
@RequiredArgsConstructor
public class SchoolMealService {

    private final SchoolRepository schoolRepository;
    private final SchoolMealRepository schoolMealRepository;
    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${neis.api.key}")
    private String apiKey;

    public void loadMealsForSchool(String schoolCode, String eduOfficeCode) {
        School school = schoolRepository.findByCode(Integer.parseInt(schoolCode))
                .orElseThrow(() -> new IllegalArgumentException("학교 코드가 잘못되었습니다."));

        int page = 1;
        int pageSize = 100;

        while (true) {
            String url = String.format(
                    "https://open.neis.go.kr/hub/mealServiceDietInfo?KEY=%s&Type=json&pSize=%d&pIndex=%d&ATPT_OFCDC_SC_CODE=%s&SD_SCHUL_CODE=%s",
                    apiKey, pageSize, page, eduOfficeCode, schoolCode
            );

            try {
                String response = restTemplate.getForObject(url, String.class);
                JsonNode root = objectMapper.readTree(response);

                if (!root.has("mealServiceDietInfo") || root.get("mealServiceDietInfo").get(1).get("row").isEmpty()) {
                    break;
                }

                JsonNode rows = root.get("mealServiceDietInfo").get(1).get("row");

                for (JsonNode row : rows) {
                    String date = row.path("MLSV_YMD").asText(); // "20240514"
                    String dishName = row.path("DDISH_NM").asText().replaceAll("<br/>", ", ");
                    String calorieStr = row.path("CAL_INFO").asText().replaceAll("[^0-9]", "");
                    String mealType = row.path("MMEAL_SC_NM").asText();

                    if (date.length() != 8) continue;

                    String month = date.substring(4, 6);
                    String day = date.substring(6, 8);

                    // 주차 계산 (한국 기준)
                    LocalDate localDate = LocalDate.of(
                            Integer.parseInt(date.substring(0, 4)),
                            Integer.parseInt(month),
                            Integer.parseInt(day)
                    );
                    WeekFields weekFields = WeekFields.of(Locale.KOREA);
                    String week = String.valueOf(localDate.get(weekFields.weekOfMonth()));

                    SchoolMealCategory category;
                    try {
                        category = SchoolMealCategory.fromString(mealType);
                    } catch (IllegalArgumentException e) {
                        continue; // 무시
                    }

                    int calorie = calorieStr.isEmpty() ? 0 : Integer.parseInt(calorieStr);

                    SchoolMeal meal = SchoolMeal.builder()
                            .school(school)
                            .month(month)
                            .week(week)
                            .day(day)
                            .dishName(dishName)
                            .category(category)
                            .calorie(calorie)
                            .build();

                    schoolMealRepository.save(meal);
                }

                page++;

            } catch (Exception e) {
                e.printStackTrace();
                break;
            }
        }
    }
}