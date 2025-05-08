package com.example.highteenday_backend.domain.chat;

import com.example.highteenday_backend.domain.base.BaseEntity;
import com.example.highteenday_backend.domain.users.User;
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
@Table(name= "chat_participants")
@Entity
public class ChatParticipants extends BaseEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "CHT_PT_id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "USR_id", nullable = false)
    private User user;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "CHT_RM_id", nullable = false)
    private ChatRoom chatRoom;

    @Column(name = "CHT_PT_last_read_date")
    private LocalDateTime lastReadDate;

    @Column(name = "CHT_PT_last_read_count")
    private Integer lastReadCount;
}
