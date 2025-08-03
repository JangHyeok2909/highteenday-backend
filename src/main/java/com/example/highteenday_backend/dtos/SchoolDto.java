package com.example.highteenday_backend.dtos;

import com.example.highteenday_backend.enums.SchoolCategory;
import jakarta.persistence.Column;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;


@Builder
@Data
@NoArgsConstructor
@AllArgsConstructor
public class SchoolDto {
    private Integer code;
    private String name;
    private String location;
    private String eduOfficeCode;
    private SchoolCategory category;
}
