# 분산 시스템·설계

판정 기준과 칸 설명은 [README](README.md)에 있다.

이 프로젝트의 중심 영역이다. 장애 전파·타임아웃·서킷브레이커·헬스 판정은 before/after 실측까지
있다.

사례가 없는 것은 두 무리다. 단일 인스턴스라서 생기는 질문(DD-01, DD-15, DD-16, DD-22)은
T-10(다중 인스턴스 전환)이 채운다. 메시지 큐(DD-11, DD-12)는 T-11(Kafka)이 채운다.

DD-10은 이어 묻기 좋은 질문이다. 회사에서는 중복 실행을 분산 락으로 막았고, 사이드에서는 멱등성으로
막고 있다. 락은 실행을 하나로 줄이고, 멱등성은 여러 번 실행돼도 결과가 같게 만든다.

| # | 질문 | 겪은 사례 | 정리한 곳 | 판정 |
|---|---|---|---|:-:|
| DD-01 | 수평 확장과 수직 확장의 차이는? 서버를 무상태로 만든다는 것은? | | | |
| DD-02 | 로드밸런서의 헬스체크는 무엇을 보고 판정해야 하나? | 공유 의존성을 readiness에서 빼 Redis 장애 구간 헬스가 12회 전부 DOWN → 11회 전부 UP: [헬스 판정][readiness] | | |
| DD-03 | 외부 의존성의 타임아웃은 계층별로 어떻게 잡나? | 커넥션 획득 1s·소켓 읽기 2s·쿼리 1.5s: [DB 무응답 대기][unavailable]. 타임아웃의 합이 요청 전체 상한이 아님: [freeze 대기][freeze-gap] | | |
| DD-04 | 재시도는 언제 위험하고 백오프는 왜 필요한가? | [응답 유실 뒤 재시도][retry] | | |
| DD-05 | 서킷 브레이커는 어떻게 동작하나? 상태는 어떻게 바뀌나? | [ResilientRedisExecutor][executor], 서킷 유무 대조 실행 `redis-crash-2026-09-17T06-14-24` · `07-14-13`. 회사: 정부 주소 검색 API | | |
| DD-06 | 느린 호출에도 서킷이 열리나? | 느린 호출 임계를 안 두어 Redis가 느릴 때는 서킷이 열릴 수 없음: [Redis 느림][redis-slow] | | |
| DD-07 | 벌크헤드란? 없으면 무엇이 번지나? | DB를 기다리는 요청이 Tomcat 스레드를 다 써 DB를 덜 쓰는 기능까지 지연: [DB 느림][mysql-slow] | | |
| DD-08 | API 멱등성은 어떻게 설계하나? | [응답 유실 뒤 재시도][retry] (T-02) | [concepts 6.2][concepts] | |
| DD-09 | 분산 락은 어떻게 구현하나? 락을 쥔 쪽이 죽으면? | 회사: 같은 고객사 파드 간 중복 실행 방지 | [gap 분석 2-3][gap] | |
| DD-10 | 락과 멱등성은 각각 어떤 중복을 막나? | 회사 분산 락, T-02 멱등성 | | |
| DD-11 | 메시지 전달 보장(at-most·at-least·exactly-once)은? | | [concepts 6.2][concepts] | |
| DD-12 | Transactional Outbox 패턴이란? | | [gap 분석 2-2][gap] | |
| DD-13 | 강한 일관성과 최종 일관성의 차이는? | 조회수를 Redis 버퍼에 모았다가 DB로 정산: [폴백 중 조회수 유실][viewcount-loss] | | |
| DD-14 | 비정규화한 데이터의 정합성은 어떻게 지키나? | [카운터 경합][lost-update] | | |
| DD-15 | CAP 정리란? | | | |
| DD-16 | 무중단 배포 방식(롤링·블루그린·카나리)은? | | [concepts 7.7][concepts] | |
| DD-17 | 한 의존성의 장애가 앱 전체로 번지는 경로는? | [Redis 장애 전파][cascade], [DB 느림][mysql-slow] | | |
| DD-18 | 메트릭·로그·트레이스는 각각 무엇에 답하나? SLI·SLO는? | 측정 체계 `performance/`. 알림을 걸기 전 잡음 바닥을 알아야 하는 이유: [부하 시 500][unmapped-500] | [concepts 1.8, 7.5][concepts] | |
| DD-19 | 동시 처리량과 대기 시간의 관계(Little's Law)는? | 초당 체크아웃 479건 × 1회 점유 0.02836초 = 동시 점유 13.6개: [Redis 대기 중 커넥션 점유][conn-held] | [concepts 1.5][concepts] | |
| DD-20 | 캐시가 비었을 때 DB로 몰리는 부하는 어떻게 다루나? | [용량 절벽][capacity-cliff] | [concepts 4.3][concepts] | |
| DD-21 | 조회수처럼 쓰기가 잦은 카운터는 어떻게 설계하나? | `ViewCountScheduler`의 Redis 버퍼 정산: [폴백 중 조회수 유실][viewcount-loss], [정산 건너뜀][settlement] | | |
| DD-22 | 트래픽이 10배가 되면 어디부터 무너지나? | | [gap 분석 1-4][gap] | |

[concepts]: ../career/toss-interview-concepts.md
[gap]: ../career/toss-gap-analysis.md
[readiness]: ../../performance/cases/redis-health-readiness.md
[unavailable]: ../../performance/cases/mysql-unavailable-wait-bound.md
[freeze-gap]: ../../performance/cases/mysql-freeze-timeout-gap.md
[retry]: ../../performance/cases/retry-after-lost-response.md
[redis-slow]: ../../performance/cases/redis-slow-latency-without-fallback.md
[mysql-slow]: ../../performance/cases/mysql-slow-latency-amplification.md
[viewcount-loss]: ../../performance/cases/redis-viewcount-loss-on-fallback.md
[lost-update]: ../../performance/cases/reaction-counter-lost-update.md
[cascade]: ../../performance/cases/redis-failure-cascade.md
[unmapped-500]: ../../performance/cases/unmapped-500-under-load.md
[conn-held]: ../../performance/cases/db-connection-held-during-redis-wait.md
[capacity-cliff]: ../../performance/cases/redis-crash-capacity-cliff.md
[settlement]: ../../performance/cases/circuit-open-skips-viewcount-settlement.md
[executor]: ../../src/main/java/com/example/highteenday_backend/aop/ResilientRedisExecutor.java
