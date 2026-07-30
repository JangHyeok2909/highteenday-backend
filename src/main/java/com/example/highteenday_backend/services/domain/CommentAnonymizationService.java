package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.comments.Comment;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.dtos.CommentDto;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class CommentAnonymizationService {

    /**
     * Post 익명 여부와 각 Comment의 익명 여부를 기준으로
     * CommentDto 리스트에 익명 처리를 적용해 반환한다.
     *
     * 규칙:
     * - 게시글이 익명이면 글쓴이는 "익명1"(anonMap[postAuthorId]=1)로 예약
     * - 댓글이 익명이고 작성자가 글쓴이면 → "익명(글쓴이)", userId=null
     * - 댓글이 익명이고 작성자가 글쓴이 외의 경우 → 댓글 등장 순서대로 "익명N", userId=null
     * - 댓글이 익명이 아니면 실제 닉네임 유지
     */
    public List<CommentDto> anonymize(Post post, List<Comment> comments) {
        Map<Long, Integer> anonMap = new LinkedHashMap<>();
        int counter = 1;

        if (post.isAnonymous()) {
            anonMap.put(post.getUser().getId(), 1);
            counter = 2;
        }

        List<CommentDto> dtos = new ArrayList<>(comments.size());
        for (Comment comment : comments) {
            CommentDto dto = CommentDto.fromEntity(comment);

            if (comment.isAnonymous()) {
                if (comment.getUser().getId().equals(post.getUser().getId())) {
                    dto.setAuthor("익명(글쓴이)");
                    dto.setUserId(null);
                } else {
                    Long userId = comment.getUser().getId();
                    if (!anonMap.containsKey(userId)) {
                        anonMap.put(userId, counter++);
                    }
                    dto.setAuthor("익명" + anonMap.get(userId));
                    dto.setUserId(null);
                }
            }

            dtos.add(dto);
        }
        return dtos;
    }
}
