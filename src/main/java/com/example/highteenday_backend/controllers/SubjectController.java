package com.example.highteenday_backend.controllers;

import com.example.highteenday_backend.domain.schools.subjects.Subject;
import com.example.highteenday_backend.domain.schools.timetableTamplates.TimetableTemplate;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.RequestSubjectDto;
import com.example.highteenday_backend.dtos.SubjectDto;
import com.example.highteenday_backend.security.CustomUserPrincipal;
import com.example.highteenday_backend.services.TimetableTemplateService;
import com.example.highteenday_backend.services.domain.SubjectService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;


@Tag(name = "과목 API")
@RequiredArgsConstructor
@RequestMapping("/api/timetableTemplates/{timetableTemplatesId}/subjects")
@RestController
public class SubjectController {
    private final SubjectService subjectService;
    private final TimetableTemplateService templateService;

    @Operation(summary = "해당 시간표 템플릿에 존재하는 모든 과목 리스트 조회")
    @GetMapping
    public ResponseEntity<List<SubjectDto>> getSubjects(@AuthenticationPrincipal CustomUserPrincipal userPrincipal,
                                                        @PathVariable Long timetableTemplatesId){
        User user = userPrincipal.getUser();
        TimetableTemplate template = templateService.findById(timetableTemplatesId);
        if(user.getId() != template.getUser().getId()) return ResponseEntity.badRequest().build();
        List<Subject> subjects = template.getSubjects();
        List<SubjectDto> subjectDtos = new ArrayList<>();
        for(Subject subject:subjects){
            subjectDtos.add(subject.toDto());
        }
        return ResponseEntity.ok(subjectDtos);
    }
    @Operation(summary = "과목 생성")
    @PostMapping
    public ResponseEntity<SubjectDto> addSubject(@AuthenticationPrincipal CustomUserPrincipal userPrincipal,
                                                 @PathVariable Long timetableTemplatesId,
                                                 @RequestBody RequestSubjectDto dto){
        User user = userPrincipal.getUser();
        TimetableTemplate template = templateService.findById(timetableTemplatesId);
        if(user.getId() != template.getUser().getId()) return ResponseEntity.badRequest().build();
        Subject subject = Subject.builder()
                .subjectName(dto.getSubjectName())
                .timetableTemplate(template)
                .build();
        Subject save = subjectService.save(subject);
        return ResponseEntity.ok(save.toDto());
    }
    @Operation(summary = "과목명 수정")
    @PutMapping("/{subjectId}")
    public ResponseEntity<SubjectDto> updateSubject(@AuthenticationPrincipal CustomUserPrincipal userPrincipal,
                                                    @PathVariable Long subjectId,
                                                    @RequestBody RequestSubjectDto dto
                                                    ){
        User user = userPrincipal.getUser();
        Subject subject = subjectService.findById(subjectId);
        Long ownerId = subject.getTimetableTemplate().getUser().getId();
        if(user.getId() != ownerId) return ResponseEntity.badRequest().build();
        Subject updatedSubject = subjectService.update(subject, dto);
        return ResponseEntity.ok(updatedSubject.toDto());
    }
    @Operation(summary = "과목 삭제")
    @DeleteMapping("/{subjectId}")
    public ResponseEntity<String> deleteSubject(@AuthenticationPrincipal CustomUserPrincipal userPrincipal,
                                                @PathVariable Long subjectId){
        User user = userPrincipal.getUser();
        Subject subject = subjectService.findById(subjectId);
        Long ownerId = subject.getTimetableTemplate().getUser().getId();
        if(user.getId() != ownerId) return ResponseEntity.badRequest().build();
        subjectService.delete(subject);
        return ResponseEntity.ok("과목 삭제 완료.");
    }
}
