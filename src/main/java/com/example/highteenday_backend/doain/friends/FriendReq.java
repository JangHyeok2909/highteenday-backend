package com.example.highteenday_backend.doain.friends;

import com.example.highteenday_backend.doain.base.BaseEntity;
import com.example.highteenday_backend.doain.users.User;
import com.example.highteenday_backend.enums.FriendRequestStatus;
import jakarta.persistence.*;
import lombok.*;

@Builder
@Getter
@AllArgsConstructor
@NoArgsConstructor
@Table(name= "friends_requests")
@Entity
public class FriendReq extends BaseEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "FRD_REQ_id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "USR_req_id", nullable = false)
    private User requester; // 요청자

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "USR_rec_id", nullable = false)
    private User receiver; // 수신자

    @Enumerated(EnumType.STRING)
    @Column(name = "FRD_REQ_status", nullable = false)
    private FriendRequestStatus status;
}
