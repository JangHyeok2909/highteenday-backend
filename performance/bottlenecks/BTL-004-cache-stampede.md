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

## 해결 방법

| 후보 | 대상 | 트레이드오프 |
|------|------|--------------|
| 미스 시 분산락(SETNX) — 1개만 DB 조회 | 스탬피드 | 락 대기 지연 소폭, 구현 복잡도 |
| TTL jitter (기본 TTL ± 랜덤 10~20%) | 애벌랜치 | 없음에 가까움 — 가장 먼저 적용 |
| 논리 만료(soft TTL) + 백그라운드 갱신 | 스탬피드 | 짧은 시간 낡은 데이터 노출 |
| null 캐싱 (짧은 TTL) | 페네트레이션 | 삭제 직후 잠깐 "없음" 캐시됨 |
| 기동 시 캐시 워밍 | 콜드 스타트 | 배포 파이프라인에 단계 추가 |
