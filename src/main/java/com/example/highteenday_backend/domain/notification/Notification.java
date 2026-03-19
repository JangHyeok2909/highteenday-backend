package com.example.highteenday_backend.domain.notification;

import com.example.highteenday_backend.domain.base.BaseEntity;
import com.example.highteenday_backend.domain.comments.CommentLike;
import com.example.highteenday_backend.domain.friends.FriendReq;
import com.example.highteenday_backend.domain.posts.PostLike;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.enums.EntityType;
import com.example.highteenday_backend.enums.NotificationCategory;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Builder
@Getter
@AllArgsConstructor
@NoArgsConstructor
@Table(name= "notifications")
@Entity
public class Notification extends BaseEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "NT_id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "USR_rec_id", nullable = false, foreignKey = @ForeignKey(name = "fk_notifications_usr_rec"))
    private User receiver;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "USR_send_id", foreignKey = @ForeignKey(name = "fk_notifications_usr_send"))
    private User sender;

    @Enumerated(EnumType.STRING)
    @Column(name = "NT_CAT", nullable = false)
    private NotificationCategory category;

    private EntityType entityType;
    private Long entityId;

    @Column(name = "NT_msg", length = 255)
    private String message;

    @Column(name = "NT_content_msg", length = 255)
    private String contentMessage;

    @Builder.Default
    @Column(name = "NT_is_read", nullable = false)
    private Boolean isRead = false;
}
