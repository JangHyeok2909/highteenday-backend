package com.example.highteenday_backend.dtos;

import lombok.Builder;

import java.util.List;

@Builder
public record ResponseMealDto(
        Long schoolId,String schoolName,List<SchoolMealDto> mealdtos
) {

}
