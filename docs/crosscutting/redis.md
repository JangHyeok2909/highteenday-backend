# Redis — 키 인벤토리, 장애 격리 정책

## 이 문서가 답하는 질문

- Redis에 어떤 키가 어떤 타입·TTL로 저장되는가?
- 각 키를 읽고 쓰는 코드는 어디이고, Redis 장애 시 무엇이 일어나는가?
- `@ResilientRedis` AOP와 직접 try/catch fallback은 어떻게 나뉘어 있는가?

## 3줄 요약

- 용도는 4가지다: 조회수 버퍼(카운터+중복방지), 핫게시글 랭킹(ZSET), 리프레시 토큰 캐시, 게시글 목록·건수 캐시.
- 장애 격리는 두 정책이다: 기본값 반환으로 충분한 단순 조작은 `@ResilientRedis` AOP, DB 재조회가 필요한 곳은 서비스 코드의 직접 try/catch.
- Redis가 죽어도 서비스는 계속 동작한다 — 대신 조회수 집계 중단, 랭킹 빈 목록(DB fallback), 토큰 검증 DB 직행, 목록 캐시 미스가 된다.

Port/Adapter 구분(왜 일부는 `infrastructure/redis/`이고 일부는 `services/domain/redisService/`인지)은 **도메인이 Redis 를 직접 알아야 하는가**로 갈린다 — 도메인이 포트 인터페이스만 아는 것은 `infrastructure/redis/` 로, 캐시처럼 Redis 자체가 관심사인 것은 `services/domain/redisService/` 로 간다.

## 키 인벤토리

실제 키 문자열은 전부 코드 상수·키 생성 메서드에서 확인했다.

| 키 패턴 | 타입 | TTL | 쓰는 코드 | 장애 시 동작 |
|---|---|---|---|---|
| `viewed:{postId}:{userId}` | String — SETNX 중복방지 | 1시간 (`ViewCountService · DEDUP_TTL`) | `infrastructure/redis/RedisViewCountStore · tryMarkViewed()` | AOP가 false 반환 → 조회수 증가 자체를 스킵 |
| `post:views:{postId}` | String — INCR 카운터 | 없음 — 스케줄러가 읽고(peek) DB 반영 후 반영분만 DECRBY로 차감, 0 이하면 삭제 | `RedisViewCountStore · incrementCount() / getCount() / peekPendingCounts() / settleCounts()` | AOP가 스킵/0/빈 Map 반환 → 그 주기 동기화 없음 |

