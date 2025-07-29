package com.example.highteenday_backend.services;

import com.example.highteenday_backend.domain.schools.UserTimetables.UserTimetable;
import com.example.highteenday_backend.domain.schools.UserTimetables.UserTimetableRepository;
import com.example.highteenday_backend.exceptions.ResourceNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@RequiredArgsConstructor
@Service
public class UserTimetableService {
    private final UserTimetableRepository timetableRepository;

    public UserTimetable findById(Long timetableId){
        return timetableRepository.findById(timetableId)
                .orElseThrow(()->new ResourceNotFoundException("timetable does not exist, timetableId="+timetableId));
    }
    @Transactional
    public UserTimetable save(UserTimetable timetable){
        return timetableRepository.save(timetable);
    }
    @Transactional
    public void delete(UserTimetable timetable){
        timetableRepository.delete(timetable);
    }
}
