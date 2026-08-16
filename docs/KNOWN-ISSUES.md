# KNOWN-ISSUES — 확인된 결함과 문서-코드 불일치

온보딩 문서 작성 과정에서 실제 코드를 읽고 확인한 결함·불일치의 단일 목록이다.
다른 문서는 결함을 본문에 서술하지 않고 이 파일의 항목 번호(KI-nn)로 링크한다.

> KI-01~12는 Phase 1(구조·흐름 문서), KI-13~31은 Phase 2(crosscutting·데이터 모델 문서),
> KI-32부터는 Phase 3~4(도메인·운영 문서) 작성 중 확인된 항목이다 — 전 Phase 보강 완료.
> "확인 방법"은 신입이 직접 재현해볼 수 있는 절차다.
>
> **2026-08-11 상태 재검증**: 최초 검증(2026-07-30) 이후 Flyway 도입(V1~V7), 반응/스크랩
> upsert 전환, RecentHotPost 엔티티 삭제 등이 반영되어 일부 항목이 해소되었다. 해소된
> 항목은 삭제하지 않고 원문 아래 **→ 갱신** 줄로 현재 상태를 남긴다 (발견 당시 기록 보존).

## 실행 환경

### KI-01. docker-compose.yml이 실행 불가
- 위치: `docker-compose.yml` — `services` 아래 MySQL 섹션이 주석 헤더만 있고 서비스 정의가 비어 있는데, `app` 서비스가 `depends_on: mysql`을 참조한다.
- 결과: `docker compose up`이 `service "app" depends on undefined service "mysql"`로 즉시 실패한다.
- 확인 방법: 저장소 루트에서 `docker compose up` 실행.
- 우회: [00-quickstart.md](00-quickstart.md)의 절차대로 Redis만 compose로 띄우고 MySQL·앱은 개별 기동.

### KI-02. 기본 프로파일 local의 프로퍼티 파일이 없음
- 위치: `src/main/resources/application.properties` — `spring.profiles.active=local`이 기본값인데 `application-local.properties`는 gitignore 대상이며 저장소에 없다.
- 결과: 아무 옵션 없이 `./gradlew bootRun` 하면 datasource·JWT 키가 없어 부팅에 실패한다.
- 우회: dev 프로파일 사용 ([00-quickstart.md](00-quickstart.md)).

## 보안

### KI-03. 실제 NEIS API 키가 소스 주석에 커밋되어 있음
- 위치: `api/SchoolInfoService.java` — `apiKey` 필드 위 주석에 실제 키 문자열이 남아 있고, git 히스토리 다수 리비전에도 존재한다.
- 조치 필요: 주석 삭제 + NEIS 포털에서 키 재발급(히스토리에 남으므로 삭제만으로는 무효화되지 않음).
- → 갱신 (2026-08-11): 소스의 주석은 삭제됨. **키 재발급은 여전히 필요** — git 히스토리에 키가 남아 있다.

### KI-04. GET 전체가 permitAll인 블랙리스트 인가 구조
- 위치: `security/SecurityConfig.java · filterChain()` — 명시된 GET 경로만 `authenticated()`이고 마지막에 `GET /**`가 `permitAll()`이다.
- 결과: 새 GET 엔드포인트를 추가하면 기본값이 "전체 공개"가 된다. 공개된 GET 핸들러가 `@AuthenticationPrincipal`을 null 체크 없이 사용하는 곳에서는 비인증 요청 시 401이 아니라 NPE 500이 난다.

### KI-05. 게시글·댓글 수정/삭제에 소유권 검증이 없음 (IDOR)
- 위치: `services/domain/PostService.java · updatePost() / deletePost()`, `services/domain/CommentService.java · updateComment() / deleteComment()` — 파라미터로 받은 `userId`를 리소스 작성자와 비교하지 않는다.
- 결과: 로그인한 아무 사용자가 남의 글·댓글을 수정/삭제할 수 있다.
- 참고: `NotificationService.validateOwnership()`, `ChatService.requireParticipant()`에는 검증이 있다 — 일관성이 없는 상태.

### KI-06. 쿠키 인증 + SameSite=None + CSRF 비활성 조합
- 위치: `security/SecurityConfig.java · filterChain()`의 `csrf disable` + `application-prod.properties`의 `app.cookie-same-site=None`.
- 결과: HttpOnly 쿠키로 인증하면서 CSRF 방어가 없어 크로스사이트 쓰기 위조가 이론상 가능하다. 대응 방침 결정 필요.

## 인증 필터 체인

### KI-07. TokenAuthenticationFilter가 예외를 삼켜 TokenExceptionFilter가 사실상 동작하지 않음
- 위치: `security/TokenAuthenticationFilter.java · doFilterInternal()` — `tokenProvider.getAuthentication()` 실패를 `catch (RuntimeException)`으로 잡아 log.warn만 하고 통과시킨다. 같은 파일에 주석 처리된 `throw new TokenException(...)`과 빈 else 블록이 남아 있다.
- 결과: 앞단에 등록된 `TokenExceptionFilter`(만료/서명오류를 코드별 401로 변환하는 역할)에 예외가 도달하지 못한다. 클라이언트는 토큰 상태와 무관하게 익명 사용자로 진행되다가 인가 단계에서 일괄 401을 받는다. [04-request-flow.md](04-request-flow.md) 참고.

