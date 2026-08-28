package com.example.highteenday_backend.initializers;

import com.example.highteenday_backend.api.SchoolInfoService;
import com.example.highteenday_backend.api.SchoolMealInitializer;
import com.example.highteenday_backend.constants.SchoolFileConstants;
import com.example.highteenday_backend.domain.schools.SchoolMealRepository;
import com.example.highteenday_backend.domain.schools.SchoolRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.io.File;
import java.time.LocalDate;

import static org.junit.jupiter.api.Assumptions.assumeFalse;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * prod 최초 급식 수집 분기가 실제로 도달 가능한지 확인한다 (docs/KNOWN-ISSUES.md KI-45).
 *
 * 예전 조건은 {@code count == 0 && file.exists()} 였다. 바깥에서 이미 파일 존재를
 * 요구했으므로 안쪽 else(= 파일이 없을 때 NEIS 에서 수집)는 절대 실행될 수 없었고,
 * 급식 JSON 이 없는 prod 환경에서는 급식이 영영 수집되지 않았다.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("SchoolDataProdInitializer")
class SchoolDataProdInitializerTest {

    @Mock private SchoolInfoService schoolInfoService;
    @Mock private SchoolRepository schoolRepository;
    @Mock private SchoolMealRepository schoolMealRepository;
    @Mock private SchoolMealInitializer schoolMealInitializer;

    @InjectMocks private SchoolDataProdInitializer initializer;

    /** 이 테스트가 의미를 가지려면 이번 달 급식 JSON 이 실제로 없어야 한다. */
    private void requireNoMealJsonForThisMonth() {
        LocalDate now = LocalDate.now();
        File file = new File(SchoolFileConstants.getMealJsonPath(now.getYear(), now.getMonthValue()));
        assumeFalse(file.exists(),
                "이번 달 급식 JSON 이 저장소에 있어 '파일 없음' 분기를 확인할 수 없다");
    }

    @Test
    @DisplayName("급식 데이터도 JSON 파일도 없으면 NEIS 에서 최초 수집한다 — 예전에는 도달 불가였다")
    void collectsFromNeisWhenNoDataAndNoFile() {
        requireNoMealJsonForThisMonth();
        when(schoolRepository.count()).thenReturn(100L);
        when(schoolMealRepository.count()).thenReturn(0L);

        initializer.importSchoolsIfEmpty();

        verify(schoolMealInitializer).loadDataAndSaveToDb();
        verify(schoolMealInitializer, never()).saveToDbFromJson();
    }

    @Test
    @DisplayName("급식 데이터가 이미 있으면 아무것도 수집하지 않는다")
    void doesNothingWhenMealDataExists() {
        when(schoolRepository.count()).thenReturn(100L);
        when(schoolMealRepository.count()).thenReturn(5000L);

        initializer.importSchoolsIfEmpty();

        verify(schoolMealInitializer, never()).loadDataAndSaveToDb();
        verify(schoolMealInitializer, never()).saveToDbFromJson();
    }

    @Test
    @DisplayName("학교 데이터가 이미 있으면 학교는 다시 적재하지 않는다 — 부팅마다 NEIS 전량 크롤을 막는다")
    void doesNotReimportSchoolsWhenPresent() {
        when(schoolRepository.count()).thenReturn(100L);
        when(schoolMealRepository.count()).thenReturn(5000L);

        initializer.importSchoolsIfEmpty();

        verify(schoolInfoService, never()).loadAllSchools();
        verify(schoolInfoService, never()).importSchoolsFromJson();
    }
}
