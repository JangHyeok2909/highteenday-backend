package com.example.highteenday_backend.services.domain;


import com.example.highteenday_backend.domain.schools.subjects.Subject;
import com.example.highteenday_backend.domain.schools.subjects.SubjectRepository;
import com.example.highteenday_backend.exceptions.ResourceNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@RequiredArgsConstructor
@Service
public class SubjectService {
    private final SubjectRepository subjectRepository;

    public Subject findById(Long subjectId){
        return subjectRepository.findById(subjectId)
                    .orElseThrow(()->new ResourceNotFoundException("subject does not exist, subjectId="+subjectId));
    }
    @Transactional
    public Subject save(Subject subject){
        return subjectRepository.save(subject);
    }
    @Transactional
    public void delete(Subject subject){
        subjectRepository.delete(subject);
    }
    @Transactional
    public Subject update(Subject subject){
        return subjectRepository.save(subject);
    }

}
