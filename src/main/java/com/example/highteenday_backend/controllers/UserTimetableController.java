package com.example.highteenday_backend.controllers;

import com.example.highteenday_backend.domain.schools.UserTimetables.UserTimetable;
import com.example.highteenday_backend.domain.schools.UserTimetables.UserTimetableRepository;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.security.CustomUserPrincipal;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;


@Tag(name ="시간표 템플릿의 시간표 API")
@RequiredArgsConstructor
@RequestMapping("/api/timetableTemplates/{timetableTemplatesId}/userTimetables")
@RestController
public class UserTimetableController {
    private final UserTimetableRepository timetableRepository;

    @GetMapping
    private ResponseEntity<?> getUserTimetables(@AuthenticationPrincipal CustomUserPrincipal userPrincipal,
                                                Long timetableTemplatesId){
        User user = userPrincipal.getUser();

        List<UserTimetable> userTimetables = timetableRepository.findByUser(user);
        return ResponseEntity.ok(userTimetables);
    }

//    @PostMapping
//    private ResponseEntity<?> addTimetable(@AuthenticationPrincipal CustomUserPrincipal userPrincipal){
//        User user = userPrincipal.getUser();
//
//    }
}
