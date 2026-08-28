package com.example.highteenday_backend.dtos;

import com.example.highteenday_backend.domain.schools.School;
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
    private Long id;
    private Integer code;
    private String name;
    private String location;
    private String eduOfficeCode;
    private SchoolCategory category;

    public static SchoolDto fromEntity(School school) {
        return SchoolDto.builder()
                .id(school.getId())
                .code(school.getCode())
                .name(school.getName())
                .location(school.getLocation())
                .eduOfficeCode(school.getEduOfficeCode())
                .category(school.getCategory())
                .build();
    }
}
