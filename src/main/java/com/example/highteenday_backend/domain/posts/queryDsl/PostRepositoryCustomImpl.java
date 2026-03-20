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
    public Page<Post> searchKeywordsAll(String keywords, PostSearchType searchType, Pageable pageable) {
        QPost post = QPost.post;

        String safeKeywords = keywords == null ? "" : keywords.trim();
        String[] keywordArr = safeKeywords.isEmpty() ? new String[0] : safeKeywords.split("\\s+");
        BooleanBuilder builder = new BooleanBuilder();
        if(searchType == PostSearchType.TITLE_CONTENT){ //제목+본문
            for(String keyword:keywordArr){
                if (keyword == null || keyword.isBlank()) continue;
                BooleanBuilder keywordsBuilder = new BooleanBuilder();
                keywordsBuilder.or(post.title.containsIgnoreCase(keyword))
                                .or(post.content.containsIgnoreCase(keyword));
                builder.and(keywordsBuilder);
            }
        } else if(searchType == PostSearchType.CONTENT){ //본문
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
    public Page<Post> searchKeywords(Long boardId, String keywords, PostSearchType searchType, Pageable pageable) {
        return null;
    }

    @Override
    public PageResponse<PostPreviewDto> findByBoardCursor(PostListingDto dto) {
        QPost post = QPost.post;

        BooleanBuilder builder = new BooleanBuilder();
        //cursor
        if(dto.getLastSeedId()!=null) builder.and(post.id.lt(dto.getLastSeedId()));
        //boardId
        if(dto.getBoardId()!=null) builder.and(post.board.id.eq(dto.getBoardId()));
        //valid
        builder.and(post.isValid.eq(true));

        List<PostPreviewDto> content = queryFactory.select(Projections.fields(PostPreviewDto.class,
                post.id.as("id"),
                post.board.as("boardId"),
                post.nickname.as("author"),
                post.title.as("title"),
                post.viewCount.as("viewCount"),
                post.likeCount.as("likeCount"),
                post.commentCount.as("commentCount"),
                post.created.as("createdAt")
        ))
                .from(post)
                .where(builder)
                .orderBy(getOrderSec(dto.getSortType(),QPost.post))
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

    @Override
    public PageResponse<PostPreviewDto> findByBoardOffset(PostListingDto dto) {
        QPost post = QPost.post;

        BooleanBuilder builder = new BooleanBuilder();
        //boardId
        if(dto.getBoardId()!=null) builder.and(post.board.id.eq(dto.getBoardId()));
        //valid
        builder.and(post.isValid.eq(true));

        List<PostPreviewDto> content = queryFactory.select(Projections.fields(PostPreviewDto.class,
                        post.id.as("id"),
                        post.board.id.as("boardId"),
                        post.nickname.as("author"),
                        post.title.as("title"),
                        post.viewCount.as("viewCount"),
                        post.likeCount.as("likeCount"),
                        post.commentCount.as("commentCount"),
                        post.created.as("createdAt")
                ))
                .from(post)
                .where(builder)
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
