package com.example.highteenday_backend.domain.posts.queryDsl;

import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.posts.PostLike;
import com.example.highteenday_backend.domain.posts.QPostLike;
import com.example.highteenday_backend.domain.users.User;
import com.querydsl.core.BooleanBuilder;
import com.querydsl.jpa.impl.JPAQueryFactory;
import lombok.RequiredArgsConstructor;

import java.util.List;
import java.util.Optional;


@RequiredArgsConstructor
public class PostLikeRepositoryCustomImpl implements PostLikeRepositoryCustom{
    private final JPAQueryFactory queryFactory;
    @Override
    public Optional<PostLike> findByPostAndUser(Post post, User user, Boolean isValid) {
        QPostLike postLike = QPostLike.postLike;
        BooleanBuilder builder = new BooleanBuilder();

        builder.and(postLike.post.eq(post));
        builder.and(postLike.user.eq(user));
        if(isValid != null) builder.and(postLike.isValid.eq(isValid));

        Optional<PostLike> result = Optional.ofNullable(queryFactory.selectFrom(postLike).where(builder).fetchOne());
        return result;
    }
}
