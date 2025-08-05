package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.schools.School;
import com.example.highteenday_backend.domain.schools.SchoolRepository;
import com.example.highteenday_backend.exceptions.ResourceNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;

@RequiredArgsConstructor
@Service
public class SchoolService {
    private final SchoolRepository schoolRepository;


    public School findById(Long schoolId){
        return schoolRepository.findById(schoolId)
                .orElseThrow(()->new ResourceNotFoundException("school does not exist, schoolId="+schoolId));
    }


    public List<School> searchSchoolName(String schoolName) {
        return schoolRepository.findByNameContaining(schoolName);
    }


}
