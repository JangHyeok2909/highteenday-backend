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
- → 갱신 (2026-08-28, 커밋 `64e399a`): **해소** — `docker-compose.yml`에 `mysql` 서비스 정의를 채우고 `mysql-data` 볼륨을 붙였다. 현재 정의된 서비스는 `mysql`·`redis`·`app` 셋이라 `depends_on`이 실재하는 대상을 가리킨다. 같은 커밋에서 `00-quickstart.md`의 절차도 "Redis만 개별 기동"에서 compose 일괄 기동으로 고쳤다.
- → 기록 정정 (2026-09-05): 위 갱신 줄이 **10일 가까이 누락돼 있었다.** 코드는 8/28에 고쳤는데 장부는 계속 "실행 불가"라고 말하고 있었다. 저장소를 공개(2026-09-04)한 뒤에는 이 항목이 **KNOWN-ISSUES를 여는 사람이 가장 먼저 읽는 두 줄**이 되므로, 장부가 틀린 채로 남으면 나머지 항목의 신뢰도까지 함께 깎인다. **코드를 고치면 같은 작업 안에서 장부를 갱신한다.**

### KI-02. 기본 프로파일 local의 프로퍼티 파일이 없음
- 위치: `src/main/resources/application.properties` — `spring.profiles.active=local`이 기본값인데 `application-local.properties`는 gitignore 대상이며 저장소에 없다.
- 결과: 아무 옵션 없이 `./gradlew bootRun` 하면 datasource·JWT 키가 없어 부팅에 실패한다.
- 우회: dev 프로파일 사용 ([00-quickstart.md](00-quickstart.md)).
- → 갱신 (2026-08-28, 커밋 `64e399a`): **해소** — `src/main/resources/application-local.properties.example`(60줄)을 추가해 복사만 하면 되는 상태로 만들었고, `application-dev.properties`의 기본값을 손봐 **아무 설정 없이도 dev 프로파일이 뜨도록** 했다. gitignore 대상인 실제 `application-local.properties`는 여전히 저장소에 없지만, **없어서 막히는 상황이 사라졌다**는 점이 달라진 것이다.
- → 기록 정정 (2026-09-05): KI-01과 같은 이유로 갱신이 누락돼 있었다.

## 보안

### KI-03. 실제 NEIS API 키가 소스 주석에 커밋되어 있음
- 위치: `api/SchoolInfoService.java` — `apiKey` 필드 위 주석에 실제 키 문자열이 남아 있고, git 히스토리 다수 리비전에도 존재한다.
- 조치 필요: 주석 삭제 + NEIS 포털에서 키 재발급(히스토리에 남으므로 삭제만으로는 무효화되지 않음).
- → 갱신 (2026-08-11): 소스의 주석은 삭제됨. **키 재발급은 여전히 필요** — git 히스토리에 키가 남아 있다.
- → 등급 상향 (2026-09-05): **저장소가 2026-09-04에 공개로 전환되면서 성격이 바뀌었다.** 비공개일 때는 "언젠가 재발급할 것"이었지만, 지금은 **누구나 읽을 수 있는 노출된 자격증명**이다.
  - 노출 범위(실측): 공개 히스토리의 커밋 **6개**, 파일 **6개**(`api/`와 이전 위치 `services/school/`의 `SchoolInfoService`·`SchoolMealService`·`SchoolScheduleService`). 최초 유입은 커밋 `37f1bcd`의 `apiKey` 필드 주석이고, 키는 32자 hex(`cee4ba90…`)다. **현재 HEAD 트리에는 없다** — 히스토리에만 남아 있다.
  - **히스토리 재작성으로는 해결되지 않는다.** force-push 이후에도 GitHub는 dangling 커밋을 한동안 API로 제공하고, 포크·클론·캐시에는 그대로 남는다. **NEIS 포털에서 키를 폐기·재발급하는 것이 유일한 무효화 방법이다.**
  - 재발급 후 할 일: 운영 환경변수 `NEIS_API_KEY` 교체. 소스·프로퍼티는 이미 `${NEIS_API_KEY}` 참조라 코드 변경은 필요 없다.
  - 함께 확인한 것: 설정 파일(`application*.properties`, `docker-compose*.yml`)의 전체 히스토리를 훑었고 **리터럴 비밀값은 테스트용 더미뿐이다.** 공개 히스토리에서 실제로 유효한 자격증명은 이 키 하나다.

### KI-04. GET 전체가 permitAll인 블랙리스트 인가 구조
- 위치: `security/SecurityConfig.java · filterChain()` — 명시된 GET 경로만 `authenticated()`이고 마지막에 `GET /**`가 `permitAll()`이다.
- 결과: 새 GET 엔드포인트를 추가하면 기본값이 "전체 공개"가 된다. 공개된 GET 핸들러가 `@AuthenticationPrincipal`을 null 체크 없이 사용하는 곳에서는 비인증 요청 시 401이 아니라 NPE 500이 난다.
- → 갱신 (2026-08-28): **해소** — `GET /**` permitAll을 제거하고 화이트리스트로 뒤집었다. 공개 GET은 9개 패턴만 명시하고(게시판 목록·게시판별 글 목록·글 상세·글 검색·댓글 목록/단건·인기글·학교 검색·중복 확인), 나머지는 전부 `anyRequest().authenticated()`로 떨어진다. 공개 여부가 바뀐 기존 엔드포인트는 없다 — 전환 전후 인가 매트릭스가 동일하다.
  - 함께 명시한 것: `/actuator/**` permitAll. prod는 `management.server.port=8081`이라 이 필터 체인에 오지 않지만, **perf 프로파일은 포트를 비워 8080에서 서빙**하므로 이 규칙이 없으면 Prometheus 스크레이프(`app:8080/actuator/prometheus`)와 compose 헬스체크가 401이 되어 측정 파이프라인이 죽는다. 전환 전에는 `GET /**`가 이를 가려 주고 있었다.
  - `/error`, `/ws/**`, `OPTIONS /**`, `/oauth2/**`도 명시했다. 프리플라이트에는 쿠키가 실리지 않으므로 막으면 브라우저 요청이 전부 죽는다.
- 회귀 방지: `security/AuthorizationMatrixTest.unlistedGetPathDefaultsToDenied()` — 매핑되지 않은 GET 경로를 비로그인으로 호출한다. 화이트리스트면 401, 블랙리스트로 되돌아가면 인가를 통과해 404가 되므로 실패한다. 이것이 KI-04의 증상("새 GET이 기본 공개") 자체를 잡는 테스트다. 공개 7경로·보호 18경로의 매트릭스도 같은 클래스가 고정한다.

### KI-05. 게시글·댓글 수정/삭제에 소유권 검증이 없음 (IDOR)
- 위치: `services/domain/PostService.java · updatePost() / deletePost()`, `services/domain/CommentService.java · updateComment() / deleteComment()` — 파라미터로 받은 `userId`를 리소스 작성자와 비교하지 않는다.
- 결과: 로그인한 아무 사용자가 남의 글·댓글을 수정/삭제할 수 있다.
- 참고: `NotificationService.validateOwnership()`, `ChatService.requireParticipant()`에는 검증이 있다 — 일관성이 없는 상태.
- → 갱신 (2026-08-28): **해소** — `PostService`·`CommentService`에 `validateOwnership()`을 추가하고 수정·삭제 진입부에서 호출한다. 작성자가 아니면 `CustomException(ErrorCode.NO_ACCESS)` → 403.
  - 컨트롤러가 아니라 서비스에 둔 이유: 이미 검증을 가진 두 서비스와 자리를 맞췄고, 수정·삭제가 컨트롤러 외의 경로에서 불려도 같은 구멍이 다시 열리지 않는다.
  - 댓글은 **게시글 작성자에게도 삭제 권한을 주지 않았다.** 신고·모더레이션 기능이 없는 상태에서 그 권한을 열면 "글쓴이가 불리한 댓글을 지운다"는 별개 문제가 생긴다.
  - 기존 테스트 `CommentServiceTest.doesNotVerifyOwnership()`("소유권 검증은 컨트롤러 책임")은 결함 동작을 고정하고 있었으므로 작성자 본인 수정이 통과하는지 보는 테스트로 교체했다.
- 회귀 방지: `PostServiceTest.Ownership`(3건), `CommentServiceTest.Ownership`(3건) — 타인 요청이 403이고 본문·`isValid`·캐시·댓글 수 어느 것도 바뀌지 않음을 함께 단언한다. 예외만 보면 "던지고 나서 이미 바꿨다"를 놓친다.

