package com.example.highteenday_backend.services.school;

import com.example.highteenday_backend.domain.schools.School;
import com.example.highteenday_backend.domain.schools.SchoolRepository;
import com.example.highteenday_backend.domain.schools.SchoolSchedule;
import com.example.highteenday_backend.domain.schools.SchoolScheduleRepository;
import com.example.highteenday_backend.enums.SchoolCategory;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class SchoolScheduleService {

    private final SchoolRepository schoolRepository;
    private final SchoolScheduleRepository schoolScheduleRepository;
    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${neis.api.key}")
    //    application.properties 파일에 주석 해제하시고 붙혀넣으시면 됩니다.
//# NEIS API 인증키
//neis.api.key=cee4ba90a5d34912a1e7c38edad08c01
    private String apiKey;

    public void loadAllSchoolSchedules() {
        List<School> highSchools = schoolRepository.findByCategory(SchoolCategory.HIGH);
        log.info("고등학교 개수: {}", highSchools.size());

        for (School school : highSchools) {
            try {
                log.info("{} ({}) 시간표 수집 시작", school.getName(), school.getCode());
                loadScheduleForSchool(school);
            } catch (Exception e) {
                log.warn("{} 시간표 수집 실패: {}", school.getName(), e.getMessage());
            }
        }
    }

    private void loadScheduleForSchool(School school) {
        String schoolCode = school.getCode().toString();
        String eduOfficeCode = school.getEduOfficeCode();

        int page = 1;
        while (true) {
            String url = String.format(
                    "https://open.neis.go.kr/hub/hisTimetable?KEY=%s&Type=json&pIndex=%d&pSize=100&ATPT_OFCDC_SC_CODE=%s&SD_SCHUL_CODE=%s",
                    apiKey, page, eduOfficeCode, schoolCode
            );

            try {
                String response = restTemplate.getForObject(url, String.class);
                JsonNode root = objectMapper.readTree(response);

                if (!root.has("hisTimetable")) break;

                JsonNode body = root.get("hisTimetable").get(1);
                if (body == null || !body.has("row")) break;

                JsonNode rows = body.get("row");
                if (rows.isEmpty()) break;

                for (JsonNode row : rows) {
                    LocalDate date = LocalDate.parse(
                            row.path("ALL_TI_YMD").asText(),
                            DateTimeFormatter.ofPattern("yyyyMMdd")
                    );

                    String dayName = row.path("ORD_DAY_NM").asText();
                    String day = (dayName != null && !dayName.isBlank()) ? dayName.substring(0, 1) : "X"; // "X"는 임의 값

                    SchoolSchedule schedule = SchoolSchedule.builder()
                            .school(school)
                            .grade(row.path("GRADE").asInt())
                            .major(row.path("DDDEP_NM").asText())
                            .classNumber(row.path("CLASS_NM").asInt())
                            .subject(row.path("ITRT_CNTNT").asText())
                            .period(row.path("PERIO").asInt())
                            .date(date)
                            .week(String.valueOf(date.getDayOfWeek().getValue()))
                            .day(day)
                            .build();

                    schoolScheduleRepository.save(schedule);
                }

                page++;
            } catch (Exception e) {
                log.warn("{} / 페이지 {} 처리 중단: {}", school.getName(), page, e.getMessage());
                break;
            }
        }
    }
}