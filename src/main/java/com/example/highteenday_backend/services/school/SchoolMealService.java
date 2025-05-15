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
    //    application.properties 파일에 주석 해제하시고 붙혀넣으시면 됩니다.
//# NEIS API 인증키
//neis.api.key=cee4ba90a5d34912a1e7c38edad08c01
    private String apiKey;

    public void loadMealsForSchoolForMonth(String schoolCode, String eduOfficeCode, int year, int month) {
        School school = schoolRepository.findByCode(Integer.parseInt(schoolCode))
                .orElseThrow(() -> new IllegalArgumentException("학교 코드가 잘못되었습니다."));

        int page = 1;
        int pageSize = 100;
        String startDate = String.format("%04d%02d01", year, month);
        String endDate = String.format("%04d%02d31", year, month); // 유효하지 않은 날짜는 NEIS에서 자동 제외

        while (true) {
            String url = String.format(
                    "https://open.neis.go.kr/hub/mealServiceDietInfo?KEY=%s&Type=json&pSize=%d&pIndex=%d&ATPT_OFCDC_SC_CODE=%s&SD_SCHUL_CODE=%s&MLSV_FROM_YMD=%s&MLSV_TO_YMD=%s",
                    apiKey, pageSize, page, eduOfficeCode, schoolCode, startDate, endDate
            );

            try {
                String response = restTemplate.getForObject(url, String.class);
                JsonNode root = objectMapper.readTree(response);

                if (!root.has("mealServiceDietInfo") || root.get("mealServiceDietInfo").get(1).get("row").isEmpty()) {
                    break;
                }

                JsonNode rows = root.get("mealServiceDietInfo").get(1).get("row");

                for (JsonNode row : rows) {
                    String date = row.path("MLSV_YMD").asText(); // yyyyMMdd
                    String dishName = row.path("DDISH_NM").asText().replaceAll("<br/>", ", ");
                    String calorieStr = row.path("CAL_INFO").asText().replaceAll("[^0-9]", "");
                    String mealType = row.path("MMEAL_SC_NM").asText();

                    if (date.length() != 8) continue;

                    LocalDate localDate = LocalDate.of(
                            Integer.parseInt(date.substring(0, 4)),
                            Integer.parseInt(date.substring(4, 6)),
                            Integer.parseInt(date.substring(6, 8))
                    );

                    String monthStr = String.format("%02d", localDate.getMonthValue());
                    String day = String.format("%02d", localDate.getDayOfMonth());
                    String week = String.valueOf(localDate.get(WeekFields.of(Locale.KOREA).weekOfMonth()));

                    SchoolMealCategory category;
                    try {
                        category = SchoolMealCategory.fromString(mealType);
                    } catch (IllegalArgumentException e) {
                        continue; // 조식/중식/석식이 아닌 경우 스킵
                    }

                    int calorie = calorieStr.isEmpty() ? 0 : Integer.parseInt(calorieStr);

                    // 중복 체크
                    boolean exists = schoolMealRepository.existsBySchoolAndDateAndCategory(
                            school, localDate, category
                    );

                    if (exists) continue;

                    SchoolMeal meal = SchoolMeal.builder()
                            .school(school)
                            .month(monthStr)
                            .week(week)
                            .day(day)
                            .dishName(dishName)
                            .category(category)
                            .calorie(calorie)
                            .date(localDate)
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

    public void loadAllSchoolMealsForMonth(int year, int month) {
        schoolRepository.findAll().forEach(school -> {
            try {
                loadMealsForSchoolForMonth(
                        String.valueOf(school.getCode()),
                        school.getEduOfficeCode(),
                        year, month
                );
            } catch (Exception e) {
                System.err.printf("학교 [%s] 급식 정보 수집 실패: %s%n", school.getName(), e.getMessage());
            }
        });
    }
}