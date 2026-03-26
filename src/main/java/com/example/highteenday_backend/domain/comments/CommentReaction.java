package com.example.highteenday_backend.domain.comments;

import com.example.highteenday_backend.domain.base.BaseEntity;
import com.example.highteenday_backend.domain.posts.PostReactionKind;
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
        name = "comments_reactions",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_comments_reactions_cmt_usr",
                columnNames = {"CMT_id", "USR_id"}
        )
)
@Entity
public class CommentReaction extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "CMT_RCT_id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "USR_id", nullable = false, foreignKey = @ForeignKey(name = "fk_comments_reactions_usr"))
    private User user;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "CMT_id", nullable = false, foreignKey = @ForeignKey(name = "fk_comments_reactions_cmt"))
    private Comment comment;

    @Enumerated(EnumType.STRING)
    @Column(name = "CMT_RCT_kind", nullable = false, length = 16)
    private PostReactionKind kind;

    public void applyActive(PostReactionKind kind) {
        this.kind = kind;
        this.isValid = true;
    }

    public void cancel() {
        this.isValid = false;
    }
}
