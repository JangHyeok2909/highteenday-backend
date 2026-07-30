package com.example.highteenday_backend.services;


import com.example.highteenday_backend.domain.schools.UserTimetables.UserTimetable;
import com.example.highteenday_backend.domain.schools.subjects.Subject;
import com.example.highteenday_backend.domain.schools.timetableTamplates.TimetableTemplate;
import com.example.highteenday_backend.domain.schools.timetableTamplates.TimetableTemplateRepository;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.ImportTimetableTemplateDto;
import com.example.highteenday_backend.dtos.RequestTimetableTemplateDto;
import com.example.highteenday_backend.dtos.TimetableTemplateDetailDto;
import com.example.highteenday_backend.enums.ErrorCode;
import com.example.highteenday_backend.enums.Grade;
import com.example.highteenday_backend.enums.Semester;
import com.example.highteenday_backend.exceptions.CustomException;
import com.example.highteenday_backend.exceptions.ResourceNotFoundException;
import com.example.highteenday_backend.services.domain.FriendService;
import com.example.highteenday_backend.services.domain.SubjectService;
import com.example.highteenday_backend.services.domain.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RequiredArgsConstructor
@Service
public class TimetableTemplateService {
    private final TimetableTemplateRepository timetableTemplateRepository;
    private final SubjectService subjectService;
    private final UserTimetableService timetableService;
    private final FriendService friendService;
    private final UserService userService;

    public TimetableTemplate findById(Long templateId){
        return timetableTemplateRepository.findById(templateId)
                .orElseThrow(()->new ResourceNotFoundException("template does not exist, templateId="+templateId));
    }
    public List<TimetableTemplate> findByUser(User user){
        return timetableTemplateRepository.findByUser(user);
    }

    public TimetableTemplate getDefaultTemplate(User user){
        return timetableTemplateRepository.findByUserAndIsDefaultTrue(user)
                .orElseThrow(()-> new ResourceNotFoundException("default template is not exists."));
    }

    // 친구의 기본 시간표 조회
    @Transactional(readOnly = true)
    public TimetableTemplateDetailDto getFriendDefaultTemplate(User me, Long friendId){
        friendService.validateFriendship(me.getId(), friendId);
        User friend = userService.findById(friendId);
        TimetableTemplate template = timetableTemplateRepository.findByUserAndIsDefaultTrue(friend)
                .orElseThrow(()-> new CustomException(ErrorCode.DEFAULT_TIMETABLE_TEMPLATE_NOT_FOUND));
        return TimetableTemplateDetailDto.fromEntity(template);
    }

    // 친구의 시간표 템플릿을 과목/시간표까지 복사하여 내 템플릿으로 저장
    @Transactional
    public TimetableTemplate importTemplate(User user, ImportTimetableTemplateDto dto){
        TimetableTemplate source = timetableTemplateRepository.findById(dto.getSourceTemplateId())
                .orElseThrow(()-> new CustomException(ErrorCode.TIMETABLE_TEMPLATE_NOT_FOUND));
        Long ownerId = source.getUser().getId();
        if(!ownerId.equals(user.getId())) friendService.validateFriendship(user.getId(), ownerId);

        String templateName = dto.getTemplateName();
        TimetableTemplate copied = timetableTemplateRepository.save(TimetableTemplate.builder()
                .user(user)
                .templateName(templateName == null || templateName.isBlank() ? source.getTemplateName() : templateName)
                .grade(source.getGrade())
                .semester(source.getSemester())
                .isDefault(false)
                .build());

        Map<Long, Subject> copiedSubjects = new HashMap<>();
        for(Subject subject : source.getSubjects()){
            copiedSubjects.put(subject.getId(), subjectService.save(Subject.builder()
                    .subjectName(subject.getSubjectName())
                    .hoursPerWeek(subject.getHoursPerWeek())
                    .timetableTemplate(copied)
                    .build()));
        }
        for(UserTimetable timetable : source.getTimetables()){
            timetableService.save(UserTimetable.builder()
                    .subject(copiedSubjects.get(timetable.getSubject().getId()))
                    .timetableTemplate(copied)
                    .day(timetable.getDay())
                    .period(timetable.getPeriod())
                    .build());
        }

        if(dto.isDefault()) selectDefaultTemplate(user, copied);
        return copied;
    }
    @Transactional
    public TimetableTemplate save(TimetableTemplate template){
        if(template.isDefault()) selectDefaultTemplate(template.getUser(),template);
        return timetableTemplateRepository.save(template);
    }
    @Transactional
    public TimetableTemplate update(TimetableTemplate template,RequestTimetableTemplateDto dto){
        String changedName = dto.getTemplateName();
        Grade changedGrade = dto.getGrade();
        Semester changedSemester = dto.getSemester();
        boolean changedDefault = dto.isDefault();
        if(changedName !=null||!changedName.isEmpty()) template.updateTemplateName(changedName);
        if(changedGrade !=null) template.updateGrade(changedGrade);
        if(changedSemester !=null) template.updateSemester(changedSemester);
        if(changedDefault==true) selectDefaultTemplate(template.getUser(),template);
        return template;
    }
    @Transactional
    public void delete(TimetableTemplate template){
        timetableTemplateRepository.delete(template);
    }

    @Transactional
    public void selectDefaultTemplate(User user, TimetableTemplate template){
        List<TimetableTemplate> templates = timetableTemplateRepository.findByUser(user);
        for(TimetableTemplate t: templates){
            t.updateDefault(false);
        }
        template.updateDefault(true);
        timetableTemplateRepository.saveAll(templates);
    }
}
