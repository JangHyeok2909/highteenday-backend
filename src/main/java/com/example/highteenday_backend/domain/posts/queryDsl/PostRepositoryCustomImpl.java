package com.example.highteenday_backend.domain.posts.queryDsl;


import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.posts.QPost;
import com.example.highteenday_backend.dtos.PostPreviewDto;
import com.example.highteenday_backend.dtos.paged.PostListingDto;
import com.example.highteenday_backend.enums.PostSearchType;
import com.example.highteenday_backend.enums.SortType;
import com.querydsl.core.BooleanBuilder;
import com.querydsl.core.types.OrderSpecifier;
import com.querydsl.core.types.Projections;
import com.querydsl.jpa.impl.JPAQuery;
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
    public List<PostPreviewDto> findByBoard(PostListingDto dto) {
        QPost post = QPost.post;

        BooleanBuilder builder = new BooleanBuilder();

        Integer offset = dto.getPage() * dto.getSize(); // 기본값: offset 기반
        // 커서 기반: RECENT + randomPage=false + lastSeedId가 실제로 있을 때만
        if(dto.getSortType() == SortType.RECENT && !dto.isRandomPage() && dto.getLastSeedId() != null) {
            builder.and(post.id.lt(dto.getLastSeedId()));
            offset = null; // 커서 사용 시 offset 불필요
        }
        //boardId
        if(dto.getBoardId()!=null) builder.and(post.board.id.eq(dto.getBoardId()));
        //valid
        builder.and(post.isValid.eq(true));

        JPAQuery<PostPreviewDto> query = queryFactory.select(Projections.fields(PostPreviewDto.class,
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
                .orderBy(getOrderSec(dto.getSortType(), QPost.post))
                .limit(dto.getSize());

        if(offset != null) query.offset(offset);
        List<PostPreviewDto> previewDtos = query.fetch();
        return previewDtos;
    }

    @Override
    public Long countTotal(Long boardId) {
        QPost post = QPost.post;
        Long total = Optional.ofNullable(queryFactory
                .select(post.count())
                .from(post)
                .where(
                        post.board.id.eq(boardId),
                        post.isValid.eq(true)
                )
                .fetchOne()).orElse(0L);
        return total;
    }

    private OrderSpecifier<?> getOrderSec(SortType sortType, QPost post){
        return switch(sortType){
            case LIKE -> post.likeCount.desc();
            case VIEW -> post.viewCount.desc();
            default -> post.id.desc();
        };
    }
}
