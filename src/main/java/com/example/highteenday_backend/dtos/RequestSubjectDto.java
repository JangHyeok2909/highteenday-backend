package com.example.highteenday_backend.dtos;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

@Builder
@AllArgsConstructor
@Data
public class RequestSubjectDto {
    private String subject;
}
