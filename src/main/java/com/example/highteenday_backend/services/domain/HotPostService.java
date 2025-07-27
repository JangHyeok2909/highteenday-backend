package com.example.highteenday_backend.services.domain;

import org.springframework.stereotype.Service;

@Service
public class HotPostService {
    /*일간,주간,월간,게시판별 실시간 핫게시글 선정
    * 일간: 하루동안 올라온 게시글 중 score 순으로 10개 선정
    * 주간: 일주일동안 올라온 게시글 중 score 순으로 10개 선정
    * 월간: 한달동안 올라온 게시글 중 score 순으로 10개 선정
    * 게시판별 실시간: 5분간격으로 score 순으로 3개 선정. limit score 설정하여 일정 점수 이상 충족해야만 선정되도록.
    * */

//    private double calculrateScore(){
//
//    }
}
