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
//    application.properties 파일에 주석 해제하시고 붙혀넣으시면 됩니다.
//# NEIS API 인증키
//neis.api.key=cee4ba90a5d34912a1e7c38edad08c01
    private String apiKey;

    public void loadAllSchools() {
        int pageSize = 1000;
        int page = 1;
        int totalCount = 0;
        int totalPages = Integer.MAX_VALUE; // 매우 크게 설정

        while (page <= totalPages) {
            String url = String.format(
                    "https://open.neis.go.kr/hub/schoolInfo?KEY=%s&Type=json&pSize=%d&pIndex=%d",
                    apiKey, pageSize, page
            );

            try {
                String response = restTemplate.getForObject(url, String.class);
                JsonNode root = objectMapper.readTree(response);

                if (!root.has("schoolInfo")) {
                    System.out.println("응답에 schoolInfo 없음. 중단.");
                    break;
                }

                JsonNode schoolInfo = root.get("schoolInfo");

                // 전체 개수 추출 (page == 1일 때만 하면 됨)
                if (page == 1) {
                    totalCount = schoolInfo.get(0).get("head").get(0).get("list_total_count").asInt();
                    totalPages = (int) Math.ceil(totalCount / (double) pageSize);
                    System.out.println("총 학교 수: " + totalCount + ", 총 페이지 수: " + totalPages);
                }

                JsonNode rows = schoolInfo.get(1).get("row");
                if (rows == null || rows.isEmpty()) {
                    System.out.println("페이지 " + page + "에 데이터 없음 → 중단");
                    break;
                }

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
                }

                page++;

            } catch (Exception e) {
                System.out.println("예외 발생: " + e.getMessage());
                e.printStackTrace();
                break;
            }
        }

        System.out.println("전국 학교 데이터 저장 완료. 저장된 수: " + schoolRepository.count());
    }
}