package com.example.highteenday_backend.doain.chat;

import com.example.highteenday_backend.doain.base.BaseEntity;
import com.example.highteenday_backend.doain.users.User;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Builder
@Getter
@AllArgsConstructor
@NoArgsConstructor
@Table(name= "chat_messages")
@Entity
public class ChatMsg extends BaseEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "CHT_MSG_id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "CHT_RM_id", nullable = false)
    private ChatRoom chatRoom;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "USR_id", nullable = false)
    private User sender;

    @Column(name = "CHT_MSG_content", columnDefinition = "TEXT", nullable = false)
    private String content;

    @Column(name = "CHT_MSG_img_url", columnDefinition = "TEXT")
    private String imageUrl;
}