### KI-06. 쿠키 인증 + SameSite=None + CSRF 비활성 조합
- 위치: `security/SecurityConfig.java · filterChain()`의 `csrf disable` + `application-prod.properties`의 `app.cookie-same-site=None`.
- 결과: HttpOnly 쿠키로 인증하면서 CSRF 방어가 없어 크로스사이트 쓰기 위조가 이론상 가능하다. 대응 방침 결정 필요.
- → 갱신 (2026-08-28): **해소(최소 방어)** — 사용자 결정에 따라 **Origin 검증 필터**를 넣었다. `security/CsrfOriginValidationFilter`가 쓰기 메서드(POST/PUT/PATCH/DELETE)에 대해 `Origin`이 허용 목록에 있는지 확인하고, 아니면 403으로 끊는다. `Origin`이 없으면 `Referer`의 출처로 한 번 더 본다.
  - **CSRF 토큰(double-submit)을 지금 넣지 않은 이유**: 방어력은 그쪽이 높지만 **프론트엔드가 XSRF 토큰을 되돌려 보내도록 함께 고쳐야 한다.** 프론트는 별도 저장소라 백엔드만 바꾸면 모든 쓰기 요청이 깨진다. Origin 검증은 프론트 변경 없이 지금 넣을 수 있고, 나중에 토큰 방식을 얹어도 충돌하지 않는다.
  - **한계(중요)**: `Origin`과 `Referer`가 **둘 다 없으면 통과시킨다.** 서버 간 호출·curl·k6 부하 스크립트는 이 헤더를 보내지 않고, 막으면 정상 이용과 성능 측정이 죽는다. CSRF는 브라우저를 통해서만 성립하고 브라우저는 교차 출처 쓰기에 `Origin`을 생략하지 않으므로 이 예외가 방어에 구멍을 내지는 않는다 — 다만 토큰 방식보다 약한 방어라는 점은 명시해 둔다.
  - **같은 출처는 허용 목록에 없어도 통과시킨다**: 같은 출처 요청은 CSRF가 성립하지 않고, 막으면 개발 환경에서 Swagger UI로 API를 호출하는 것이 전부 403이 된다.
  - CORS 허용 목록과 **같은 목록**(`SecurityConfig.ALLOWED_ORIGINS`)을 본다. 둘이 갈라지면 "CORS는 통과하는데 쓰기는 403"인 상태가 생긴다. 기존 CORS 동작은 바꾸지 않았다.
- 회귀 방지: `security/CsrfOriginValidationFilterTest` — 판정 로직 9건은 **필터를 직접 호출해** 확인한다(MockMvc로 보내면 스프링 CORS 필터가 먼저 낯선 Origin을 403으로 끊어, 이 필터를 지워도 테스트가 통과해 버린다). 여기에 더해 중첩 클래스 `Wiring`이 `FilterChainProxy`를 뒤져 **필터가 실제 보안 체인에 등록돼 있는지**를 따로 단언한다 — 판정이 맞아도 체인에 없으면 아무것도 막지 못하기 때문이다.

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
- → 갱신 (2026-08-28): **해소** — `deploy.yml`에 `test` 잡을 추가하고 `build: needs: test`로 걸어, 테스트가 실패하면 이미지 빌드도 배포도 시작되지 않는다. main 푸시에만 도는 배포 워크플로만으로는 병합 전 게이트가 되지 않으므로 `ci.yml`을 새로 두어 develop 대상 PR과 develop 푸시에서도 테스트를 돌린다. `Dockerfile`의 `-x test`는 그대로 두었다 — 게이트 잡이 이미 통과한 뒤에만 이미지 빌드가 시작되므로 같은 검증을 두 번 할 이유가 없다(이유를 Dockerfile 주석에 남김). 테스트 프로파일 부재는 그 사이 `src/test/resources/application-test.properties`(H2)로 해소되어 `HighteendayBackendApplicationTests`가 실 DB 없이 통과한다. 회귀 방지: `ci/CiTestGateTest` — 워크플로 YAML을 직접 파싱해 테스트 잡 존재·`needs` 연결·PR 트리거를 단언한다.

## 에러 처리

### KI-13. GlobalExceptionHandler의 죽은 핸들러와 내부 메시지 노출
- 위치: `exceptions/GlobalExceptionHandler.java` — 세 가지 문제가 겹쳐 있다.
  - 400 핸들러가 `java.net.BindException`(네트워크 포트 바인딩 예외)을 import한다. 검증 바인딩 실패용 `org.springframework.validation.BindException`이 아니므로 이 등록은 죽은 코드다.
  - 400/403/404/405/409/500 응답의 `message`에 `e.getMessage()`를 그대로 잇는다 — 500조차 내부 예외 메시지가 클라이언트로 나간다.
  - `handleCustomException`이 `e.getErrorCode().getMessage()`(기본 메시지)만 쓰므로 `CustomException(ErrorCode, "상세 메시지")`로 넣은 상세가 응답에 반영되지 않는다.
- 결과: 검증 실패의 응답 일관성 저하 + 내부 구현 정보 노출 + 상세 메시지 유실.
- 확인 방법: 파일 상단 import 절과 각 핸들러의 body 조립부를 읽는다.
- → 갱신 (2026-08-28, 죽은 import): **해소** — `java.net.BindException`을 `org.springframework.validation.BindException`으로 교체.
- → 갱신 (2026-08-28, 메시지 노출·유실): **해소** — 방향을 둘로 갈랐다.
  - **밖으로 나가면 안 되는 것**: 400/403/404/405/409/500 응답 본문에서 `e.getMessage()`를 전부 제거하고 코드별 고정 문구로 바꿨다. 원인 문자열은 서버 로그에만 남는다. DB 예외 메시지에는 제약 조건 이름(`users.uk_users_email`)과 컬럼명이, 본문 파싱 실패 메시지에는 DTO 클래스명과 필드 경로가 그대로 들어 있어 스키마를 알려 주는 통로였다.
  - **나가야 하는 것**: `handleCustomException`이 `errorCode.getMessage()` 대신 `e.getMessage()`를 쓴다. 상세를 넣어 던지면 그 상세가, 안 넣으면 ErrorCode 기본 메시지가 나간다(`CustomException`의 1-인자 생성자가 이미 기본 메시지를 `message`에 채워 둔다).
  - **상세를 응답에 실어도 되는 근거**: 현재 상세를 붙이는 4개 지점은 모두 고정 문구이거나 호출자가 방금 보낸 값(email·nickname·commentId)을 되돌려 주는 것이라, 클라이언트가 모르던 정보가 새로 나가지 않는다. 이 조건을 핸들러 주석에 규칙으로 남겼다.
  - 검증 실패는 예외다 — `MethodArgumentNotValidException` 핸들러는 필드별 사유를 그대로 돌려준다. 클라이언트가 고칠 수 있는 정보이고, 이것이 검증 실패를 알리는 정식 통로다.
  - `CustomException` 로깅은 5xx면 스택까지, 4xx면 한 줄만 남긴다. 4xx는 정상 시나리오라 스택이 로그를 덮는다.
- 회귀 방지: `exceptions/GlobalExceptionHandlerTest` — 웹 슬라이스에서 실제 응답 본문을 문자열로 받아 `uk_users_email` 같은 내부 문자열이 없는지, 그리고 `CustomException` 상세가 반영되는지를 6건으로 단언한다.

### KI-14. TokenService가 ErrorCode 없이 raw RuntimeException을 던짐
- 위치: `services/domain/TokenService.java · findByRefreshTokenOrThrow() / findByAccessTokenOrThrow() / deleteByUserEmail() / saveOrUpdate()` — 전부 `new RuntimeException("...")`.
- 결과: 리프레시 토큰 만료·무효라는 정상 시나리오가 `GlobalExceptionHandler`의 500 경로로 떨어진다. 클라이언트는 401을 못 받아 재로그인 유도가 어렵다.
- 부기: 이 클래스만 `jakarta.transaction.Transactional`을 import한다 (다른 서비스는 전부 `org.springframework...Transactional`).
- 확인 방법: 만료된 refreshToken 쿠키로 `POST /api/token/refresh` 호출 → 500 응답.
- → 갱신 (2026-08-28): **해소** — 5개 지점의 raw `RuntimeException`을 `CustomException(ErrorCode, 상세)`로 바꿨다. 만료 → `TOKEN_EXPIRED`(401), 무효·없음 → `INVALID_TOKEN`(401), 사용자 없음 → `USER_NOT_FOUND`(404).
  - **만료와 무효를 하나로 합치지 않은 이유**: 둘 다 401이지만 클라이언트가 해야 할 일이 다르다. 만료는 조용히 재로그인으로 보내면 되고, 무효는 토큰이 위조·폐기된 것이라 저장된 자격증명을 지워야 한다. 상태 코드만 같고 `code` 필드로 갈린다.
  - 부기 사항도 함께 정정: 이 클래스만 쓰던 `jakarta.transaction.Transactional`을 `org.springframework.transaction.annotation.Transactional`로 교체했다. 두 애노테이션은 롤백 규칙이 달라(전자는 체크 예외에도 롤백) 같은 코드가 클래스마다 다르게 동작할 수 있다.
