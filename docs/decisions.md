# 설계 결정

이 문서는 "왜 이렇게 만들었고, 그 대가로 무엇을 감수했는가"에 답한다. 현재 구조 자체는
[시스템 구조](architecture.md), 아직 풀지 못한 문제는 [알려진 문제](issues.md)에서 다룬다.
결정마다 맥락, 결정, 검토한 대안, 대가, 근거를 적는다. 저장소에 대안 검토 기록이 없는 결정은
검토한 대안 항목을 두지 않았다.

| 결정 | 한 줄 요약 | 대가 |
|---|---|---|
| [1. Redis 명령 타임아웃 100ms](#1-redis-명령-타임아웃-100ms) | 응답 목표에서 거꾸로 계산한 상한 | 계산이 근사이고 입력값 하나는 정의가 원자료와 다름 |
| [2. 앱 전체가 공유하는 Redis 서킷브레이커](#2-앱-전체가-공유하는-redis-서킷브레이커) | Redis 실패를 메서드 구분 없이 함께 판단 | 서킷이 열린 동안 캐시 무효화도 건너뜀 |
| [3. 앱 자체 상태만 보는 readiness](#3-앱-자체-상태만-보는-readiness) | Redis 장애로 인스턴스가 전부 빠지는 것을 막음 | 의존성 상태는 다른 경로로 따로 봐야 함 |
| [4. Redis 조회수 버퍼와 60초 주기 반영](#4-redis-조회수-버퍼와-60초-주기-반영) | 조회마다 게시글 행을 갱신하지 않음 | Redis 장애 중 증가분 유실을 수용, 중복 반영 가능성 |
| [5. 관계 행 기준의 반응 카운터 재계산](#5-관계-행-기준의-반응-카운터-재계산) | 잠금 없이 COUNT로 파생값을 갱신 | 동시 요청 뒤 카운터 불일치, 반응 수에 비례하는 비용 |
| [6. 반응 API의 목표 상태 전환](#6-반응-api의-목표-상태-전환) | 토글 POST를 PUT·DELETE로 바꿔 재시도에도 같은 결과 | 프론트엔드 계약 변경, 다른 액션은 남음 |
| [7. 최신순 커서와 OFFSET 혼합 목록](#7-최신순-커서와-offset-혼합-목록) | 최신순 연속 탐색만 커서로 | 큰 페이지 번호와 인기순 정렬은 OFFSET 비용 그대로 |
| [8. 이미지 임시 경로 업로드와 영구 경로 승격](#8-이미지-임시-경로-업로드와-영구-경로-승격) | 글 저장 전에 업로드를 받음 | DB 커밋과 S3 복사가 원자적이지 않아 고아 객체 가능 |

## 공통 원칙: 트랜잭션 밖의 외부 저장소 작업

Redis 컨테이너를 60초 멈춘 실행 `redis-crash-2026-09-11T06-06-22`에서 HikariCP 커넥션 10개가 모두
사용 중이었고, Redis를 쓰지 않는 API도 실패했다([Redis 장애 전파 사례](../performance/cases/redis-failure-cascade.md)).
어느 경로가 커넥션을 쥐고 있었는지는 확정하지 못했다. 트랜잭션 안의 Redis 호출과 OSIV가 후보이고,
[알려진 문제](issues.md)의 RES-001로 조사 중이다. 트랜잭션 안에서 외부 저장소를 기다리면 커넥션 점유
시간이 외부 지연만큼 늘어나므로, DB 원자성에 필요하지 않은 Redis, S3 작업은 커밋 뒤나 트랜잭션 밖에서
실행한다. 대가로 두 저장소에 걸친 작업은 실패 순서, 재시도, 고아 데이터 처리를 따로 설계해야 한다.
아직 이 원칙을 지키지 못한 곳은 RES-001과 STORAGE-001이다.

## 1. Redis 명령 타임아웃 100ms

- 맥락: 타임아웃을 지정하지 않아 Lettuce 기본값 60초가 적용됐다. Redis를 60초 멈춘 실행에서 장애
  구간 p95는 60,003ms, 오류율은 31.75%였다.
- 결정: 응답 목표에서 거꾸로 계산했다. (p95 목표 500ms − Redis 외 처리 p95 70ms) ÷ 요청당 Redis
  호출 4.09회 = 105ms를 내림해 100ms로 정했다. p95는 더하거나 뺄 수 있는 값이 아니므로 이 식은 상한을
  어림하는 근사다.
- 입력값 출처:
  - 500ms는 p95 목표값이다. 한계 부하 시나리오 [breakpoint.js](../performance/scenarios/breakpoint.js)의 목표와 같다.
  - 4.09회는 정상 부하 실행 `normal-day-2026-09-11T04-34-36`의 run.json에 기록된 요청당 Redis 명령 수(4.0877)다.
  - 70ms는 설정 주석에 같은 실행의 "Redis 외 처리 p95"로 적혀 있다. run.json에서 가장 가까운 값은 측정
    구간 전체 HTTP p95 68.69ms이고, 이 값은 Redis 호출 시간을 포함하므로 "Redis 외 처리"라는 정의와 정확히
    같지 않다.
- 검토한 대안: 먼저 정상 지연(p99.9 1.647ms)과 GC pause 최댓값을 근거로 200ms를 적용했다. 같은 장애에서
  p95가 973ms로 목표를 넘었다. 100ms보다 낮추면 정상 Redis 호출이 실패하고, 실패는 폴백이 받아 기본값을
  돌려주므로 조회수가 기록 없이 빠진다.
- 대가: 정상 상태와의 여유는 측정 기준에 따라 다르다. 설정 주석에 기록된 값은 다섯 부하 프로파일의 명령
  100만 건 중 최댓값 5.91ms(여유 16.9배)이고, Redis 장애 전파 사례의 정상 구간 클라이언트 측 관측
  최댓값은 44.2ms(여유 약 2.3배)다. 서킷이 열리기 전까지는 Redis 호출마다 최대 100ms를 기다린다.
- 근거: [application.properties](../src/main/resources/application.properties)의 `spring.data.redis.timeout` 주석,
  [Redis 장애 전파 사례](../performance/cases/redis-failure-cascade.md)

## 2. 앱 전체가 공유하는 Redis 서킷브레이커

- 맥락: 타임아웃만 있으면 Redis가 멈춘 동안 모든 호출이 100ms씩 기다린다. Redis는 프로세스 하나라서
  한 메서드의 실패는 다른 메서드에도 그대로 해당한다.
- 결정: Resilience4j 인스턴스 `redis` 하나를 모든 Redis 호출이 함께 쓴다. 최근 10초 안의 호출이 20건
  이상이고 그중 50% 이상이 실패하면 열고, 5초 뒤 들어오는 호출 3건으로 회복을 판정한다(HALF_OPEN 최대 3초).
- 검토한 대안: 호출 수 기준 창은 버렸다. 한계 부하 실행의 초당 137회 호출에서 20회 창은 0.15초여서,
  Redis의 짧은 정지만으로 서킷이 열리고 5초 동안 호출 685건을 건너뛸 수 있다.
- 대가: 서킷이 열린 동안 캐시 무효화도 건너뛴다. 그 사이 삭제·수정된 글은 TTL(미리보기 30분, 목록
  60분)이 끝날 때까지 남는다. 실패로 세는 예외가 `DataAccessException`이라 MySQL 오류도 포함되므로,
  서킷을 거치는 코드 안에 DB 호출을 두면 MySQL 장애가 Redis 서킷을 연다.
- 근거: [ResilientRedisExecutor](../src/main/java/com/example/highteenday_backend/aop/ResilientRedisExecutor.java),
  [application.properties](../src/main/resources/application.properties)의 `resilience4j.circuitbreaker` 주석,
  [서킷 개방이 조회수 정산을 건너뛴 사례](../performance/cases/circuit-open-skips-viewcount-settlement.md)

## 3. 앱 자체 상태만 보는 readiness

- 맥락: `/actuator/health`는 db, diskSpace, ping, redis, ssl 다섯 가지를 모두 만족해야 UP이다.
  `redis-crash-2026-09-11T06-37-20`(도착률 4/s, HikariCP 최대 10)에서 Redis가 멈춘 60초 동안 HTTP 요청
  972건의 오류율은 0%였지만 헬스 체크 12회는 모두 DOWN이었다. 모든 인스턴스가 Redis 하나를 공유하므로,
  로드밸런서가 이 경로를 본다면 Redis 장애 하나로 모든 인스턴스가 제외될 수 있다.
- 결정: readiness 그룹에는 `readinessState`만 넣는다. 로드밸런서를 둔다면 `/actuator/health/readiness`를
  보게 한다. 검증 실행 `redis-crash-2026-09-22T07-33-59`(도착률 60/s, HikariCP 최대 60)에서 readiness는
  11회 모두 UP이었다. 발견 실행과 장애 종류는 같고 부하 조건은 다르다.
- 대가: 의존성 상태는 `/actuator/health`와 알림으로 따로 확인해야 한다. 서비스를 내린 상태라 실제
  로드밸런서 설정으로는 확인하지 않았다.
- 근거: [application.properties](../src/main/resources/application.properties)의
  `management.endpoint.health.group.readiness` 주석, [헬스 판정 사례](../performance/cases/redis-health-readiness.md)

<a id="4-조회수는-redis에-모아-60초마다-반영"></a>

## 4. Redis 조회수 버퍼와 60초 주기 반영

- 맥락: 조회 시점마다 DB를 UPDATE하면 인기 게시글 한 행에 쓰기가 몰린다(hot row).
- 결정: 사용자별 중복 방지 키를 만든 뒤 Redis 버퍼에 증가분을 쌓고, 스케줄러가 이전 실행이 끝난 뒤
  60초마다(`fixedDelay`) MySQL에 반영한다. 순서는 읽기, 게시글별 DB 반영, 반영한 만큼 Redis 차감,
  랭킹 갱신이다. 주기를 시작할 때 서킷이 열려 있으면 그 주기는 건너뛴다.
- 검토한 대안: 처음에는 GETDEL로 읽으면서 지웠는데, 그 뒤 DB 반영이 실패하면 증가분을 되돌릴 수 없어
  읽기와 차감을 나눴다. 배치 전체를 트랜잭션 하나로 묶던 구조는 게시글 하나의 실패가 주기 전체를
  되돌려 게시글 단위 트랜잭션으로 바꿨다. 대기 키 탐색은 블로킹 O(N) 명령인 KEYS 대신 SCAN을 쓴다.
- 대가: Redis가 증가분의 유일한 임시 저장소다. Redis 응답을 2분간 막은 실행에서 기대 증가분 2,572건 중
  413건이 MySQL과 Redis 어디에도 남지 않았다. 이 손실은 DATA-001로 수용한 위험이다. DB 반영과 Redis
  차감 사이에 프로세스가 멈추거나, 주기 도중 서킷이 열려 차감이 거절되면 같은 증가분이 다음 주기에 다시
  반영될 수 있다. 차감 거절 1건은 실험에서 확인했고 중복 반영은 아직 관측하지 않았다(DATA-002).
- 근거: [RedisViewCountStore](../src/main/java/com/example/highteenday_backend/infrastructure/redis/RedisViewCountStore.java),
  [ViewCountScheduler](../src/main/java/com/example/highteenday_backend/schedulers/ViewCountScheduler.java),
  [조회수 유실 사례](../performance/cases/redis-viewcount-loss-on-fallback.md),
  [서킷 개방이 조회수 정산을 건너뛴 사례](../performance/cases/circuit-open-skips-viewcount-settlement.md)

## 5. 관계 행 기준의 반응 카운터 재계산

- 맥락: 좋아요·싫어요 관계 행이 기준 데이터이고, `Post`의 카운터는 조회용 파생값이다.
- 결정: 반응을 처리한 뒤 COUNT 쿼리로 카운터를 다시 계산하고 잠금은 걸지 않는다.
- 대가: 여러 장애 실험에서 카운터와 실제 행 수의 어긋남을 관측했다(실행별 값은 사례 문서).
  PUT 전환 전 커밋 `652a031`의 POST 토글을 코드로 따라가 센 결과, 좋아요 한 번에 DB 문장이 10개 나갔다.
  전환 뒤 문장 수는 다시 세지 않았다. COUNT 비용은 그 글의 반응 수에 비례하고, dirty checking이 모든
  컬럼을 쓰므로 같은 글의 다른 변경을 되돌릴 수도 있다. 두 문제 모두 수정 전이다(DATA-003, DATA-004).
- 근거: [ReactionService](../src/main/java/com/example/highteenday_backend/services/domain/ReactionService.java),
  [반응 카운터 lost update 사례](../performance/cases/reaction-counter-lost-update.md),
  [반응 재집계와 행 덮어쓰기 사례](../performance/cases/reaction-write-recount-and-row-overwrite.md)

## 6. 반응 API의 목표 상태 전환

- 맥락: 서버가 커밋한 뒤 응답만 사라지면 클라이언트는 같은 요청을 다시 보낸다. 연결의 30%에서 응답을
  끊은 실험에서 토글·생성 재시도 67건이 모두 사용자 의도와 다른 상태를 남겼다. 응답은 200이라
  오류율에는 드러나지 않았다.
- 결정: 게시글과 댓글 반응 모두 켜기는 `PUT`, 끄기는 `DELETE`로 나누고, 이미 그 상태면 아무것도 하지
  않는다. 반응 행은 조회 없이 upsert 한 문장(`INSERT ... ON DUPLICATE KEY UPDATE`)으로 쓴다. 같은
  실험을 다시 돌려 게시글·댓글 좋아요 재시도 23건의 결함이 0건임을 확인했다.
- 같은 문제의 다른 경로: 생성 API는 목표 상태로 표현할 수 없어 요청별 UUID와 UNIQUE 제약(멱등 키)으로
  고칠 계획이다. 토큰 재발급은 직전 토큰을 잠시 인정하는 유예 기간과, 재사용을 감지해 토큰 계보를
  폐기하는 방식 사이에서 보안 수준을 먼저 정해야 해 결정을 미뤘다.
- 대가: 프론트엔드 호출 계약이 바뀐다. 스크랩, 게시글·댓글·단체 채팅방 생성, 토큰 재발급은 아직
  재시도 결함이 남아 있다.
- 근거: [PostReactionController](../src/main/java/com/example/highteenday_backend/controllers/PostReactionController.java),
  [CommentReactionController](../src/main/java/com/example/highteenday_backend/controllers/CommentReactionController.java),
  [PostReactionRepository](../src/main/java/com/example/highteenday_backend/domain/posts/PostReactionRepository.java),
  [응답 유실 뒤 재시도 사례](../performance/cases/retry-after-lost-response.md)

## 7. 최신순 커서와 OFFSET 혼합 목록

- 맥락: 게시글 목록은 최신순 연속 탐색, 페이지 번호 이동, 좋아요·조회수 정렬을 함께 지원한다.
- 결정: 최신순이고, 페이지 번호로 건너뛴 요청이 아니며(`randomPage=false`), 이전 페이지의 마지막 ID가
  있을 때만 ID 커서를 쓴다. 나머지는 OFFSET을 쓴다.
- 대가: 큰 page 값과 좋아요·조회수 정렬은 OFFSET 비용을 그대로 가진다. 입력 상한과 실행 계획을
  변경할 때마다 확인해야 한다.
- 근거: [PostRepositoryCustomImpl](../src/main/java/com/example/highteenday_backend/domain/posts/queryDsl/PostRepositoryCustomImpl.java)의 `findByBoard`

<a id="8-이미지는-임시-경로에-올린-뒤-영구-경로로-승격"></a>

## 8. 이미지 임시 경로 업로드와 영구 경로 승격

- 맥락: 에디터는 게시글을 저장하기 전에 이미지를 올린다.
- 결정: 이미지를 먼저 `tmp/{userId}/...`에 올리고, 게시글이나 댓글이 생성되면 영구 경로로 복사한 뒤
  본문의 URL을 바꾼다. 승격된 임시 파일은 넘어온 URL만 지운다.
- 대가: DB 커밋과 S3 복사는 하나의 원자적 작업이 아니어서 복사 뒤 DB가 실패하면 고아 객체가 남는다.
  게시글 저장 흐름에서 승격이 트랜잭션 안에 있어 S3 지연이 트랜잭션을 늘린다(STORAGE-001).
- 근거: [S3FileStorageAdapter](../src/main/java/com/example/highteenday_backend/services/global/S3FileStorageAdapter.java),
  [MediaProcessingService](../src/main/java/com/example/highteenday_backend/services/domain/MediaProcessingService.java)의
  `processCreatePostMedia`
