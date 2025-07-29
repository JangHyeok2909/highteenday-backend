package com.example.highteenday_backend.controllers;

import com.example.highteenday_backend.domain.schools.UserTimetables.UserTimetable;
import com.example.highteenday_backend.domain.schools.subjects.Subject;
import com.example.highteenday_backend.domain.schools.timetableTamplates.TimetableTemplate;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.RequestSubjectDto;
import com.example.highteenday_backend.dtos.SubjectDto;
import com.example.highteenday_backend.security.CustomUserPrincipal;
import com.example.highteenday_backend.services.TimetableTemplateService;
import com.example.highteenday_backend.services.UserTimetableService;
import com.example.highteenday_backend.services.domain.SubjectService;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;


@Tag(name = "과목 API")
@RequiredArgsConstructor
@RequestMapping("/api/timetableTemplates/{timetableTemplatesId}/userTimetables/{userTimetableId}/subjects")
@RestController
public class SubjectController {
    private final SubjectService subjectService;
    private final TimetableTemplateService templateService;
    private final UserTimetableService timetableService;
    @GetMapping
    public ResponseEntity<List<SubjectDto>> getSubjects(@AuthenticationPrincipal CustomUserPrincipal userPrincipal,
                                         @PathVariable Long timetableTemplatesId){
        User user = userPrincipal.getUser();
        TimetableTemplate template = templateService.findById(timetableTemplatesId);
        if(user.getId() != template.getUser().getId()) return ResponseEntity.badRequest().build();
        List<UserTimetable> timetables = template.getTimetables();
        List<SubjectDto> subjectDtos = new ArrayList<>();
        for(UserTimetable utt:timetables){
            subjectDtos.add(utt.getSubject().toDto());
        }
        return ResponseEntity.ok(subjectDtos);
    }
    @PostMapping
    public ResponseEntity<SubjectDto> addSubject(@AuthenticationPrincipal CustomUserPrincipal userPrincipal,
                                        @PathVariable Long timetableTemplatesId,
                                        @PathVariable Long userTimetableId,
                                        RequestSubjectDto dto){
        User user = userPrincipal.getUser();
        TimetableTemplate template = templateService.findById(timetableTemplatesId);
        if(user.getId() != template.getUser().getId()) return ResponseEntity.badRequest().build();
        UserTimetable timetable = timetableService.findById(userTimetableId);
        Subject subject = Subject.builder()
                .subjectName(dto.getSubjectName())
                .userTimetable(timetable)
                .build();
        Subject save = subjectService.save(subject);
        return ResponseEntity.ok(save.toDto());
    }
    @PutMapping("/{subjectId}")
    public ResponseEntity<SubjectDto> updateSubject(@AuthenticationPrincipal CustomUserPrincipal userPrincipal,
                                                    @PathVariable Long subjectId,
                                                    RequestSubjectDto dto
                                                    ){
        User user = userPrincipal.getUser();
        Subject subject = subjectService.findById(subjectId);
        Long ownerId = subject.getUserTimetable().getTimetableTemplate().getUser().getId();
        if(user.getId() != ownerId) return ResponseEntity.badRequest().build();
        if(!dto.getSubjectName().equals(subject.getSubjectName())){
            subject.updateName(dto.getSubjectName());
        }
        return ResponseEntity.ok(subject.toDto());
    }
    @DeleteMapping("/{subjectId}")
    public ResponseEntity<String> deleteSubject(@AuthenticationPrincipal CustomUserPrincipal userPrincipal,
                                                @PathVariable Long subjectId){
        User user = userPrincipal.getUser();
        Subject subject = subjectService.findById(subjectId);
        Long ownerId = subject.getUserTimetable().getTimetableTemplate().getUser().getId();
        if(user.getId() != ownerId) return ResponseEntity.badRequest().build();
        subjectService.delete(subject);
        return ResponseEntity.ok("과목 삭제 완료.");
    }
}