- 회귀 방지: `TokenServiceTest.FailureStatus`(4건) — 예외 타입뿐 아니라 `ErrorCode`와 그 HTTP 상태까지 단언한다. 타입만 보면 "던지긴 하는데 클라이언트는 여전히 500을 받는" 상태를 못 잡는다.

### KI-15. UserService가 검증 실패 400을 500으로 변환
- 위치: `services/domain/UserService.java · updateNickname() / updatePassword()` — VO 생성(`new Nickname(...)`, `Password.fromRawPassword(...)`)을 `catch (Exception)`으로 감싸 `CustomException(INTERNAL_ERROR)`로 다시 던진다.
- 결과: VO가 던진 400대 `CustomException`(INVALID_NICKNAME_FORMAT, INVALID_PASSWORD_FORMAT)이 500 INTERNAL_ERROR로 바뀐다. 예: 1자 닉네임으로 `PATCH /api/user/nickname` → 400이어야 하나 500.
- 확인 방법: 위 요청을 보내고 응답 코드를 본다. `domain/users/vo/Nickname.java` 생성자와 대조.
- → 갱신 (2026-08-28): **해소돼 있었음(코드 변경 없음)** — `updateNickname()`·`updatePassword()`의 try 블록에 `catch (CustomException e) { throw e; }`가 `catch (Exception)`보다 앞에 들어가 있다. 도메인 오류는 그대로 올라가고, 그 뒤의 `catch (Exception)`은 진짜 예기치 못한 예외만 `INTERNAL_ERROR`로 감싼다. 커밋 `c84d660`에서 들어왔다.
- 회귀 방지: 이미 있다 — `UserServiceTest`가 "새 비밀번호가 규칙을 어기면 `INVALID_PASSWORD_FORMAT`이 그대로 올라온다", "2자 미만 닉네임은 `INVALID_NICKNAME_FORMAT`이 그대로 올라온다"와 그 반대편("저장 중 예기치 못한 예외는 `INTERNAL_ERROR`로 감싼다")을 함께 고정한다. 양쪽을 다 봐야 "전부 통과시켜서 통과한" 상태를 걸러낼 수 있다.

### KI-16. 요청 본문 검증이 사실상 미적용
- 위치: `@Valid`가 `src/main/java` 전체에서 3곳뿐이다 (grep 전수 확인).
  - 유효 2곳: `controllers/UserController · loginUser()`, `controllers/PostController · createPost()`.
  - 무효 1곳: `services/domain/PostService · updatePost(..., @Valid UpdatePostDto)` — 클래스에 `@Validated`가 없어 메서드 검증이 동작하지 않는다.
- 결과: 댓글·채팅·친구·회원가입 등 나머지 `@RequestBody` DTO는 Bean Validation을 타지 않고, VO·수동 검사·DB 제약에 의존한다. DTO에 어떤 제약 애노테이션을 붙여도 조용히 무시되는 함정.
- 조치 필요: 컨트롤러 `@RequestBody`에 `@Valid` 일괄 적용 또는 서비스 클래스에 `@Validated` 추가 중 방침 결정.
- → 갱신 (2026-08-28): **해소(배관 연결까지)** — 사용자 결정에 따라 **컨트롤러 `@RequestBody`에 `@Valid` 일괄 적용**. 31개 파라미터 전부에 붙였고, `PostService.updatePost()`의 무효한 `@Valid`는 제거했다.
  - **DTO에 새 제약 애노테이션은 붙이지 않았다.** 이렇게 하면 기존 요청의 성공/실패가 하나도 바뀌지 않아 **성능 측정 기준선에 영향이 없다.** 결함의 본질은 "제약을 붙여도 조용히 무시된다"는 함정이었고, 그 함정만 없앤 것이다. 어떤 제약을 걸지는 도메인 판단이라 별도 작업이다.
  - **서비스에 `@Validated`를 붙이는 안은 버렸다**: 검증 실패가 `ConstraintViolationException`으로 나와 `GlobalExceptionHandler`에 핸들러를 하나 더 만들어야 하고, 예외가 웹 계층이 아닌 서비스 계층에서 발생해 응답 형식이 `MethodArgumentNotValidException` 경로와 달라진다. 검증 실패 응답이 두 가지 모양이 되는 건 그 자체로 결함이다.
  - `ChatController`의 `Map<String, String>` 본문 한 곳은 제외했다. `Map`은 Bean Validation이 걸 제약이 없는 타입이라 `@Valid`를 붙여도 의미가 없다.
- 회귀 방지: `controllers/RequestBodyValidationTest` — 리플렉션으로 모든 `@RestController`를 훑어 `@RequestBody` 파라미터에 `@Valid`가 빠진 곳이 있는지 단언한다. **개별 요청 테스트로는 이 결함을 못 잡는다** — 제약이 없으면 통과하고, 제약을 붙여도 무시되니 또 통과하기 때문이다. 그래서 구조를 단언한다. 검증이 실제로 동작하는지(제약 위반 → 400)는 `PostControllerWebSliceTest.blankTitleIsRejected()`가 따로 본다.

## Redis

### KI-17. 조회수 드레인이 블로킹 KEYS 명령 사용
- 위치: `infrastructure/redis/RedisViewCountStore.java · consumePendingCounts()` — `redisTemplate.keys(VIEW_COUNT_PREFIX + "*")`. `schedulers/ViewCountScheduler`가 60초마다 호출한다.
- 결과: KEYS는 전체 키스페이스를 훑는 O(N) 블로킹 명령이다. 키가 많아지면 60초마다 Redis 전체가 멈칫하며, 같은 인스턴스를 쓰는 토큰 캐시·게시글 캐시까지 지연된다. SCAN 또는 별도 Set 인덱스로 대체 필요.
- 확인 방법: 코드에서 `keys(` 호출 확인. redis-cli `MONITOR`로 60초마다 KEYS가 찍히는 것 관찰.

### KI-18. ResilientRedisAspect가 민감 인자를 로그에 남김
- 위치: `aop/ResilientRedisAspect.java · handle()` — 실패 시 `log.warn(..., joinPoint.getArgs(), e)`.
- 결과: `RedisTokenCacheStore.put/delete`의 첫 인자가 리프레시 토큰 원문이므로, Redis 장애 시 유효한 토큰이 로그 파일에 평문으로 남는다. 또한 `catch (Exception)`이라 Redis 접속 오류가 아닌 코드 버그(NPE 등)도 "Redis unavailable"로 위장되어 삼켜진다.
- 조치 필요: 인자 로깅 제거(또는 마스킹) + catch 범위를 `DataAccessException` 계열로 축소.
- → 갱신 (2026-08-28): **해소** — 두 가지를 함께 고쳤다.
  - 로그에서 `joinPoint.getArgs()`를 제거하고 메서드 이름 + 예외 타입 + `getMostSpecificCause()` 메시지만 남긴다. **마스킹 규칙을 두지 않고 인자 자체를 뺀 이유**: 어떤 인자가 민감한지는 호출 지점마다 다르고, 규칙을 두면 새 `@ResilientRedis` 메서드가 추가될 때마다 규칙을 갱신해야 해 같은 사고가 다시 난다. 장애 원인 파악에는 메서드 이름과 예외로 충분하다.
  - `catch (Exception)` → `catch (DataAccessException)`. 스프링 데이터 Redis가 Lettuce 예외를 `RedisConnectionFailureException`·`RedisSystemException` 등 이 계열로 번역하므로, 이 계열만 잡으면 진짜 인프라 장애와 코드 버그가 갈린다. 버그는 이제 삼켜지지 않고 500으로 드러난다.
- 부수 변경: `ResilientRedisAspectTest`의 장애 시뮬레이션이 평범한 `RuntimeException`이었다. 그건 스프링이 실제로 내는 타입이 아니어서 좁힌 catch에 걸리지 않는다 — `RedisConnectionFailureException`으로 바꿨다.
- 회귀 방지: `aop/ResilientRedisAspectTest.FailureHandling` — Logback `ListAppender`로 실제 로그 출력을 붙잡아 (1) 토큰 원문·이메일이 로그에 없고 메서드 이름은 있는지, (2) NPE가 "Redis unavailable"로 위장되지 않고 그대로 전파되는지를 단언한다.

### KI-19. RedisConfig에 동일 구성 RedisTemplate 빈 3개
- 위치: `configs/RedisConfig.java` — `boardTemplate`, `countingTemplate`, `hotPidTemplate`이 전부 `RedisTemplate<String, Long>` + StringRedisSerializer + GenericToStringSerializer로 완전히 같다.
- 결과: 기능 문제는 없으나 빈 하나로 충분한 중복이다. `RedisPostsCache`는 같은 키(`board:{id}:count`)를 증감은 `boardTemplate`, 조회는 `countingTemplate`으로 접근해 읽는 사람을 혼란시킨다.
- 확인 방법: 세 빈 정의를 나란히 비교.

