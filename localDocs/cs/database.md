# DB·Redis

판정 기준과 칸 설명은 [README](README.md)에 있다.

아홉 분야 중 사례가 가장 많다. 트랜잭션·락·커넥션 풀·N+1·캐시 장애는 실측 사례가 있다. 반대로
인덱스(DB-01 ~ DB-06)는 개념 정리만 있고 이 프로젝트에서 인덱스로 무엇을 바꾼 사례가 없다.
면접에서 가장 자주 나오는 영역 중 하나라 실험으로 채울 우선순위가 높다([README](README.md) 실험 표).

| # | 질문 | 겪은 사례 | 정리한 곳 | 판정 |
|---|---|---|---|:-:|
| DB-01 | 인덱스란? 왜 B+Tree를 쓰나(B-Tree·해시 인덱스와 비교)? | | [concepts 2.1][concepts] | |
| DB-02 | 클러스터드 인덱스와 세컨더리 인덱스의 차이는? InnoDB에서는 어떻게 되나? | | [concepts 2.1][concepts] | |
| DB-03 | 복합 인덱스의 컬럼 순서는 어떻게 정하나? | | [concepts 2.1][concepts] | |
| DB-04 | 커버링 인덱스란? | | | |
| DB-05 | 인덱스가 있는데도 안 타거나 오히려 느린 경우는? | | | |
| DB-06 | 실행 계획(EXPLAIN)에서 무엇을 보나? | | | |
| DB-07 | 트랜잭션의 ACID는 각각 무엇을 보장하나? | | [concepts 2.3][concepts] | |
| DB-08 | 격리 수준 네 가지와 각각에서 생기는 이상 현상은? | REPEATABLE READ에서 읽고 쓰는 사이 갱신이 사라짐: [카운터 경합][lost-update] | [concepts 2.3][concepts] | |
| DB-09 | MySQL InnoDB의 기본 격리 수준은? MVCC는 어떻게 동작하나? | 같은 스냅샷에서 서로의 미커밋 행을 못 봄: [카운터 경합][lost-update] | [concepts 2.3][concepts] | |
| DB-10 | 갱신 유실이란? 어떻게 막나? | 행을 센 뒤 카운터에 덮어써 실행 7건 중 4건에서 −1·+1·+3 어긋남: [카운터 경합][lost-update] | | |
| DB-11 | 비관적 락과 낙관적 락의 차이와 선택 기준은? | 비관적 락 대 원자적 증감 비교: [카운터 경합][lost-update] 조치 절 | [concepts 2.4][concepts] | |
| DB-12 | 공유 락·배타 락, 갭 락·넥스트키 락이란? | | [concepts 2.4][concepts] | |
| DB-13 | 데드락은 왜 생기고 InnoDB는 어떻게 처리하나? | | [concepts 2.4][concepts] | |
| DB-14 | 정규화(1NF ~ BCNF)는 무엇을 없애나? | | [concepts 2.6][concepts] | |
| DB-15 | 반정규화는 언제 하고 무엇을 포기하나? | 비정규화 카운터 `PST_like_count`가 동시성에서 정합성을 잃음: [카운터 경합][lost-update] | [concepts 2.6][concepts], [예상 질문 Q2][questions] | |
| DB-16 | 조인의 종류와 조인 알고리즘(Nested Loop·Hash Join)은? | | | |
| DB-17 | N+1 문제란? 어떻게 해결하나? | 요청당 쿼리 1,507개 → 112개 → 3.9개, p95 226.7ms → 34.3ms: [댓글 쿼리 증폭][n-plus-1] | [concepts 3.2][concepts] | |
| DB-18 | OFFSET 페이지네이션의 문제와 커서 방식은? | | [concepts 2.2][concepts] | |
| DB-19 | 커넥션 풀은 왜 쓰고 크기는 어떻게 정하나? | 동시 점유 커넥션 = 초당 체크아웃 × 1회 점유 시간, 13.6개 → 29.6개: [Redis 대기 중 커넥션 점유][conn-held]. 풀이 빈 채 획득 대기 1,000ms에 실패: [DB 무응답 대기][unavailable] | | |
| DB-20 | 레플리케이션이란? 복제 지연은 무엇을 깨뜨리나? | | | |
| DB-21 | 샤딩과 파티셔닝의 차이는? | | | |
| DB-22 | RDB와 NoSQL은 각각 언제 쓰나? | | | |
| DB-23 | 데이터가 있는 테이블의 스키마를 바꿀 때 주의할 점은? | Flyway 운영 규칙(추가·백필·제약 순서): [저장소 규칙][rules] 데이터베이스 절 | [concepts 2.8][concepts] | |
| DB-24 | 소프트 삭제의 장단점은? | 정합성 프로브가 소프트 삭제된 게시글의 반응을 빼야 오탐이 안 남: [카운터 경합][lost-update] | [concepts 2.7][concepts], [예상 질문 Q3][questions] | |
| DB-25 | Redis의 자료구조와 각각의 용도는? | 인기글 랭킹 ZSET | [concepts 4.1][concepts] | |
| DB-26 | 캐시 전략(Cache-Aside·Write-Through·Write-Back)은? | 목록·개수 캐시 `RedisPostsCache` | [concepts 4.2][concepts] | |
| DB-27 | 캐시 스탬피드·애벌랜치·페네트레이션은? | Redis가 빈 상태에서 부하가 DB로 몰려 지연 급증: [용량 절벽][capacity-cliff] | [concepts 4.3][concepts] | |
| DB-28 | Redis 영속성(RDB·AOF)은 무엇이 다른가? | | | |
| DB-29 | Redis는 싱글 스레드인데 왜 빠른가? | | | |
| DB-30 | Redis가 죽으면 앱은 어떻게 버티나? | 명령 타임아웃 100ms와 서킷브레이커 도입 전후: [Redis 장애 전파][cascade], [ResilientRedisExecutor][executor] | [concepts 4.4][concepts] | |

[concepts]: ../career/toss-interview-concepts.md
[questions]: ../career/toss-interview-questions.md
[rules]: ../../CLAUDE.md
[lost-update]: ../../performance/cases/reaction-counter-lost-update.md
[n-plus-1]: ../../performance/cases/comment-query-amplification.md
[conn-held]: ../../performance/cases/db-connection-held-during-redis-wait.md
[unavailable]: ../../performance/cases/mysql-unavailable-wait-bound.md
[capacity-cliff]: ../../performance/cases/redis-crash-capacity-cliff.md
[cascade]: ../../performance/cases/redis-failure-cascade.md
[executor]: ../../src/main/java/com/example/highteenday_backend/aop/ResilientRedisExecutor.java
