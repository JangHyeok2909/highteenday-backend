package com.example.highteenday_backend.api;

import com.example.highteenday_backend.domain.schools.School;
import com.example.highteenday_backend.domain.schools.SchoolRepository;
import com.example.highteenday_backend.domain.schedule.SchoolSchedule;
import com.example.highteenday_backend.enums.SchoolCategory;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.io.File;
import java.io.IOException;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Slf4j
@Service
@RequiredArgsConstructor
public class SchoolScheduleService {

    private final SchoolRepository schoolRepository;
    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${neis.api.key}")
    private String apiKey;

    public void loadAllSchoolSchedules() {
        List<School> highSchools = schoolRepository.findByCategory(SchoolCategory.HIGH);
        log.info("고등학교 개수: {}", highSchools.size());

        List<SchoolSchedule> allSchedules = new ArrayList<>();

        for (School school : highSchools) {
            try {
                log.info("{} ({}) 시간표 수집 시작", school.getName(), school.getCode());
                List<SchoolSchedule> schedules = loadScheduleForSchool(school);
                allSchedules.addAll(schedules);
            } catch (Exception e) {
                log.warn("{} 시간표 수집 실패: {}", school.getName(), e.getMessage());
            }
        }

        saveSchedulesAsJson(allSchedules);
    }

    private List<SchoolSchedule> loadScheduleForSchool(School school) {
        List<SchoolSchedule> scheduleList = new ArrayList<>();
        Set<String> subjectSet = new HashSet<>(); // 중복 방지용

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
                    String subject = row.path("ITRT_CNTNT").asText();

                    // 중복 체크: 이미 subjectSet에 있으면 건너뛰기
                    if (subjectSet.contains(subject)) {
                        continue;
                    }
                    subjectSet.add(subject);

                    LocalDate date = LocalDate.parse(
                            row.path("ALL_TI_YMD").asText(),
                            DateTimeFormatter.ofPattern("yyyyMMdd")
                    );

                    String dayName = row.path("ORD_DAY_NM").asText();
                    String day = (dayName != null && !dayName.isBlank()) ? dayName.substring(0, 1) : "X";

                    SchoolSchedule schedule = SchoolSchedule.builder()
                            .school(school)  // 필요하면 제외해도 됨. 순환참조 주의
                            .grade(row.path("GRADE").asInt())
                            .major(row.path("DDDEP_NM").asText())
                            .classNumber(row.path("CLASS_NM").asInt())
                            .subject(subject)
                            .period(row.path("PERIO").asInt())
                            .date(date)
                            .week(String.valueOf(date.getDayOfWeek().getValue()))
                            .day(day)
                            .build();
//                    System.out.println("학교명="+schedule.getSchool().getName()+", 과목명="+schedule.getSubject());
                    scheduleList.add(schedule);
                }

                page++;
            } catch (Exception e) {
                log.warn("{} / 페이지 {} 처리 중단: {}", school.getName(), page, e.getMessage());
                break;
            }
        }

        return scheduleList;
    }

    private void saveSchedulesAsJson(List<SchoolSchedule> schedules) {
        try {
            // LocalDate, LocalDateTime 직렬화 모듈 등록
            objectMapper.registerModule(new JavaTimeModule());
            objectMapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

            File outputFile = new File("school_schedules.json");
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(outputFile, schedules);
            log.info("학교 시간표 데이터가 school_schedules.json 파일로 저장되었습니다.");
        } catch (IOException e) {
            log.error("JSON 저장 실패: {}", e.getMessage());
        }
    }
}