package com.example.highteenday_backend.domain.chat;

import com.example.highteenday_backend.domain.base.BaseEntity;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.enums.ChatMsgType;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Builder
@Getter
@AllArgsConstructor
@NoArgsConstructor
@Table(
        name = "chat_messages",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_chat_messages_room_client",
                columnNames = {"CHT_RM_id", "CHT_MSG_client_id"}
        ),
        indexes = @Index(name = "idx_chat_messages_room_id", columnList = "CHT_RM_id, CHT_MSG_id DESC")
)
@Entity
public class ChatMsg extends BaseEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "CHT_MSG_id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "CHT_RM_id", nullable = false, foreignKey = @ForeignKey(name = "fk_chat_messages_cht_rm"))
    private ChatRoom chatRoom;

    // SYSTEM 메시지의 sender는 해당 동작을 유발한 사용자(입장/퇴장/강퇴 주체)다.
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "USR_id", nullable = false, foreignKey = @ForeignKey(name = "fk_chat_messages_usr"))
    private User sender;

    @Enumerated(EnumType.STRING)
    @Column(name = "CHT_MSG_type", length = 20, nullable = false)
    private ChatMsgType type;

    // IMAGE 타입은 본문 없이 이미지만 전송할 수 있다.
    @Column(name = "CHT_MSG_content", columnDefinition = "TEXT")
    private String content;

    @Column(name = "CHT_MSG_img_url", columnDefinition = "TEXT")
    private String imageUrl;

    // 클라이언트 발급 UUID. 재전송 멱등성 키이며 SYSTEM 메시지는 null이다.
    @Column(name = "CHT_MSG_client_id", length = 36)
    private String clientMsgId;
}
