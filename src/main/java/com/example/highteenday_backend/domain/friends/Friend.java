package com.example.highteenday_backend.domain.friends;

import com.example.highteenday_backend.domain.base.BaseEntity;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.enums.FriendStatus;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Table(name= "friends")
@Entity
public class Friend extends BaseEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "FRD_id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "USR_id", nullable = false, foreignKey = @ForeignKey(name = "fk_friends_usr"))
    private User user;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "USR_frd_id", nullable = false, foreignKey = @ForeignKey(name = "fk_friends_usr_frd"))
    private User friend;

    @Enumerated(EnumType.STRING)
    @Column(name = "FRD_status", nullable = false)
    private FriendStatus status;

    // === 정적 팩토리 ===

    public static Friend createFriendship(User user, User friend) {
        Friend f = new Friend();
        f.user = user;
        f.friend = friend;
        f.status = FriendStatus.FRIEND;
        return f;
    }

    public static Friend createBlock(User blocker, User blocked) {
        Friend f = new Friend();
        f.user = blocker;
        f.friend = blocked;
        f.status = FriendStatus.BLOCKED;
        return f;
    }

    // === 도메인 메서드 ===

    public void block() {
        this.status = FriendStatus.BLOCKED;
    }

    public void unblock() {
        this.status = FriendStatus.FRIEND;
    }

    public boolean isBlocked() {
        return this.status == FriendStatus.BLOCKED;
    }

    public boolean isFriend() {
        return this.status == FriendStatus.FRIEND;
    }

    // === Builder (테스트 호환) ===

    @Builder
    private Friend(Long id, User user, User friend, FriendStatus status) {
        this.id = id;
        this.user = user;
        this.friend = friend;
        this.status = status;
    }
}
