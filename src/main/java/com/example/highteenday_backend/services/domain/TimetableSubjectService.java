package com.example.highteenday_backend.services.domain;


import com.example.highteenday_backend.domain.schools.UserTimetables.UserTimetable;
import com.example.highteenday_backend.domain.schools.subjects.Subject;
import com.example.highteenday_backend.domain.schools.timetableTamplates.TimetableTemplate;
import com.example.highteenday_backend.dtos.RequestTimetableDto;
import com.example.highteenday_backend.services.UserTimetableService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;


@RequiredArgsConstructor
@Service
public class TimetableSubjectService {
    private final SubjectService subjectService;
    private final UserTimetableService timetableService;
    @Transactional
    public UserTimetable createTimetableAndIncHours(Subject subject, TimetableTemplate template, RequestTimetableDto dto){
        UserTimetable savedTimetable = timetableService.save(template, subject, dto);
        subjectService.updateHoursPerWeek(subject,1);
        return savedTimetable;
    }
    @Transactional
    public void deleteTimetableAndDecHours(UserTimetable timetable){
        if(timetable == null) return;
        Subject subject = timetable.getSubject();
        if(subject != null) subjectService.updateHoursPerWeek(subject,-1);
        timetableService.delete(timetable);
    }
}
