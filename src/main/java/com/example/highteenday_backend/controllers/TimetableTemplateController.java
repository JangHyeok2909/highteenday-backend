package com.example.highteenday_backend.controllers;


import jakarta.validation.Valid;
import com.example.highteenday_backend.domain.schools.timetableTamplates.TimetableTemplate;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.ImportTimetableTemplateDto;
import com.example.highteenday_backend.dtos.RequestTimetableTemplateDto;
import com.example.highteenday_backend.dtos.TimetableTemplateDetailDto;
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
            templateDtos.add(TimetableTemplateDto.fromEntity(template));
        }
        return ResponseEntity.ok(templateDtos);
    }
    @Operation(summary = "시간표 템플릿 생성")
    @PostMapping
    public ResponseEntity<TimetableTemplateDto> createTimetableTemplate(@AuthenticationPrincipal CustomUserPrincipal userPrincipal,
                                                                        @Valid @RequestBody RequestTimetableTemplateDto dto){


        User user = userPrincipal.getUser();
        TimetableTemplate template = TimetableTemplate.builder()
                .user(user)
                .templateName(dto.getTemplateName())
                .grade(dto.getGrade())
                .semester(dto.getSemester())
                .isDefault(dto.isDefault())
                .build();

        TimetableTemplate save = templateService.save(template);
        return ResponseEntity.created(null).body(TimetableTemplateDto.fromEntity(save));
    }
    @Operation(summary = "친구의 기본 시간표 조회",
            description = "친구가 기본으로 설정한 시간표 템플릿을 과목/시간표까지 함께 조회. 서로 차단하지 않은 친구 관계여야 함.")
    @GetMapping("/friends/{friendId}/default")
    public ResponseEntity<TimetableTemplateDetailDto> getFriendDefaultTemplate(
            @AuthenticationPrincipal CustomUserPrincipal userPrincipal,
            @PathVariable Long friendId
    ){
        User user = userPrincipal.getUser();
        return ResponseEntity.ok(templateService.getFriendDefaultTemplate(user, friendId));
    }

    @Operation(summary = "시간표 템플릿 가져오기",
            description = "친구의 시간표 템플릿을 과목/시간표까지 복사하여 내 템플릿으로 저장. templateName 미전달 시 원본 이름 사용.")
    @PostMapping("/import")
    public ResponseEntity<TimetableTemplateDto> importTimetableTemplate(
            @AuthenticationPrincipal CustomUserPrincipal userPrincipal,
            @Valid @RequestBody ImportTimetableTemplateDto dto
    ){
        User user = userPrincipal.getUser();
        TimetableTemplate imported = templateService.importTemplate(user, dto);
        return ResponseEntity.created(null).body(TimetableTemplateDto.fromEntity(imported));
    }

    @Operation(summary = "시간표 템플릿 수정", description = "바꿀값만 할당하여 전달, 바꾸지 않을 값은 null 전달.")
    @PatchMapping("/{timetableTemplateId}")
    public ResponseEntity<TimetableTemplateDto> updateTimetableTemplate(
            @AuthenticationPrincipal CustomUserPrincipal userPrincipal,
            @Valid @RequestBody RequestTimetableTemplateDto dto,
            @PathVariable Long timetableTemplateId
    ){
        User user = userPrincipal.getUser();
        TimetableTemplate template = templateService.findById(timetableTemplateId);
        if(template.getUser().getId().equals(user.getId())){
            TimetableTemplate updatedTemplate = templateService.update(template, dto);
            return ResponseEntity.ok(TimetableTemplateDto.fromEntity(updatedTemplate));
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
        if(template.getUser().getId().equals(user.getId())){
            templateService.delete(template);
            return ResponseEntity.ok("시간표 템플릿 삭제 완료.");
        } else{
            return ResponseEntity.badRequest().build();
        }
    }
}
