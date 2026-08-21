# EXP-004: 캐시 기여도 정량화 — Cold Start vs Cache Warm

> 상태: 계획
> 날짜: | 담당: | 관련: BTL-004 (cache stampede)

## 1. 목적

Redis 캐시 계층(게시판/게시글 목록/HOT 랭킹)이 실제로 얼마나 기여하는지,
그리고 콜드 상태에서 **캐시 미스 폭풍이 DB를 압사시키는지** 확인한다.

## 2. 가설

> **H1**: 웜 캐시의 읽기 P95는 콜드 대비 60% 이상 낮을 것이다.
> **H2**: 콜드 스타트 첫 1분간 동일 키(게시판 목록, HOT)에 대한 동시 미스가
> DB 동일 쿼리 폭주(thundering herd)로 나타날 것이다 —
> `events_statements_summary_by_digest`에서 해당 쿼리 COUNT_STAR 급증으로 검증.

- 반증 조건: H1 — 차이가 30% 미만이면 캐시 무용(또는 히트율 문제) → 별도 분석.

## 3. 배경

Redis 캐시: board/post 목록, HOT 랭킹(Sorted Set), 조회수 버퍼.
캐시 무효화는 쓰기 시(write-through invalidate). 스탬피드 보호(락/이중 TTL)는 없어 보임 → 검증 대상.

## 4. 테스트 환경

| 항목 | 값 |
|------|-----|
| 데이터셋 | medium |
| 캐시 상태 | **실험 자체가 cold/warm 비교** — 절차 엄수 |

## 5. 시나리오 / 실행 방법

```bash
# COLD: 반드시 순서대로
docker exec perf-redis redis-cli FLUSHALL && docker restart perf-app
sleep 30   # 앱 기동 대기 (healthcheck 확인)
node tools/perf-run.js scenarios/cold-start.js --dataset medium --loadgen docker

# WARM: 워밍업 내장 시나리오
node tools/perf-run.js scenarios/cache-warm.js --dataset medium --loadgen docker
```

## 6. 측정 지표

| 역할 | 지표 | 판정 기준 |
|------|------|-----------|
| 1차 | 읽기 P95: cold(전반 5분) vs warm(measurement 페이즈) | 60% 이상 개선 |
| 1차 | redis hit ratio 시간 곡선 | cold에서 0→0.9 도달 시간 |
| 보조 | mysql threads_running, 특정 쿼리 COUNT_STAR (digest) | 스탬피드 검증 |

## 7~8. 결과 / 그래프

(기입 — cold/warm P95를 같은 축에 겹치기, hit ratio 상승 곡선)

## 9. 병목 분석

(스탬피드 확인 시: 몇 개의 동시 미스가 같은 쿼리를 중복 실행했는지 수치화)

## 10. 개선

후보:
1. 캐시 워밍 엔드포인트/기동 훅 (재배포 직후 주요 키 선적재)
2. 스탬피드 보호 — 캐시 미스 시 분산락 1개만 DB 조회, 나머지는 짧은 대기 후 재조회
3. TTL jitter — 동시 만료(avalanche) 방지

## 11. 재실험

| 지표 | Before | After | 변화 |
|------|--------|-------|------|
| cold 첫 1분 P95 | | | |
| cold 오류율 | | | |
| hit ratio 0.9 도달 시간 | | | |

## 12~13. 결론 / 향후 개선

(기입)
