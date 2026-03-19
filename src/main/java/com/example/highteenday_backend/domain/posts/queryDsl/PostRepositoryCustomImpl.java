package com.example.highteenday_backend.domain.posts.queryDsl;


import com.example.highteenday_backend.domain.boards.Board;
import com.example.highteenday_backend.domain.boards.QBoard;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.posts.QPost;
import com.example.highteenday_backend.domain.users.QUser;
import com.example.highteenday_backend.dtos.BoardDto;
import com.example.highteenday_backend.dtos.PostPreviewDto;
import com.example.highteenday_backend.dtos.paged.PageResponse;
import com.example.highteenday_backend.dtos.paged.PostListingDto;
import com.example.highteenday_backend.enums.PostSearchType;
import com.example.highteenday_backend.enums.SortType;
import com.querydsl.core.BooleanBuilder;
import com.querydsl.core.types.OrderSpecifier;
import com.querydsl.core.types.Projections;
import com.querydsl.jpa.impl.JPAQueryFactory;
import org.springframework.data.domain.*;

import java.util.List;
import java.util.Optional;

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

    @Override
    public PageResponse<PostPreviewDto> findByBoard(PostListingDto dto) {
        QPost post = QPost.post;
        QUser user = QUser.user;
        QBoard board = QBoard.board;

        List<PostPreviewDto> content = queryFactory.select(Projections.constructor(PostPreviewDto.class,
                post.id,
                board.id,
                board.name,
                user.nickname,
                user.id,
                post.title,
                post.isAnonymous,
                post.viewCount,
                post.likeCount,
                post.commentCount,
                post.created,
                post.updatedDate,
                post.updatedBy.isNotNull()
        ))
                .from(post)
                .join(post.board, board)
                .join(post.user,user)
                .where(
                        post.board.id.eq(dto.getBoardId()),
                        post.isValid.eq(true)
                )
                .orderBy(getOrderSec(dto.getSortType(),QPost.post))
                .offset(dto.getPage()*dto.getSize())
                .limit(dto.getSize())
                .fetch();

        Long total = Optional.ofNullable(queryFactory
                .select(post.count())
                .from(post)
                .where(
                        post.board.id.eq(dto.getBoardId()),
                        post.isValid.eq(true)
                )
                .fetchOne()).orElse(0L);

        return new PageResponse<>(content,dto.getPage(),dto.getSize(),total);
    }

    private OrderSpecifier<?> getOrderSec(SortType sortType, QPost post){
        return switch(sortType){
            case LIKE -> post.likeCount.desc();
            case VIEW -> post.viewCount.desc();
            default -> post.id.desc();
        };
    }
}
