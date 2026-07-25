package com.example.highteenday_backend.domain;

import com.example.highteenday_backend.domain.comments.Comment;
import com.example.highteenday_backend.domain.posts.Post;
import org.hibernate.annotations.DynamicUpdate;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 비정규화 카운터를 들고 있는 엔티티가 부분 UPDATE로 매핑돼 있는지 검증한다.
 *
 * <p>@DynamicUpdate가 없으면 Hibernate는 엔티티가 더러워질 때 모든 컬럼을 쓴다.
 * 조회수 배치가 view_count만 바꾸려고 flush해도 함께 실려 나간 낡은 like_count /
 * comment_count 가 다른 트랜잭션의 갱신을 되돌린다.
 */
class DenormalizedCounterMappingTest {

    @Test
    @DisplayName("Post는 변경된 컬럼만 UPDATE한다")
    void postUsesDynamicUpdate() {
        assertThat(Post.class.getAnnotation(DynamicUpdate.class))
                .as("Post에 @DynamicUpdate가 없으면 조회수 배치가 좋아요/댓글 수를 덮어쓴다")
                .isNotNull();
    }

    @Test
    @DisplayName("Comment는 변경된 컬럼만 UPDATE한다")
    void commentUsesDynamicUpdate() {
        assertThat(Comment.class.getAnnotation(DynamicUpdate.class))
                .as("Comment에 @DynamicUpdate가 없으면 본문 수정이 반응 카운터를 덮어쓴다")
                .isNotNull();
    }
}