### KI-08. 인증 성공 경로가 요청마다 DB를 조회
- 위치: `security/TokenProvider.java · getAuthentication()` — JWT 클레임 파싱 후 `userRepository.findByEmail()`로 매 요청 사용자 조회.
- 결과: stateless JWT의 이점이 사라지고 인증 경로가 요청당 최소 1 SELECT를 유발한다.

## 문서-코드 불일치 (Phase 1에서 확인분)

### KI-09. README 실행 가이드가 현재 코드와 불일치
- `README.md` 실행 섹션이 `jwt.secret`, `jwt.access-token-expiration` 등 코드에 존재하지 않는 프로퍼티 키를 안내한다. 실제 키는 `jwt.key`다. DB명도 `highteenday`로 안내하나 dev 기본값은 `highteenday_db`다.
- README 기술 스택 표의 "CI/CD: GitHub Actions → EC2 (PM2)"는 과거 방식이다. 현재는 Docker/ECR 배포다 (`.github/workflows/deploy.yml`).
- → 갱신 (2026-08-11): **해소** — README 실행 섹션을 실제 환경변수 기반으로 재작성하고 00-quickstart.md로 연결, CI/CD 표기를 ECR/Docker로 정정.

### KI-10. SYSTEM_ARCHITECTURE.md가 구버전 상태로 방치됨
- Next.js·duckdns 도메인·`PostLike`/`PostDislike`(통합 전 스키마)·잘못된 OAuth 콜백 경로 등 현재 코드와 다른 서술 다수. 현행 기준은 [02-architecture.md](02-architecture.md)를 따른다.

### KI-11. README의 핫스코어 갱신 주기 서술이 코드와 다름
- README는 "1분 주기로 전체 게시글 스코어 갱신"이라 하나, 코드는 `schedulers/HotScoreScheduler.java · @Scheduled(fixedRate = 5분)`로 리더보드 상위 50개만 갱신한다.
- → 갱신 (2026-08-11): **해소** — README 핫게시글 절을 5분 주기·상위 50개 갱신으로 정정.

## 테스트·CI

### KI-12. 테스트가 CI에서 실행되지 않음
- `.github/workflows/deploy.yml`은 배포 전용이며 `gradlew test` 단계가 없다. `Dockerfile`도 `-x test`로 빌드한다. `src/test/resources`에 테스트 프로파일이 없어 `HighteendayBackendApplicationTests`(@SpringBootTest)는 실 DB 없이 실패한다.

## 에러 처리

### KI-13. GlobalExceptionHandler의 죽은 핸들러와 내부 메시지 노출
- 위치: `exceptions/GlobalExceptionHandler.java` — 세 가지 문제가 겹쳐 있다.
  - 400 핸들러가 `java.net.BindException`(네트워크 포트 바인딩 예외)을 import한다. 검증 바인딩 실패용 `org.springframework.validation.BindException`이 아니므로 이 등록은 죽은 코드다.
  - 400/403/404/405/409/500 응답의 `message`에 `e.getMessage()`를 그대로 잇는다 — 500조차 내부 예외 메시지가 클라이언트로 나간다.
  - `handleCustomException`이 `e.getErrorCode().getMessage()`(기본 메시지)만 쓰므로 `CustomException(ErrorCode, "상세 메시지")`로 넣은 상세가 응답에 반영되지 않는다.
- 결과: 검증 실패의 응답 일관성 저하 + 내부 구현 정보 노출 + 상세 메시지 유실.
- 확인 방법: 파일 상단 import 절과 각 핸들러의 body 조립부를 읽는다.

### KI-14. TokenService가 ErrorCode 없이 raw RuntimeException을 던짐
- 위치: `services/domain/TokenService.java · findByRefreshTokenOrThrow() / findByAccessTokenOrThrow() / deleteByUserEmail() / saveOrUpdate()` — 전부 `new RuntimeException("...")`.
- 결과: 리프레시 토큰 만료·무효라는 정상 시나리오가 `GlobalExceptionHandler`의 500 경로로 떨어진다. 클라이언트는 401을 못 받아 재로그인 유도가 어렵다.
- 부기: 이 클래스만 `jakarta.transaction.Transactional`을 import한다 (다른 서비스는 전부 `org.springframework...Transactional`).
- 확인 방법: 만료된 refreshToken 쿠키로 `POST /api/token/refresh` 호출 → 500 응답.

### KI-15. UserService가 검증 실패 400을 500으로 변환
- 위치: `services/domain/UserService.java · updateNickname() / updatePassword()` — VO 생성(`new Nickname(...)`, `Password.fromRawPassword(...)`)을 `catch (Exception)`으로 감싸 `CustomException(INTERNAL_ERROR)`로 다시 던진다.
- 결과: VO가 던진 400대 `CustomException`(INVALID_NICKNAME_FORMAT, INVALID_PASSWORD_FORMAT)이 500 INTERNAL_ERROR로 바뀐다. 예: 1자 닉네임으로 `PATCH /api/user/nickname` → 400이어야 하나 500.
- 확인 방법: 위 요청을 보내고 응답 코드를 본다. `domain/users/vo/Nickname.java` 생성자와 대조.

