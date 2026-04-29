package com.example.highteenday_backend.api;

import com.example.highteenday_backend.constants.SchoolFileConstants;
import com.example.highteenday_backend.domain.schools.School;
import com.example.highteenday_backend.domain.schools.SchoolRepository;
import com.example.highteenday_backend.dtos.SchoolDto;
import com.example.highteenday_backend.enums.SchoolCategory;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class SchoolInfoService {

    private final SchoolRepository schoolRepository;
    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${neis.api.key}")
//# NEIS API 인증키
//neis.api.key=cee4ba90a5d34912a1e7c38edad08c01
    private String apiKey;

    public void loadAllSchools() {
        List<SchoolDto> schoolDtos = new ArrayList<>();  // 여기에 모든 학교 저장

        int pageSize = 1000;
        int page = 1;
        int totalCount = 0;
        int totalPages = Integer.MAX_VALUE;

        while (page <= totalPages) {
            String url = String.format(
                    "https://open.neis.go.kr/hub/schoolInfo?KEY=%s&Type=json&pSize=%d&pIndex=%d",
                    apiKey, pageSize, page
            );

            try {
                String response = restTemplate.getForObject(url, String.class);
                JsonNode root = objectMapper.readTree(response);

                if (!root.has("schoolInfo")) break;

                JsonNode schoolInfo = root.get("schoolInfo");

                if (page == 1) {
                    totalCount = schoolInfo.get(0).get("head").get(0).get("list_total_count").asInt();
                    totalPages = (int) Math.ceil(totalCount / (double) pageSize);
                }

                JsonNode rows = schoolInfo.get(1).get("row");
                if (rows == null || rows.isEmpty()) break;

                for (JsonNode row : rows) {
                    String codeText = row.path("SD_SCHUL_CODE").asText().trim();
                    if (codeText.isEmpty()) continue;

                    Integer code;
                    try {
                        code = Integer.parseInt(codeText);
                    } catch (NumberFormatException e) {
                        continue;
                    }

                    if (schoolRepository.existsByCode(code)) continue;

                    String categoryName = row.path("SCHUL_KND_SC_NM").asText();
                    SchoolCategory category;
                    try {
                        category = SchoolCategory.fromString(categoryName);
                    } catch (IllegalArgumentException e) {
                        continue;
                    }

                    SchoolDto schoolDto = SchoolDto.builder()
                            .code(code)
                            .name(row.path("SCHUL_NM").asText())
                            .location(row.path("LCTN_SC_NM").asText())
                            .eduOfficeCode(row.path("ATPT_OFCDC_SC_CODE").asText())
                            .category(category)
                            .build();
                    schoolDtos.add(schoolDto);  // 목록에 추가
                }

                page++;

            } catch (Exception e) {
                e.printStackTrace();
                break;
            }
        }
        File file = new File(SchoolFileConstants.SCHOOL_JSON_PATH);
        // 경로의 부모 디렉토리 존재 여부 확인
        File parentDir = file.getParentFile();
        if (!parentDir.exists()) {
            parentDir.mkdirs();  // 디렉토리 없으면 자동 생성
        }

        // JSON 파일로 저장
        try {
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(file, schoolDtos);
            log.info("School data saved to schools.json.");
        } catch (IOException e) {
            log.warn("Failed to save schools.json: {}", e.getMessage());
            e.printStackTrace();        }
    }
    @Transactional
    public void importSchoolsFromJson() {
        File jsonFile = new File(SchoolFileConstants.SCHOOL_JSON_PATH);

        if (!jsonFile.exists()) {
            log.error("schools.json not found. path={}", SchoolFileConstants.SCHOOL_JSON_PATH);
            return;
        }

        try {
            //schools.json 읽어 리스트로 역직렬화
            List<SchoolDto> dtoList = objectMapper.readValue(
                    jsonFile,
                    new TypeReference<List<SchoolDto>>() {}
            );

            // 2. School 엔티티로 변환 + 저장
            for (SchoolDto dto : dtoList) {
                // 이미 존재하면 건너뜀
                if (schoolRepository.existsByCode(dto.getCode())) {
                    continue;
                }

                School school = School.builder()
                        .code(dto.getCode())
                        .name(dto.getName())
                        .location(dto.getLocation())
                        .eduOfficeCode(dto.getEduOfficeCode())
                        .category(dto.getCategory())
                        .build();

                schoolRepository.save(school);
            }
            log.info("School data loaded from schools.json into DB.");

        } catch (IOException e) {
            log.warn("Failed to read schools.json: {}", e.getMessage());
            e.printStackTrace();
        }
    }


}