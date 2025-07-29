package com.example.highteenday_backend.controllers;

import com.example.highteenday_backend.domain.schools.UserTimetable;
import com.example.highteenday_backend.domain.schools.UserTimetableRepository;
import com.example.highteenday_backend.domain.users.User;
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
@RequestMapping("/api/userTimetables")
@RestController
public class UserTimetableController {
    private final UserTimetableRepository timetableRepository;

    @GetMapping
    private ResponseEntity<?> getUserTimetables(@AuthenticationPrincipal CustomUserPrincipal userPrincipal){
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
