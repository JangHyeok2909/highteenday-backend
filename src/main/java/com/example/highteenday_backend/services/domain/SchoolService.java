package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.schools.School;
import com.example.highteenday_backend.domain.schools.SchoolRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class SchoolService {

    @Autowired
    private SchoolRepository schoolRepository;

    public List<School> searchSchoolName(String schoolName) {
        return schoolRepository.findByNameContaining(schoolName);
    }
}