### KI-20. 핫랭킹 ZSET 키에 TTL이 없어 무기한 누적
- 위치: `infrastructure/redis/RedisHotPostRanking.java · addScore()` — expire 설정이 없다. 키는 날짜 접미사(`hot:leaderboard:day:{yyyyMMdd}`)와 5분 접미사(`hot:board:{boardId}realtime:{yyyyMMddHHmm}`)로 매일/5분마다 새로 생긴다.
- 결과: 지나간 날짜·시각의 ZSET이 삭제되지 않고 Redis 메모리에 계속 쌓인다. 정리 스케줄러도 없다.
- 확인 방법: 서버를 이틀 이상 돌린 뒤 redis-cli `KEYS hot:*`로 과거 날짜 키가 남아 있는 것 확인.
- → 갱신 (2026-08-28): **해소** — `HotPostRankingPort.addScore()`에 `Duration ttl` 파라미터를 추가하고, 어댑터가 ZSET에 점수를 쓴 뒤 `expire(key, ttl)`을 건다. 일자 리더보드는 2일, 게시판별 5분 실시간 버킷은 30분.
  - **정리 스케줄러를 만들지 않은 이유**: 스케줄러는 자기도 실패할 수 있고 실패해도 조용하다. Redis의 만료는 서버가 알아서 하며 키가 몇 개든 비용이 같다. 이 프로젝트의 스케줄러 풀 크기가 1이라(KI-44) 배치를 하나 더 얹는 것 자체가 위험 부담이다.
  - **TTL을 어댑터가 키 이름으로 추측하지 않고 호출자가 넘기게 한 이유**: 키는 시간 버킷이라 종류마다 수명이 다르다. 어댑터가 접두어를 보고 분기하면 새 버킷을 추가할 때마다 어댑터를 고쳐야 하고, 고치는 것을 잊으면 그 버킷만 조용히 TTL 없이 쌓인다 — 원래 결함과 같은 모양이다.
  - **일자 키를 1일이 아니라 2일로 한 이유**: TTL은 쓸 때마다 갱신되므로 마지막 쓰기 기준이다. 1일이면 오전에 마지막으로 갱신된 키가 그날 저녁 조회 전에 사라져 DB fallback으로 새는 구간이 생긴다. 2일이면 동시에 남는 키가 최대 2개로 묶이면서 그날 내내 살아 있다.
- 회귀 방지: `infrastructure/redis/RedisHotPostRankingTest`(2건) — 어댑터가 `expire`를 실제로 부르는지, 호출자가 준 TTL을 그대로 쓰는지 본다. **서비스 계층이 아니라 어댑터에서 보는 이유**: 결함 행위("TTL을 안 건다")가 어댑터에만 있어, 서비스 테스트는 어댑터가 TTL을 무시해도 통과한다.

## 트랜잭션·이벤트

### KI-21. S3 원격 호출이 트랜잭션 내부에서 실행됨
- 위치: `services/domain/MediaProcessingService.java` — 전 메서드가 `@Transactional`이며 내부에서 `fileStorage.copyToFinalLocation()`/`deleteByUrl()`(S3 네트워크 호출)을 수행한다. 호출자인 `services/domain/PostService · createPost()/updatePost()`, `CommentService · createComment()`도 트랜잭션 안이다.
- 결과: (1) S3 지연 동안 DB 커넥션·락을 점유해 커넥션 풀 고갈 위험. (2) S3 복사 후 트랜잭션이 롤백되면 S3 파일·삭제가 되돌아가지 않아 고아 파일/유실이 생긴다.
- 조치 필요: S3 작업을 커밋 후(AFTER_COMMIT 이벤트 등)로 분리하는 방침 결정.

### KI-22. 게시글 생성 시 커밋 전에 Redis 캐시를 갱신
- 위치: `services/domain/PostService.java · createPost()` — `@Transactional` 안에서 `postPrevCache.evictBoard() / cachePostPrev() / incrementBoardCount()`를 호출한다. `deletePost()`의 evict·감소도 동일 패턴.
- 결과: 커밋 전 캐시에 새 게시글이 실리므로, 이후 트랜잭션이 롤백되면 존재하지 않는 게시글이 목록 캐시에 남고 게시판 카운트도 어긋난다 (TTL 만료까지).
- 확인 방법: `createPost` 본문에서 save 이후·return 이전의 캐시 호출 3줄 확인.
- → 갱신 (2026-08-28): **해소** — 캐시 갱신 3줄을 `AfterCommitExecutor.run(...)` 안으로 옮겨 커밋 이후에 실행한다. `deletePost()`의 evict·감소도 같다.
  - **새로 만든 것**: `services/global/AfterCommitExecutor` — 트랜잭션 동기화가 활성이면 `afterCommit` 콜백으로 미루고, 트랜잭션 밖이면 즉시 실행한다. 트랜잭션 밖에서 미루면 커밋 자체가 없어 영영 실행되지 않기 때문이다.
  - **`@TransactionalEventListener(AFTER_COMMIT)` 대신 이 방식을 쓴 이유**: 이벤트 방식은 캐시 갱신 하나를 위해 이벤트 타입·리스너 클래스·발행 지점 세 개를 만들어야 하고, 실행 지점이 코드에서 멀어져 "여기 캐시가 언제 갱신되나"를 따라가기 어렵다. 이 프로젝트는 이미 리스너 없는 이벤트가 방치된 전례가 있다(KI-25).
  - **`PostPreviewDto`는 커밋 전에 만든다**: 커밋 후에는 영속성 컨텍스트가 닫혀 지연 로딩이 깨진다. 람다에는 이미 만들어진 DTO와 `boardId`만 담긴다.
  - **커밋 후 작업의 실패는 삼킨다**: 이미 커밋된 트랜잭션은 되돌릴 수 없으므로 예외를 올리면 성공한 요청이 실패로 보고된다. 캐시 갱신은 실패해도 다음 조회가 DB에서 다시 채우므로 이 조건을 만족한다 — 이 자리에 넣어도 되는 작업의 기준을 클래스 주석에 규칙으로 남겼다.
- 회귀 방지: `services/global/AfterCommitExecutorTest`(5건, 커밋 전 미실행·커밋 시 실행·롤백 시 미실행·트랜잭션 밖 즉시 실행·실패 전파 안 함) + `PostServiceTest.CacheAfterCommit`(2건) — 후자는 예약된 작업을 **일부러 실행하지 않고**, 메서드가 끝난 시점까지 캐시가 그대로인지 본다. 캐시 호출을 다시 트랜잭션 안으로 옮기면 즉시 깨진다.

### KI-23. ViewCountScheduler의 자기호출 트랜잭션과 드레인 유실
- 위치: `schedulers/ViewCountScheduler.java · syncViewsToDB()` — (1) 내부에서 `this.applyViewCount()`를 직접 호출하므로 `applyViewCount`의 `@Transactional`은 자기호출로 무효이고, 배치 전체가 외부 트랜잭션 하나로 묶인다. (2) `drainViewCounts()`가 Redis 카운터를 GETDEL로 먼저 삭제한 뒤 DB에 반영한다.
- 결과: 게시글 단위 격리가 의도대로 안 되고, 배치 트랜잭션이 커밋에 실패하면 이미 Redis에서 지워진 조회수 증가분이 통째로 유실된다.
- 확인 방법: `applyViewCount` 호출부가 프록시를 거치지 않는 것, `RedisViewCountStore · consumePendingCounts()`의 `getAndDelete` 순서 확인.
- → 갱신 (2026-08-28): **해소** — 두 문제를 각각 고쳤다.
  - **(1) 자기호출**: `applyViewCount()`를 `PostService`로 옮기고 스케줄러는 `postService.applyViewCount()`를 호출한다. 다른 빈이므로 호출이 프록시를 타고, 게시글 하나당 트랜잭션 하나가 실제로 성립한다. `syncViewsToDB()`의 `@Transactional`은 제거했다 — 남겨 두면 바깥 트랜잭션이 다시 생겨 안쪽이 그 트랜잭션에 참여해 버린다.
    - **`@Transactional(propagation = REQUIRES_NEW)`나 자기 주입(`@Lazy` self) 대신 클래스를 옮긴 이유**: 조회수를 더하는 것은 `Post` 엔티티를 바꾸는 일이라 원래 `PostService`의 일이다. 프록시 우회 트릭은 "왜 이렇게 썼는지"를 아는 사람만 유지할 수 있고, 다음 사람이 다시 `this.` 로 되돌리면 조용히 원래 결함으로 돌아간다.
  - **(2) 드레인 순서**: `consumePendingCounts()`(GETDEL)를 `peekPendingCounts()`(읽기만) + `settleCounts(applied)`(반영된 만큼 차감)로 나눴다. 순서가 **읽기 → DB 반영 → 차감**이 되어, 반영에 실패한 게시글의 증가분은 Redis에 남아 다음 주기에 다시 시도된다.
    - **DEL이 아니라 DECRBY인 이유**: peek 이후 반영까지 사이에 들어온 새 조회수가 이미 카운터에 더해져 있다. 키를 통째로 지우면 그 조회수까지 사라지지만, 반영한 값만 빼면 그 사이 증가분이 다음 주기로 넘어간다. 차감 결과가 0 이하면 키를 지운다 — 안 지우면 값이 0인 키가 쌓여 `KEYS`가 훑을 키스페이스가 단조 증가한다.
    - **삭제된 게시글은 예외**: 다시 시도해도 성공하지 않으므로 반영된 것으로 쳐서 차감한다. 안 그러면 매 주기 같은 실패를 반복한다.
  - `KEYS`는 그대로 두었다 — SCAN 전환은 KI-17의 범위다.
