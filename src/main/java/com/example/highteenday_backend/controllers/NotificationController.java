package com.example.highteenday_backend.controllers;

import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.NotificationDto;
import com.example.highteenday_backend.dtos.paged.PagedNotificationsDto;
import com.example.highteenday_backend.security.CustomUserPrincipal;
import com.example.highteenday_backend.services.domain.NotificationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;


@Tag(name = "알림 API", description = "알림 조회, 읽음 처리, 삭제")
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/notifications")
public class NotificationController {

    private final NotificationService notificationService;

    @Operation(summary = "알림 목록 조회", description = "미읽음 우선, 최신순 페이징")
    @GetMapping
    public ResponseEntity<PagedNotificationsDto> getNotifications(
            @AuthenticationPrincipal CustomUserPrincipal userPrincipal,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        User user = userPrincipal.getUser();
        PagedNotificationsDto dto = notificationService.getNotifications(user, page, size);
        return ResponseEntity.ok(dto);
    }

    @Operation(summary = "읽지 않은 알림 수", description = "헤더 배지 표시용")
    @GetMapping("/unread-count")
    public ResponseEntity<Long> getUnreadCount(
            @AuthenticationPrincipal CustomUserPrincipal userPrincipal) {
        User user = userPrincipal.getUser();
        long count = notificationService.getUnreadCount(user);
        return ResponseEntity.ok(count);
    }

    @Operation(summary = "알림 읽음 처리", description = "단일 알림 읽음 처리 후 네비게이션 정보 반환")
    @PatchMapping("/{id}/read")
    public ResponseEntity<NotificationDto> markAsRead(
            @AuthenticationPrincipal CustomUserPrincipal userPrincipal,
            @PathVariable Long id) {
        User user = userPrincipal.getUser();
        NotificationDto dto = notificationService.markAsRead(id, user);
        return ResponseEntity.ok(dto);
    }

    @Operation(summary = "전체 읽음 처리")
    @PatchMapping("/read-all")
    public ResponseEntity<String> markAllAsRead(
            @AuthenticationPrincipal CustomUserPrincipal userPrincipal) {
        User user = userPrincipal.getUser();
        notificationService.markAllAsRead(user);
        return ResponseEntity.ok("전체 읽음 처리 완료.");
    }

    @Operation(summary = "읽은 알림 전체 삭제")
    @DeleteMapping("/read")
    public ResponseEntity<String> deleteReadNotifications(
            @AuthenticationPrincipal CustomUserPrincipal userPrincipal) {
        notificationService.deleteReadNotifications(userPrincipal.getUser());
        return ResponseEntity.ok("읽은 알림 삭제 완료.");
    }

    @Operation(summary = "알림 삭제")
    @DeleteMapping("/{id}")
    public ResponseEntity<String> deleteNotification(
            @AuthenticationPrincipal CustomUserPrincipal userPrincipal,
            @PathVariable Long id) {
        User user = userPrincipal.getUser();
        notificationService.deleteNotification(id, user);
        return ResponseEntity.ok("알림 삭제 완료.");
    }
}
