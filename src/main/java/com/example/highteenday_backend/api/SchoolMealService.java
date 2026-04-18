package com.example.highteenday_backend.api;

import com.example.highteenday_backend.constants.SchoolFileConstants;
import com.example.highteenday_backend.domain.schools.School;
import com.example.highteenday_backend.domain.schools.SchoolMeal;
import com.example.highteenday_backend.domain.schools.SchoolMealRepository;
import com.example.highteenday_backend.domain.schools.SchoolRepository;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.SchoolMealDto;
import com.example.highteenday_backend.enums.SchoolMealCategory;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;

import java.io.File;
import java.io.IOException;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.temporal.WeekFields;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

@Slf4j
@Service
@RequiredArgsConstructor
public class SchoolMealService {

    private final SchoolRepository schoolRepository;
    private final SchoolMealRepository schoolMealRepository;
    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${neis.api.key}")
    private String apiKey;

    @Getter
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class MealRecord {
        private String schoolCode;
        private String date;   // yyyy-MM-dd
        private String month;
        private String week;
        private String day;
        private String category;
        private String dishName;
        private int calorie;
    }

    public List<SchoolMealDto> getMealsByDate(User user, LocalDate date) {
        School school = findSchoolById(user.getSchool().getId());
        List<SchoolMeal> meals = schoolMealRepository.findByDateAndSchool(date, school);
        return SchoolMealDto.fromEntities(meals);
    }

    public List<SchoolMealDto> getMealsByWeek(LocalDate date, Long schoolId) {
        School school = findSchoolById(schoolId);

        LocalDate startOfWeek = date.with(DayOfWeek.MONDAY);
        LocalDate endOfWeek = date.with(DayOfWeek.SUNDAY);

        List<SchoolMeal> meals = schoolMealRepository.findByDateBetweenAndSchool(startOfWeek, endOfWeek, school);
        return SchoolMealDto.fromEntities(meals);
    }

    public List<SchoolMealDto> getMealsByMonth(LocalDate date, Long schoolId) {
        School school = findSchoolById(schoolId);

        YearMonth ym = YearMonth.from(date);
        LocalDate startOfMonth = ym.atDay(1);
        LocalDate endOfMonth = ym.atEndOfMonth();

        List<SchoolMeal> meals = schoolMealRepository.findByDateBetweenAndSchool(startOfMonth, endOfMonth, school);
        return SchoolMealDto.fromEntities(meals);
    }

    private School findSchoolById(Long id) {
        return schoolRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("School not found: " + id));
    }

    /**
     * NEIS API에서 특정 학교의 한 달치 급식을 가져와 MealRecord 리스트로 반환합니다.
     */
    private List<MealRecord> fetchMealsForSchool(String schoolCode, String eduOfficeCode, int year, int month) {
        List<MealRecord> records = new ArrayList<>();

        int page = 1;
        int pageSize = 100;
        String startDate = String.format("%04d%02d01", year, month);
        String endDate = String.format("%04d%02d31", year, month);

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
                    String date = row.path("MLSV_YMD").asText();
                    String dishName = row.path("DDISH_NM").asText().replaceAll("<br/>", ", ");
                    String calorieStr = row.path("CAL_INFO").asText().replaceAll("[^0-9]", "");
                    String mealType = row.path("MMEAL_SC_NM").asText();

                    if (date.length() != 8) continue;

                    try {
                        SchoolMealCategory.fromString(mealType);
                    } catch (IllegalArgumentException e) {
                        continue;
                    }

                    LocalDate localDate = LocalDate.of(
                            Integer.parseInt(date.substring(0, 4)),
                            Integer.parseInt(date.substring(4, 6)),
                            Integer.parseInt(date.substring(6, 8))
                    );

                    String monthStr = String.format("%02d", localDate.getMonthValue());
                    String day = String.format("%02d", localDate.getDayOfMonth());
                    String week = String.valueOf(localDate.get(WeekFields.of(Locale.KOREA).weekOfMonth()));
                    int calorie = calorieStr.isEmpty() ? 0 : Integer.parseInt(calorieStr);

                    records.add(MealRecord.builder()
                            .schoolCode(schoolCode)
                            .date(localDate.toString())
                            .month(monthStr)
                            .week(week)
                            .day(day)
                            .category(mealType)
                            .dishName(dishName)
                            .calorie(calorie)
                            .build());
                }

                page++;

            } catch (Exception e) {
                log.error("급식 API 호출 실패. schoolCode={}, page={}: {}", schoolCode, page, e.getMessage());
                break;
            }
        }

        return records;
    }

    /**
     * 모든 학교의 한 달치 급식을 NEIS에서 가져와 단일 JSON 파일로 저장합니다.
     * 파일 경로: ./schoolData/meals/{year}-{month}.json
     */
    public void loadAllSchoolMealsForMonth(int year, int month) {
        List<MealRecord> allRecords = new ArrayList<>();

        schoolRepository.findAll().forEach(school -> {
            try {
                List<MealRecord> records = fetchMealsForSchool(
                        String.valueOf(school.getCode()),
                        school.getEduOfficeCode(),
                        year, month
                );
                allRecords.addAll(records);
            } catch (Exception e) {
                log.error("학교 [{}] 급식 수집 실패: {}", school.getName(), e.getMessage());
            }
        });

        String path = SchoolFileConstants.getMealJsonPath(year, month);
        File file = new File(path);
        File parentDir = file.getParentFile();
        if (!parentDir.exists()) {
            parentDir.mkdirs();
        }

        try {
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(file, allRecords);
            log.info("급식 JSON 저장 완료. year={}, month={}, totalCount={}", year, month, allRecords.size());
        } catch (IOException e) {
            log.warn("급식 JSON 저장 실패: {}", e.getMessage());
        }
    }

    /**
     * JSON 파일에서 모든 학교의 급식 데이터를 읽어 DB에 저장합니다.
     */
    @Transactional
    public void importMealsFromJson(int year, int month) {
        String path = SchoolFileConstants.getMealJsonPath(year, month);
        File file = new File(path);

        if (!file.exists()) {
            log.warn("급식 JSON 파일 없음. path={}", path);
            return;
        }

        try {
            List<MealRecord> records = objectMapper.readValue(file, new TypeReference<List<MealRecord>>() {});

            for (MealRecord record : records) {
                School school = schoolRepository.findByCode(Integer.parseInt(record.getSchoolCode())).orElse(null);
                if (school == null) continue;

                LocalDate localDate = LocalDate.parse(record.getDate());
                SchoolMealCategory category;
                try {
                    category = SchoolMealCategory.fromString(record.getCategory());
                } catch (IllegalArgumentException e) {
                    continue;
                }

                if (schoolMealRepository.existsBySchoolAndDateAndCategory(school, localDate, category)) {
                    continue;
                }

                SchoolMeal meal = SchoolMeal.builder()
                        .school(school)
                        .month(record.getMonth())
                        .week(record.getWeek())
                        .day(record.getDay())
                        .dishName(record.getDishName())
                        .category(category)
                        .calorie(record.getCalorie())
                        .date(localDate)
                        .build();

                schoolMealRepository.save(meal);
            }

            log.info("급식 JSON → DB 저장 완료. year={}, month={}", year, month);
        } catch (IOException e) {
            log.warn("급식 JSON 읽기 실패: {}", e.getMessage());
        }
    }
}
