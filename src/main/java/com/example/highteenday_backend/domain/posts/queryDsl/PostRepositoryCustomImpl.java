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
import com.querydsl.core.types.dsl.ComparableExpressionBase;
import com.querydsl.jpa.impl.JPAQuery;
import com.querydsl.jpa.impl.JPAQueryFactory;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.*;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;


@RequiredArgsConstructor
public class PostRepositoryCustomImpl implements PostRepositoryCustom {
    private final JPAQueryFactory queryFactory;


    @Override
    public Page<Post> searchKeywordsAll(String keywords, PostSearchType searchType, Pageable pageable) {
        return searchPage(null, keywords, searchType, pageable);
    }

    @Override
    public Page<Post> searchKeywords(Long boardId, String keywords, PostSearchType searchType, Pageable pageable) {
        return searchPage(boardId, keywords, searchType, pageable);
    }

    /** boardId 가 null 이면 전체 게시판, 아니면 해당 게시판으로 한정한다. */
    private Page<Post> searchPage(Long boardId, String keywords, PostSearchType searchType, Pageable pageable) {
        QPost post = QPost.post;

        String safeKeywords = keywords == null ? "" : keywords.trim();
        String[] keywordArr = safeKeywords.isEmpty() ? new String[0] : safeKeywords.split("\\s+");
        BooleanBuilder builder = new BooleanBuilder();
        builder.and(post.isValid.eq(true));
        if (boardId != null) builder.and(post.board.id.eq(boardId));
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
                        .orderBy(toOrderSpecifiers(pageable.getSort(), post))
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

    /**
     * Pageable 의 Sort 를 QPost 경로로 옮긴다. 인식하지 못하는 속성명은 무시한다.
     * 마지막에 유일 키인 id 를 덧붙여야 정렬 키가 같은 글들 사이의 순서까지 고정되어
     * OFFSET 페이징에서 중복·누락이 생기지 않는다.
     */
    private OrderSpecifier<?>[] toOrderSpecifiers(Sort sort, QPost post) {
        List<OrderSpecifier<?>> specifiers = new ArrayList<>();
        for (Sort.Order order : sort) {
            ComparableExpressionBase<?> path = switch (order.getProperty()) {
                case "created", "createdAt" -> post.created;
                case "likeCount" -> post.likeCount;
                case "viewCount" -> post.viewCount;
                case "commentCount" -> post.commentCount;
                case "id" -> post.id;
                default -> null;
            };
            if (path == null) continue;
            specifiers.add(order.isAscending() ? path.asc() : path.desc());
        }
        specifiers.add(post.id.desc());
        return specifiers.toArray(new OrderSpecifier<?>[0]);
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
