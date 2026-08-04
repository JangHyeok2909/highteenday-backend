# operations/runbook — 시나리오별 대응 절차

## 이 문서가 답하는 질문

- Redis가 죽으면 서비스에 무슨 일이 일어나고, 무엇이 유실되는가?
- 배포가 실패하면 어떻게 되돌리는가?
- 스키마 변경은 어떤 절차로 하는가?
- 로그는 어디서 어떻게 보는가?

## 3줄 요약

- Redis 장애 시 서비스는 계속 동작한다 — `@ResilientRedis`가 기본값을 반환하고 캐시·랭킹·토큰은 DB로 fallback한다. 대가는 조회수 유실이다.
- 배포 실패 시 자동 롤백이 없다 — ECR의 이전 커밋 SHA 태그로 수동 재기동해야 한다 (절차 자체는 `[미확인]`).
- 스키마 변경은 dev에서는 `ddl-auto=update` 자동, prod에서는 수동 SQL이다 — `ddl/` 스크립트에 FK 오타가 있으니 그대로 실행하지 말 것 (아래 ⑤).

## 시나리오 1: Redis가 죽으면 무슨 일이 일어나는가

애플리케이션은 죽지 않는다. 격리 장치는 두 겹이다 ([02-architecture.md](../02-architecture.md)의 Redis 장애 격리 규칙):

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
- Redis 데이터가 날아간 경우(재시작 등): `post:views:*`에 버퍼링돼 있던 미반영 증분이 유실된다. `ViewCountScheduler.syncViewsToDB()`가 60초 주기(fixedDelay)로 비우므로 유실 폭은 최대 직전 sync 이후 누적분이다. 또한 `viewed:*` 중복 방지 키(1h TTL)도 사라지므로 복구 직후 같은 사용자의 조회가 한 번 더 집계될 수 있다.
- 게시글 본문의 조회수 표시는 DB 누적값 + Redis 버퍼(`getCount`, 장애 시 0)로 조합되므로 장애 중에는 버퍼 몫만큼 낮게 보인다.

복구 후 별도 조치는 필요 없다 — 캐시는 미스 시 재적재되고, 핫 랭킹은 스케줄러가 재계산한다.

## 시나리오 2: 배포가 실패하면

현재 자동 롤백이 없다 ([deploy.md](deploy.md) ⑤). deploy job은 `docker compose up -d --force-recreate`로 끝나며 기동 성공 여부를 확인하지 않는다.

수동 롤백 절차 `[미확인: 실제로 검증한 적 없는 절차다 — 아래는 파이프라인 구조에서 도출한 것]`:

1. build job이 이미지를 **커밋 SHA 태그**로 ECR에 push하므로(`.github/workflows/deploy.yml · build`), 이전 정상 커밋의 SHA 태그 이미지가 ECR에 남아 있다.
2. EC2 접속 후 `~/app/.env`의 `ECR_IMAGE=` 값을 이전 SHA 태그 URI로 수정.
3. `docker compose -f docker-compose.prod.yml --env-file .env pull && docker compose -f docker-compose.prod.yml --env-file .env up -d --force-recreate`.
4. 확인: `curl http://localhost:8080/actuator/health` → `{"status":"UP"}`.

대안: 이전 정상 커밋을 `main`에 revert-push하면 파이프라인이 그 커밋으로 재배포한다 (이미지 재빌드 시간 소요).

주의: `latest` 태그는 실패한 빌드를 가리키고 있을 수 있으므로 롤백에 쓰지 말 것. ECR 이미지 보존 기간(수명주기 정책)은 `[미확인: AWS 콘솔 접근 불가]`.

## 시나리오 3: 스키마를 변경하려면

- **dev**: `spring.jpa.hibernate.ddl-auto=update`(`application-dev.properties`) — 엔티티 수정 후 재기동하면 자동 반영된다. 컬럼 삭제·타입 변경은 update가 처리하지 않으므로 수동 확인 필요.
- **prod**: `ddl-auto=none`(`application-prod.properties`) — **배포 전에 수동 SQL을 직접 실행**해야 한다. 관례는 `src/main/resources/ddl/`에 마이그레이션 스크립트를 남기는 것이다. `ddl/V_group_chat.sql` 상단 주석이 절차를 명시한다: "prod 는 ddl-auto=none 이므로 이 스크립트를 배포 전에 직접 실행해야 한다", 그리고 순서 규칙(컬럼 추가 → 백필 → NOT NULL/UNIQUE 제약)까지 담고 있어 새 스크립트 작성의 모범이다.
- **주의**: `ddl/V_daily_hot_post.sql`의 FK가 존재하지 않는 `post` 테이블을 참조한다(실 테이블명은 `posts` — `domain/posts/Post.java · @Table(name="posts")`). 그대로 실행하면 실패하므로 수정 후 실행해야 한다 ([KI-28](../KNOWN-ISSUES.md)).
- prod 스키마 변경 실행 이력·검증 기록은 저장소에 없다 `[미확인: 스크립트가 prod에 실제 적용되었는지 확인 불가]`.

## 시나리오 4: 로그를 보려면

- **prod 컨테이너 로그**: EC2에서 `docker logs -f highteenday-app` (`docker-compose.prod.yml · container_name`). 로그 레벨은 INFO(`application-prod.properties`)라 정상 요청은 안 찍히고, 300ms 초과 요청이 `[API] Slow.` / `[Service] Slow.` WARN으로 찍힌다 (`aop/ExecutionLoggingAspect.java`). 파일 적재·수집 설정은 없다 — 컨테이너 재생성 시 이전 로그가 사라진다 `[미확인: EC2 도커 로깅 드라이버 설정에 따라 다를 수 있음]`.
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
| prod 수동 DDL 관례 | `src/main/resources/ddl/` (V_group_chat.sql 주석이 절차 명시) |
| p6spy 설정 | `src/main/resources/spy.properties`, `application-dev.properties`의 p6spy 키 |

## 알려진 문제·미확인 사항

- [KI-28](../KNOWN-ISSUES.md) `ddl/V_daily_hot_post.sql`의 FK가 존재하지 않는 `post` 테이블 참조 (실 테이블명 `posts`) — 그대로 실행 시 실패
- [KI-48](../KNOWN-ISSUES.md) 배포 후 검증·자동 롤백 부재 ([deploy.md](deploy.md)와 동일 항목)
- [KI-01](../KNOWN-ISSUES.md#ki-01-docker-composeyml이-실행-불가) 로컬 compose 전체 기동 불가 — 로컬 장애 재현 시 참고
- `[미확인]` 4건: 수동 롤백 절차의 실검증, ECR 이미지 보존 정책, prod DDL 적용 이력, EC2 도커 로깅 드라이버

마지막 검증일: 2026-07-30
