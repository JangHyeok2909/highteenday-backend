# EXP-005: 댓글 조회 쿼리 폭발 (N+1) 검증

> 상태: 계획
> 날짜: | 담당: | 관련: BTL-005

## 1. 목적

댓글 목록 API가 댓글 수에 비례해 쿼리를 발행하는지(N+1) 확인하고,
있다면 JOIN FETCH/배치 로딩으로 개선해 효과를 수치화한다.

## 2. 가설

> **H1**: `GET /api/posts/{id}/comments`의 응답 시간과 발행 쿼리 수는
> 댓글 수 N에 선형 비례할 것이다 (Comment→User/parent LAZY 로딩이 개별 조회로 풀림).
> 근거: 엔티티 전반이 FetchType.LAZY이고 CLAUDE.md에 "JOIN FETCH는 필요한 쿼리에만
> 적용" 원칙만 있어, 댓글 목록 경로에 적용됐는지 검증된 적 없음.

- 반증 조건: 쿼리 수가 N과 무관하게 상수(1~3개)면 기각 — 이미 최적화된 것.

## 3. 배경

p6spy가 이미 의존성에 있다(`p6spy-spring-boot-starter`) — 쿼리 수 계측에 그대로 사용.

## 4. 테스트 환경

| 항목 | 값 |
|------|-----|
| 데이터셋 | medium — Zipf 편중으로 최상위 인기글엔 댓글 수백 개 존재 |
| 캐시 상태 | warm |

## 5. 시나리오 / 실행 방법

```bash
# 1단계 (기능 검증): 단일 요청의 쿼리 수 세기 — 부하 없이
#   댓글 5개 글 vs 100개 글 각각 curl 1회 → p6spy 로그의 쿼리 수 비교
docker logs perf-app --tail 0 -f | grep -c "select" &   # 또는 spy.log 확인
curl -s "localhost:18080/api/posts/<댓글5개글>/comments" > /dev/null
curl -s "localhost:18080/api/posts/<댓글100개글>/comments" > /dev/null

# 2단계 (부하 검증): 댓글 열람 편중 부하에서 지연 분포
node tools/perf-run.js scripts/comments.js --dataset medium -e VUS=50 -e DURATION=5m --loadgen docker
```

## 6. 측정 지표

| 역할 | 지표 | 판정 기준 |
|------|------|-----------|
| 1차 | 요청당 쿼리 수 (p6spy) | 댓글 수와 무관해야 정상 |
| 1차 | comment_list P95 | 개선 후 (댓글 많은 글 기준) 50%↓ 목표 |
| 보조 | mysql questions rate — 같은 RPS에서 총 쿼리량 | N+1 해소 시 급감 |

## 7~8. 결과 / 그래프

(기입 — 댓글 수 vs 쿼리 수 산점도가 핵심 그래프)

## 9. 병목 분석

(발행된 개별 쿼리를 digest로 그룹핑 — 어떤 연관이 풀리는지 특정)

## 10. 개선

후보:
1. `JOIN FETCH` (repository 쿼리 수정) — 댓글+작성자 한 방
2. `@BatchSize` / `default_batch_fetch_size` — IN 절 배치 로딩 (전역 효과)
3. DTO 프로젝션 (QueryDSL) — 필요한 컬럼만

## 11. 재실험

| 지표 | Before | After | 변화 |
|------|--------|-------|------|
| 요청당 쿼리 수 (댓글 100개) | | | |
| comment_list P95 | | | |
| DB questions/s (동일 RPS) | | | |

## 12~13. 결론 / 향후 개선

(기입 — 같은 패턴이 의심되는 다른 경로: 채팅방 목록, 마이페이지)
