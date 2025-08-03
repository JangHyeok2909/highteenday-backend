package com.example.highteenday_backend.domain.schools.timetableTamplates;


import com.example.highteenday_backend.domain.users.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface TimetableTemplateRepository extends JpaRepository<TimetableTemplate,Long> {
    List<TimetableTemplate> findByUser(User user);
    Optional<TimetableTemplate> findByUserAndIsDefaultTrue(User user);
}
