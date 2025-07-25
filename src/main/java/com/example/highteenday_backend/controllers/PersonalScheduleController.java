package com.example.highteenday_backend.controllers;

import com.example.highteenday_backend.domain.schedule.PersonalSchedule;
import com.example.highteenday_backend.dtos.PersonalScheduleRequest;
import com.example.highteenday_backend.security.CustomUserPrincipal;
import com.example.highteenday_backend.services.domain.PersonalScheduleService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/personal-schedules")
public class PersonalScheduleController {
    private final PersonalScheduleService personalScheduleService;

    @GetMapping
    public ResponseEntity<List<PersonalSchedule>> getSchedules(@AuthenticationPrincipal CustomUserPrincipal userPrincipal) {
        List<PersonalSchedule> schedules = personalScheduleService.getSchedulesByUser(userPrincipal.getId());
        return ResponseEntity.ok(schedules);
    }

    @PostMapping
    public ResponseEntity<PersonalSchedule> addSchedule(@AuthenticationPrincipal CustomUserPrincipal userPrincipal,
                                                        @RequestBody PersonalScheduleRequest request) {
        PersonalSchedule saved = personalScheduleService.addSchedule(userPrincipal.getId(), request);
        return ResponseEntity.ok(saved);
    }

    @PutMapping("/{id}/finish")
    public ResponseEntity<PersonalSchedule> finishSchedule(@PathVariable Long id,
                                                           @AuthenticationPrincipal CustomUserPrincipal userPrincipal) {
        PersonalSchedule updated = personalScheduleService.markAsFinished(userPrincipal.getId(), id);
        return ResponseEntity.ok(updated);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteSchedule(@PathVariable Long id,
                                               @AuthenticationPrincipal CustomUserPrincipal userPrincipal) {
        personalScheduleService.deleteSchedule(userPrincipal.getId(), id);
        return ResponseEntity.noContent().build();
    }
}
