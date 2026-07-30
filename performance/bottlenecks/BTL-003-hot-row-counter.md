# BTL-003: 인기글 비정규화 카운터 단일 row 락 경합

> 유형: Lock / DB
> 상태: **확정** — `datasets/seed.js`의 Zipf 편중 댓글/반응/스크랩 생성 중
> concurrency=5의 낮은 동시성에서도 실제 데드락이 재현됨(아래 로그 원문)
> 관련: EXP-003

## 증상

반응(좋아요)/댓글 API의 P99만 유독 나쁘고, 부하가 특정 인기글에 쏠린 시간대에
`innodb_row_lock_waits`가 함께 뛴다. 최악의 경우 데드락 로그.

## 원인

읽기 최적화를 위해 `Post`가 `likeCount, dislikeCount, commentCount, scrapCount`를
컬럼으로 비정규화(README/CLAUDE.md 명세). 좋아요 1건 = post row 1건 UPDATE.

트래픽은 Zipf 분포로 소수 인기글에 몰리므로, **논리적으로 분산된 쓰기가
물리적으로 같은 row 하나에 직렬화**된다. InnoDB row lock은 트랜잭션 커밋까지
유지되므로 트랜잭션 길이만큼 후속 요청이 줄을 선다.

## 영향

- write-heavy / peak-hour, 그리고 실서비스에서 "글이 터졌을 때" 정확히 재현
- 반응 API 자체 + 같은 커넥션 풀을 쓰는 다른 쓰기 경로로 2차 전파 (BTL-002와 결합 시 증폭)

## 재현 방법

```bash
# reactions.js는 Zipf(hotPost)로 이미 편중 설계됨
k6 run scripts/reactions.js -e VUS=100 -e DURATION=5m -e DATASET=medium
```

관찰 지표: `post_reaction` P99, `mysql_global_status_innodb_row_lock_waits`,
부하 중 스냅샷 `SELECT * FROM performance_schema.data_lock_waits;`

### 실측 재현 기록 (2026-07-30)

`datasets/seed.js --profile smoke`(동시성 5, VU가 아니라 단순 병렬 클라이언트 수준)로
댓글 150건 + 반응 300건 + 스크랩 40건을 50개 게시글에 Zipf 편중 생성했을 때,
**k6/VU 부하 없이 시드 스크립트 단계에서만도** 다음 데드락이 다수(comments 15건,
reactions 6건, scraps 3건 실패) 발생했다:

```
org.springframework.dao.CannotAcquireLockException: could not execute statement
[Deadlock found when trying to get lock; try restarting transaction]
[update posts set brd_id=?,pst_comment_count=?,pst_content=?,pst_dislike_count=?,
 pst_is_anonymous=?,is_valid=?,pst_like_count=?,usr_nickname=?,pst_scrap_count=?,
 pst_title=?,upt_id=?,upt_date=?,usr_id=?,pst_view_count=? where pst_id=?]
```

동시성 5라는 극히 낮은 부하에서도 재현된다는 것은, 실제 k6 부하(수십~수백 VU)에서는
이 데드락이 훨씬 더 빈번할 것이라는 강한 신호다. 원인은 Hibernate가 `Post` 엔티티
전체를 더티 체킹으로 UPDATE하기 때문에(단일 카운터 컬럼만 바꾸는 게 아니라 title,
content 등 전체 컬럼을 매번 다시 쓴다) 락 보유 시간과 충돌 표면이 더 넓어진 것으로
보인다 — `update posts set brd_id=..., pst_content=..., pst_title=..., ...` 전체
컬럼이 SET 절에 나열되는 것이 그 증거. 이는 개선 우선순위를 더 높인다: 단순 원자적
`UPDATE posts SET like_count = like_count + 1 WHERE id = ?`로 바꾸면 락 보유 시간이
크게 줄어 이 데드락 빈도도 함께 낮아질 가능성이 높다.

## 해결 방법

| 후보 | 효과 | 트레이드오프 |
|------|------|--------------|
| Redis INCR 버퍼 + 주기 flush | row 경합 소멸 (조회수와 동일 기존 패턴 재사용) | 카운트 표시 지연(초 단위), flush 실패 시 유실 대비 필요 |
| 원자 UPDATE (`SET like_count=like_count+1`) | 엔티티 로드/더티체킹 제거 → 락 보유 시간 최소화 | JPA 우회(@Modifying), 영속성 컨텍스트 정합 주의 |
| 카운터 테이블 분리 | 본문 조회와 락 분리 | 조인 or 2차 조회 추가 |
| 낙관적 락 + 재시도 | 데드락 방지 | 재시도 비용, 고경합 시 오히려 악화 |