- 회귀 방지: `ViewCountSchedulerTest.DrainOrder`(4건) — `InOrder`로 DB 반영이 차감보다 먼저인지, 실패한 게시글이 차감 목록에서 빠지는지(ArgumentCaptor), 하나가 실패해도 나머지가 진행되는지, 삭제된 게시글은 정리되는지를 본다. `ViewCountServiceTest.PeekAndSettle`(5건)이 읽기와 정리가 실제로 분리됐는지 고정한다.

### KI-24. STOMP 발행이 트랜잭션 커밋 전에 일어남
- 위치: `services/domain/ChatService.java · markAsRead()` 및 `writeSystemMessage()/publishMemberEvent()`를 부르는 초대·강퇴·퇴장·이름변경 메서드들, `services/domain/NotificationService.java · saveNotification()` — 모두 `@Transactional` 안에서 `messagingTemplate.convertAndSend...`를 호출한다.
- 결과: 트랜잭션이 롤백되면 클라이언트는 DB에 존재하지 않는 메시지·알림·멤버 이벤트를 이미 수신한 상태가 된다 (유령 이벤트). 기존 문서도 이를 인지하고 있다 — `docs/GROUP_CHAT.md` 8절 "알려진 한계: 트랜잭션 커밋 전에 WebSocket 메시지가 나갑니다".
- 조치 필요: `TransactionSynchronization.afterCommit` 또는 AFTER_COMMIT 이벤트로 발행 이전 방침 결정.
- → 갱신 (2026-08-28): **해소** — 발행 4곳(`ChatService.markAsRead()`·`writeSystemMessage()`·`publishMemberEvent()`, `NotificationService.saveNotification()`)을 모두 `AfterCommitExecutor.run(...)`으로 감쌌다. KI-22와 같은 장치를 쓴다.
  - **`TransactionSynchronization.afterCommit`을 택하고 AFTER_COMMIT 이벤트를 버린 이유**: 이벤트 방식은 발행 지점마다 이벤트 타입과 리스너를 만들어야 하고, 발행 코드가 원래 자리에서 멀어져 "이 메시지가 언제 나가나"를 따라가기 어려워진다. 이 프로젝트는 리스너 없는 이벤트가 방치된 전례가 있다(KI-25). 지금 방식은 발행 코드가 원래 위치에 그대로 남고 실행 시점만 늦춰진다.
  - **페이로드 DTO는 커밋 전에 만든다**: 커밋 후에는 영속성 컨텍스트가 닫혀 `ChatMessageDto.fromEntity()`·`NotificationDto.fromEntity()`의 지연 로딩이 깨진다. 람다에는 완성된 DTO와 id 값만 담긴다.
  - `docs/GROUP_CHAT.md` 8절의 "알려진 한계"와 9절 남은 작업 1번도 해소로 갱신했다.
- 회귀 방지: `ChatServiceTest.MarkAsRead.doesNotPublishBeforeCommit()`, `NotificationServiceTest.doesNotPushBeforeCommit()` — 예약된 작업을 **일부러 실행하지 않고** 발행이 일어나지 않았는지 본다. 발행을 다시 트랜잭션 안으로 옮기면 즉시 깨진다.

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
- → 갱신 (2026-09-04): **해소** — 두 갈래를 각각 없앴다. 반응 확인 2N 은 댓글 id 를 한 번에 넘기는 일괄 조회로([OPT-001](../performance/optimizations/OPT-001-comment-reaction-batch.md)), 작성자 LAZY 로딩은 `CommentRepository.findByPost` 의 `join fetch c.user` 로([OPT-002](../performance/optimizations/OPT-002-comment-author-fetch-join.md)) 바꿨다. 요청당 쿼리가 **1,507 → 3.9** 로 줄었고 댓글 수에 비례하지 않는다 — 댓글 6개짜리 글과 4,040개짜리 글이 똑같이 4개를 쓴다. 회귀 방지 테스트는 `CommentReactionServiceTest`(호출 횟수 고정)와 `CommentRepositoryTest`(실행 문장 수 고정)에 있다. **레이어 위반(컨트롤러가 DTO 조립을 품음)은 그대로 남아 있다.**

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
- → 갱신 (2026-08-28): **해소** — 사용자 결정에 따라 **이메일 무효화 + soft delete**. `User.withdraw()`가 `isValid=false`로 두면서 `USR_email`을 `deleted-{id}@deleted.invalid`로 치환한다. `UserService.deleteAccount()`는 이 메서드만 부른다.
  - **이메일을 치환한 이유**: `users.USR_email`에 유니크 제약이 있어, 원래 이메일을 그대로 두면 **같은 이메일로 재가입할 수 없다.** 표식값으로 비켜 주면 스키마를 건드리지 않고 재가입이 가능해진다. 대가는 탈퇴 회원의 원래 이메일을 복구할 수 없다는 것이고, 그건 의도된 선택이다.
  - **표식 도메인을 `.invalid`로 한 이유**: RFC 2606이 "절대 실재하지 않는다"고 못박은 예약 TLD라 실수로 메일이 발송될 수 없다. 형식은 `Email` VO의 정규식을 통과해야 하므로 실제 이메일 모양을 지킨다(`+`는 그 정규식이 허용하지 않아 `-`를 쓴다).
  - **FK 위반·JPA 오류를 잡던 try/catch는 제거했다**: DELETE를 하지 않으므로 그 예외가 발생할 수 없다. 일어날 수 없는 경우를 위한 처리를 남겨 두면 읽는 사람을 오도한다.
  - `findByEmail`·`existsByEmail`에 `isValid = true`를 걸었다. 이메일이 이미 비켜 있어 원래 이메일로는 안 잡히지만, 인증·토큰 재발급이 전부 `findByEmail`을 지나므로 이중으로 막는다. 닉네임 쿼리는 건드리지 않았다 — 탈퇴자의 닉네임을 풀어 줄지는 별개의 제품 결정이다.
- 회귀 방지: `UserServiceTest.DeleteAccount` — 행이 지워지지 않고 `isValid=false`가 되는지, 이메일이 표식값으로 바뀌어 재가입이 가능해지는지 확인한다. 물리 삭제를 전제하던 기존 테스트 3건(FK 위반·JPA 오류·기타 예외의 ErrorCode 변환)은 그 예외가 더 이상 발생할 수 없으므로 함께 제거했다.

## 게시글·반응·댓글 (Phase 3에서 확인분)

### KI-35. 게시글 검색에 정렬이 적용되지 않음
- 위치: `domain/posts/queryDsl/PostRepositoryCustomImpl.java · searchKeywordsAll()` — orderBy 절이 없고, `searchPagedPosts()`에 전달되는 Sort도 무시된다. 미구현 `searchKeywords()`는 `return null`.
- 결과: 검색 결과 순서가 보장되지 않으며 페이지 간 중복·누락이 발생할 수 있다.

