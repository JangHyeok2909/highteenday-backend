package com.example.highteenday_backend.domain.chat;

import com.example.highteenday_backend.domain.base.BaseEntity;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.enums.ChatRole;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Builder
@Getter
@AllArgsConstructor
@NoArgsConstructor
@Table(
        name = "chat_participants",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_chat_participants_room_usr",
                columnNames = {"CHT_RM_id", "USR_id"}
        ),
        indexes = @Index(name = "idx_chat_participants_usr", columnList = "USR_id, is_valid")
)
@Entity
public class ChatParticipants extends BaseEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "CHT_PT_id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "USR_id", nullable = false, foreignKey = @ForeignKey(name = "fk_chat_participants_usr"))
    private User user;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "CHT_RM_id", nullable = false, foreignKey = @ForeignKey(name = "fk_chat_participants_cht_rm"))
    private ChatRoom chatRoom;

    @Enumerated(EnumType.STRING)
    @Column(name = "CHT_PT_role", length = 20, nullable = false)
    private ChatRole role;

    // 마지막으로 읽은 메시지 ID. 안읽음 수는 이 값보다 큰 메시지 수로 계산한다.
    @Column(name = "CHT_PT_last_read_msg_id")
    private Long lastReadMsgId;

    @Column(name = "CHT_PT_last_read_date")
    private LocalDateTime lastReadDate;

    // 입장 시각. 이 시각 이전 메시지는 보이지 않고, 안읽음 집계에도 잡히지 않는다.
    // 재입장 시 갱신되므로 나갔다 들어온 사이의 대화는 노출되지 않는다.
    @Column(name = "CHT_PT_joined_at", nullable = false)
    private LocalDateTime joinedAt;

    // 입장 시점의 마지막 메시지 ID. 이전 대화를 가리는 하한선.
    @Column(name = "CHT_PT_joined_msg_id")
    private Long joinedMsgId;

    @Column(name = "CHT_PT_notify", nullable = false)
    private boolean notificationEnabled;

    // 단조 증가. 지연 도착한 오래된 읽음 요청이 상태를 되돌리지 않는다.
    public void updateLastReadMsgId(Long msgId) {
        if (msgId == null) return;
        if (this.lastReadMsgId == null || msgId > this.lastReadMsgId) {
            this.lastReadMsgId = msgId;
            this.lastReadDate = LocalDateTime.now();
        }
    }

    public void changeRole(ChatRole role) {
        this.role = role;
    }

    public void updateNotification(boolean enabled) {
        this.notificationEnabled = enabled;
    }

    // 나갔던 방 재입장 (soft delete 복구). 이전 대화는 가린다.
    public void rejoin(LocalDateTime now, Long lastMsgId) {
        this.isValid = true;
        this.joinedAt = now;
        this.joinedMsgId = lastMsgId;
        this.lastReadMsgId = lastMsgId;
        this.lastReadDate = now;
        this.role = ChatRole.MEMBER;
    }
}
