package com.example.highteenday_backend.domain.friends;

import com.example.highteenday_backend.domain.base.BaseEntity;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.enums.ErrorCode;
import com.example.highteenday_backend.enums.FriendRequestStatus;
import com.example.highteenday_backend.exceptions.CustomException;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Table(name= "friends_requests")
@Entity
public class FriendReq extends BaseEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "FRD_REQ_id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "USR_req_id", nullable = false, foreignKey = @ForeignKey(name = "fk_friends_requests_usr_req"))
    private User requester; // 요청자

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "USR_rec_id", nullable = false, foreignKey = @ForeignKey(name = "fk_friends_requests_usr_rec"))
    private User receiver; // 수신자

    @Enumerated(EnumType.STRING)
    @Column(name = "FRD_REQ_status", nullable = false)
    private FriendRequestStatus status;

    // === 정적 팩토리 ===

    public static FriendReq create(User requester, User receiver) {
        if (requester.getId().equals(receiver.getId())) {
            throw new CustomException(ErrorCode.INVALID_REQUEST, "자기 자신에게 친구 요청 불가");
        }
        FriendReq req = new FriendReq();
        req.requester = requester;
        req.receiver = receiver;
        req.status = FriendRequestStatus.REQUESTED;
        return req;
    }

    // === 도메인 메서드 ===

    /** 수신자 본인 확인 */
    public void validateReceiver(Long userId) {
        if (!this.receiver.getId().equals(userId)) {
            throw new CustomException(ErrorCode.NO_ACCESS);
        }
    }

    // === Builder (테스트 호환) ===

    @Builder
    private FriendReq(Long id, User requester, User receiver, FriendRequestStatus status) {
        this.id = id;
        this.requester = requester;
        this.receiver = receiver;
        this.status = status;
    }
}