### KI-36. 게시글 확정 시 tmp 폴더 일괄 삭제로 동시 작성 이미지 유실 가능
- 위치: `services/domain/MediaProcessingService` → `services/global/S3FileStorageAdapter · deleteUserTmp()` — 게시글 확정 후 해당 유저의 `tmp/{userId}/` 전체를 삭제한다.
- 결과: 같은 사용자가 두 글을 동시에 작성 중이면(탭 2개), 먼저 확정한 글이 다른 글의 임시 이미지까지 지운다.
- → 갱신 (2026-08-28): **해소** — `FileStoragePort.deleteUserTmp(Long userId)`를 `deletePromotedTmpFiles(Collection<String> tmpUrls)`로 바꿨다. 이번 요청이 실제로 최종 위치로 옮긴 URL만 넘어가므로, 같은 사용자의 다른 초안은 인자에 들어가지 않는다. 호출 4곳(글 생성·글 수정·댓글 생성·프로필 이미지)이 각각 자기가 승격시킨 URL 목록을 넘긴다.
  - **`deleteUserTmp`를 남겨 두지 않고 시그니처를 바꾼 이유**: 남겨 두면 "사용자 tmp 전체 삭제"라는 위험한 도구가 그대로 있어 다음 사람이 다시 쓴다. 인자를 URL 목록으로 바꾸면 **범위를 넓히는 호출 자체를 쓸 수 없다.** 프로덕션에서 이 메서드를 부르던 곳은 4곳뿐이라 옮길 비용도 작았다.
  - **tmp 파일에 TTL/수명주기 규칙을 거는 대안은 버렸다**: S3 라이프사이클 정책은 저장소 밖(인프라 설정)에 있어 저장소만 보고는 알 수 없고, 이 결함(다른 글의 파일을 지운다)을 직접 막아 주지도 않는다. 확정되지 않은 초안의 tmp 파일이 남는 문제는 별개이며 이번 범위가 아니다.
  - 부수 영향: 승격되지 않은 tmp 파일은 이제 남는다. 예전에는 전체 삭제가 그것까지 치웠지만, 그 부수 효과가 곧 이 결함이었다. 정리는 S3 라이프사이클 규칙으로 다루는 것이 맞다.
- 회귀 방지: `MediaProcessingServiceTest.doesNotTouchOtherDraftsOfTheSameUser()` — `ArgumentCaptor`로 삭제 대상 목록을 붙잡아 이번 요청이 승격시킨 URL만 들어 있고 다른 초안의 tmp URL은 없는지 단언한다. 나머지 3개 경로도 `List.of(...)` 인자를 정확히 검증하도록 갱신했다.

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
- → 갱신 (2026-08-28, `respondToFriendRequest` 잔여분): **해소** — 분기 이전에 응답 값을 검증하고, 허용되지 않는 값이면 `CustomException(INVALID_REQUEST)` → 400으로 막는다. 요청 행은 그대로 살아남는다. `if/else if` 연쇄를 `switch`로 바꿔 분기 누락이 눈에 띄게 했다.
  - **`FriendRequestStatus`를 그대로 파싱하지 않고 응답 전용 enum(`FriendResponse`)을 따로 둔 이유**: 그 enum에는 `REQUESTED`가 들어 있는데 "요청함"은 요청의 초기 상태이지 응답이 아니다. 그대로 쓰면 `REQUESTED`가 유효한 값으로 통과해 세 분기 어디에도 걸리지 않고, **원래 결함이 그대로 재현된다.** 받을 수 있는 값만 세어 두면 그런 값이 400으로 걸린다.
  - null과 대소문자·공백도 함께 처리한다. null을 그냥 두면 `equalsIgnoreCase`에서 NPE가 나 400이어야 할 것이 500이 된다.
- 회귀 방지: `FriendServiceTest.RespondToFriendRequest`에 3건 추가 — 오타(`"ACCEPT"`)·`"REQUESTED"`·`null` 각각에 대해 400이고 **요청 행이 살아 있는지**(`isValid == true`)를 함께 단언한다. 예외만 보면 "던지고 나서 이미 종결시켰다"를 놓친다.

### KI-43. Friend/FriendReq가 물리 삭제됨
- 위치: `services/domain/FriendService` — 친구 삭제·요청 처리에서 행을 물리 삭제한다. soft delete 컨벤션 위배 (KI-34와 동일 계열).
- → 갱신 (2026-08-11): **부분 해소** — `FriendReq`는 `BaseEntity.delete()`(soft delete)로 전환되어 요청 이력이 보존된다. `Friend` 관계 행은 여전히 `deleteAll()` 물리 삭제다.
- → 갱신 (2026-08-28): **해소** — `deleteFriends()`의 `friendRepository.deleteAll(relations)`를 `relations.forEach(Friend::delete)`로 바꿨다. 스키마 변경은 필요 없었다 — `friends` 테이블에 이미 `is_valid`가 있고 `(USR_id, USR_frd_id)` 유니크 제약이 없어, 다시 친구를 맺으면 새 행이 들어간다.
  - **핵심은 삭제 쪽이 아니라 조회 쪽이었다.** soft delete만 하고 조회를 그대로 두면 **이미 끊은 친구가 계속 친구로 보인다.** `FriendRepository`의 6개 쿼리 전부에 `is_valid = true`를 넣었다: `findAllFriends`(UNION 두 가지), `findFriendsRelations`, `findFriendIdsAmong`(UNION 두 가지), `findMutualFriendIdsAmong`(f1과 EXISTS 안의 f2), `existsFriendship`(JPQL, f1과 f2), 그리고 파생 쿼리 `findByUserAndFriend` → `findByUserAndFriendAndIsValidTrue`로 개명. 새 쿼리를 추가할 때 잊지 않도록 리포지토리 상단에 규칙으로 적었다.
  - **`@Where`/`@SQLRestriction`으로 엔티티에 전역 필터를 걸지 않은 이유**: 네이티브 쿼리에는 적용되지 않는다. 이 리포지토리는 6개 중 4개가 네이티브라 절반만 걸리는 필터가 생기고, 그게 오히려 "필터가 있다"는 착각을 만든다.
  - 부수 수정: `@DataJpaTest` 두 클래스(`FriendRepositoryTest`, `FriendReqRepositoryTest`)에 `@Import(JpaAuditingConfig.class)`를 추가했다. KI-52에서 `@EnableJpaAuditing`을 애플리케이션 클래스에서 분리한 뒤로 `@DataJpaTest`가 그 설정을 못 올려 `created_at`이 null이 되고 NOT NULL 제약에 걸렸다.
- 회귀 방지: `FriendRepositoryTest`에 soft delete 필터 테스트 4건 추가(H2 실 DB, `@DataJpaTest`) — 관계를 지운 뒤 `existsFriendship`·`findAllFriends`·`findFriendsRelations`·`findMutualFriendIdsAmong`가 각각 빈 결과를 주는지 본다. `FriendServiceTest`는 양방향 행이 `isValid=false`가 되고 `deleteAll`/`delete`가 호출되지 않는지 확인한다.

### KI-44. 외부 API RestTemplate에 타임아웃이 없음
- 위치: `configs/AppConfig.java · restTemplate()` — `new RestTemplate()` 기본 생성으로 connect/read 타임아웃 미설정.
- 결과: NEIS 무응답 시 스케줄러·부팅 초기화 스레드가 무기한 대기한다.
- → 보강 (2026-08-18): **정지가 다른 배치로 전파된다는 사실을 확정했다.** `@EnableScheduling`만 선언돼 있고 `TaskScheduler` 빈도, `spring.task.scheduling.pool.size` 설정도 없어 스케줄러 스레드 풀이 **1개**다(Spring Boot `TaskSchedulingProperties` 기본값). 따라서 `SchoolMealScheduler`가 타임아웃 없는 NEIS 호출에 묶이면 같은 스레드를 쓰는 `ViewCountScheduler`(60초 주기)와 `HotScoreScheduler`(5분 주기)가 **함께 멈춘다**. 조회수는 Redis에 계속 쌓이기만 하고 DB에 반영되지 않는다.
- 확인 방법: `grep -rn "TaskScheduler" src/main/java`(0건)와 `grep -rn "task.scheduling" src/main/resources`(0건). 재현은 NEIS 호스트를 hosts 파일로 블랙홀 IP에 매핑한 뒤 `SchoolMealScheduler.loadSchoolMeals()`를 수동 호출하고, 이후 `ViewCountSync` 로그가 끊기는지 관찰.
- 조치 방향: 두 가지가 **모두** 필요하다. `RestTemplate`에 connect/read 타임아웃을 설정해 근본 원인을 막고, `spring.task.scheduling.pool.size`를 4 이상으로 올려 배치 간 격리를 만든다. 풀 크기만 올리면 NEIS 호출 스레드는 여전히 영원히 묶인다.

### KI-45. 학교·급식 초기화 로직의 중복 실행과 유실 위험
- 위치: 세 가지가 겹친다.
  - `initializers/SchoolDataProdInitializer` — 최초 수집 분기가 도달 불가 구조라 급식 JSON 파일이 없으면 prod에서 영영 수집되지 않는다.
  - `api/SchoolInfoInitializer` — !prod 부팅마다 무조건 NEIS 전량 크롤을 수행한다 (`AppStartupRunner`의 조건부 로드와 중복).
  - `api/SchoolMealInitializer · importMealsFromJson()` — deleteAll 후 재적재 방식이라 수집 실패 시 기존 급식 데이터가 전량 유실될 수 있다.