### KI-16. 요청 본문 검증이 사실상 미적용
- 위치: `@Valid`가 `src/main/java` 전체에서 3곳뿐이다 (grep 전수 확인).
  - 유효 2곳: `controllers/UserController · loginUser()`, `controllers/PostController · createPost()`.
  - 무효 1곳: `services/domain/PostService · updatePost(..., @Valid UpdatePostDto)` — 클래스에 `@Validated`가 없어 메서드 검증이 동작하지 않는다.
- 결과: 댓글·채팅·친구·회원가입 등 나머지 `@RequestBody` DTO는 Bean Validation을 타지 않고, VO·수동 검사·DB 제약에 의존한다. DTO에 어떤 제약 애노테이션을 붙여도 조용히 무시되는 함정.
- 조치 필요: 컨트롤러 `@RequestBody`에 `@Valid` 일괄 적용 또는 서비스 클래스에 `@Validated` 추가 중 방침 결정.

## Redis

### KI-17. 조회수 드레인이 블로킹 KEYS 명령 사용
- 위치: `infrastructure/redis/RedisViewCountStore.java · consumePendingCounts()` — `redisTemplate.keys(VIEW_COUNT_PREFIX + "*")`. `schedulers/ViewCountScheduler`가 60초마다 호출한다.
- 결과: KEYS는 전체 키스페이스를 훑는 O(N) 블로킹 명령이다. 키가 많아지면 60초마다 Redis 전체가 멈칫하며, 같은 인스턴스를 쓰는 토큰 캐시·게시글 캐시까지 지연된다. SCAN 또는 별도 Set 인덱스로 대체 필요.
- 확인 방법: 코드에서 `keys(` 호출 확인. redis-cli `MONITOR`로 60초마다 KEYS가 찍히는 것 관찰.

### KI-18. ResilientRedisAspect가 민감 인자를 로그에 남김
- 위치: `aop/ResilientRedisAspect.java · handle()` — 실패 시 `log.warn(..., joinPoint.getArgs(), e)`.
- 결과: `RedisTokenCacheStore.put/delete`의 첫 인자가 리프레시 토큰 원문이므로, Redis 장애 시 유효한 토큰이 로그 파일에 평문으로 남는다. 또한 `catch (Exception)`이라 Redis 접속 오류가 아닌 코드 버그(NPE 등)도 "Redis unavailable"로 위장되어 삼켜진다.
- 조치 필요: 인자 로깅 제거(또는 마스킹) + catch 범위를 `DataAccessException` 계열로 축소.

### KI-19. RedisConfig에 동일 구성 RedisTemplate 빈 3개
- 위치: `configs/RedisConfig.java` — `boardTemplate`, `countingTemplate`, `hotPidTemplate`이 전부 `RedisTemplate<String, Long>` + StringRedisSerializer + GenericToStringSerializer로 완전히 같다.
- 결과: 기능 문제는 없으나 빈 하나로 충분한 중복이다. `RedisPostsCache`는 같은 키(`board:{id}:count`)를 증감은 `boardTemplate`, 조회는 `countingTemplate`으로 접근해 읽는 사람을 혼란시킨다.
- 확인 방법: 세 빈 정의를 나란히 비교.

### KI-20. 핫랭킹 ZSET 키에 TTL이 없어 무기한 누적
- 위치: `infrastructure/redis/RedisHotPostRanking.java · addScore()` — expire 설정이 없다. 키는 날짜 접미사(`hot:leaderboard:day:{yyyyMMdd}`)와 5분 접미사(`hot:board:{boardId}realtime:{yyyyMMddHHmm}`)로 매일/5분마다 새로 생긴다.
- 결과: 지나간 날짜·시각의 ZSET이 삭제되지 않고 Redis 메모리에 계속 쌓인다. 정리 스케줄러도 없다.
- 확인 방법: 서버를 이틀 이상 돌린 뒤 redis-cli `KEYS hot:*`로 과거 날짜 키가 남아 있는 것 확인.

## 트랜잭션·이벤트

### KI-21. S3 원격 호출이 트랜잭션 내부에서 실행됨
- 위치: `services/domain/MediaProcessingService.java` — 전 메서드가 `@Transactional`이며 내부에서 `fileStorage.copyToFinalLocation()`/`deleteByUrl()`(S3 네트워크 호출)을 수행한다. 호출자인 `services/domain/PostService · createPost()/updatePost()`, `CommentService · createComment()`도 트랜잭션 안이다.
- 결과: (1) S3 지연 동안 DB 커넥션·락을 점유해 커넥션 풀 고갈 위험. (2) S3 복사 후 트랜잭션이 롤백되면 S3 파일·삭제가 되돌아가지 않아 고아 파일/유실이 생긴다.
- 조치 필요: S3 작업을 커밋 후(AFTER_COMMIT 이벤트 등)로 분리하는 방침 결정.

### KI-22. 게시글 생성 시 커밋 전에 Redis 캐시를 갱신
- 위치: `services/domain/PostService.java · createPost()` — `@Transactional` 안에서 `postPrevCache.evictBoard() / cachePostPrev() / incrementBoardCount()`를 호출한다. `deletePost()`의 evict·감소도 동일 패턴.
- 결과: 커밋 전 캐시에 새 게시글이 실리므로, 이후 트랜잭션이 롤백되면 존재하지 않는 게시글이 목록 캐시에 남고 게시판 카운트도 어긋난다 (TTL 만료까지).
- 확인 방법: `createPost` 본문에서 save 이후·return 이전의 캐시 호출 3줄 확인.

