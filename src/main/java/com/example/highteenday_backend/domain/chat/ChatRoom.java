package com.example.highteenday_backend.domain.chat;

import com.example.highteenday_backend.domain.base.BaseEntity;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.enums.ChatRoomCategory;
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
        name = "chat_rooms",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_chat_rooms_pair_key",
                columnNames = "CHT_RM_pair_key"
        )
)
@Entity
public class ChatRoom extends BaseEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "CHT_RM_id")
    private Long id;

    // PRIVATE 방은 이름이 없다. 조회 시 상대방 닉네임으로 조립해서 내려준다.
    @Column(name = "CHT_RM_name", length = 255)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(name = "CHT_RM_CAT", nullable = false)
    private ChatRoomCategory category;

    // PRIVATE 방 중복 생성 방지 키: "{작은USR_id}:{큰USR_id}". GROUP은 null.
    // UNIQUE 제약이 걸려 있어 동시 요청이 겹쳐도 방이 두 개 생기지 않는다.
    @Column(name = "CHT_RM_pair_key", length = 64)
    private String pairKey;

    // GROUP 방장. PRIVATE은 null.
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "USR_owner_id", foreignKey = @ForeignKey(name = "fk_chat_rooms_usr_owner"))
    private User owner;

    @Column(name = "CHT_RM_last_msg", length = 255)
    private String lastMessage;

    public static String pairKeyOf(Long userIdA, Long userIdB) {
        long low = Math.min(userIdA, userIdB);
        long high = Math.max(userIdA, userIdB);
        return low + ":" + high;
    }

    public void updateLastMessage(String preview) {
        this.lastMessage = preview;
    }

    public void updateName(String name) {
        this.name = name;
    }

    // 방장이 나갈 때 남은 참여자에게 위임한다.
    public void changeOwner(User newOwner) {
        this.owner = newOwner;
    }
}
