package com.example.highteenday_backend.domain.notification;

import com.example.highteenday_backend.domain.base.BaseEntity;
import com.example.highteenday_backend.domain.comments.CommentLike;
import com.example.highteenday_backend.domain.friends.FriendReq;
import com.example.highteenday_backend.domain.posts.PostLike;
import com.example.highteenday_backend.domain.users.User;
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
    @JoinColumn(name = "USR_rec_id", nullable = false)
    private User receiver;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "USR_send_id")
    private User sender;

    @Enumerated(EnumType.STRING)
    @Column(name = "NT_CAT", nullable = false)
    private NotificationCategory category;

    @Column(name = "FRD_REQ_id")
    private Long friendReqId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "PST_LK_id")
    private PostLike postLike;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "CMT_LK_id")
    private CommentLike commentLike;

    @Column(name = "NT_url", length = 255)
    private String url;

    @Column(name = "NT_msg", length = 255)
    private String message;

    @Builder.Default
    @Column(name = "NT_is_read", nullable = false)
    private Boolean isRead = false;
}
