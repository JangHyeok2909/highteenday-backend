package com.example.highteenday_backend.controllers;


import com.example.highteenday_backend.domain.schools.timetableTamplates.TimetableTemplate;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.RequestTimetableTemplateDto;
import com.example.highteenday_backend.dtos.TimetableTemplateDto;
import com.example.highteenday_backend.security.CustomUserPrincipal;
import com.example.highteenday_backend.services.TimetableTemplateService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;

@Tag(name="시간표 템플릿 API")
@RequiredArgsConstructor
@RestController
@RequestMapping("/api/timetableTemplates")
public class TimetableTemplateController {
    private final TimetableTemplateService templateService;

    @Operation(summary = "유저의 시간표 템플릿 리스트 가져오기")
    @GetMapping
    public ResponseEntity<List<TimetableTemplateDto>> getTimetableTemplates(@AuthenticationPrincipal CustomUserPrincipal userPrincipal){
        User user = userPrincipal.getUser();
        List<TimetableTemplate> templates = templateService.findByUser(user);
        List<TimetableTemplateDto> templateDtos = new ArrayList<>();
        for(TimetableTemplate template : templates){
            templateDtos.add(template.toDto());
        }
        return ResponseEntity.ok(templateDtos);
    }
    @Operation(summary = "시간표 템플릿 생성")
    @PostMapping
    public ResponseEntity<TimetableTemplateDto> createTimetableTemplate(@AuthenticationPrincipal CustomUserPrincipal userPrincipal,
                                                                        @RequestBody RequestTimetableTemplateDto dto){


        User user = userPrincipal.getUser();
        TimetableTemplate template = TimetableTemplate.builder()
                .user(user)
                .templateName(dto.getTemplateName())
                .grade(dto.getGrade())
                .semester(dto.getSemester())
                .isDefault(dto.isDefault())
                .build();

        TimetableTemplate save = templateService.save(template);
        return ResponseEntity.created(null).body(save.toDto());
    }
    @Operation(summary = "시간표 템플릿 수정", description = "바꿀값만 할당하여 전달, 바꾸지 않을 값은 null 전달.")
    @PutMapping("/{timetableTemplateId}")
    public ResponseEntity<TimetableTemplateDto> updateTimetableTemplate(
            @AuthenticationPrincipal CustomUserPrincipal userPrincipal,
            @RequestBody RequestTimetableTemplateDto dto,
            @PathVariable Long timetableTemplateId
    ){
        User user = userPrincipal.getUser();
        TimetableTemplate template = templateService.findById(timetableTemplateId);
        if(template.getUser().getId() == user.getId()){
            TimetableTemplate updatedTemplate = templateService.update(template, dto);
            return ResponseEntity.ok(updatedTemplate.toDto());
        } else{
            return ResponseEntity.badRequest().build();
        }
    }
    @Operation(summary = "시간표 템플릿 삭제")
    @DeleteMapping("/{timetableTemplateId}")
    public ResponseEntity<String> deleteTimetableTemplate(
            @AuthenticationPrincipal CustomUserPrincipal userPrincipal,
            @PathVariable Long timetableTemplateId
    ){
        User user = userPrincipal.getUser();
        TimetableTemplate template = templateService.findById(timetableTemplateId);
        if(template.getUser().getId() == user.getId()){
            templateService.delete(template);
            return ResponseEntity.ok("시간표 템플릿 삭제 완료.");
        } else{
            return ResponseEntity.badRequest().build();
        }
    }
}
