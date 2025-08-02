package com.example.highteenday_backend.controllers;

import com.example.highteenday_backend.domain.schools.School;
import com.example.highteenday_backend.services.domain.SchoolService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/schools")
public class SchoolController {

    @Autowired
    private SchoolService schoolService;

    @GetMapping("/search")
    public List<School> searchSchools(@RequestParam("name") String name) {
        return schoolService.searchSchoolName(name);
    }
}