| `hot:leaderboard:day:{yyyyMMdd}` | ZSET — 일별 전역 핫랭킹 | 2일 — 쓸 때마다 갱신 (`HotPostService · LEADERBOARD_DAY_TTL`, [KI-20](../KNOWN-ISSUES.md#ki-20-핫랭킹-zset-키에-ttl이-없어-무기한-누적) 갱신) |
 `infrastructure/redis/RedisHotPostRanking` 경유, 키는 `services/domain/HotPostService · leaderboardDayRedisKey()` | AOP가 빈 Set/List 반환 → 조회는 `DailyHotPost` DB fallback (`HotPostService · getLeaderboardDayHotPostsFromDb()`) |
| `hot:board:{boardId}realtime:{yyyyMMddHHmm}` | ZSET — 게시판별 5분 단위 실시간 랭킹 | 30분 (`REALTIME_BUCKET_TTL`) |
 `HotPostService · updateRecentScore() / getRecentHotPosts()`, 키는 `getKey()` | AOP가 빈 Set 반환 → 실시간 인기글 빈 목록 |
| `RT:{refreshToken}` | String — 값은 이메일 | 7일 또는 DB 만료까지 남은 시간 | `infrastructure/redis/RedisTokenCacheStore` | `put`/`delete`는 AOP 스킵, `get`은 직접 try/catch로 `Optional.empty()` → DB 조회로 fallback (`services/domain/TokenService · findByRefreshTokenOrThrow()`) |
| `board:{boardId}:posts` | List — 최신 게시글 id 최대 50개 | 60분 (`RedisPostsCache · BOARD_TTL`) | `services/domain/redisService/RedisPostsCache · addPostToBoard() / getPostPrevs()` | `getPostPrevs`가 직접 try/catch → `postRepository.findByBoard` DB 재조회 |
| `posts:{postId}` | String — `PostPreviewDto` JSON | 30분 (`POST_TTL`) | `RedisPostsCache · cachePostPrev()`, 미스 시 `findAllDtoByIds`로 채움 | 위와 동일 경로에서 함께 fallback |
| `board:{boardId}:count` | String — 게시글 총 건수 | 60분 (`COUNT_TTL = BOARD_TTL`) — 생성·증감 경로가 같은 값을 쓴다. 증감 시 키가 없었으면(`INCRBY` 반환값 = delta) 증감을 버리고 DB 재집계한다 ([KI-56](../KNOWN-ISSUES.md#ki-56-게시판-글-개수-캐시가-만료-후-첫-쓰기에서-1로-되살아난다) 갱신) | `RedisPostsCache · getCount() / createCount() / applyCountDelta()` | `getCount` 직접 try/catch → `postRepository.countTotal` |


- `services/domain/redisService/CursorCacheService`는 전체가 주석 처리된 빈 껍데기다 — 사용처 없음.
- `board:{boardId}:posts`는 최대 50개(`PostPrevCache.MAX_CACHED_POSTS`)만 담으므로, 캐시 경로 진입 조건은 `(page + 1) × size ≤ 50`이다. 예전에는 페이지 번호만 봐서 `size`가 크면 빈 목록이 반환됐다 ([KI-57](../KNOWN-ISSUES.md#ki-57-페이지-크기가-크면-캐시-경로가-빈-목록을-반환한다) 갱신).

- RedisTemplate 빈은 `configs/RedisConfig.java`에 5개 정의되어 있는데 그중 `boardTemplate`/`countingTemplate`/`hotPidTemplate` 3개는 구성이 동일하다 ([KI-19](../KNOWN-ISSUES.md#ki-19-redisconfig에-동일-구성-redistemplate-빈-3개)). `board:{boardId}:count` 키는 두 템플릿으로 접근하지만 직렬화가 같아 호환된다.


## 장애 격리 두 정책

### 정책 1 — `@ResilientRedis` AOP (단순 조작)

`aop/ResilientRedis` + `aop/ResilientRedisAspect`. 메서드에 애노테이션만 붙이면 aspect가 `DataAccessException`(스프링이 Lettuce 예외를 번역한 계열)을 잡고 반환 타입별 기본값(void 무시, boolean false, 숫자 0, 컬렉션 빈 값)을 돌려준다. 그 밖의 예외(NPE 등 코드 버그)는 삼키지 않고 그대로 전파된다.
 애노테이션 javadoc이 명시하듯 "복잡한 fallback이 필요한 메서드에는 사용하지 않는다".

적용처: `RedisViewCountStore` 전 메서드, `RedisHotPostRanking` 전 메서드, `RedisTokenCacheStore.put/delete`, `RedisPostsCache`의 쓰기·evict 계열.

실패 로그에는 메서드 이름·예외 타입·원인 메시지만 남긴다. 인자를 통째로 찍던 예전 동작은 `RedisTokenCacheStore.put`의 리프레시 토큰 원문이 로그에 남는 문제라 2026-08-28에 제거했다 ([KI-18](../KNOWN-ISSUES.md#ki-18-resilientredisaspect가-민감-인자를-로그에-남김) 갱신). 회귀 방지: `aop/ResilientRedisAspectTest.FailureHandling`.

### 정책 2 — 직접 try/catch (DB fallback 필요)

기본값 반환으로는 부족하고 DB를 다시 조회해야 하는 읽기 경로는 서비스/어댑터 코드가 직접 처리한다:

| 메서드 | fallback |
|---|---|
| `RedisPostsCache · getPostPrevs()` | `postRepository.findByBoard`로 DB 재조회 |
| `RedisPostsCache · getCount()` | `postRepository.countTotal` |
| `RedisTokenCacheStore · get()` | `Optional.empty()` 반환 → 호출자(`TokenService`)가 DB 조회 |
| `HotPostService · getLeaderboardDayHotPosts()` | 랭킹이 비면 `DailyHotPost` 테이블 조회 |

`getPostPrevs`는 추가로 캐시 미스 처리를 겸한다: 목록 키의 길이(`size(key)`)가 0이면 DB 상위 50건을 읽어 워밍하고, 개별 게시글 미스는 `findAllDtoByIds`로 채운 뒤 재캐시한다.


## 조회수 파이프라인의 Redis 사용

읽기 경로에서 `PostDetailService`가 `ViewCountService.increaseViewCount()`를 호출하면 SETNX 중복방지 후 INCR로 버퍼에 쌓이고, 60초마다 `ViewCountScheduler`가 `peekPendingViewCounts()`로 읽어 DB에 반영한 뒤 `settleViewCounts()`로 반영분만 차감한다 (`schedulers/ViewCountScheduler`). 반영에 실패한 게시글의 증가분은 Redis에 남아 다음 주기에 다시 시도된다 ([KI-23](../KNOWN-ISSUES.md#ki-23-viewcountscheduler의-자기호출-트랜잭션과-드레인-유실) 갱신).

이 드레인이 Redis의 블로킹 명령 `KEYS post:views:*`를 사용한다는 점은 그대로다 — [KI-17](../KNOWN-ISSUES.md#ki-17-조회수-드레인이-블로킹-keys-명령-사용).


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

- [KI-17](../KNOWN-ISSUES.md#ki-17-조회수-드레인이-블로킹-keys-명령-사용) KEYS 명령 주기 사용 — 미해결
- [KI-19](../KNOWN-ISSUES.md#ki-19-redisconfig에-동일-구성-redistemplate-빈-3개) 동일 구성 빈 중복 — 미해결
- [KI-18](../KNOWN-ISSUES.md#ki-18-resilientredisaspect가-민감-인자를-로그에-남김) 민감 인자 로깅 + 광범위 catch, [KI-20](../KNOWN-ISSUES.md#ki-20-핫랭킹-zset-키에-ttl이-없어-무기한-누적) 랭킹 키 TTL 부재, [KI-22](../KNOWN-ISSUES.md#ki-22-게시글-생성-시-커밋-전에-redis-캐시를-갱신) 커밋 전 캐시 갱신, [KI-23](../KNOWN-ISSUES.md#ki-23-viewcountscheduler의-자기호출-트랜잭션과-드레인-유실) 드레인 유실, [KI-56](../KNOWN-ISSUES.md#ki-56-게시판-글-개수-캐시가-만료-후-첫-쓰기에서-1로-되살아난다)·[KI-57](../KNOWN-ISSUES.md#ki-57-페이지-크기가-크면-캐시-경로가-빈-목록을-반환한다) 목록 캐시 결함 — 전부 해소 (각 항목의 갱신 줄 참고)
- `[미확인]` prod Redis의 maxmemory·eviction 정책 — 서버 설정이 저장소에 없다

마지막 검증일: 2026-09-05

