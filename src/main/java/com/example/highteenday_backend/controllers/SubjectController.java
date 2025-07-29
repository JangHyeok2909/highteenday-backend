package com.example.highteenday_backend.controllers;

import com.example.highteenday_backend.domain.schools.Subject;
import com.example.highteenday_backend.domain.schools.SubjectRepository;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.RequestSubjectDto;
import com.example.highteenday_backend.security.CustomUserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RequiredArgsConstructor
@RequestMapping("/api/subjects")
@RestController
public class SubjectController {
    private final SubjectRepository subjectRepository;
    @GetMapping
    public ResponseEntity<?> getSubjects(@AuthenticationPrincipal CustomUserPrincipal userPrincipal){
        User user = userPrincipal.getUser();
        List<Subject> subjects = subjectRepository.findByUser(user);
        return ResponseEntity.ok(subjects);
    }
    @PostMapping
    public ResponseEntity<?> addSubject(@AuthenticationPrincipal CustomUserPrincipal userPrincipal,
                                        RequestSubjectDto dto){
        User user = userPrincipal.getUser();
        Subject subject = Subject.builder()
                .name(dto.getSubject())
                .user(user)
                .build();
        subjectRepository.save(subject);
        return ResponseEntity.ok(subject);
    }

}
