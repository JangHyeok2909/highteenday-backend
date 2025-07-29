package com.example.highteenday_backend.domain.schools.subjects;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;


@Repository
public interface SubjectRepository extends JpaRepository<Subject,Long> {
}
