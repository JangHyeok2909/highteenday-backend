package com.example.highteenday_backend.dtos;

import lombok.AllArgsConstructor;
import lombok.Data;


@Data
@AllArgsConstructor
public class PostConsistencyResponse {

    private Long postId;

    // posts 테이블 (비정규화 값)
    private int likeCount;
    private int dislikeCount;

    // 실제 reactions COUNT
    private int likeActual;
    private int dislikeActual;

    // 정합성 여부
    private boolean drift;
}