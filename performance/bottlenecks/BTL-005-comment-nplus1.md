# BTL-005: 댓글 목록 N+1 쿼리

> 유형: N+1 / JPA / Query
> 상태: 의심
> 관련: EXP-005

## 증상

댓글이 많은 인기글일수록 `GET /api/posts/{id}/comments`가 선형으로 느려지고,
동일 RPS에서 DB `questions/s`(총 쿼리량)가 비정상적으로 높다.

## 원인

전 엔티티 `FetchType.LAZY` 원칙(CLAUDE.md) 하에서 댓글 목록 → DTO 변환 시
`comment.getUser()`, `comment.getParent()` 등 연관 접근이 댓글마다
개별 SELECT로 풀리는 패턴. 목록 경로에 `JOIN FETCH`가 적용됐는지 미검증.
익명 댓글 분기(`isAnonymous`)로 User 접근이 조건부라 테스트에서 안 드러났을 가능성.

## 영향

- 인기글(=댓글 많은 글)일수록 악화 — Zipf 접근과 정확히 역상관인 최악 조합
- 마이페이지 내 댓글, 채팅방 목록(방별 집계) 등 유사 패턴 경로에 동반 의심

## 재현 방법

```bash
# 부하 없이 확정 가능: 댓글 5개 글 vs 100개 글 각 1회 호출, p6spy 로그 쿼리 수 비교
curl -s "localhost:8080/api/posts/<id>/comments" > /dev/null
# 쿼리 수가 댓글 수에 비례하면 확정
```

관찰 지표: 요청당 쿼리 수(p6spy), `comment_list` P95,
`rate(mysql_global_status_questions[1m])` / k6 RPS 비율.

## 해결 방법

| 후보 | 효과 | 트레이드오프 |
|------|------|--------------|
| repository에 `JOIN FETCH` | 해당 경로 1쿼리화 | 페이징과 fetch join 충돌 주의 (컬렉션 fetch 시) |
| `default_batch_fetch_size=100` 전역 설정 | 전 경로 IN 배치화 — 최소 수정 최대 효과 | 쿼리가 1+N/100으로 남음 (완전 제거는 아님) |
| QueryDSL DTO 프로젝션 | 필요한 컬럼만, 엔티티 로드 자체 제거 | 코드량 증가 |
