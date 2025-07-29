package com.example.highteenday_backend.api;

import com.example.highteenday_backend.domain.schools.SchoolRepository;
import com.example.highteenday_backend.domain.schools.SchoolSchedule;
import com.example.highteenday_backend.domain.schools.SchoolScheduleRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.File;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class SchoolScheduleImportService {

    private final SchoolScheduleRepository schoolScheduleRepository;
    private final SchoolRepository schoolRepository;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public void importSchedulesFromJson(String filePath) {
        try {
            objectMapper.registerModule(new JavaTimeModule());

            File jsonFile = new File(filePath);

            List<SchoolSchedule> schedules = objectMapper.readValue(
                    jsonFile,
                    new TypeReference<List<SchoolSchedule>>() {}
            );

            log.info("읽은 시간표 개수: {}", schedules.size());

            // school 엔티티가 JSON에 포함되어있으면 순환참조 문제 없도록 조정 필요
            // 혹은 schoolId만 포함되어 있다면 schoolRepository에서 조회 후 set 처리해야 함
            for (SchoolSchedule schedule : schedules) {
                // 예: school 필드가 null일 수도 있으니 실제 DB 엔티티로 다시 설정 (필요 시)
                // 예: schedule.setSchool(schoolRepository.findById(schedule.getSchool().getId()).orElse(null));

                schoolScheduleRepository.save(schedule);
            }

            log.info("DB 저장 완료");
        } catch (Exception e) {
            log.error("JSON 파싱 또는 DB 저장 중 오류 발생: ", e);
        }
    }
}