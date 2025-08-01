package com.example.highteenday_backend.services.domain;


import com.example.highteenday_backend.domain.schools.subjects.Subject;
import com.example.highteenday_backend.domain.schools.subjects.SubjectRepository;
import com.example.highteenday_backend.dtos.RequestSubjectDto;
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
    public Subject update(Subject subject, RequestSubjectDto dto){
        if(!dto.getSubjectName().equals(subject.getSubjectName())){
            subject.updateName(dto.getSubjectName());
        }
        return subject;
    }
    @Transactional
    public void updateHoursPerWeek(Subject subject,Integer changeAmount){
        subject.updateHoursPerWeek(changeAmount);
    }
    @Transactional
    public void delete(Subject subject){
        subjectRepository.delete(subject);
    }
    @Transactional
    public void deleteById(Long subjectId){
        subjectRepository.deleteById(subjectId);
    }


}
