package com.example.highteenday_backend.domain.posts;

import com.example.highteenday_backend.domain.base.BaseEntity;
import com.example.highteenday_backend.domain.users.User;
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
        name = "posts_reactions",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_posts_reactions_pst_usr",
                columnNames = {"PST_id", "USR_id"}
        )
)
@Entity
public class PostReaction extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "PST_RCT_id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "USR_id", nullable = false, foreignKey = @ForeignKey(name = "fk_posts_reactions_usr"))
    private User user;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "PST_id", nullable = false, foreignKey = @ForeignKey(name = "fk_posts_reactions_pst"))
    private Post post;

    @Enumerated(EnumType.STRING)
    @Column(name = "PST_RCT_kind", nullable = false, length = 16)
    private PostReactionKind kind;

    public void applyState(PostReactionKind kind) {
        this.kind = kind;
        this.isValid = true;
    }

    public void cancel() {
        this.isValid = false;
    }
}
