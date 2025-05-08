package com.example.highteenday_backend.domain.chat;

import com.example.highteenday_backend.domain.base.BaseEntity;
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
@Table(name= "chat_rooms")
@Entity
public class ChatRoom extends BaseEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "CHT_RM_id")
    private Long id;

    @Column(name = "CHT_RM_name", length = 255, nullable = false)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(name = "CHT_RM_CAT", nullable = false)
    private ChatRoomCategory category;

    @Column(name = "CHT_RM_last_msg", length = 255)
    private String lastMessage;
}
