# 07. Performance — 성능 개선 이력과 재현 가능성

## 이 문서가 답하는 질문

- README의 성능 개선 서사(N+1, 인덱스, 커서 페이징, 캐싱, 락 비교)는 각각 코드 어디에 있는가?
- README가 보고하는 수치는 어떤 조건에서 측정되었고, 지금 저장소에서 재현 가능한가?
- 서버 튜닝 값(스레드, slow 로그 임계치)은 무엇인가?

## 3줄 요약

- README의 개선 항목 5건은 모두 현재 코드에서 좌표를 확인할 수 있다 — "게시판 목록 캐싱" 오서술은 README에서 정정됐다 ([KI-49](KNOWN-ISSUES.md) 갱신 참고).
- README의 **과거** 수치를 만든 당시 k6 스크립트는 저장소에 없으므로, 그 수치들은 여전히 "README가 보고하는 수치"로 읽어야 한다.
- 다만 2026-08부터는 [performance/](../performance/README.md)에 k6 스크립트·시나리오·전용 관측 환경·실행 이력 저장이 도입되어, **이후의 모든 측정은 저장소 안에서 재현·검증 가능하다**.

## 수치를 읽는 법 (먼저 읽을 것)

README "성능 개선 경험" 섹션의 수치(P95, 처리량 등)는 k6 부하 테스트 결과로 서술되어 있다. 측정 조건의 저장소 내 확인 가능 여부:

| 측정 조건 | 확인 가능? | 근거 |
|---|---|---|
| 데이터 규모: 게시글 10만 건 | 가능 | `src/main/resources/data.sql` — 재귀 CTE(`cte_max_recursion_depth=100000`)로 posts 10만 건 생성. 단 `spring.sql.init.mode=never`(dev·prod 공통)라 자동 실행되지 않는 **수동 적재 스크립트**다 |
| 당시 k6 스크립트·부하 시나리오 (VU 수, 지속시간 등) | 불가 | 과거 수치를 만든 스크립트는 `.gitignore`(`k6/`, `load-tests/`) 시절의 것으로 복원되지 않았다 |
| 당시 측정 환경 (하드웨어, DB 설정) | 불가 | `[미확인: 저장소에 기록 없음]` |
| **현재의 측정 체계** | 가능 | `performance/` — k6 스크립트(`scripts/`, `scenarios/`), 데이터셋 시더(`datasets/`), Docker 관측 스택(`environment/`), 실행 이력·회귀 판정(`tools/`, `reports/`). 새 측정은 실행 조건(데이터셋·부하 프로파일)까지 함께 기록된다 |

## 개선 항목별 코드 좌표

### 1. N+1 — fetch join

- README 서사: 게시글 목록에서 작성자·게시판 지연 로딩으로 페이지당 최대 20회 추가 쿼리 → fetch join으로 단일 쿼리화. 보고 수치: P95 119ms → 73ms.
- 코드: `domain/posts/PostRepository.java · findByBoard(Board, Pageable)` — `join fetch p.user` JPQL.
- 현재 맥락: 게시판 목록 조회의 주 경로는 QueryDSL DTO 프로젝션(`PostRepositoryCustomImpl.findByBoard`)으로 바뀌어 연관 엔티티를 아예 로딩하지 않고, `Post.nickname` 비정규화 컬럼(`domain/posts/Post.java`)으로 User 조인 자체를 제거했다. fetch join 쿼리는 엔티티가 필요한 경로에 남아 있다.

### 2. 복합 인덱스

- README 서사: (2-1) 최신순 조회의 FileSort 제거, (2-2) 좋아요·조회수 정렬 + OFFSET의 Full Scan 개선. 보고 수치: 2-2 기준 avg 15s+ → 2.2s.
- 코드: `domain/posts/Post.java · @Table(indexes = ...)` — 실제로는 3건이 정의되어 있다:
  - `idx_posts_brd_valid_id` (BRD_id, is_valid, PST_id DESC) — 최신순
  - `idx_posts_brd_valid_like` (BRD_id, is_valid, PST_like_count DESC) — 좋아요순
  - `idx_posts_brd_valid_view` (BRD_id, is_valid, PST_view_count DESC) — 조회순
- 주의: prod는 `ddl-auto=none`이라 `@Index` 선언이 자동 반영되지 않는다. prod 인덱스 실재 여부는 `[미확인: DB 접근 불가]`.

### 3. 커서 기반 페이징 (하이브리드)

- README 서사: OFFSET은 뒤 페이지일수록 느림 → id 커서 적용, 랜덤 페이지 이동은 OFFSET 유지. 보고 수치: avg 42ms → 11ms. 한계: 뒤쪽 페이지 OFFSET 요청 시 여전히 대량 스캔.
- 코드: `domain/posts/queryDsl/PostRepositoryCustomImpl.java · findByBoard(PostListingDto)` — 분기 조건은 `SortType.RECENT && !randomPage && lastSeedId != null`일 때만 `post.id.lt(lastSeedId)` 커서 + offset 미적용, 그 외에는 `page*size` OFFSET. 정렬 분기는 같은 파일 `getOrderSec()`.
- 상세 설계 배경: [adr/adr-003-hybrid-pagination.md](adr/adr-003-hybrid-pagination.md).

