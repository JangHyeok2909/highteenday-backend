package com.example.highteenday_backend.domain.notification;

import com.example.highteenday_backend.domain.users.User;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;


@Repository
public interface NotificationRepository extends JpaRepository<Notification, Long> {

    Page<Notification> findByReceiverAndIsValidTrueOrderByIsReadAscCreatedDesc(User receiver, Pageable pageable);

    long countByReceiverAndIsValidTrueAndIsReadFalse(User receiver);

    @Modifying
    @Query("UPDATE Notification n SET n.isRead = true WHERE n.receiver = :user AND n.isRead = false AND n.isValid = true")
    void markAllAsReadByReceiver(@Param("user") User user);

    @Modifying
    @Query("UPDATE Notification n SET n.isValid = false WHERE n.receiver = :user AND n.isRead = true AND n.isValid = true")
    void softDeleteReadByReceiver(@Param("user") User user);
}