- → 갱신 (2026-08-28): **해소** — 세 문제를 각각 고쳤다.
  - **(1) 도달 불가 분기**: `SchoolDataProdInitializer`의 바깥 조건에서 `&& file.exists()`를 뺐다. 바깥에서 이미 파일 존재를 요구했으므로 안쪽 `else`(파일이 없을 때 NEIS 최초 수집)가 절대 실행될 수 없었다. 이제 `count == 0`만 보고, 파일이 있으면 JSON에서, 없으면 NEIS에서 가져온다.
  - **(2) 중복 초기화**: `api/SchoolInfoInitializer`를 **삭제**했다. `AppStartupRunner`와 프로파일(`!prod & !test`)·이벤트(`ApplicationReadyEvent`)·하는 일이 완전히 같은데, 이쪽만 조건 없이 매 부팅 NEIS 전량 크롤을 돌았다. **둘을 합치지 않고 지운 이유**: `AppStartupRunner`는 이미 `schoolRepository.count() == 0`으로 감싸 두었고 시드 사용자 배정 순서까지 맞춰 놨다. 남길 쪽이 명확해 옮길 로직이 없다. 참조하는 코드도 없었고 주입받던 `SchoolService`는 쓰이지도 않았다.
  - **(3) 재적재 유실**: `importMealsFromJson()`에서 `deleteAll()`을 **새 행을 다 만든 뒤로** 옮기고, 만들어진 행이 0건이면 기존 데이터를 건드리지 않고 돌아가게 했다. `@Transactional`이 이미 붙어 있어 삭제와 저장은 한 단위다.
    - **"0건이면 그대로 둔다"를 넣은 이유**: 트랜잭션만으로는 부족하다. 학교 코드가 하나도 매칭되지 않는 경우는 예외가 아니라 정상 종료라 롤백되지 않고, 그대로 "전부 지우고 0건 저장"이 커밋된다.
- 회귀 방지: `api/SchoolMealServiceTest`(3건) — 매칭 학교가 없을 때·파일이 없을 때 `deleteAll`이 불리지 않는지, 정상일 때 `InOrder`로 **학교 조회 → deleteAll → saveAll** 순서인지 본다(예전에는 deleteAll이 학교 조회보다 앞에 있었다). `initializers/SchoolDataProdInitializerTest`(3건) — 데이터도 파일도 없을 때 NEIS 수집 분기가 실제로 실행되는지 확인한다. 이번 달 급식 JSON이 저장소에 있으면 그 분기를 확인할 수 없으므로 `assumeFalse`로 건너뛴다.

### KI-46. 시간표 템플릿 수정 시 NPE 가능
- 위치: `services/TimetableTemplateService · update()` — templateName이 null인 요청에서 NPE 경로가 있다 (KI-16의 검증 부재와 결합).

### KI-47. 학교 검색이 엔티티를 직접 반환
- 위치: `controllers/SchoolController.java · searchSchools()` — DTO 변환 없이 `School` 엔티티를 응답으로 노출한다. "엔티티 직접 노출 금지" 컨벤션 위배.

## 운영·테스트 (Phase 4에서 확인분)

### KI-48. 배포 후 검증·자동 롤백이 없음
- 위치: `.github/workflows/deploy.yml` — `docker compose up -d --force-recreate`로 끝난다. `/actuator/health` 확인 단계가 없다.
- 결과: 새 컨테이너가 기동 직후 죽어도 워크플로는 성공으로 남고, 롤백은 수동이다 ([operations/runbook.md](operations/runbook.md)).
- → 갱신 (2026-08-28): **해소** — `up -d` 이후에 기동 확인 단계를 넣었다. `http://localhost:8081/actuator/health`가 `"status":"UP"`을 돌려줄 때까지 5초 간격으로 최대 120초 기다린다. 통과하지 못하면 컨테이너 상태와 마지막 200줄 로그를 워크플로 출력에 남기고, **배포 직전 이미지로 되돌린 뒤** `exit 1`로 실패시킨다.
  - **포트 8081인 이유**: `application-prod.properties`의 `management.server.port=8081`. `docker-compose.prod.yml`이 `network_mode: host`라 EC2의 localhost로 바로 닿는다.
  - **롤백 대상은 `docker inspect`로 배포 전에 기록한다**: `.env`의 `ECR_IMAGE`는 이미 새 이미지로 덮여 있어 그것만으로는 되돌릴 곳을 모른다. 쉘 환경변수가 `--env-file` 값보다 우선하므로 `ECR_IMAGE="$PREVIOUS_IMAGE" docker compose up`으로 되돌린다.
  - **컨테이너가 이미 죽었으면 즉시 중단한다**: `docker ps -q`가 비면 120초를 채울 이유가 없다. 실패를 빨리 알리는 편이 낫다.
  - **compose의 `healthcheck:` 대신 워크플로에서 확인하는 이유**: compose 헬스체크는 컨테이너 상태를 표시할 뿐 `up -d`의 종료 코드를 바꾸지 않아, 그것만으로는 워크플로가 여전히 성공으로 끝난다. 배포 성공/실패를 가르는 판정은 배포를 실행하는 쪽에 있어야 한다.
- 회귀 방지: `ci/DeploymentHealthCheckTest`(4건) — 워크플로 YAML에서 deploy 잡의 SSH 스크립트를 꺼내, 헬스 확인·`exit 1`·로그 출력·롤백이 모두 들어 있는지 단언한다.

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
- → 갱신 (2026-08-28): **해소** — `spring-security-test`를 추가하고 웹 슬라이스 기반 3종을 깔았다.
  - `support/WebSliceTest` — `@WebMvcTest` + 테스트 프로파일 + `SecurityConfig` import를 묶은 합성 애노테이션. `@WebMvcTest`는 `@Configuration` 클래스를 타입 필터로 걸러내므로 `SecurityConfig`를 명시적으로 import하지 않으면 부트 기본 보안이 적용돼 실제 인가 규칙을 검증할 수 없다.
  - `support/WebSliceSecuritySupport` — `SecurityConfig`가 필드 주입하는 협력자 3개(`CustomOAuth2UserService`·`OAuth2SuccessHandler`·`TokenProvider`)의 목. 셋 다 인가 판정에는 관여하지 않고 OAuth2 로그인 경로에서만 쓰인다.
  - `support/TestPrincipals` — `@WithMockUser`는 스프링 기본 `UserDetails`를 심어 `@AuthenticationPrincipal CustomUserPrincipal`이 null이 되므로, 실제 principal 타입을 만들어 넣는 헬퍼.
- 부수 변경: `@EnableJpaAuditing`을 `HighteendayBackendApplication`에서 `configs/JpaAuditingConfig`로 분리했다. 애플리케이션 클래스에 붙어 있으면 JPA를 뺀 슬라이스에서도 항상 처리되어 "JPA metamodel must not be empty"로 컨텍스트가 뜨지 않는다.
- 첫 사용처 2건: `controllers/PostControllerWebSliceTest`(요청 매핑·`@Valid` 동작·응답 직렬화·비로그인 쓰기 차단), `security/AuthorizationMatrixTest`(공개 7경로·보호 18경로의 비로그인 응답을 표로 고정 — KI-04·KI-05의 회귀 그물).

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

## 게시글 목록 캐시 (2026-08-18 확인분)

> 아래 둘은 같은 클래스(`services/domain/redisService/RedisPostsCache`)의 결함이지만 서로
> 독립이다. KI-56은 **총 개수**가 틀리는 문제, KI-57은 **목록 내용**이 비는 문제다.
>
> 둘 다 성능 테스트로는 드러나지 않는다. 부하 스크립트(`performance/scripts/posts.js`)가
> `size=10` 고정에 페이지 0~4만 요청하고, 매 실행 전 `FLUSHALL`로 Redis를 비우기 때문이다.

### KI-56. 게시판 글 개수 캐시가 만료 후 첫 쓰기에서 1로 되살아난다
- 위치: `services/domain/redisService/RedisPostsCache.java` — `board:{boardId}:count` 키를 다루는 세 경로의 TTL과 생성 방식이 어긋나 있다.
  - `createCount()`: 캐시 미스 시 DB 집계값을 `set(key, count, Duration.ofMinutes(5))` — **TTL 5분**
  - `incrementBoardCount()`: `opsForValue().increment(key, 1)`(Redis `INCRBY`) 후 `expire(key, BOARD_TTL)` — **TTL 60분**
  - `decrementBoardCount()`: 같은 구조의 `DECRBY`
