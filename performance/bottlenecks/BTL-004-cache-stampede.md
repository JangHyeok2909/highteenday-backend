# BTL-004: 캐시 스탬피드 / 애벌랜치 / 페네트레이션 무방비

> 유형: Cache / Redis / DB
> 상태: 의심
> 관련: EXP-004

## 증상

- **스탬피드**: 인기 키(게시판 목록, HOT 랭킹) 만료 순간 동시 미스 → 같은 무거운
  쿼리가 수십 개 중복 실행 → DB 스파이크 → 그 사이 모든 읽기 지연
- **애벌랜치**: 같은 TTL로 적재된 키들이 동시에 만료 → 주기적 지연 스파이크
- **페네트레이션**: 존재하지 않는 ID 반복 조회(삭제글 링크 등)는 항상 미스 → 항상 DB 도달

## 원인

캐시 적재가 "미스 → DB 조회 → SET" 단순 패턴(look-aside)으로 보이며,
분산락·이중 TTL·null 캐싱 같은 보호 장치가 코드에서 확인되지 않음.
재배포/Redis 재시작 직후에는 전체 키가 동시 미스 상태(콜드 스타트).

## 영향

- 재배포 직후 몇 분 (사용자가 몰린 시간대 배포일수록 심각)
- HOT 랭킹처럼 "모두가 같은 키"를 보는 데이터에서 최대
- Redis 장애 복구 직후 (failover 시나리오와 결합)

## 재현 방법

```bash
docker exec perf-redis redis-cli FLUSHALL && docker restart perf-app && sleep 30
k6 run scenarios/cold-start.js -e DATASET=medium
```

관찰 지표: 첫 1분의 `mysql_threads_running` 스파이크, redis hit ratio 0→상승 곡선,
`events_statements_summary_by_digest`에서 목록 쿼리 COUNT_STAR 폭증.

## 개선 전 선행 조건

공통 조건 넷은 [`README.md`의 "개선 전 공통 선행 조건"](README.md#개선-전-공통-선행-조건)에 있다.
이 병목에만 걸리는 것은 아래 넷이다.

### ① Redis 요청이 0건일 때 hit ratio가 0%로 나온다 (T-18) — 필수

이 병목의 1차 지표가 hit ratio인데, **hit ratio 0%가 두 가지 뜻을 갖는다.**

- 캐시를 조회했는데 전부 미스였다 (측정하려는 것)
- 애초에 Redis 요청이 없었다 (측정과 무관)

`cold-start` 초반이 정확히 두 번째 상황이 섞이는 구간이라, 지금 도구로는 "미스 폭풍"과
"아직 아무것도 안 물어봤다"를 구분할 수 없다. 요청 0건이면 **0%가 아니라 결측**으로
처리하는 수정이 개선 전에 들어가야 한다.

### ② cold / warm 상태가 의도대로였는지 확인할 것

`perf-run.js`가 실행 전에 캐시 상태를 재서 `cacheState`와 `cacheKeysBefore`를 남긴다
(복원이 있었든 없었든 항상 잰다). **페어 실험에서 두 실행의 이 값을 먼저 확인한다** —
`cold-start`가 warm에서 시작했으면 그 실행은 시나리오 이름과 다른 것을 잰 것이다.

프로파일을 전환하면 MySQL 볼륨만 갈아끼워지고 **Redis는 그대로 살아 있다**(E-22 부분 해결).
`bootstrap.js`나 `docker exec perf-redis redis-cli FLUSHALL`을 반드시 거친다.

### ③ `medium` 이상에서만 인기 키 편중이 재현된다

`small`은 사용자가 100명이라 한 글이 받을 수 있는 활성 반응의 상한이 100이다. 그 결과 상위
10% 집중도가 **54.4%**에 그친다(명세 기대 ~80%). 스탬피드는 "모두가 같은 키를 본다"에서
나오는 현상이므로, 편중이 평평해지면 재현되지 않는다.

### ④ cache-warm의 TPS가 비어 있으면 0으로 읽지 말 것

`cache-warm`은 warmup/measure를 두 executor로 나누고 정적 태그를 쓰므로 동적 phase 계산을
켜지 않는다. 그래서 커스텀 `phase_iterations` Counter가 증가하지 않고 builtin
`iterations{phase:X}`로 폴백한다. 둘 다 비면 **0이 아니라 `null`(미집계)로 기록된다** —
실제로 리포트에 "TPS 0.00"이라는 거짓 값이 찍힌 적이 있어 그렇게 바뀌었다.

### 함께 볼 것 — 카운트 캐시의 5분 TTL이 애벌랜치 후보다

게시판 목록의 `total`은 `RedisPostsCache.getCount()`가 **5분 TTL**로 캐시하고, 미스일 때만
`COUNT(*)`가 실행된다(`RedisPostsCache.java:151-172`). 게시판 5개의 키가 같은 시각에 적재되면
**5분마다 함께 만료된다** — 이 문서가 말하는 애벌랜치의 구체적 후보다.

이건 추론이며 확인 방법은 명확하다. `mysql.threadsRunning` max와 `redis.expiredKeys`(둘 다
이미 수집 중)를 시간축에 놓고 5분 주기가 보이는지 본다. 주기가 보이면 TTL 지터가 개선
후보에 들어간다.

## 해결 방법

| 후보 | 대상 | 트레이드오프 |
|------|------|--------------|
| 미스 시 분산락(SETNX) — 1개만 DB 조회 | 스탬피드 | 락 대기 지연 소폭, 구현 복잡도 |
| TTL jitter (기본 TTL ± 랜덤 10~20%) | 애벌랜치 | 없음에 가까움 — 가장 먼저 적용 |
| 논리 만료(soft TTL) + 백그라운드 갱신 | 스탬피드 | 짧은 시간 낡은 데이터 노출 |
| null 캐싱 (짧은 TTL) | 페네트레이션 | 삭제 직후 잠깐 "없음" 캐시됨 |
| 기동 시 캐시 워밍 | 콜드 스타트 | 배포 파이프라인에 단계 추가 |
