package com.example.highteenday_backend.controllers;

import com.example.highteenday_backend.domain.schools.School;
import com.example.highteenday_backend.services.domain.SchoolService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;


@Tag(name = "학교 API")
@RequiredArgsConstructor
@RestController
@RequestMapping("/api/schools")
public class SchoolController {
    private final SchoolService schoolService;

    @Operation(summary = "학교 이름으로 검색")
    @GetMapping("/search")
    public ResponseEntity<List<School>> searchSchools(@RequestParam("name") String name) {
        name = name.replaceAll(" ", "");
        List<School> schools = schoolService.searchSchoolName(name);
        return ResponseEntity.ok(schools);
    }
}
