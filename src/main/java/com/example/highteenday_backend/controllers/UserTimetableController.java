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
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;


@Tag(name ="시간표 템플릿의 시간표 API")
@RequiredArgsConstructor
@RequestMapping("/api/timetableTemplates/{timetableTemplatesId}/userTimetables")
@RestController
public class UserTimetableController {
    private final UserTimetableService timetableService;
    private final TimetableTemplateService templateService;
    private final SubjectService subjectService;
    @Operation(summary = "시간표 전체 조회", description = "timetableTemplatesId에 해당하는 시간표 전체 조회")
    @GetMapping
    private ResponseEntity<List<UserTimetableDto>> getTimetables(@AuthenticationPrincipal CustomUserPrincipal userPrincipal,
                                                                 Long timetableTemplatesId){
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
    @PostMapping()
    private ResponseEntity<UserTimetableDto> addTimetable(
            @AuthenticationPrincipal CustomUserPrincipal userPrincipal,
            RequestTimetableDto dto,
            @PathVariable Long timetableTemplatesId
    ){
        User user = userPrincipal.getUser();
        TimetableTemplate template = templateService.findById(timetableTemplatesId);
        Long ownerId = template.getUser().getId();
        if(user.getId()!=ownerId) return ResponseEntity.badRequest().build();
        Subject subject = subjectService.findById(dto.getSubjectId());

        UserTimetable timetable = UserTimetable.builder()
                .subject(subject)
                .timetableTemplate(template)
                .day(dto.getDay())
                .period(dto.getPeriod())
                .build();

        UserTimetable save = timetableService.save(timetable);
        return ResponseEntity.created(null).body(save.toDto());
    }
    @Operation(summary = "시간표 삭제", description = "시간표id를 통해 한시간 분량의 해당 과목 삭제함.")
    @DeleteMapping("/{userTimetableId}")
    public ResponseEntity<String> deleteTimetable(@AuthenticationPrincipal CustomUserPrincipal userPrincipal,
                                             @PathVariable Long userTimetableId){
        User user = userPrincipal.getUser();
        UserTimetable timetable = timetableService.findById(userTimetableId);
        if(timetable.getTimetableTemplate().getUser().getId() != user.getId()) return ResponseEntity.badRequest().build();
        timetableService.delete(timetable);
        return ResponseEntity.ok("시간표 삭제완료.");
    }
}