### KI-23. ViewCountScheduler의 자기호출 트랜잭션과 드레인 유실
- 위치: `schedulers/ViewCountScheduler.java · syncViewsToDB()` — (1) 내부에서 `this.applyViewCount()`를 직접 호출하므로 `applyViewCount`의 `@Transactional`은 자기호출로 무효이고, 배치 전체가 외부 트랜잭션 하나로 묶인다. (2) `drainViewCounts()`가 Redis 카운터를 GETDEL로 먼저 삭제한 뒤 DB에 반영한다.
- 결과: 게시글 단위 격리가 의도대로 안 되고, 배치 트랜잭션이 커밋에 실패하면 이미 Redis에서 지워진 조회수 증가분이 통째로 유실된다.
- 확인 방법: `applyViewCount` 호출부가 프록시를 거치지 않는 것, `RedisViewCountStore · consumePendingCounts()`의 `getAndDelete` 순서 확인.

### KI-24. STOMP 발행이 트랜잭션 커밋 전에 일어남
- 위치: `services/domain/ChatService.java · markAsRead()` 및 `writeSystemMessage()/publishMemberEvent()`를 부르는 초대·강퇴·퇴장·이름변경 메서드들, `services/domain/NotificationService.java · saveNotification()` — 모두 `@Transactional` 안에서 `messagingTemplate.convertAndSend...`를 호출한다.
- 결과: 트랜잭션이 롤백되면 클라이언트는 DB에 존재하지 않는 메시지·알림·멤버 이벤트를 이미 수신한 상태가 된다 (유령 이벤트). 기존 문서도 이를 인지하고 있다 — `docs/GROUP_CHAT.md` 8절 "알려진 한계: 트랜잭션 커밋 전에 WebSocket 메시지가 나갑니다".
- 조치 필요: `TransactionSynchronization.afterCommit` 또는 AFTER_COMMIT 이벤트로 발행 이전 방침 결정.

### KI-25. 리스너 없는 이벤트와 이벤트 페이로드 오류
- 위치: `eventEntities/` 대조 결과 세 가지.
  - `FriendRequestDeclinedEvent`·`FriendBlockedEvent`는 `services/domain/FriendService · respondToFriendRequest()`에서 발행되지만 리스너가 없다 — 발행만 되고 소멸.
  - `CommentCreatedEvent.parentCommentAuthorId` 필드에 `services/domain/CommentService · createComment()`가 부모 댓글의 **작성자 id가 아니라 부모 댓글 id**(`comment.getParent().getId()`)를 넣는다. 현재는 아무 리스너도 이 필드를 안 읽어 실해가 없지만, 대댓글 알림을 구현하는 순간 엉뚱한 사용자를 가리키게 된다.
  - `NotificationEventListener · onCommentCreated`와 `NotificationService · createCommentNotification()` 어디에도 작성자==수신자 검사가 없어, 자기 게시글에 댓글을 달면 자기 자신에게 알림이 온다.
- 확인 방법: 리스너 2개 파일에서 두 이벤트 참조 부재 grep, `createComment`의 builder 인자, 본인 글에 댓글 작성 후 알림 목록 조회.

## API 구현

### KI-26. 스크랩 목록이 전량 로딩과 메모리 페이징으로 동작
- 위치: `controllers/MypageController.java · getUserScraps()` — `scrapService.getRecentScrapsByUser()`가 사용자의 스크랩 **전체**를 조회해 메모리에서 정렬하고, `Utils/PageUtils · createPage()`가 `list.subList()`로 잘라 Page를 흉내 낸다.
- 결과: 세 가지가 겹친다.
  - 스크랩이 많은 사용자일수록 전체 행 + 연관 Post 로딩으로 느려진다 (DB 페이징 아님).
  - 범위를 벗어난 `page` 요청 시 `subList`의 fromIndex가 toIndex를 넘어 예외가 발생한다 (`IllegalArgumentException` → 400, 빈 페이지 반환이라는 일반 페이징 규약과 다름).
  - `domain/scraps/ScrapRepository · findByUser()`는 스크랩의 `isValid`만 필터하고 **게시글의 `isValid`는 필터하지 않아** 삭제된 게시글이 스크랩 목록에 그대로 노출된다.
- 확인 방법: 스크랩 2건인 계정으로 `GET /api/mypage/scraps?page=5` 호출(예외 응답), 스크랩한 글을 삭제한 뒤 목록 재조회(삭제 글 노출).

### KI-27. 댓글 목록 조회의 루프 내 건당 쿼리
- 위치: `controllers/CommentController.java · getComments()` — 로그인 상태면 댓글마다 `commentReactionService.getLikeSatateDto()`를 호출하고, 이는 `existsByCommentAndUserAndKindAndIsValidTrue`를 LIKE·DISLIKE 각 1회 실행한다.
- 결과: 댓글 N개 조회가 N+1을 넘어 **2N+α 쿼리**가 된다 (댓글 100개면 반응 조회만 200 쿼리). 컨트롤러가 서비스 로직을 품고 있는 레이어 위반이기도 하다.
- 확인 방법: p6spy를 켜고(`decorator.datasource.p6spy.enable-logging=true`) 로그인 상태로 댓글 많은 글을 조회해 쿼리 수를 센다.

## 데이터 모델·스키마

