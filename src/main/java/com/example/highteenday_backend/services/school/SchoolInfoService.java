package com.example.highteenday_backend.services.school;

import com.example.highteenday_backend.domain.schools.School;
import com.example.highteenday_backend.domain.schools.SchoolRepository;
import com.example.highteenday_backend.enums.SchoolCategory;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

@Service
@RequiredArgsConstructor
public class SchoolInfoService {

    private final SchoolRepository schoolRepository;
    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${neis.api.key}")
    private String apiKey;

    public void loadAllSchools() {
        int page = 1;
        int pageSize = 1000;

        while (true) {
            String url = String.format(
                    "https://open.neis.go.kr/hub/schoolInfo?KEY=%s&Type=json&pSize=%d&pIndex=%d",
                    apiKey, pageSize, page
            );

            try {
                String response = restTemplate.getForObject(url, String.class);
                JsonNode root = objectMapper.readTree(response);

                if (!root.has("schoolInfo") || root.get("schoolInfo").get(1).get("row").isEmpty()) {
                    break; // 더 이상 데이터가 없으면 종료
                }

                JsonNode rows = root.get("schoolInfo").get(1).get("row");

                for (JsonNode row : rows) {
                    String codeText = row.path("SD_SCHUL_CODE").asText().trim();
                    if (codeText.isEmpty()) {
                        System.out.println("빈 코드 발견: 건너뜀");
                        continue;
                    }

                    Integer code;
                    try {
                        code = Integer.parseInt(codeText);
                    } catch (NumberFormatException e) {
                        System.out.println("숫자 아님: " + codeText + " → 건너뜀");
                        continue;
                    }

                    if (schoolRepository.existsByCode(code)) continue;

                    String categoryName = row.path("SCHUL_KND_SC_NM").asText();

                    SchoolCategory category;
                    try {
                        category = SchoolCategory.fromString(categoryName);
                    } catch (IllegalArgumentException e) {
                        // 지원되지 않는 카테고리는 무시
                        continue;
                    }

                    School school = School.builder()
                            .code(code)
                            .name(row.path("SCHUL_NM").asText())
                            .location(row.path("LCTN_SC_NM").asText())
                            .category(category)
                            .build();

                    schoolRepository.save(school);
                }

                page++; // 다음 페이지로 이동

            } catch (Exception e) {
                e.printStackTrace();
                break;
            }
        }
    }
}