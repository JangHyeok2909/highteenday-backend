package com.example.highteenday_backend.api;

import com.example.highteenday_backend.domain.schools.School;
import com.example.highteenday_backend.domain.schools.SchoolRepository;
import com.example.highteenday_backend.enums.SchoolCategory;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
public class SchoolInfoService {

    private final SchoolRepository schoolRepository;
    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${neis.api.key}")
//    application.properties 파일에 주석 해제하시고 붙혀넣으시면 됩니다.
//# NEIS API 인증키
//neis.api.key=cee4ba90a5d34912a1e7c38edad08c01
    private String apiKey;

    public void loadAllSchools() {
        List<School> schoolList = new ArrayList<>();  // 여기에 모든 학교 저장

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

                    School school = School.builder()
                            .code(code)
                            .name(row.path("SCHUL_NM").asText())
                            .location(row.path("LCTN_SC_NM").asText())
                            .eduOfficeCode(row.path("ATPT_OFCDC_SC_CODE").asText())
                            .category(category)
                            .build();

                    schoolRepository.save(school);
                    schoolList.add(school);  // 목록에 추가
                }

                page++;

            } catch (Exception e) {
                e.printStackTrace();
                break;
            }
        }

        // JSON 파일로 저장
        try {
            File outputFile = new File("schools.json");
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(outputFile, schoolList);
            System.out.println("학교 정보가 schools.json 파일로 저장되었습니다.");
        } catch (IOException e) {
            System.out.println("JSON 저장 실패: " + e.getMessage());
            e.printStackTrace();        }
    }

}