### KI-28. 수동 DDL과 실제 스키마의 불일치
- 위치: 두 가지.
  - `src/main/resources/ddl/V_daily_hot_post.sql` — FK가 `REFERENCES post(PST_id)`로 존재하지 않는 `post` 테이블을 참조한다 (실제 테이블명은 `posts`). 이 스크립트를 그대로 실행하면 실패한다.
  - `application-prod.properties` — 주석은 "validate — block DDL changes; startup fails fast on schema mismatch"라 하나 실제 값은 `ddl-auto=none`이다. none은 검증 자체를 안 하므로 스키마 불일치 시 기동은 성공하고 런타임 SQL 오류로 나타난다.
- 조치 필요: DDL 오타 수정 + 주석과 값 일치화(validate 채택 여부 결정). 근본적으로는 미병합 `feature/flyway-migration` 브랜치의 마이그레이션 도입 여부 결정.
- → 갱신 (2026-08-11): **대부분 해소** — Flyway가 도입되어 스키마를 소유한다 (V1 baseline ~ V7, [MIGRATION.md](MIGRATION.md)). `daily_hot_post`는 V6 마이그레이션으로 정식 생성됐고, `ddl/V_daily_hot_post.sql`은 결함 경고 주석을 단 채 기록용으로 보존된다. prod 프로퍼티의 "validate" 주석도 실제 값(none)에 맞게 수정됨.

### KI-29. 엔티티 명명 규칙 이탈 모음
- 위치: 컬럼 규칙(`{대문자 접두어}_{소문자 snake}`, 복수형 테이블명)에서 벗어난 사례들.
  - `domain/Token/Token.java` — `@Table` 자체가 없어 테이블명이 기본값 `token`(단수)이고, 패키지명도 유일하게 대문자(`Token`)다.
  - `domain/hot/DailyHotPost.java`·`RecentHotPost.java` — `@Table(name=...)` 미지정으로 `daily_hot_post`/`recent_hot_post`(단수).
  - `domain/medias/Media.java` — `USR_profile_owner_id_` 끝에 언더스코어가 붙어 있다.
  - `domain/base/BaseEntity.java` — `created_at`/`is_valid`(무접두어 소문자)와 `UPT_Date`/`UPT_id`(접두어형 + 대문자 D 혼재)가 섞여 있다.
  - `domain/schools/SchoolMeal.java` — `date` 컬럼이 `@Column(name=...)` 없이 무접두어. `domain/schools/subjects/Subject.java` — `SBJ_hours_per_Week`의 대문자 W.
- 결과: 실질 버그는 아니나 `ddl-auto=update` 산출물과 수동 DDL·쿼리 작성 시 혼동을 유발한다.
- 확인 방법: 각 파일의 `@Table`/`@Column` 애노테이션 확인.
- → 갱신 (2026-08-11): **부분 해소** — `Token`은 `@Table(name="tokens")` 명시 + V5 마이그레이션으로 정리됐고 (부하 테스트에서 대소문자 불일치 장애로 실증된 뒤 수정 — [performance/bottlenecks/BTL-008](../performance/bottlenecks/BTL-008-token-table-case-mismatch.md)), `RecentHotPost`는 엔티티 자체가 삭제됐다. `Media`·`BaseEntity`·`SchoolMeal`·`Subject`의 이탈은 그대로 남아 있다.

## 문서-코드 불일치 (Phase 2에서 확인분)

### KI-30. 급식 수집 주기가 README와 다름
- 위치: `schedulers/SchoolMealScheduler.java` — `@Scheduled(cron = "0 0 0 1 * ?")`, 즉 **매월 1일 00:00**에 당월 데이터를 수집한다. `README.md`는 "급식 데이터는 매월 말일 스케줄러로 NEIS API에서 자동 수집"이라 서술한다.
- 결과: 운영 시점 예측이 어긋난다 (말일에 다음 달 선수집이 아니라, 1일 0시에 당월 수집).
- 확인 방법: cron 식과 README 학교 도메인 절 대조.
- → 갱신 (2026-08-11): **해소** — README 서술을 "매월 1일 00:00 당월 수집"으로 정정.

### KI-31. 부하 테스트 스크립트가 저장소에 없어 성능 수치 재현 불가
- 위치: `.gitignore`가 `k6/`와 `load-tests/`를 "Load test scripts (local only)" 주석과 함께 배제한다. 저장소에 해당 디렉터리가 없다.
- 결과: `README.md` 성능 개선 절의 k6 기반 전후 수치(처리량·p95 등)를 제3자가 재현·검증할 수 없다. `controllers/testing/PostConsistencyController` 주석이 언급하는 "k6 teardown에서 호출" 스크립트도 저장소 밖이다.
- 조치 필요: 스크립트를 저장소에 포함하거나 README에 재현 불가임을 명시.
- → 갱신 (2026-08-11): **구조적으로 해소** — `performance/`에 k6 스크립트(`scripts/`, `scenarios/`), 전용 관측 환경(`environment/`), 실행 이력·회귀 판정 도구(`tools/`)가 저장소에 포함됐다. 단 README의 **과거** 수치를 만든 당시 스크립트는 복원되지 않았으므로, 그 수치들은 여전히 "당시 기록"으로 읽어야 한다 ([07-performance.md](07-performance.md)).

## 인증·사용자 (Phase 3에서 확인분)