- 원인: Redis `INCRBY`는 **키가 없으면 0으로 만든 뒤 증가**시킨다. 값 직렬화가 `GenericToStringSerializer<Long>`(평문 십진 문자열)이라 타입 오류로 막히지도 않는다. 그리고 `getCount()`는 캐시 히트 시 TTL을 갱신하지 않으므로, 키는 생성 5분 뒤 조회량과 무관하게 사라진다.
- 결과: 아래 순서로 총 개수가 최대 60분간 `1`(삭제가 먼저면 `-1`)이 된다.
  ```text
  t+0분    목록 조회 → 미스 → createCount() → count = 50,000, TTL 5분
  t+5분    키 만료
  t+6분    글 작성 → INCRBY(키 없음) → count = 1, TTL 60분      ← 여기서 망가짐
  t+6~66분 조회는 전부 히트하므로 createCount()가 불리지 않음 → total = 1 유지
  ```
  `GET /api/boards/{boardId}/posts` 응답의 `total`이 그 값이고(`controllers/BoardPostController · getPostsByBoardId()` → `PageResponse(content, page, size, count)`), 클라이언트는 이 값으로 전체 페이지 수를 계산하므로 페이지네이션이 1페이지로 축소된다. **쓰기가 있는 게시판이라면 이 사이클이 반복되므로 카운터가 맞는 시간보다 틀린 시간이 더 길다.**
- 확인 방법: 게시판 목록을 한 번 조회해 `board:{id}:count`를 만들고(`redis-cli TTL board:1:count` → 300 부근), 6분 기다린 뒤 글을 하나 작성하고 `redis-cli GET board:1:count` 확인 → `1`.
- 조치 방향: 증감 전에 키 존재를 확인하고 없으면 증감 대신 `createCount()`로 DB 재집계를 하거나, `INCRBY` 반환값이 증가분과 같은지(= 키가 없었다는 신호) 보고 보정한다. 어느 쪽이든 `createCount`의 5분과 증감의 60분을 하나로 통일해야 한다.
- [KI-53](#ki-53-댓글-수-카운터가-동시-쓰기에서-유실됨)·[KI-55](#ki-55-반응스크랩-카운터가-동시-쓰기에서-드물게-1씩-어긋난다)와 다른 문제다 — 저쪽은 **DB 카운터**의 동시성 문제이고 이쪽은 **Redis 캐시 카운터**의 만료 문제다.
- → 갱신 (2026-08-28): **해소** — 조치 방향 두 가지를 모두 적용했다.
  - **TTL 통일**: `createCount()`의 5분과 증감의 60분을 `COUNT_TTL` 하나로 묶었다. 60분에 맞춘 이유는 게시글 목록 캐시(`BOARD_TTL`)와 같은 주기로 만료돼 두 캐시가 따로 놀지 않게 하기 위해서다. 값의 정확성은 TTL이 아니라 증감이 지킨다.
  - **키 부재 시 증감 대신 재집계**: `incrementBoardCount()`/`decrementBoardCount()`를 `applyCountDelta(boardId, delta)` 하나로 합치고, `INCRBY` **반환값이 delta와 같으면**(= 직전 값이 0 = 키가 없었다) 그 값을 버리고 `createCount()`로 DB 재집계한다.
  - **`EXISTS`를 먼저 부르지 않은 이유**: 확인과 증감 사이에 키가 만료될 수 있어 오히려 새 틈이 생긴다. 반환값 판정은 `INCRBY` 한 번으로 끝나 그 틈이 없다. 대가는 실제 개수가 정확히 1(또는 -1)이 되는 경우 불필요한 `COUNT(*)`가 한 번 도는 것뿐이고, 결과 값은 어느 쪽이든 같다.
  - **Lua 스크립트를 쓰지 않은 이유**: `EXISTS`+`INCRBY`를 원자화하면 위 낭비도 없앨 수 있지만, 스크립트가 배포 산출물 밖(문자열 상수)에 생겨 테스트·리뷰 대상에서 벗어난다. 얻는 것이 "드문 경우의 COUNT 한 번"뿐이라 비용이 맞지 않는다.
- 회귀 방지: `RedisPostsCacheTest.CountDelta`(4건) — 키 부재 상태의 증가·감소가 각각 DB 재집계로 이어지는지, 키가 살아 있으면 DB를 안 건드리는지, 그리고 **생성 경로와 증감 경로의 TTL이 실제로 같은 값인지**(ArgumentCaptor로 두 값을 비교) 확인한다. 마지막 항목이 없으면 TTL이 다시 어긋나도 아무도 모른다.

### KI-57. 페이지 크기가 크면 캐시 경로가 빈 목록을 반환한다
- 위치: `services/domain/PostService.java · getPagedPosts()`가 페이지 **번호**만 보고 캐시 경로를 택한다(`dto.getPage() < CACHE_PAGE_LIMIT && sortType == RECENT`, `CACHE_PAGE_LIMIT = 5`). 그런데 캐시 목록 `board:{id}:posts`는 최대 **50개**(`RedisPostsCache · MAX_SIZE`)만 담고, `size`는 컨트롤러에서 1~50까지 허용된다(`size <= 0 || size > 50`이면 기본값).
- 결과: `page=3&size=20`이면 조회 범위가 `start=60, end=79`가 되어 50개짜리 리스트를 벗어난다. `getPostPrevs()`의 흐름은 이렇게 된다.
  1. `range(key, 60, 79)` → 빈 리스트
  2. "캐시가 비었다"고 판단해 DB에서 RECENT 상위 50건을 읽고 `addPostToBoard` 50회 + `cachePostPrev` 50회로 재적재
  3. `range(key, 60, 79)` 재실행 → **여전히 빈 리스트**(리스트 길이는 그대로 50)
  4. 빈 목록을 반환

  즉 `page=3~4 & size=20`은 게시글이 수만 건 있어도 `content`가 빈 배열이고(`total`은 정상값이라 "3페이지가 있다는데 열면 비어 있다"로 보인다), `page=2 & size=20`은 20건 요청에 **10건만** 조용히 반환한다. 성능 측면으로는 그런 요청마다 DB 50행 조회와 Redis 명령 약 150회를 쓰고 아무것도 돌려주지 않는다.
- 확인 방법: 게시글 60건 이상인 게시판에 `GET /api/boards/{id}/posts?page=3&size=20` 요청 → `content: []`, `total`은 정상. 같은 요청을 `sortType=LIKE`로 바꾸면(캐시 경로를 벗어난다) 정상 응답이 온다.
- 조치 방향: 캐시 경로 진입 조건을 페이지 번호가 아니라 **끝 인덱스** 기준으로 바꾼다 — `(page + 1) * size <= MAX_SIZE`. 벗어나면 `postRepository.findByBoard(dto)`로 직행한다. 재적재도 `range` 결과가 아니라 `size(key)`로 "리스트가 실제로 비었는지"를 판정해야 한다.
- → 갱신 (2026-08-19): **해소** — 조치 방향대로 두 군데를 고쳤다.
  - `PostService.getPagedPosts()`: 진입 조건을 `dto.getPage() < CACHE_PAGE_LIMIT` 에서 `(page + 1) * size <= PostPrevCache.MAX_CACHED_POSTS` 로 바꿨다. 캐시 용량 50은 `PostPrevCache.MAX_CACHED_POSTS` 상수 하나로 모았다 — 이전에는 `RedisPostsCache` 의 private `MAX_SIZE=50` 과 `PostService` 의 `CACHE_PAGE_LIMIT=5` 가 서로 모르는 채로 같은 사실을 두 번 표현했고, **그 어긋남이 이 결함의 원인**이었다. 새 조건이 기존 조건을 완전히 포함하므로(size 10 일 때 page 0~4 그대로) `CACHE_PAGE_LIMIT` 은 삭제했다.
  - `RedisPostsCache.getPostPrevs()`: 재적재 판정을 `range()` 결과가 아니라 `opsForList().size(key)` 로 바꿨다. 부수적으로 재적재 경로의 중복 `range` 호출이 사라졌고, `ids` 가 null 일 때 NPE 로 예외 폴백에 빠지던 것이 명시적 빈 목록 반환이 됐다.
- 검증: 단위 테스트 8개 추가. 라우팅 6개(`page=3&size=20`·`page=2&size=20` → DB, `page=1&size=20`·`page=0&size=50`(경계) → 캐시, `page=1&size=50` → DB, `page=9&size=5` → 캐시 — 마지막은 기존 조건이면 캐시를 쓸 수 있는데도 DB로 새던 경우다)와 재적재 판정 2개(리스트가 비면 재적재, 차 있는데 구간만 밖이면 DB를 다시 읽지 않음). 저장소 전체 테스트 597개가 통과했다.

마지막 검증일: 2026-08-11 (최초 작성 2026-07-30, 이후 해소분은 각 항목의 "→ 갱신" 줄 참고)
KI-53·54는 2026-08-14 추가 — 부하 테스트 중 발견분. KI-55는 같은 날 데이터셋 재생성 검증 중 발견.
KI-56·57은 2026-08-18 추가 — "이미 아는 문제 말고 새 문제"를 찾는 코드 재독에서 발견. 부하 테스트가 밟지 않는 경로라 실행 결과로는 드러나지 않았다.
