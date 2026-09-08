# operations/runbook — 시나리오별 대응 절차

## 이 문서가 답하는 질문

- Redis가 죽으면 서비스에 무슨 일이 일어나고, 무엇이 유실되는가?
- 배포가 실패하면 어떻게 되돌리는가?
- 스키마 변경은 어떤 절차로 하는가?
- 로그는 어디서 어떻게 보는가?

## 3줄 요약

- Redis 장애 시 서비스는 계속 동작한다 — `@ResilientRedis`가 기본값을 반환하고 캐시·랭킹·토큰은 DB로 fallback한다. 대가는 장애 중 조회수 유실이다.
- 배포 실패 시 워크플로가 헬스체크 뒤 직전 이미지로 자동 롤백한다. 그래도 안 되면 ECR의 이전 커밋 SHA 태그로 수동 재기동한다 (수동 절차는 `[미확인]`).
- 스키마 변경은 Flyway 마이그레이션을 새 번호로 추가하는 것이다 ([MIGRATION.md](../MIGRATION.md)). `ddl/`의 옛 수동 스크립트는 실행하지 않는다.


## 시나리오 1: Redis가 죽으면 무슨 일이 일어나는가

애플리케이션은 죽지 않는다. 격리 장치는 두 겹이다 (키별 정책은 [crosscutting/redis.md](../crosscutting/redis.md)):

1. **`@ResilientRedis` (단순 조작)** — `aop/ResilientRedisAspect.java · handle()`이 예외를 잡아 WARN 로그 후 반환 타입별 기본값을 돌려준다: void→null, boolean→false, 숫자→0, List/Set/Map→빈 컬렉션 (`defaultValue()`).
2. **서비스 내 try/catch (복잡한 fallback)** — DB 재조회가 필요한 경로.

경로별 실제 동작:

| 경로 | 장애 시 동작 | 근거 |
|---|---|---|
| 게시글 목록 캐시 | try/catch로 DB 직접 조회 (`findByBoard`) | `services/domain/redisService/RedisPostsCache.java · getPostPrevs()` catch 블록 |
| 게시글 count 캐시 | try/catch로 `postRepository.countTotal()` | 같은 파일 `getCount()` |
| 일간 핫게시글 | `topPostIds()`가 `@ResilientRedis`로 빈 Set 반환 → `getLeaderboardDayHotPostsFromDb()`가 `daily_hot_post` 테이블에서 조회 (5분 주기 `syncLeaderboardDayToDb()`가 미리 적재해 둔 스냅샷) | `services/domain/HotPostService.java · getLeaderboardDayHotPosts()`, `infrastructure/redis/RedisHotPostRanking.java` |
| 리프레시 토큰 검증 | 캐시 get이 장애 시 empty 반환 → DB `tokenRepository.findByRefreshToken()` 재조회 후 재적재 시도 | `services/domain/TokenService.java · findByRefreshTokenOrThrow()`, `infrastructure/redis/RedisTokenCacheStore.java` |
| 조회수 | **유실** — 아래 참고 | `infrastructure/redis/RedisViewCountStore.java` |

**조회수 유실 범위** (코드 근거):