### KI-32. UserService.register()가 서블릿 응답 객체를 받는 레이어 역류
- 위치: `services/domain/UserService.java · register()` — 도메인 서비스가 `HttpServletResponse`를 파라미터로 받아 직접 쿠키를 굽는다.
- 결과: 웹 계층 관심사가 도메인 서비스로 역류해 재사용·테스트가 어렵다. [02-architecture.md](02-architecture.md)의 레이어 규칙과 충돌.

### KI-33. Role 체계가 사실상 사문화 + CLAUDE.md의 OAuth 콜백 경로 불일치
- 위치: `security/CustomUserPrincipal.java` — 3-인자 생성자가 `user.getRole()`을 무시하고 항상 ROLE_USER를 부여한다. `enums/Role`의 GUEST/ADMIN 분기(`security/TokenProvider`의 isGuest 체크 포함)는 도달 경로가 없다.
- 부기: `CLAUDE.md`는 콜백을 `/login/oauth2/code/*`로 서술하나 실제는 `/oauth2/login/code/*`다 (`security/SecurityConfig · filterChain()`).
- 결과: 관리자 권한 기능을 붙이려는 순간 동작하지 않는 함정. 문서를 믿고 콜백 URL을 등록하면 실패.

### KI-34. 회원 탈퇴가 물리 삭제라 FK 제약으로 실패할 수 있음
- 위치: `services/domain/UserService.java · deleteAccount()` — soft delete 컨벤션과 달리 사용자 행을 물리 삭제한다.
- 결과: 게시글·댓글 등 FK가 남은 사용자는 제약 위반으로 탈퇴가 실패하고, 성공하더라도 컨벤션(isValid) 위배.

## 게시글·반응·댓글 (Phase 3에서 확인분)

### KI-35. 게시글 검색에 정렬이 적용되지 않음
- 위치: `domain/posts/queryDsl/PostRepositoryCustomImpl.java · searchKeywordsAll()` — orderBy 절이 없고, `searchPagedPosts()`에 전달되는 Sort도 무시된다. 미구현 `searchKeywords()`는 `return null`.
- 결과: 검색 결과 순서가 보장되지 않으며 페이지 간 중복·누락이 발생할 수 있다.

### KI-36. 게시글 확정 시 tmp 폴더 일괄 삭제로 동시 작성 이미지 유실 가능
- 위치: `services/domain/MediaProcessingService` → `services/global/S3FileStorageAdapter · deleteUserTmp()` — 게시글 확정 후 해당 유저의 `tmp/{userId}/` 전체를 삭제한다.
- 결과: 같은 사용자가 두 글을 동시에 작성 중이면(탭 2개), 먼저 확정한 글이 다른 글의 임시 이미지까지 지운다.

### KI-37. 반응 취소·스크랩 취소가 핫스코어에 반영되지 않음
- 위치: `services/domain/PostReactionService` — 반응 신규 생성 시에만 `PostReactedEvent`를 발행하고 취소(soft cancel) 시에는 발행하지 않는다. `ScrapService`도 신규 생성 시에만 발행.
- 결과: 좋아요를 눌렀다 취소해도 핫스코어는 5분 주기 스케줄러 재계산 전까지 부풀려진 상태로 남는다.

### KI-38. 반응 API 응답의 isLiked/isDisliked가 항상 false
- 위치: `controllers/PostReactionController.java · react()` — 토글 후 상태를 다시 조회하지 않고 기본값 DTO를 반환한다.
- 결과: 클라이언트가 응답만 믿으면 버튼 상태가 실제와 어긋난다.
- 확인 방법: 좋아요 요청 후 응답 body와 GET 재조회 결과 비교.

### KI-39. 삭제된 댓글이 내용째 노출됨
- 위치: `domain/comments/CommentRepository · findByPost()` — isValid 필터가 없다.
- 결과: soft delete된 댓글이 목록 조회에 원문 그대로 내려간다.
- 확인 방법: 댓글 삭제 후 해당 게시글 댓글 목록 조회.

### KI-40. 단건 댓글 조회가 익명화를 우회함
- 위치: `controllers/CommentController.java · getCommentByIdTest()` — 익명 댓글에 `CommentAnonymizationService`를 적용하지 않고 반환한다 (메서드명에 Test가 남은 프로덕션 엔드포인트).
- 결과: 익명 댓글 작성자의 닉네임·userId가 노출된다. 익명 보장 정책 위반.

### KI-41. 댓글 수정 미디어 처리에서 NPE 가능
- 위치: `services/domain/MediaProcessingService · processUpdateCommentMedia()` — 기존 s3Url이 null인 댓글을 수정할 때 null 역참조 경로가 있다.
- 결과: 이미지 없던 댓글 수정 시 500 가능.
- → 갱신 (2026-08-11): **해소** — null 가드 추가 (부하 테스트에서 실증 후 수정, [performance/bottlenecks/BTL-010](../performance/bottlenecks/BTL-010-comment-update-npe.md)). 단위 테스트 포함.

## 친구·학교 (Phase 3에서 확인분)

