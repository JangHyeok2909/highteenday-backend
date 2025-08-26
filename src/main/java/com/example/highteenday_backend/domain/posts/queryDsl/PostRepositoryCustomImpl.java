package com.example.highteenday_backend.domain.posts.queryDsl;


import com.example.highteenday_backend.Utils.PageUtils;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.posts.QPost;
import com.example.highteenday_backend.enums.PostSearchType;
import com.querydsl.core.BooleanBuilder;
import com.querydsl.jpa.impl.JPAQueryFactory;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.util.List;

@RequiredArgsConstructor
public class PostRepositoryCustomImpl implements PostRepositoryCustom {
    private final JPAQueryFactory queryFactory;

    @Override
    public Page<Post> searchKeywords(String keywords, PostSearchType searchType, Pageable pageable) {
        QPost post = QPost.post;

        String[] keywordArr = keywords.split(" ");
        BooleanBuilder builder = new BooleanBuilder();
        if(searchType == PostSearchType.TITLE_CONTENT){
            for(String keyword:keywordArr){
                BooleanBuilder keywordsBuilder = new BooleanBuilder();
                keywordsBuilder.or(post.title.containsIgnoreCase(keyword))
                                .or(post.content.containsIgnoreCase(keyword));
                builder.and(keywordsBuilder);
            }
        } else if(searchType == PostSearchType.CONTENT){
            for(String keyword:keywordArr){
                builder.and(post.content.containsIgnoreCase(keyword));
            }
        } else{ //기본 title로 검색
            for(String keyword:keywordArr){
                builder.and(post.title.containsIgnoreCase(keyword));
            }
        }

        List<Post> posts = queryFactory.selectFrom(post)
                        .where(builder)
                        .offset(pageable.getOffset())
                        .limit(pageable.getPageSize())
                        .fetch();

        return PageUtils.createPage(posts, pageable);
    }


}
