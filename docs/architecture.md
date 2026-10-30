# 시스템 구조

이 문서는 "요청이 어떤 계층을 지나고, 데이터가 어느 저장소에 있으며, Redis가 멈추면 무엇이
달라지는가"에 답한다. 왜 이렇게 정했는지는 [설계 결정](decisions.md)에서 다룬다.

<img src="images/architecture.svg" alt="HighTeenDay 애플리케이션과 실험 환경 구조" width="760">

- MySQL이 영속 데이터의 기준 저장소다. Redis는 다시 만들 수 있는 캐시와 손실을 허용한 조회수
  버퍼를, S3는 사용자 업로드 파일을 둔다.
- Redis 호출은 명령 타임아웃 100ms와 서킷브레이커로 감싸, Redis 장애 때 예외 대신 기본값을 돌려준다.
- Redis와 S3 작업은 MySQL 트랜잭션으로 롤백되지 않는다. 게시글 저장의 S3 승격은 아직 트랜잭션 안에서
  실행된다([STORAGE-001](issues.md)).
- 그림의 회색 실선은 운영 경로, 파란 상자와 파란 점선은 부하·장애 실험 도구와 실험 경로다.

## 요청 처리 경로

HTTP 요청은 다음 순서로 처리된다.

1. Spring Security 필터: JWT 검증
2. Controller: 입력 검증, 응답 변환
3. Service: 유스케이스, 트랜잭션 경계
4. JPA repository 또는 외부 저장소 adapter

Redis 조회수 버퍼, 인기글 순위, 토큰 캐시는 `domain/port`의 인터페이스와 `infrastructure/redis`의 구현으로
나눈다. 게시글 목록 캐시([PostPrevCache](../src/main/java/com/example/highteenday_backend/services/domain/redisService/PostPrevCache.java),
[RedisPostsCache](../src/main/java/com/example/highteenday_backend/services/domain/redisService/RedisPostsCache.java))와
S3 adapter([S3FileStorageAdapter](../src/main/java/com/example/highteenday_backend/services/global/S3FileStorageAdapter.java))는 아직 `services` 아래에 있다.

JWT 인증 요청은 [TokenAuthenticationFilter](../src/main/java/com/example/highteenday_backend/security/TokenAuthenticationFilter.java)를 거쳐
[TokenProvider](../src/main/java/com/example/highteenday_backend/security/TokenProvider.java)의 `getAuthentication()`에서 사용자를 조회한다.
이 조회는 요청마다 MySQL을 쓰므로 DB 커넥션 풀이 막히면 인증도 함께 기다린다([AUTH-002](issues.md)).

## 패키지 지도

| 패키지 | 역할 | 처음 볼 클래스 |
|---|---|---|
| `controllers` | HTTP 매핑, 입력 검증, 응답 변환 | [PostController](../src/main/java/com/example/highteenday_backend/controllers/PostController.java), [PostReactionController](../src/main/java/com/example/highteenday_backend/controllers/PostReactionController.java), [ChatWebSocketController](../src/main/java/com/example/highteenday_backend/controllers/ChatWebSocketController.java) |
| `services` | 유스케이스와 트랜잭션 조정 | [PostService](../src/main/java/com/example/highteenday_backend/services/domain/PostService.java), [ReactionService](../src/main/java/com/example/highteenday_backend/services/domain/ReactionService.java), [HotPostService](../src/main/java/com/example/highteenday_backend/services/domain/HotPostService.java) |
| `domain` | 엔티티, repository, Redis 저장소 port 3개 | [PostRepositoryCustomImpl](../src/main/java/com/example/highteenday_backend/domain/posts/queryDsl/PostRepositoryCustomImpl.java), [ViewCountStorePort](../src/main/java/com/example/highteenday_backend/domain/port/ViewCountStorePort.java) |
| `infrastructure` | `domain/port`의 Redis 구현 | [RedisViewCountStore](../src/main/java/com/example/highteenday_backend/infrastructure/redis/RedisViewCountStore.java), [RedisHotPostRanking](../src/main/java/com/example/highteenday_backend/infrastructure/redis/RedisHotPostRanking.java) |
| `aop` | Redis 실패 시 기본값 반환, 서킷브레이커 | [ResilientRedisAspect](../src/main/java/com/example/highteenday_backend/aop/ResilientRedisAspect.java), [ResilientRedisExecutor](../src/main/java/com/example/highteenday_backend/aop/ResilientRedisExecutor.java) |
| `security` | Spring Security 필터, JWT, OAuth2 | [SecurityConfig](../src/main/java/com/example/highteenday_backend/security/SecurityConfig.java), [TokenAuthenticationFilter](../src/main/java/com/example/highteenday_backend/security/TokenAuthenticationFilter.java) |
| `schedulers` | 주기 작업 | [ViewCountScheduler](../src/main/java/com/example/highteenday_backend/schedulers/ViewCountScheduler.java), [HotScoreScheduler](../src/main/java/com/example/highteenday_backend/schedulers/HotScoreScheduler.java) |
| `configs` | Spring 구성 | [RedisConfig](../src/main/java/com/example/highteenday_backend/configs/RedisConfig.java), [S3Config](../src/main/java/com/example/highteenday_backend/configs/S3Config.java), [QueryMetricsConfig](../src/main/java/com/example/highteenday_backend/configs/QueryMetricsConfig.java) |
| `exceptions` | 오류 코드와 HTTP 상태 변환 | [GlobalExceptionHandler](../src/main/java/com/example/highteenday_backend/exceptions/GlobalExceptionHandler.java) |

