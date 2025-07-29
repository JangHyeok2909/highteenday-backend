package com.example.highteenday_backend.domain.schools.UserTimetables;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface UserTimetableRepository extends JpaRepository<UserTimetable,Long> {

}
