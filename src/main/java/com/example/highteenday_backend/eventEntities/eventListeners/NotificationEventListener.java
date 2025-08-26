package com.example.highteenday_backend.eventEntities.eventListeners;

import com.example.highteenday_backend.domain.notification.NotificationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class NotificationEventListener {
    private NotificationRepository notificationRepository;

}
