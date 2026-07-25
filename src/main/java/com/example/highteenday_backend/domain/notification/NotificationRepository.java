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

    /**
     * 알림 목록. NotificationDto가 발신자 닉네임/프로필을 즉시 사용하므로 함께 로딩한다.
     * 시스템 알림은 sender가 없으므로 left join이어야 한다.
     */
    @Query(value = """
            select n from Notification n
            left join fetch n.sender
            where n.receiver = :receiver and n.isValid = true
            order by n.isRead asc, n.created desc
            """,
            countQuery = """
            select count(n) from Notification n
            where n.receiver = :receiver and n.isValid = true
            """)
    Page<Notification> findPageByReceiver(@Param("receiver") User receiver, Pageable pageable);

    long countByReceiverAndIsValidTrueAndIsReadFalse(User receiver);

    @Modifying
    @Query("UPDATE Notification n SET n.isRead = true WHERE n.receiver = :user AND n.isRead = false AND n.isValid = true")
    void markAllAsReadByReceiver(@Param("user") User user);

    @Modifying
    @Query("UPDATE Notification n SET n.isValid = false WHERE n.receiver = :user AND n.isRead = true AND n.isValid = true")
    void softDeleteReadByReceiver(@Param("user") User user);
}