- 장애 지속 중: `tryMarkViewed()`가 `@ResilientRedis`로 false를 반환 → `ViewCountService.increaseViewCount()`가 증가를 건너뜀. 장애 동안의 조회는 **집계되지 않고 영구 유실**된다.
- Redis 데이터가 날아간 경우(재시작 등): `post:views:*`에 버퍼링돼 있던 미반영 증분이 유실된다. `ViewCountScheduler.syncViewsToDB()`가 60초 주기(fixedDelay)로 반영하므로 유실 폭은 최대 직전 sync 이후 누적분이다. 반영에 실패한 증가분은 Redis에 남겨 다음 주기에 재시도하므로 DB 쪽 실패로는 유실되지 않는다 ([KI-23](../KNOWN-ISSUES.md#ki-23-viewcountscheduler의-자기호출-트랜잭션과-드레인-유실) 갱신). 또한 `viewed:*` 중복 방지 키(1h TTL)도 사라지므로 복구 직후 같은 사용자의 조회가 한 번 더 집계될 수 있다.

- 게시글 본문의 조회수 표시는 DB 누적값 + Redis 버퍼(`getCount`, 장애 시 0)로 조합되므로 장애 중에는 버퍼 몫만큼 낮게 보인다.

복구 후 별도 조치는 필요 없다 — 캐시는 미스 시 재적재되고, 핫 랭킹은 스케줄러가 재계산한다.

## 시나리오 2: 배포가 실패하면

deploy job이 `docker compose up -d` 뒤 `http://localhost:8081/actuator/health`가 UP이 될 때까지 최대 120초 기다리고, 실패하면 컨테이너 상태와 로그 200줄을 출력한 뒤 **배포 직전 이미지로 되돌리고** 워크플로를 실패시킨다 (`.github/workflows/` 의 deploy job, [KI-48](../KNOWN-ISSUES.md) 갱신). 따라서 보통은 사람이 손댈 일이 없다.

자동 롤백까지 실패했거나 정상 기동한 버전을 더 뒤로 돌려야 할 때의 수동 절차 `[미확인: 실제로 검증한 적 없는 절차다 — 아래는 파이프라인 구조에서 도출한 것]`:

1. build job이 이미지를 **커밋 SHA 태그**로 ECR에 push하므로(`.github/workflows/deploy.yml · build`), 이전 정상 커밋의 SHA 태그 이미지가 ECR에 남아 있다.
2. EC2 접속 후 `~/app/.env`의 `ECR_IMAGE=` 값을 이전 SHA 태그 URI로 수정.
3. `docker compose -f docker-compose.prod.yml --env-file .env pull && docker compose -f docker-compose.prod.yml --env-file .env up -d --force-recreate`.
4. 확인: `curl http://localhost:8081/actuator/health` → `{"status":"UP"}`.

대안: 이전 정상 커밋을 `main`에 revert-push하면 파이프라인이 그 커밋으로 재배포한다 (이미지 재빌드 시간 소요).

주의: `latest` 태그는 실패한 빌드를 가리키고 있을 수 있으므로 롤백에 쓰지 말 것. ECR 이미지 보존 기간(수명주기 정책)은 `[미확인: AWS 콘솔 접근 불가]`.

## 시나리오 3: 스키마를 변경하려면

- 엔티티를 고치고 `src/main/resources/db/migration/`에 `V{다음 번호}__{설명}.sql`을 추가한다. 이미 적용된 파일은 체크섬 때문에 수정할 수 없다 — 되돌리려면 새 번호로 되돌리는 마이그레이션을 추가한다. 절차·로컬 검증 명령·`baseline-on-migrate` 동작은 [MIGRATION.md](../MIGRATION.md).
- 기존 행이 있는 컬럼 추가는 **컬럼 추가 → 값 백필 → NOT NULL/UNIQUE 제약** 순서로 나눠 쓴다. 백필 전에 제약을 걸면 기존 행 때문에 실패한다.
- dev·prod 모두 `ddl-auto=none`이라 엔티티만 고치면 스키마가 바뀌지 않는다. dev DB에는 예전 `ddl-auto=update` 시절의 타입 드리프트(enum vs VARCHAR)가 남아 있어, 정리한 뒤 `validate`로 올리는 것이 목표다 (`application-dev.properties` 주석).
- `src/main/resources/ddl/`의 수동 스크립트 2개는 Flyway 도입 이전 기록이다. `V_daily_hot_post.sql`은 존재하지 않는 `post` 테이블을 참조해 그대로 실행하면 실패하고, 필요한 테이블은 V6가 만든다 ([KI-28](../KNOWN-ISSUES.md#ki-28-수동-ddl과-실제-스키마의-불일치)).
- 배포 후 확인: `SELECT version, description, success FROM flyway_schema_history ORDER BY installed_rank;`

## 시나리오 4: 로그를 보려면

- **prod 컨테이너 로그**: EC2에서 `docker logs -f highteenday-app` (`docker-compose.prod.yml · container_name`). 로그 레벨은 INFO(`application-prod.properties`)라 정상 요청은 안 찍히고, 300ms 초과 요청이 `[API] Slow.` / `[Service] Slow.` WARN으로 찍힌다 (`aop/ExecutionLoggingAspect.java`). 요청당 쿼리가 20개를 넘으면 `metrics/QueryCountFilter`가 WARN을 남긴다. 파일 적재·수집 설정은 없다 — 컨테이너 재생성 시 이전 로그가 사라진다 `[미확인: EC2 도커 로깅 드라이버 설정에 따라 다를 수 있음]`.

- **SQL 로그 (p6spy)**: dev는 `decorator.datasource.p6spy.enable-logging=false`로 꺼져 있다. 켜려면 dev 프로퍼티에서 `true`로 바꾸고 `logging.level.p6spy`를 `info`로 올린다. 포맷은 `src/main/resources/spy.properties`(SingleLineFormat) — 파일 주석대로 `excludecategories`가 주석 처리되어 있어 켜면 모든 SQL(N+1 관찰 포함)이 출력된다. prod는 `logging.level.p6spy=off`로 완전 차단.
- **스케줄러 수명주기**: `@SchedulerJob` AOP(`aop/SchedulerJobAspect`)가 시작/종료를 로깅한다 — 조회수 sync는 `View count batch sync complete. synced=...` INFO 로그로 동작 여부를 확인할 수 있다 (`schedulers/ViewCountScheduler.java`).

## 코드 좌표

| 개념 | 위치 |
|---|---|
| Redis 기본값 반환 | `aop/ResilientRedisAspect.java · handle() / defaultValue()` |
| 목록·count DB fallback | `services/domain/redisService/RedisPostsCache.java · getPostPrevs() / getCount()` |
| 핫게시글 DB fallback | `services/domain/HotPostService.java · getLeaderboardDayHotPostsFromDb() / syncLeaderboardDayToDb()` |
| 토큰 캐시 miss 시 DB 재조회 | `services/domain/TokenService.java · findByRefreshTokenOrThrow()` |
| 조회수 버퍼·유실 지점 | `infrastructure/redis/RedisViewCountStore.java`, `schedulers/ViewCountScheduler.java · syncViewsToDB()` |
| 스키마 마이그레이션 | `src/main/resources/db/migration/`, 절차는 [MIGRATION.md](../MIGRATION.md) |
| 배포 헬스체크·롤백 | `.github/workflows/deploy.yml · deploy` 잡의 SSH 스크립트 |

| p6spy 설정 | `src/main/resources/spy.properties`, `application-dev.properties`의 p6spy 키 |

## 알려진 문제·미확인 사항

- [KI-28](../KNOWN-ISSUES.md) `ddl/V_daily_hot_post.sql`의 FK가 존재하지 않는 `post` 테이블 참조 — 기록용 스크립트라 실행 대상이 아니며, 필요한 테이블은 V6가 만든다
- [KI-48](../KNOWN-ISSUES.md) 배포 후 검증·자동 롤백 부재 — 해소
- [KI-17](../KNOWN-ISSUES.md#ki-17-조회수-드레인이-블로킹-keys-명령-사용) 조회수 드레인의 `KEYS` 명령 — 키가 많아지면 60초마다 Redis 전체가 멈칫한다. 미해결
- `[미확인]` 4건: 수동 롤백 절차의 실검증, ECR 이미지 보존 정책, prod DDL 적용 이력, EC2 도커 로깅 드라이버

마지막 검증일: 2026-09-05

