# 알려진 문제

이 문서는 "지금 코드에 남아 있는 문제는 무엇이고, 다음에 무엇을 할 것인가"에 답한다. 현재 코드나
실험 결과로 확인한 미해결 문제만 적고, 해결되면 이 목록에서 지운다. 해결된 문제의 경과와 수치는
[사례 색인](../performance/cases/README.md)의 각 사례에 남는다.

마지막 확인일: 2026-10-29

| ID | 상태 | 사용자 영향 | 현재 근거 | 다음 조치 | 관련 문서 |
|---|---|---|---|---|---|
| AUTH-001 | 미해결 | 만료된 토큰과 서명이 틀린 토큰이 같은 401로 끝나 클라이언트가 둘을 구분하지 못함 | [TokenAuthenticationFilter](../src/main/java/com/example/highteenday_backend/security/TokenAuthenticationFilter.java)가 DB·Redis 인프라 예외만 503으로 끊고, 그 밖의 검증 실패는 삼킨 뒤 익명 요청으로 진행. 그래서 만료·서명 오류를 코드별 401로 바꾸는 TokenExceptionFilter에 도달하지 못함 | 검증 실패 종류를 오류 코드로 전달하고 상태 코드 테스트 추가 | [Redis 장애 전파](../performance/cases/redis-failure-cascade.md) |
| AUTH-002 | 미해결 | DB 커넥션 풀이 막히면 모든 인증 요청이 함께 대기함 | [TokenProvider](../src/main/java/com/example/highteenday_backend/security/TokenProvider.java)의 `getAuthentication()`이 요청마다 User 조회 | 토큰 검증에 필요한 사용자 정보를 DB 조회 없이 구성하거나 제한된 캐시 사용 | [시스템 구조](architecture.md#요청-처리-경로) |
| RES-001 | 조사 중 | Redis 장애 중 DB 커넥션 점유가 늘어 커넥션 풀이 가득 찰 수 있음 | 60초 대기는 명령 타임아웃 100ms로 해소. 서킷브레이커 없는 대조군 `redis-crash-2026-09-17T07-14-13`에서 HikariCP active 최대 60/60, 커넥션 1회 점유 28.36ms에서 57.56ms. 트랜잭션 안 Redis 호출 경로의 폴백은 전체의 7.8%(580/7,400건)라 이것만으로 원인을 설명하지 못함. OSIV와 트랜잭션 안 Redis 호출이 후보이고 미검증 | 트랜잭션 밖 DTO 변환을 정리한 뒤 OSIV 켜짐·꺼짐 비교 | [Redis 장애 중 DB 커넥션 점유](../performance/cases/db-connection-held-during-redis-wait.md) |
| PERF-001 | 조사 중 | 부분 문자열 검색이 데이터 증가에 따라 느려질 수 있음 | QueryDSL `containsIgnoreCase` 사용 | 실제 실행 계획과 `EXPLAIN ANALYZE` 확보 | 없음 |
| PERF-002 | 조사 중 | MySQL이 느리게 응답하면 오류 없이 모든 기능이 느려지고 전체 p95가 약 20초로 늘어남 | `mysql-slow-2026-09-21T04-33-28`에서 DB 타임아웃 설정 뒤에도 장애 구간 p95 19,894ms, HikariCP active 60/60, Tomcat busy 50/50 | 요청별 DB 호출 수와 커넥션 획득·소켓 읽기 시간 기록 | [느린 MySQL의 전 기능 지연](../performance/cases/mysql-slow-latency-amplification.md) |
| PERF-003 | 조사 중 | MySQL이 실행 중 정지하면 실패까지 약 5초가 걸리는 요청이 남음 | `mysql-freeze-2026-09-22T08-19-21`에서 실패 중간값 1,007ms, p95 5,007ms. 장애 구간 커넥션 획득 p95 4,662ms라 획득 단계가 유력한 후보 | 5초 실패 요청 한 건의 획득·유효성 검사·JDBC 호출을 한 추적으로 기록 | [MySQL 실행 중 정지의 5초 실패 지연](../performance/cases/mysql-freeze-timeout-gap.md) |
| PERF-004 | 조사 중 | Redis 중단 중 도착률을 높이면 오류는 적은 채 수 초 지연과 처리량 부족이 생김 | `redis-crash-breakpoint-2026-09-17T01-30-55`에서 장애 구간 p95 4,057ms, 실행 전체 dropped iteration 2,429건. 임계 도착률 미확정 | 현재 코드로 같은 계단형 부하를 다시 실행해 임계 도착률 측정 | [Redis 중단 중 고부하 지연](../performance/cases/redis-crash-capacity-cliff.md) |
| PERF-005 | 미해결 | Redis가 타임아웃보다 짧게 느려지면 폴백과 헬스 DOWN 없이 요청 지연만 늘어남 | `redis-slow-2026-09-14T00-14-46`에서 p95 61ms에서 216ms. 요청당 Redis 명령 3.39회 × 50ms로 증가폭과 같은 크기(크기 어림, 요청별 분해 없음) | 반복 호출을 줄이거나 느린 Redis를 우회하는 변경 하나를 같은 조건에서 검증 | [느린 Redis의 요청 지연](../performance/cases/redis-slow-latency-without-fallback.md) |
| ERR-001 | 조사 중 | 의존성 장애 중 고부하에서 일부 실패가 503 분류 밖의 500으로 응답돼, 5xx 알림 기준과 클라이언트 재시도 판단이 흐려짐 | 장애 실험 28건 중 5건에서 500이 섞임(구간당 0~45건, 장애 전·중·후 구간 모두). 2~5초 뒤 500이 되는 유형은 실행 4건 모두 커넥션 획득 타임아웃 1초 이미지에서 관측됨. 나머지 1건(`mysql-crash-2026-09-21T01-30-04`)은 DB 타임아웃 설정 전 실행. 어느 예외가 503 분류를 벗어났는지 미확인 | 500 핸들러 로그에서 예외 클래스를 뽑아 분류 결정 | [고부하 실행의 미분류 500](../performance/cases/unmapped-500-under-load.md) |
| STORAGE-001 | 미해결 | S3 지연이 DB 트랜잭션을 늘리고 실패 시 고아 객체가 남을 수 있음 | [MediaProcessingService](../src/main/java/com/example/highteenday_backend/services/domain/MediaProcessingService.java)의 `processCreatePostMedia`가 `@Transactional` 안에서 S3 복사 수행 | 커밋 경계 분리와 보상 정리 작업 설계 | [설계 결정 8](decisions.md#8-이미지-임시-경로-업로드와-영구-경로-승격) |
| DATA-001 | 수용한 위험 | Redis 장애 중 조회수와 미반영 버퍼가 유실될 수 있음 | Redis가 조회수 증가분의 유일한 임시 저장소 | 허용 손실 범위와 필요 시 내구성 있는 대안 결정 | [조회수 유실](../performance/cases/redis-viewcount-loss-on-fallback.md), [설계 결정 4](decisions.md#4-redis-조회수-버퍼와-60초-주기-반영) |
| DATA-002 | 미해결 | 서킷이 열린 동안 조회수 정산의 Redis 차감이 거절되면, 같은 증가분이 다음 주기에 MySQL에 다시 반영될 수 있음 | `redis-crash-2026-09-17T06-14-24`에서 DB 반영 뒤의 `settleCounts` 호출 1건이 서킷에 거절됨(`reason=open`). 주기 시작 때만 서킷 상태를 검사함. 이 실행은 Redis 재시작으로 카운터가 사라져 중복 반영은 관측되지 않음 | `settleCounts`를 서킷 대상에서 빼고, 서킷만 여는 실험에서 게시글별로 두 주기 조회수 비교 | [서킷 개방이 조회수 정산을 건너뜀](../performance/cases/circuit-open-skips-viewcount-settlement.md) |
| DATA-003 | 조사 중 | 게시글의 좋아요·싫어요 카운터가 실제 반응 행 수와 어긋날 수 있음 | 여러 장애 실험에서 카운터와 실제 행 수의 어긋남을 관측함(실행별 값은 사례 문서). 반응 쓰기 때의 재집계 경합과 조회수 반영의 행 전체 덮어쓰기가 후보이고 어느 쪽인지 가리지 못함 | 동시 반응 재현 테스트로 두 후보 경로를 가른 뒤 수정안 결정 | [동시 반응의 카운터 어긋남](../performance/cases/reaction-counter-lost-update.md) |
| DATA-004 | 미해결 | 반응 한 번이 같은 글에서 동시에 바뀐 댓글 수, 제목·본문, 조회수를 되돌릴 수 있고, 반응 비용이 그 글의 반응 수에 비례함 | `Post`에 `@DynamicUpdate`가 없어 카운터를 저장하는 UPDATE가 요청 중 읽은 모든 컬럼을 다시 씀. 반응마다 유효 반응 행 전체를 `COUNT`로 다시 셈. 코드 판독으로 확인했고 재현 테스트는 없음 | `@DynamicUpdate` 적용, 대상 행 잠금과 원자적 증감 검토, 재현 테스트 추가 | [반응 쓰기의 재집계와 행 덮어쓰기](../performance/cases/reaction-write-recount-and-row-overwrite.md) |

상태는 세 가지다. 미해결은 원인을 알고 아직 고치지 않은 것, 조사 중은 원인이나 영향 범위를 더
확인해야 하는 것, 수용한 위험은 대가를 알고 그대로 두기로 한 것이다. 새 문제는 증상, 근거, 다음
조치를 채울 수 있을 때만 추가한다.
