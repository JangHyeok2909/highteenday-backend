package com.example.highteenday_backend.controllers;

import com.example.highteenday_backend.domain.schools.School;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.ResponseMealDto;
import com.example.highteenday_backend.dtos.SchoolMealDto;
import com.example.highteenday_backend.api.SchoolMealService;
import com.example.highteenday_backend.security.CustomUserPrincipal;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.cglib.core.Local;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;


@Tag(name = "급식표 API", description = "급식표 월,주,일 단위 조회")
@RestController
@RequestMapping("/api/schools/meals")
@RequiredArgsConstructor
public class SchoolMealController {

    private final SchoolMealService schoolMealService;
//GET /meals/date?date=2025-05-30&schoolId=1
//GET /meals/week?date=2025-05-30&schoolId=1
//GET /meals/month?date=2025-05-30&schoolId=1
//    형식으로 데이터 받으면 해당 급식 나옴
    @Operation(summary = "오늘 급식 조회", description = "오늘자 중/석식 조회")
    @GetMapping("/today")
    public ResponseEntity<List<SchoolMealDto>> getTodayMeal(@AuthenticationPrincipal CustomUserPrincipal userPrincipal){
        User user = userPrincipal.getUser();
        List<SchoolMealDto> schoolMealDtos = schoolMealService.getMealsByDate(user, LocalDate.now());
        return ResponseEntity.ok(schoolMealDtos);
    }


    @GetMapping("/date")
    public List<SchoolMealDto> getMealsByDate(@AuthenticationPrincipal CustomUserPrincipal userPrincipal,
                                              @RequestParam LocalDate date) {
        User user = userPrincipal.getUser();
        return schoolMealService.getMealsByDate(user, date);
    }

//    @GetMapping("/week")
//    public List<SchoolMealDto> getMealsByWeek(
//            @RequestParam LocalDate date,
//            @RequestParam Long schoolId
//    ) {
//        return schoolMealService.getMealsByWeek(date, schoolId);
//    }

    @Operation(summary = "월단위 급식표 조회", description = "중/석식 월단위 조회")
    @GetMapping("/month")
    public ResponseEntity<ResponseMealDto> getMealsByMonth(@AuthenticationPrincipal CustomUserPrincipal userPrincipal) {
        School school = userPrincipal.getUser().getSchool();
        List<SchoolMealDto> mealdtos = schoolMealService.getMealsByMonth(LocalDate.now(), school.getId());
        ResponseMealDto responseDto = ResponseMealDto.builder().schoolId(school.getId()).schoolName(school.getName()).mealdtos(mealdtos).build();
        return ResponseEntity.ok(responseDto);
    }
}