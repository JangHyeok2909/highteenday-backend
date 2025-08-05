package com.example.highteenday_backend.domain.schools.UserTimetables;

import com.example.highteenday_backend.domain.users.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.DayOfWeek;
import java.util.List;

@Repository
public interface UserTimetableRepository extends JpaRepository<UserTimetable,Long> {



}
