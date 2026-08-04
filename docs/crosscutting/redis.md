# Redis — 키 인벤토리, 장애 격리 정책

## 이 문서가 답하는 질문

- Redis에 어떤 키가 어떤 타입·TTL로 저장되는가?
- 각 키를 읽고 쓰는 코드는 어디이고, Redis 장애 시 무엇이 일어나는가?
- `@ResilientRedis` AOP와 직접 try/catch fallback은 어떻게 나뉘어 있는가?

## 3줄 요약

- 용도는 4가지다: 조회수 버퍼(카운터+중복방지), 핫게시글 랭킹(ZSET), 리프레시 토큰 캐시, 게시글 목록·건수 캐시.
- 장애 격리는 두 정책이다: 기본값 반환으로 충분한 단순 조작은 `@ResilientRedis` AOP, DB 재조회가 필요한 곳은 서비스 코드의 직접 try/catch.
- Redis가 죽어도 서비스는 계속 동작한다 — 대신 조회수 집계 중단, 랭킹 빈 목록(DB fallback), 토큰 검증 DB 직행, 목록 캐시 미스가 된다.

Port/Adapter 구분(왜 일부는 `infrastructure/redis/`이고 일부는 `services/domain/redisService/`인지)은 [02-architecture.md](../02-architecture.md#portadapter-목록)가 단일 출처다.

## 키 인벤토리

실제 키 문자열은 전부 코드 상수·키 생성 메서드에서 확인했다.

| 키 패턴 | 타입 | TTL | 쓰는 코드 | 장애 시 동작 |
|---|---|---|---|---|
| `viewed:{postId}:{userId}` | String — SETNX 중복방지 | 1시간 (`ViewCountService · DEDUP_TTL`) | `infrastructure/redis/RedisViewCountStore · tryMarkViewed()` | AOP가 false 반환 → 조회수 증가 자체를 스킵 |
| `post:views:{postId}` | String — INCR 카운터 | 없음 — 스케줄러가 GETDEL로 소비 | `RedisViewCountStore · incrementCount() / getCount() / consumePendingCounts()` | AOP가 스킵/0/빈 Map 반환 → 그 주기 동기화 없음 |
| `hot:leaderboard:day:{yyyyMMdd}` | ZSET — 일별 전역 핫랭킹 | 없음 → 날짜별 키 무기한 누적 ([KI-20](../KNOWN-ISSUES.md#ki-20-핫랭킹-zset-키에-ttl이-없어-무기한-누적)) | `infrastructure/redis/RedisHotPostRanking` 경유, 키는 `services/domain/HotPostService · leaderboardDayRedisKey()` | AOP가 빈 Set/List 반환 → 조회는 `DailyHotPost` DB fallback (`HotPostService · getLeaderboardDayHotPostsFromDb()`) |
| `hot:board:{boardId}realtime:{yyyyMMddHHmm}` | ZSET — 게시판별 5분 단위 실시간 랭킹 | 없음 ([KI-20](../KNOWN-ISSUES.md#ki-20-핫랭킹-zset-키에-ttl이-없어-무기한-누적)) | `HotPostService · updateRecentScore() / getRecentHotPosts()`, 키는 `getKey()` | AOP가 빈 Set 반환 → 실시간 인기글 빈 목록 |
| `RT:{refreshToken}` | String — 값은 이메일 | 7일 또는 DB 만료까지 남은 시간 | `infrastructure/redis/RedisTokenCacheStore` | `put`/`delete`는 AOP 스킵, `get`은 직접 try/catch로 `Optional.empty()` → DB 조회로 fallback (`services/domain/TokenService · findByRefreshTokenOrThrow()`) |
| `board:{boardId}:posts` | List — 최신 게시글 id 최대 50개 | 60분 (`RedisPostsCache · BOARD_TTL`) | `services/domain/redisService/RedisPostsCache · addPostToBoard() / getPostPrevs()` | `getPostPrevs`가 직접 try/catch → `postRepository.findByBoard` DB 재조회 |
| `posts:{postId}` | String — `PostPreviewDto` JSON | 30분 (`POST_TTL`) | `RedisPostsCache · cachePostPrev()`, 미스 시 `findAllDtoByIds`로 채움 | 위와 동일 경로에서 함께 fallback |
| `board:{boardId}:count` | String — 게시글 총 건수 | 생성 시 5분 (`createCount`), 증감 시 60분으로 재설정 | `RedisPostsCache · getCount() / createCount() / incrementBoardCount() / decrementBoardCount()` | `getCount` 직접 try/catch → `postRepository.countTotal` |

- `services/domain/redisService/CursorCacheService`는 전체가 주석 처리된 빈 껍데기다 — 사용처 없음.
- RedisTemplate 빈은 `configs/RedisConfig.java`에 5개 정의되어 있는데 그중 `boardTemplate`/`countingTemplate`/`hotPidTemplate` 3개는 구성이 동일하다 ([KI-19](../KNOWN-ISSUES.md#ki-19-redisconfig에-동일-구성-redistemplate-빈-3개)). `board:{boardId}:count` 키는 증감은 `boardTemplate`, 조회·생성은 `countingTemplate`으로 접근하지만 직렬화가 같아 호환된다.

## 장애 격리 두 정책

### 정책 1 — `@ResilientRedis` AOP (단순 조작)

`aop/ResilientRedis` + `aop/ResilientRedisAspect`. 메서드에 애노테이션만 붙이면 aspect가 `Exception`을 잡고 반환 타입별 기본값(void 무시, boolean false, 숫자 0, 컬렉션 빈 값)을 돌려준다. 애노테이션 javadoc이 명시하듯 "복잡한 fallback이 필요한 메서드에는 사용하지 않는다".

적용처: `RedisViewCountStore` 전 메서드, `RedisHotPostRanking` 전 메서드, `RedisTokenCacheStore.put/delete`, `RedisPostsCache`의 쓰기·evict 계열.

주의할 동작 2가지 (상세는 KI):

- aspect가 실패 로그에 `joinPoint.getArgs()`를 그대로 남긴다 — `RedisTokenCacheStore.put`의 인자에는 리프레시 토큰 원문이 포함된다 ([KI-18](../KNOWN-ISSUES.md#ki-18-resilientredisaspect가-민감-인자를-로그에-남김)).
- `catch (Exception)`이라 Redis 접속 오류가 아닌 버그(NPE, `NumberFormatException` 등)도 "Redis unavailable"로 위장되어 삼켜진다 (같은 KI).

### 정책 2 — 직접 try/catch (DB fallback 필요)

기본값 반환으로는 부족하고 DB를 다시 조회해야 하는 읽기 경로는 서비스/어댑터 코드가 직접 처리한다:

| 메서드 | fallback |
|---|---|
| `RedisPostsCache · getPostPrevs()` | `postRepository.findByBoard`로 DB 재조회 |
| `RedisPostsCache · getCount()` | `postRepository.countTotal` |
| `RedisTokenCacheStore · get()` | `Optional.empty()` 반환 → 호출자(`TokenService`)가 DB 조회 |
| `HotPostService · getLeaderboardDayHotPosts()` | 랭킹이 비면 `DailyHotPost` 테이블 조회 |

`getPostPrevs`는 추가로 캐시 미스 처리를 겸한다: 목록 키가 비면 DB 상위 50건을 읽어 워밍하고, 개별 게시글 미스는 `findAllDtoByIds`로 채운 뒤 재캐시한다.

## 조회수 파이프라인의 Redis 사용

읽기 경로에서 `PostDetailService`가 `ViewCountService.increaseViewCount()`를 호출하면 SETNX 중복방지 후 INCR로 버퍼에 쌓이고, 60초마다 `ViewCountScheduler`가 `consumePendingCounts()`로 소비해 DB에 반영한다 ([crosscutting/schedulers.md](schedulers.md)).

이 드레인이 Redis의 블로킹 명령 `KEYS post:views:*`를 사용한다는 점, 그리고 GETDEL로 지운 뒤 DB 반영이 실패하면 조회수가 유실된다는 점은 각각 [KI-17](../KNOWN-ISSUES.md#ki-17-조회수-드레인이-블로킹-keys-명령-사용), [KI-23](../KNOWN-ISSUES.md#ki-23-viewcountscheduler의-자기호출-트랜잭션과-드레인-유실) 참고.

## 코드 좌표

| 개념 | 위치 |
|---|---|
| 템플릿 빈 정의 | `configs/RedisConfig.java` |
| 장애 격리 AOP | `aop/ResilientRedis.java`, `aop/ResilientRedisAspect.java` |
| 조회수 버퍼 | `infrastructure/redis/RedisViewCountStore.java`, `services/domain/redisService/ViewCountService.java` |
| 핫랭킹 ZSET | `infrastructure/redis/RedisHotPostRanking.java`, `services/domain/HotPostService.java` |
| 토큰 캐시 | `infrastructure/redis/RedisTokenCacheStore.java` |
| 게시글 목록·건수 캐시 | `services/domain/redisService/RedisPostsCache.java` |

## 알려진 문제·미확인 사항

- [KI-17](../KNOWN-ISSUES.md#ki-17-조회수-드레인이-블로킹-keys-명령-사용) KEYS 명령 주기 사용
- [KI-18](../KNOWN-ISSUES.md#ki-18-resilientredisaspect가-민감-인자를-로그에-남김) 민감 인자 로깅 + 광범위 catch
- [KI-19](../KNOWN-ISSUES.md#ki-19-redisconfig에-동일-구성-redistemplate-빈-3개) 동일 구성 빈 중복
- [KI-20](../KNOWN-ISSUES.md#ki-20-핫랭킹-zset-키에-ttl이-없어-무기한-누적) 랭킹 키 TTL 부재
- [KI-22](../KNOWN-ISSUES.md#ki-22-게시글-생성-시-커밋-전에-redis-캐시를-갱신) 커밋 전 캐시 갱신 (트랜잭션 관점은 [transactions-events.md](transactions-events.md))
- `[미확인]` prod Redis의 maxmemory·eviction 정책 — 서버 설정이 저장소에 없어 랭킹 키 누적의 실제 영향 규모를 확정할 수 없음

마지막 검증일: 2026-07-30