## 데이터별 저장 위치

| 데이터 | 기준 저장소 | 파생 또는 임시 저장소 |
|---|---|---|
| 게시글 | MySQL | Redis 미리보기·목록·게시판 글 수 캐시 |
| 사용자, 댓글, 관계 | MySQL | 없음 |
| 리프레시 토큰 | MySQL | Redis 조회 캐시 |
| 일별 인기글 | MySQL 스냅샷 | Redis Sorted Set |
| 실시간 인기글 | 없음 | Redis Sorted Set(5분 단위 버킷) |
| 조회수 누적값 | MySQL | Redis 미반영 증가분 |
| 게시글과 댓글 이미지 | S3 영구 경로 | S3 임시 경로 |

두 저장소를 함께 바꾸는 유스케이스는 실패 순서, 재시도, 고아 데이터 처리 방법을 따로 가진다.

## Redis 키

| 키 | 용도 | 만료 | Redis 장애 시 결과 |
|---|---|---|---|
| `board:{boardId}:posts` | 최신 게시글 ID 목록 | 60분 | MySQL 조회 |
| `posts:{postId}` | 게시글 미리보기 | 30분 | MySQL 조회 |
| `board:{boardId}:count` | 게시판 글 수 | 60분 | MySQL count |
| `hot:leaderboard:day:{date}` | 일별 인기글 | 2일 | MySQL 스냅샷 조회 |
| `hot:board:{boardId}realtime:{yyyyMMddHHmm}` | 게시판별 실시간 인기 점수(5분 단위 버킷) | 30분, 쓸 때마다 갱신 | 점수 기록 생략 |
| `post:views:{postId}` | DB 반영 전 조회수 | 없음 | 새 증가분 기록 실패 |
| `viewed:{postId}:{userId}` | 중복 조회 방지 | 1시간 | 중복 방지 실패 |
| `RT:{refreshToken}` | 리프레시 토큰 조회 | 토큰 수명 | MySQL 조회 |

키 문자열은 Redis 구현 클래스나 그 클래스를 쓰는 서비스에 있다. 조회수·중복 방지·토큰 키는
[RedisViewCountStore](../src/main/java/com/example/highteenday_backend/infrastructure/redis/RedisViewCountStore.java)와
[RedisTokenCacheStore](../src/main/java/com/example/highteenday_backend/infrastructure/redis/RedisTokenCacheStore.java)의 상수,
게시글 목록 키는 [RedisPostsCache](../src/main/java/com/example/highteenday_backend/services/domain/redisService/RedisPostsCache.java)의
`create*Key` 메서드, 인기글 키는 [HotPostService](../src/main/java/com/example/highteenday_backend/services/domain/HotPostService.java)에 있다.
실시간 인기 키는 코드상 `boardId` 뒤에 `:` 구분자가 빠진 `hot:board:{boardId}realtime:` 형태다. 조회수 대기 키는
`SCAN`으로 순회하며, DB 반영에 성공한 증가분만 Redis에서 차감한다.

## Redis 장애 시 동작

`@ResilientRedis`가 붙은 메서드는 Redis를 쓰지 못할 때 예외 대신 기본값을 반환한다.
boolean은 `false`, 숫자는 `0`, 컬렉션은 빈 값, `Optional`은 `Optional.empty()`, 그 밖의
참조 타입은 `null`이다. Redis를 쓰지 못하는 경우는 두 가지이고, 응답 시간이 다르다.

| 경우 | 언제 | 기본값이 돌아오기까지 |
| --- | --- | --- |
| 접근 실패 | Redis에 호출을 보냈다가 `DataAccessException`을 받음 | 명령 타임아웃(`spring.data.redis.timeout`, 100ms)까지 대기 |
| 서킷 거절 | 서킷브레이커가 열려 있어 호출을 보내지 않음 | 대기 없음 |

서킷브레이커는 인스턴스 하나(`resilience4j.circuitbreaker.instances.redis`)를 앱 전체가
공유한다. 최근 10초 안의 Redis 호출이 20건 이상이고 그중 절반 이상이 실패하면 열리고, 5초 뒤 들어오는
호출 3건으로 회복을 판정한다(HALF_OPEN 최대 3초). 두 경우는 `redis_fallback_total`의 `reason` 태그(`error`, `open`)로
나눠 센다.

서킷이 열린 동안에는 읽기와 캐시 무효화(`evictBoard`, `evictPostPrev`, 글 개수 증감) 모두 Redis에 가지
않는다. 읽기는 DB로 가서 맞는 값을 돌려주지만, 건너뛴 무효화 때문에 서킷이 닫힌 뒤 Redis에 남은 옛
항목이 TTL(미리보기 30분, 목록·개수 60분)이 끝날 때까지 다시 읽힌다. Redis가 재시작돼 비어 있으면
이 문제는 생기지 않는다. 조회수 정산 스케줄러는 주기를 시작할 때 서킷이 열려 있으면 그 주기를 건너뛴다.
이 검사는 주기 시작 때 한 번만 하므로, 주기 도중 서킷이 열리면 DB 반영 뒤의 Redis 차감이 거절될 수 있다
([DATA-002](issues.md)).

## 설계 결정과 알려진 문제

조회수, 반응 카운터, 목록 페이지, 미디어 저장과 트랜잭션 원칙을 고른 이유와 대가는
[설계 결정](decisions.md)에 있다. 아직 풀지 못한 문제는 [알려진 문제](issues.md), 실험으로 확인한
사례는 [사례 색인](../performance/cases/README.md)에 있다.