### 4. Redis 캐싱 3단계

- README 서사: 캐싱 없음(avg 2.22s) → 목록 캐싱(1.63s) → count까지 캐싱(19ms). count 쿼리가 주요 병목이라는 인사이트.
- 코드:
  - 게시글 목록 캐시: `services/domain/redisService/RedisPostsCache.java · getPostPrevs()` — 게시판별 id 리스트(`board:{id}:posts`) + 게시글 프리뷰(`posts:{id}`), TTL 30~60분, 캐시 미스 시 DB 적재 후 재조회, Redis 장애 시 DB fallback.
  - count 캐시: 같은 파일 `getCount()/createCount()` — `board:{id}:count`, TTL 5분.
  - 적용 범위: `services/domain/PostService.java · getPagedPosts()` — `page < CACHE_PAGE_LIMIT(5) && sortType == RECENT`일 때만 캐시 경로, 그 외는 DB 직행.
  - 무효화: `PostService.createPost()/updatePost()/deletePost()`에서 `evictBoard`/`evictPostPrev`/`incrementBoardCount` 호출.
- README가 말하는 "게시판 목록" 캐싱은 코드에 없다 — `services/domain/BoardService.java`는 `boardRepository.findAll()`을 캐시 없이 반환한다 (아래 ⑤).

### 5. 좋아요 카운트 락 전략 비교

README 트러블슈팅 섹션의 비교 표 (README가 보고하는 수치):

| 방식 | 정합성 | 실패율 | 처리량 | p95 |
|---|---|---|---|---|
| 락 없음 (채택) | 불일치 발생 | 1.68% | 205/s | 579ms |
| 낙관적 락 | 유지 | 79% | 81/s | 1.3s |
| 비관적 락 | 유지 | 0% | 68/s | 951ms |

- 코드: `services/domain/PostReactionService.java` — 락·`@Version` 없이 반응 저장 후 `syncCounts()`가 DB `COUNT` 재계산 값으로 비정규화 컬럼을 덮어쓴다(`Post.syncReactionCounts()`). 증분(+1/-1)이 아니라 재계산 동기화라 드리프트가 다음 반응 시점에 자가 보정된다.
- 상세 설계 배경: [adr/adr-001-reaction-count-no-lock.md](adr/adr-001-reaction-count-no-lock.md).

### 조회수 Redis 버퍼링 (README "게시글 조회" 섹션)

- 코드: `services/domain/redisService/ViewCountService.java`(중복 방지 1h TTL) → `infrastructure/redis/RedisViewCountStore.java`(SETNX + INCR, `KEYS post:views:*` 스캔) → `schedulers/ViewCountScheduler.java · syncViewsToDB()`(60초 주기 일괄 반영).
- 상세 설계 배경: [adr/adr-002-viewcount-redis-buffer.md](adr/adr-002-viewcount-redis-buffer.md).

## 서버 튜닝 값

전 프로파일 공통 (`src/main/resources/application.properties`):

| 설정 | 값 |
|---|---|
| `server.tomcat.threads.max` | 400 |
| `server.tomcat.threads.min-spare` | 50 |
| `server.tomcat.accept-count` | 200 |
| `server.tomcat.max-connections` | 10000 |
| `app.execution-logging.slow-threshold-ms` | 300 |

slow threshold는 `aop/ExecutionLoggingAspect.java`가 소비한다 — 컨트롤러·도메인 서비스 메서드가 300ms를 넘으면 WARN(`[API] Slow.` / `[Service] Slow.`), 이하면 DEBUG. 프로퍼티 미설정 시 코드 기본값은 100ms(`@Value` 기본값)이나 현재는 300이 명시돼 있다.

## 코드 좌표

| 개념 | 위치 |
|---|---|
| 복합 인덱스 정의 | `domain/posts/Post.java · @Table(indexes)` |
| 커서/오프셋 분기 | `domain/posts/queryDsl/PostRepositoryCustomImpl.java · findByBoard()` |
| fetch join | `domain/posts/PostRepository.java · findByBoard(Board, Pageable)` |
| 목록·count 캐시 | `services/domain/redisService/RedisPostsCache.java` |
| 캐시 적용 조건 | `services/domain/PostService.java · getPagedPosts()` (page<5, RECENT만) |
| 반응 카운트 동기화 | `services/domain/PostReactionService.java · syncCounts()` |
| 조회수 버퍼 | `infrastructure/redis/RedisViewCountStore.java`, `schedulers/ViewCountScheduler.java` |
| 10만 건 적재 스크립트 | `src/main/resources/data.sql` (수동 실행 전용 — `spring.sql.init.mode=never`) |
| 톰캣·slow threshold | `src/main/resources/application.properties` |

## 알려진 문제·미확인 사항

- [KI-31](KNOWN-ISSUES.md) 과거 수치를 만든 k6 스크립트는 복원 불가 — 현재 측정 체계는 `performance/`로 저장소에 포함됨 (갱신 줄 참고)
- [KI-49](KNOWN-ISSUES.md) README "게시판 목록 캐싱" 오서술 — 2026-08-11 README에서 정정됨
- `[미확인]` 2건: prod DB의 실제 인덱스 존재 여부, 과거 k6 측정 환경

마지막 검증일: 2026-08-11
