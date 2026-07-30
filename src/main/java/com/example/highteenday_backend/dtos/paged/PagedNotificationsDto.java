package com.example.highteenday_backend.dtos.paged;

import com.example.highteenday_backend.dtos.NotificationDto;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Builder
@AllArgsConstructor
@NoArgsConstructor
@Data
public class PagedNotificationsDto {
    private int page;
    private int totalPages;
    private long totalElements;
    private List<NotificationDto> notifications;
}