### KI-42. 친구 요청에 상태 검증이 없음
- 위치: `services/domain/FriendService · sendFriendsRequest()` — 역방향 요청 존재·이미 친구·차단 상태를 검증하지 않는다. 또한 `respondToFriendRequest()`는 알 수 없는 status 값이 오면 요청 행을 조용히 삭제한다.
- 결과: 중복 관계·차단 우회 요청이 가능하고(차단 비가시성 정책과 충돌), 잘못된 status로 요청이 소실된다.
- → 갱신 (2026-08-11): **대부분 해소** — `sendFriendsRequest()`에 자기 자신·차단(양방향)·기존 친구·역방향 요청 검증이 추가됐다. 단 `respondToFriendRequest()`는 알 수 없는 status가 오면 여전히 아무 분기도 타지 않고 요청을 soft delete로 종결한다 (물리 삭제에서 이력 보존으로 바뀌었을 뿐, 오입력 소실 문제 자체는 잔존).

### KI-43. Friend/FriendReq가 물리 삭제됨
- 위치: `services/domain/FriendService` — 친구 삭제·요청 처리에서 행을 물리 삭제한다. soft delete 컨벤션 위배 (KI-34와 동일 계열).
- → 갱신 (2026-08-11): **부분 해소** — `FriendReq`는 `BaseEntity.delete()`(soft delete)로 전환되어 요청 이력이 보존된다. `Friend` 관계 행은 여전히 `deleteAll()` 물리 삭제다.

### KI-44. 외부 API RestTemplate에 타임아웃이 없음
- 위치: `configs/AppConfig.java · restTemplate()` — `new RestTemplate()` 기본 생성으로 connect/read 타임아웃 미설정.
- 결과: NEIS 무응답 시 스케줄러·부팅 초기화 스레드가 무기한 대기한다.

### KI-45. 학교·급식 초기화 로직의 중복 실행과 유실 위험
- 위치: 세 가지가 겹친다.
  - `initializers/SchoolDataProdInitializer` — 최초 수집 분기가 도달 불가 구조라 급식 JSON 파일이 없으면 prod에서 영영 수집되지 않는다.
  - `api/SchoolInfoInitializer` — !prod 부팅마다 무조건 NEIS 전량 크롤을 수행한다 (`AppStartupRunner`의 조건부 로드와 중복).
  - `api/SchoolMealInitializer · importMealsFromJson()` — deleteAll 후 재적재 방식이라 수집 실패 시 기존 급식 데이터가 전량 유실될 수 있다.

### KI-46. 시간표 템플릿 수정 시 NPE 가능
- 위치: `services/TimetableTemplateService · update()` — templateName이 null인 요청에서 NPE 경로가 있다 (KI-16의 검증 부재와 결합).

### KI-47. 학교 검색이 엔티티를 직접 반환
- 위치: `controllers/SchoolController.java · searchSchools()` — DTO 변환 없이 `School` 엔티티를 응답으로 노출한다. "엔티티 직접 노출 금지" 컨벤션 위배.

## 운영·테스트 (Phase 4에서 확인분)

### KI-48. 배포 후 검증·자동 롤백이 없음
- 위치: `.github/workflows/deploy.yml` — `docker compose up -d --force-recreate`로 끝난다. `/actuator/health` 확인 단계가 없다.
- 결과: 새 컨테이너가 기동 직후 죽어도 워크플로는 성공으로 남고, 롤백은 수동이다 ([operations/runbook.md](operations/runbook.md)).

### KI-49. README의 "게시판 목록 캐싱" 서술과 달리 캐싱이 없음
- 위치: `services/domain/BoardService` — README 캐싱 전략 절은 게시판 목록 캐싱을 포함한다고 서술하나 코드에 캐시 경로가 없다 (캐시는 게시글 목록·카운트에만 존재 — `services/domain/redisService/RedisPostsCache`).
- → 갱신 (2026-08-11): **해소** — README 캐싱 절에서 게시판 목록을 제외하고 실제 캐시 대상(게시글 목록·total count)만 서술하도록 정정.

### KI-50. 미사용 테스트 헬퍼와 미사용 의존성
- 위치: `src/test/.../configs/TestFileStorageConfig`, `src/test/.../services/global/LocalFileStorageAdapter` — 참조 0건. `build.gradle`의 `it.ozimov:embedded-redis`도 코드 사용처가 없다 (CLAUDE.md의 "Embedded Redis 사용" 서술과 불일치).

### KI-51. 단언 없는 테스트
- 위치: `src/test/.../utils/HotScoreCalculatorTest` — 계산 결과를 출력만 하고 assert가 없어 항상 통과한다.
- 결과: 핫스코어 산식 회귀를 잡지 못한다.

### KI-52. 웹 슬라이스·보안 테스트 기반 부재
- 위치: `build.gradle` — `spring-security-test` 의존성이 없고, `@WebMvcTest` 사용이 0건이다.
- 결과: 인가 규칙(KI-04, KI-05)과 요청 매핑·검증·직렬화가 테스트로 고정될 수 없는 상태다 (KI-12와 결합해 회귀 방지 공백).

## 부하 테스트에서 확인분 (2026-08)

> 이 절의 항목은 코드를 읽어서가 아니라 **성능 테스트를 실제로 돌리다 발견**했다.
> 동시 요청이 없으면 재현되지 않아 정적 리뷰로는 잡히지 않는 종류다.
> 원인 분석과 해결 후보 비교는 [defects/](defects/)의 상세 문서에 있다.

