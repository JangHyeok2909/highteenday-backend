package com.example.highteenday_backend.dtos;


import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.enums.Grade;
import com.example.highteenday_backend.enums.Semester;
import jakarta.persistence.Column;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

@AllArgsConstructor
@Builder
@Data
public class TiimetableTemplateDto {
    private Long id;
    private String templateName;
    private Grade grade;
    private Semester semester;
}
