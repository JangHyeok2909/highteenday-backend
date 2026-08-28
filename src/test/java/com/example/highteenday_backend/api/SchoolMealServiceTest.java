package com.example.highteenday_backend.api;

import com.example.highteenday_backend.constants.SchoolFileConstants;
import com.example.highteenday_backend.domain.schools.School;
import com.example.highteenday_backend.domain.schools.SchoolMeal;
import com.example.highteenday_backend.domain.schools.SchoolMealRepository;
import com.example.highteenday_backend.domain.schools.SchoolRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 급식 재적재의 원자성 (docs/KNOWN-ISSUES.md KI-45).
 *
 * 예전에는 JSON 을 읽자마자 {@code deleteAll()} 을 불러서, 학교 코드가 하나도 매칭되지
 * 않으면 기존 급식 데이터가 전량 사라진 채 아무것도 채워지지 않았다.
 *
 * 파일 경로가 {@code SchoolFileConstants} 로 고정돼 있어 임시 파일을 실제 경로에 쓴다.
 * 실데이터와 겹치지 않도록 존재할 수 없는 연·월(9999-12)을 쓰고, 테스트가 끝나면 지운다.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("SchoolMealService.importMealsFromJson")
class SchoolMealServiceTest {

    private static final int YEAR = 9999;
    private static final int MONTH = 12;

    @Mock private SchoolRepository schoolRepository;
    @Mock private SchoolMealRepository schoolMealRepository;
    @Mock private org.springframework.web.client.RestTemplate restTemplate;

    @InjectMocks private SchoolMealService schoolMealService;

    private Path mealJson;

    @AfterEach
    void deleteTempJson() throws IOException {
        if (mealJson != null) Files.deleteIfExists(mealJson);
    }

    private void writeMealJson(String schoolCode) throws IOException {
        mealJson = Path.of(SchoolFileConstants.getMealJsonPath(YEAR, MONTH));
        Files.createDirectories(mealJson.getParent());
        Files.writeString(mealJson, """
                [
                  {
                    "schoolCode": "%s",
                    "date": "9999-12-01",
                    "month": "12",
                    "week": "1",
                    "day": "월",
                    "category": "중식",
                    "dishName": "김치찌개",
                    "calorie": 700
                  }
                ]
                """.formatted(schoolCode));
    }

    @Nested
    @DisplayName("수집 결과가 쓸모없을 때")
    class WhenNothingUsable {

        @Test
        @DisplayName("매칭되는 학교가 하나도 없으면 기존 데이터를 지우지 않는다")
        void keepsExistingDataWhenNoSchoolMatches() throws IOException {
            writeMealJson("11111");
            when(schoolRepository.findByCode(anyInt())).thenReturn(Optional.empty());

            schoolMealService.importMealsFromJson(YEAR, MONTH);

            verify(schoolMealRepository, never()).deleteAll();
            verify(schoolMealRepository, never()).saveAll(any());
        }
    }

    @Nested
    @DisplayName("수집 결과가 정상일 때")
    class WhenUsable {

        @Test
        @DisplayName("새 데이터를 다 만든 뒤에 지우고 저장한다 — 삭제가 저장보다 먼저지만 조립보다는 나중이다")
        void deletesOnlyAfterBuildingRows() throws IOException {
            writeMealJson("22222");
            School school = School.builder().id(1L).code(22222).build();
            when(schoolRepository.findByCode(22222)).thenReturn(Optional.of(school));

            schoolMealService.importMealsFromJson(YEAR, MONTH);

            InOrder order = inOrder(schoolRepository, schoolMealRepository);
            // 조립(학교 조회)이 먼저다. 예전에는 deleteAll 이 이 앞에 있었다.
            order.verify(schoolRepository).findByCode(22222);
            order.verify(schoolMealRepository).deleteAll();
            order.verify(schoolMealRepository).saveAll(any());
        }
    }

    @Test
    @DisplayName("JSON 파일이 없으면 아무것도 지우지 않는다")
    void keepsExistingDataWhenFileMissing() {
        schoolMealService.importMealsFromJson(YEAR, MONTH);

        verify(schoolMealRepository, never()).deleteAll();
        verify(schoolMealRepository, never()).saveAll(any());
    }
}
