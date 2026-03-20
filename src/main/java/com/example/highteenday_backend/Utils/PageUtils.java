package com.example.highteenday_backend.Utils;

import com.example.highteenday_backend.domain.comments.Comment;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.dtos.CommentDto;
import com.example.highteenday_backend.dtos.PostPreviewDto;
import com.example.highteenday_backend.dtos.paged.PagedCommentsDto;
import com.example.highteenday_backend.dtos.paged.PagedPostsDto;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;

import java.util.ArrayList;
import java.util.List;

public class PageUtils {
    public static PagedPostsDto postsToDto(Page<Post> pagedPosts){
        List<Post> posts = pagedPosts.getContent();
        List<PostPreviewDto> postPreviewDtos =new ArrayList<>();
        for(Post p:posts){
            PostPreviewDto prevDto = PostPreviewDto.fromEntity(p);

            postPreviewDtos.add(prevDto);
        }
        PagedPostsDto pagedDto = PagedPostsDto.builder()
                .page(pagedPosts.getNumber())
                .totalPages(pagedPosts.getTotalPages())
                .totalElements(pagedPosts.getTotalElements())
                .postPreviewDtos(postPreviewDtos)
                .build();

        return pagedDto;
    }
    public static PagedCommentsDto commentsToDto(Page<Comment> pagedComments){
        List<Comment> comments = pagedComments.getContent();
        List<CommentDto> commentdtos =new ArrayList<>();
        for(Comment c:comments){
            commentdtos.add(CommentDto.fromEntity(c));
        }
        PagedCommentsDto pagedDto = PagedCommentsDto.builder()
                .page(pagedComments.getNumber())
                .totalPages(pagedComments.getTotalPages())
                .totalElements(pagedComments.getTotalElements())
                .commentDtos(commentdtos)
                .build();

        return pagedDto;
    }
//    public static PagedPostsDto postsToDto(Page<Scrap> pagedScraps){
//        List<Post> posts = pagedScraps.getContent();
//        List<PostDto> postDtos =new ArrayList<>();
//        for(Post p:posts){
//            PostDto postDto = PostDto.builder()
//                    .id(p.getId())
//                    .author(p.getUser().getNickname())
//                    .title(p.getTitle())
//                    .content(p.getContent())
//                    .viewCount(p.getViewCount())
//                    .likeCount(p.getLikeCount())
//                    .dislikeCount(p.getDislikeCount())
//                    .createdAt(p.getCreated())
//                    .build();
//
//            postDtos.add(postDto);
//        }
//        PagedPostsDto pagedDto = PagedPostsDto.builder()
//                .page(pagedScraps.getNumber())
//                .totalPages(pagedScraps.getTotalPages())
//                .totalElements(pagedScraps.getTotalElements())
//                .postDtos(postDtos)
//                .build();
//
//        return pagedDto;
//    }
    public static <T> Page<T> createPage(List<T> list, Pageable pageable) {
        // List<T>를 Page<T>로 변환
        int start = (int) pageable.getOffset();
        int end = Math.min(start + pageable.getPageSize(), list.size());
        List<T> subList = list.subList(start, end);
        return new PageImpl<>(subList, pageable, list.size());
    }
}
