package com.example.highteenday_backend.dtos;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@AllArgsConstructor
@NoArgsConstructor
@Data
@Builder
public class ImportTimetableTemplateDto {
    private Long sourceTemplateId;
    private String templateName;
    @Builder.Default
    private boolean isDefault = false;
}
