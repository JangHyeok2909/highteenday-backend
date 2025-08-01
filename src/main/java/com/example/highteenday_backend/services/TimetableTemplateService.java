package com.example.highteenday_backend.services;


import com.example.highteenday_backend.domain.schools.timetableTamplates.TimetableTemplate;
import com.example.highteenday_backend.domain.schools.timetableTamplates.TimetableTemplateRepository;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.RequestTimetableTemplateDto;
import com.example.highteenday_backend.enums.Grade;
import com.example.highteenday_backend.enums.Semester;
import com.example.highteenday_backend.exceptions.ResourceNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@RequiredArgsConstructor
@Service
public class TimetableTemplateService {
    private final TimetableTemplateRepository timetableTemplateRepository;

    public TimetableTemplate findById(Long templateId){
        return timetableTemplateRepository.findById(templateId)
                .orElseThrow(()->new ResourceNotFoundException("template does not exist, templateId="+templateId));
    }
    public List<TimetableTemplate> findByUser(User user){
        return timetableTemplateRepository.findByUser(user);
    }
    @Transactional
    public TimetableTemplate save(TimetableTemplate template){
        return timetableTemplateRepository.save(template);
    }
    @Transactional
    public TimetableTemplate update(TimetableTemplate template,RequestTimetableTemplateDto dto){
        String changedName = dto.getTemplateName();
        Grade changedGrade = dto.getGrade();
        Semester changedSemester = dto.getSemester();
        if(changedName !=null||!changedName.isEmpty()) template.updateTemplateName(changedName);
        if(changedGrade !=null) template.updateGrade(changedGrade);
        if(changedSemester !=null) template.updateSemester(changedSemester);
        return template;
    }
    @Transactional
    public void delete(TimetableTemplate template){
        timetableTemplateRepository.delete(template);
    }

}
