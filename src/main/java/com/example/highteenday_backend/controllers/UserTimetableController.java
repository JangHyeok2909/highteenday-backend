package com.example.highteenday_backend.controllers;

import com.example.highteenday_backend.domain.schools.UserTimetables.UserTimetable;
import com.example.highteenday_backend.domain.schools.subjects.Subject;
import com.example.highteenday_backend.domain.schools.timetableTamplates.TimetableTemplate;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.RequestTimetableDto;
import com.example.highteenday_backend.dtos.UserTimetableDto;
import com.example.highteenday_backend.security.CustomUserPrincipal;
import com.example.highteenday_backend.services.TimetableTemplateService;
import com.example.highteenday_backend.services.UserTimetableService;
import com.example.highteenday_backend.services.domain.SubjectService;
import com.example.highteenday_backend.services.domain.TimetableSubjectService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;


@Tag(name ="시간표 API")
@RequiredArgsConstructor
@RequestMapping("/api/timetableTemplates")
@RestController
public class UserTimetableController {
    private final UserTimetableService timetableService;
    private final TimetableTemplateService templateService;
    private final SubjectService subjectService;
    private final TimetableSubjectService timetableSubjectService;

    @Operation(summary = "오늘의 시간표 가져오기")
    @GetMapping("/userTimetables/today")
    public ResponseEntity<List<UserTimetableDto>> getTodayTimetables(@AuthenticationPrincipal CustomUserPrincipal userPrincipal){
        User user = userPrincipal.getUser();
        DayOfWeek day = LocalDate.now().getDayOfWeek();
        TimetableTemplate defaultTemplate = templateService.getDefaultTemplate(user);
        List<UserTimetable> todayTimetables = defaultTemplate.getTimetables();
        todayTimetables.removeIf(timetable -> timetable.getDay() !=day);
        List<UserTimetableDto> timetableDtos = toListDto(todayTimetables);
        return ResponseEntity.ok(timetableDtos);
    }

    @Operation(summary = "시간표 전체 조회", description = "timetableTemplatesId에 해당하는 시간표 전체 조회")
    @GetMapping("/{timetableTemplatesId}/userTimetables")
    private ResponseEntity<List<UserTimetableDto>> getTimetables(@AuthenticationPrincipal CustomUserPrincipal userPrincipal,
                                                                 @PathVariable Long timetableTemplatesId){
        User user = userPrincipal.getUser();
        TimetableTemplate template = templateService.findById(timetableTemplatesId);
        if(template.getUser().getId() != user.getId()) return ResponseEntity.badRequest().build();
        List<UserTimetable> timetables = template.getTimetables();
        List<UserTimetableDto> timetableDtos = new ArrayList<>();
        for(UserTimetable utt:timetables){
            timetableDtos.add(utt.toDto());
        }
        return ResponseEntity.ok(timetableDtos);
    }
    @Operation(summary = "시간표 추가", description = "과목id,요일,교시 등을 받아 해당 교시에 한시간 분량의 과목 추가")
    @PostMapping("/{timetableTemplatesId}/userTimetables")
    private ResponseEntity<UserTimetableDto> addTimetable(
            @AuthenticationPrincipal CustomUserPrincipal userPrincipal,
            @RequestBody RequestTimetableDto dto,
            @PathVariable Long timetableTemplatesId
    ){
        User user = userPrincipal.getUser();
        TimetableTemplate template = templateService.findById(timetableTemplatesId);
        Long ownerId = template.getUser().getId();
        if(user.getId()!=ownerId) return ResponseEntity.badRequest().build();
        Subject subject = subjectService.findById(dto.getSubjectId());
        UserTimetable savedTimetable = timetableSubjectService.createTimetableAndIncHours(subject, template, dto);
        return ResponseEntity.created(null).body(savedTimetable.toDto());
    }

    @Operation(summary = "시간표 삭제", description = "시간표id를 통해 한시간 분량의 해당 과목 삭제함.")
    @DeleteMapping("/{timetableTemplatesId}/userTimetables/{userTimetableId}")
    public ResponseEntity<String> deleteTimetable(@AuthenticationPrincipal CustomUserPrincipal userPrincipal,
                                                  @PathVariable Long userTimetableId){
        User user = userPrincipal.getUser();
        UserTimetable timetable = timetableService.findById(userTimetableId);
        if(timetable.getTimetableTemplate().getUser().getId() != user.getId()) return ResponseEntity.badRequest().build();
        timetableSubjectService.deleteTimetableAndDecHours(timetable);
        return ResponseEntity.ok("시간표 삭제완료.");
    }

    public List<UserTimetableDto> toListDto(List<UserTimetable> timetables){
        List<UserTimetableDto> timetableDtos = new ArrayList<>();
        for(UserTimetable utt:timetables){
            timetableDtos.add(utt.toDto());
        }
        return timetableDtos;
    }
}
