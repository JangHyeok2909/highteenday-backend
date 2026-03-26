package com.example.highteenday_backend.domain.posts.queryDsl;

import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.posts.PostDislike;
import com.example.highteenday_backend.domain.posts.QPostDislike;
import com.example.highteenday_backend.domain.users.User;
import com.querydsl.core.BooleanBuilder;
import com.querydsl.jpa.impl.JPAQueryFactory;
import lombok.RequiredArgsConstructor;

import java.util.Optional;

@RequiredArgsConstructor
public class PostDislikeRepositoryCustomImpl implements PostDislikeRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    @Override
    public Optional<PostDislike> findByPostAndUser(Post post, User user, Boolean isValid) {
        QPostDislike postDislike = QPostDislike.postDislike;
        BooleanBuilder builder = new BooleanBuilder();
        builder.and(postDislike.post.eq(post));
        builder.and(postDislike.user.eq(user));
        if (isValid != null) {
            builder.and(postDislike.isValid.eq(isValid));
        }
        return Optional.ofNullable(queryFactory.selectFrom(postDislike).where(builder).fetchOne());
    }
}