### KI-53. 댓글 수 카운터가 동시 쓰기에서 유실됨
- 위치: `domain/posts/Post.java · incrementCommentCount()` — `this.commentCount++`로 JVM 메모리에서 읽고-더하고-쓴다. `Post`에 `@Version`이 없어 충돌이 예외로도 드러나지 않는다.
- 결과: 같은 게시글에 동시에 댓글이 달리면 증가분이 유실된다. `large` 실측에서 활성 게시글 70건의 카운터가 실제보다 적었고(전부 과소, 과다 0건), 합계로 13,284건이 비었다. 목록의 댓글 수와 `HotScoreCalculator`의 인기 점수가 함께 낮아진다.
- 확인 방법: `SELECT SUM(PST_comment_count) FROM posts WHERE is_valid=1`과 활성 댓글 실제 개수를 비교. 스크랩·좋아요 카운터는 DB 재계산 방식이라 같은 조건에서 불일치 0건·3건으로 대조된다.
- 상세: [defects/KI-53](defects/KI-53-comment-counter-lost-update.md) — 원인·대조 근거·해결 후보 4가지. [BTL-003](../performance/bottlenecks/BTL-003-hot-row-counter.md)과 같은 코드지만 다른 문제다(저쪽은 락 대기로 느려지는 것, 이쪽은 값이 틀리는 것).
- → 갱신 (2026-08-14): **해소** — `Post` 엔티티의 `commentCount++`를 `PostRepository`의 원자 UPDATE(`set p.commentCount = p.commentCount + 1`)로 교체. 감소 하한도 `where p.commentCount > 0`으로 DB가 보장한다. 동시 요청 30건 재현으로 원인을 확정한 뒤 고쳤다. **이미 어긋난 기존 데이터는 복구되지 않는다** — 성능 데이터셋 재생성으로 해소한다.

### KI-54. 반응·스크랩 토글 API가 멱등하지 않음
- 위치: `services/domain/PostReactionService · likeReact()`, `services/domain/ScrapService · toggleScrap()` — 같은 요청을 두 번 보내면 상태가 원래대로 돌아온다. 클라이언트가 "좋아요 상태로 만들어달라"고 표현할 방법이 없다.
- 결과: 응답을 받지 못한 요청을 재시도하면 서버가 이미 처리한 작업이 취소된다. 네트워크가 불안정할 때 사용자가 누른 좋아요·스크랩이 저절로 풀린다. 재시도할수록 의도에서 멀어진다.
- 확인 방법: 같은 반응 요청을 두 번 연속 보내고 `GET /api/posts/{id}` 응답의 `liked`/`scrapped` 확인.
- → 부분 완화 (2026-08-14): **서버는 그대로**이고, 성능 데이터 생성기만 자기 데이터를 지키도록 막았다 (`performance/datasets/seed.js`의 `ensureToggled()` — 응답을 못 받은 경우 재요청 대신 상태를 조회해 판정). 실사용자와 프론트엔드는 여전히 노출돼 있다.
- 상세: [defects/KI-54](defects/KI-54-toggle-non-idempotent.md) — `PUT`/`DELETE` 분리 권고와, 병목 재측정이 끝날 때까지 미루는 이유. [BTL-012](../performance/bottlenecks/BTL-012-scrap-toggle-race-duplicate.md)(해소된 경쟁 상태)와 다른 문제다 — 동시성이 아니라 단일 클라이언트의 재시도로 발생한다.

### KI-55. 반응·스크랩 카운터가 동시 쓰기에서 드물게 1씩 어긋난다
- 위치: `services/domain/ScrapService · toggleScrap()`, `services/domain/PostReactionService · syncCounts()` — 카운터를 `COUNT(*)` 로 다시 세어 대입한다. 세는 시점이 자기 트랜잭션 안이라, 동시에 커밋 중인 다른 트랜잭션의 행이 REPEATABLE READ 격리에서 보이지 않는다.
- 결과: 같은 게시글에 동시에 반응·스크랩이 몰리면 카운터가 실제보다 **1 작아진다**. 재계산 방식이라 다음 쓰기가 바로잡으므로 오차가 누적되지 않는다 — [KI-53](defects/KI-53-comment-counter-lost-update.md)의 증감 방식이 무한히 쌓이던 것과 다른 점이다.
- 확인 방법: 깨끗한 DB에 `small` 시드 생성 후 `posts.PST_scrap_count` 합과 활성 `scraps` 행 수 비교. 실측: `small`(게시글 500) 스크랩 2건·좋아요 1건, `large`(게시글 100,000) **역시 스크랩 2건·좋아요 1건**. 게시글이 200배인데 불일치가 늘지 않는다 — 경쟁 창이 규모에 비례하지 않는다는 뜻이라 실질 영향이 작다.
- 판단: **당장 고치지 않는다.** 오차가 1로 제한되고 자가 치유되며, 인기글 정렬(`HotScoreCalculator`)에 영향을 줄 규모가 아니다. 근본 해결은 KI-53처럼 원자 증감으로 바꾸는 것인데, 토글이라 "켜기/끄기"를 구분해 증감해야 해서 KI-54(멱등성)와 함께 다루는 편이 낫다.

마지막 검증일: 2026-08-11 (최초 작성 2026-07-30, 이후 해소분은 각 항목의 "→ 갱신" 줄 참고)
KI-53·54는 2026-08-14 추가 — 부하 테스트 중 발견분. KI-55는 같은 날 데이터셋 재생성 검증 중 발견.
