# ADR-002. 조회수는 Redis에 버퍼링 후 배치로 DB에 반영한다

상태: 소급 채록 (결정 당시 기록이 아니라 README·코드에서 재구성) — 마지막 검증일: 2026-09-07

## 배경

조회수를 조회 요청마다 DB UPDATE로 반영하면 인기 게시글 한 행에 쓰기 부하가 집중된다 (README "게시글 조회" 섹션). 조회는 서비스에서 가장 빈번한 쓰기 유발 행위이므로, 요청 경로에서 DB 쓰기를 제거할 필요가 있었다.

## 검토한 대안

`[미확인: 대안 비교 기록이 저장소에 없다 — 아래는 일반적 선택지로, 실제 검토 여부는 알 수 없음]`

- 요청마다 DB UPDATE: 구현 단순하나 핫 row 경합.
- DB 배치 누적(별도 카운트 테이블): 조회 경로가 여전히 DB 쓰기.
- Redis 버퍼 + 주기 flush: 조회 경로는 Redis 연산 2회로 끝나고 DB 쓰기는 60초에 1회로 응집 — 채택.

## 결정

Redis를 쓰기 버퍼로 사용한다. 요청 경로: `viewed:{postId}:{userId}` SETNX(1시간 TTL)로 중복 조회를 걸러낸 뒤 `post:views:{postId}` INCR. 반영 경로: 스케줄러가 60초 주기로 버퍼를 읽어(`peek`) 게시글별 트랜잭션으로 `Post.addViewCount()` UPDATE하고, 반영에 성공한 만큼만 `DECRBY`로 차감한다(`settle`). 같은 루프에서 일간 핫스코어도 갱신한다. Port/Adapter로 분리해 도메인은 `ViewCountStorePort`만 안다.


## 결과·트레이드오프

- 얻은 것: 조회 경로에서 DB 쓰기 제거, 핫 row 경합 해소, 사용자당 1시간 중복 방지.
- 잃은 것 (코드로 확인되는 한계):
  - **유실 허용**: Redis 장애 중 조회는 집계되지 않고, 미반영 버퍼는 Redis 데이터 유실 시 사라진다 — 유실 범위 상세는 [operations/runbook.md](../operations/runbook.md) 시나리오 1과 [DATA-001](../issues/). DB 반영 실패분은 읽기 → 반영 → 성공분 차감 순서로 Redis에 남겨 재시도한다.

  - **최대 60초 지연**: DB의 조회수는 항상 버퍼만큼 과거 값이다.

  - **키 탐색은 SCAN**: `peekPendingCounts()`가 `redisTemplate.scan(...)`으로 커서 순회한다. 처음에는 KEYS를 썼고, KEYS는 전체 키 수에 비례하는 블로킹 명령이라 키가 늘면 Redis 전체를 멈출 수 있다. 2026-09-08에 SCAN으로 바꿨다 ([KI-17](../archive/legacy-docs/2026-09-11/KNOWN-ISSUES.md#ki-17-조회수-드레인이-블로킹-keys-명령-사용)). SCAN은 순회 중 생긴 키를 그 주기에 빠뜨릴 수 있고, 빠진 증가분은 다음 주기에 반영된다.
  - 삭제된 게시글의 버퍼는 sync 시 `ResourceNotFoundException`으로 건너뛰고 반영된 것으로 쳐서 정리한다 (`syncViewsToDB()`의 catch) — 남겨 두면 매 주기 같은 실패를 반복한다.


## 근거 좌표

| 근거 | 위치 |
|---|---|
| 중복 방지 + 증가 진입점 | `services/domain/redisService/ViewCountService.java · increaseViewCount()` |
| Redis 연산 (SETNX/INCR/읽기/차감) | `infrastructure/redis/RedisViewCountStore.java · tryMarkViewed() / incrementCount() / peekPendingCounts() / settleCounts()` |

| Port 인터페이스 | `domain/port/ViewCountStorePort.java` |
| 60초 배치 반영 | `schedulers/ViewCountScheduler.java · syncViewsToDB()` (`@Scheduled(fixedDelay = 60000)`) |
| DB 반영 도메인 메서드 | `domain/posts/Post.java · addViewCount()` |
| 설계 서사 | `README.md · "게시글 조회 (Redis 조회수 캐싱)"` |
