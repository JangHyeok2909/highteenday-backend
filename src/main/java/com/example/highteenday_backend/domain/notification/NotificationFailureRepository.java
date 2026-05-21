package com.example.highteenday_backend.domain.notification;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface NotificationFailureRepository extends JpaRepository<NotificationFailure, Long> {

    @Query("SELECT nf FROM NotificationFailure nf " +
            "WHERE nf.status = com.example.highteenday_backend.enums.NotificationFailureStatus.PENDING " +
            "AND nf.nextRetryAt <= :now " +
            "AND nf.isValid = true " +
            "ORDER BY nf.nextRetryAt ASC")
    List<NotificationFailure> findRetryable(@Param("now") LocalDateTime now, Pageable pageable);
}
