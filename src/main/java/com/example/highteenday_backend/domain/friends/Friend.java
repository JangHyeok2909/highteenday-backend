package com.example.highteenday_backend.domain.friends;

import com.example.highteenday_backend.domain.base.BaseEntity;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.enums.FriendStatus;
import jakarta.persistence.*;
import lombok.*;

@Builder
@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
@Table(name= "friends")
@Entity
public class Friend extends BaseEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "FRD_id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "USR_id", nullable = false)
    private User user;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "USR_frd_id", nullable = false)
    private User friend;

    @Enumerated(EnumType.STRING)
    @Column(name = "FRD_status", nullable = false)
    private FriendStatus status;
}
