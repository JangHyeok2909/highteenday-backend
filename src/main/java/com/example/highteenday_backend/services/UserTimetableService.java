package com.example.highteenday_backend.services;

import com.example.highteenday_backend.domain.schools.UserTimetables.UserTimetable;
import com.example.highteenday_backend.domain.schools.UserTimetables.UserTimetableRepository;
import com.example.highteenday_backend.domain.schools.subjects.Subject;
import com.example.highteenday_backend.domain.schools.timetableTamplates.TimetableTemplate;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.RequestTimetableDto;
import com.example.highteenday_backend.exceptions.ResourceNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.util.List;

@RequiredArgsConstructor
@Service
public class UserTimetableService {
    private final UserTimetableRepository timetableRepository;

    public UserTimetable findById(Long timetableId){
        return timetableRepository.findById(timetableId)
                .orElseThrow(()->new ResourceNotFoundException("timetable does not exist, timetableId="+timetableId));
    }

    @Transactional
    public UserTimetable save(TimetableTemplate template,Subject subject, RequestTimetableDto dto){
        UserTimetable timetable = UserTimetable.builder()
                .subject(subject)
                .timetableTemplate(template)
                .day(dto.getDay())
                .period(dto.getPeriod())
                .build();
        return timetableRepository.save(timetable);
    }
    @Transactional
    public void delete(UserTimetable timetable){
        timetableRepository.delete(timetable);
    }
}
