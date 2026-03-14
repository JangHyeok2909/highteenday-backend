package com.example.highteenday_backend.domain.posts.queryDsl;


import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.posts.QPost;
import com.example.highteenday_backend.enums.PostSearchType;
import com.querydsl.core.BooleanBuilder;
import com.querydsl.jpa.impl.JPAQueryFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;

import java.util.List;

public class PostRepositoryCustomImpl implements PostRepositoryCustom {
    private final JPAQueryFactory queryFactory;

    public PostRepositoryCustomImpl(JPAQueryFactory queryFactory) {
        this.queryFactory = queryFactory;
    }

    @Override
    public Page<Post> searchKeywords(String keywords, PostSearchType searchType, Pageable pageable) {
        QPost post = QPost.post;

        String safeKeywords = keywords == null ? "" : keywords.trim();
        String[] keywordArr = safeKeywords.isEmpty() ? new String[0] : safeKeywords.split("\\s+");
        BooleanBuilder builder = new BooleanBuilder();
        if(searchType == PostSearchType.TITLE_CONTENT){
            for(String keyword:keywordArr){
                if (keyword == null || keyword.isBlank()) continue;
                BooleanBuilder keywordsBuilder = new BooleanBuilder();
                keywordsBuilder.or(post.title.containsIgnoreCase(keyword))
                                .or(post.content.containsIgnoreCase(keyword));
                builder.and(keywordsBuilder);
            }
        } else if(searchType == PostSearchType.CONTENT){
            for(String keyword:keywordArr){
                if (keyword == null || keyword.isBlank()) continue;
                builder.and(post.content.containsIgnoreCase(keyword));
            }
        } else{ //기본 title로 검색
            for(String keyword:keywordArr){
                if (keyword == null || keyword.isBlank()) continue;
                builder.and(post.title.containsIgnoreCase(keyword));
            }
        }

        List<Post> posts = queryFactory.selectFrom(post)
                        .where(builder)
                        .offset(pageable.getOffset())
                        .limit(pageable.getPageSize())
                        .fetch();

        Long total = queryFactory
                .select(post.count())
                .from(post)
                .where(builder)
                .fetchOne();

        long totalElements = total == null ? 0L : total;
        return new PageImpl<>(posts, pageable, totalElements);
    }


}
