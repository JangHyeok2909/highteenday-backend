# operations/environments — local / dev / prod / perf 프로파일 비교

## 이 문서가 답하는 질문

- 프로파일들은 datasource, DDL, Redis, 쿠키, CORS, 로깅, 시드에서 어떻게 다른가?
- 어떤 값이 공통(`application.properties`)이고 어떤 값이 프로파일별인가?

## 3줄 요약

- 기본 프로파일은 local이지만 `application-local.properties`는 gitignore 대상이라 저장소에 없다 ([KI-02](../KNOWN-ISSUES.md#ki-02-기본-프로파일-local의-프로퍼티-파일이-없음)) — local 열의 값 대부분은 "공통 기본값 또는 개인 파일에 위임"이다.
- dev는 로컬 기본값을 내장한 실질 개발 표준이고, prod는 전부 환경변수 주입이다. 스키마는 두 쪽 다 Flyway가 소유하며 `ddl-auto=none`이다 ([MIGRATION.md](../MIGRATION.md)).
- 시드 데이터·학교 데이터 초기화는 `@Profile("!prod")`라 local·dev에서만 돈다.
- 부하 테스트용 **perf 프로파일**은 단독으로 쓰지 않고 `prod,perf`로 겹쳐 쓴다 — prod 설정을 유지한 채 쿠키 도메인/Secure와 액추에이터 포트만 로컬 HTTP 테스트에 맞게 되돌린다 (`application-perf.properties` 상단 주석에 이유가 있다).

## 비교 표

각 값은 `src/main/resources/application.properties`(공통), `application-dev.properties`, `application-prod.properties`에서 실측했다. local 열에서 "공통값"은 `application.properties`의 값이 그대로 적용된다는 뜻이고, — 는 개인 `application-local.properties`가 정의해야 하는 값이다.

| 항목 | local (파일 부재, [KI-02](../KNOWN-ISSUES.md#ki-02-기본-프로파일-local의-프로퍼티-파일이-없음)) | dev | prod |
|---|---|---|---|
| datasource | — (개인 파일 필요, 없으면 부팅 실패) | `${DB_URL:jdbc:mysql://localhost:3306/highteenday_db}`, `${DB_USERNAME:root}`, `${DB_PASSWORD:}` | `${DB_URL}`, `${DB_USERNAME}`, `${DB_PASSWORD}` — 기본값 없음, 전부 주입 |
| `ddl-auto` | — | `none` (스키마는 Flyway 소유 — [MIGRATION.md](../MIGRATION.md)) | `none` (동일 — Flyway. `baseline-on-migrate`라 기존 DB는 V1을 건너뛴다) |
| `spring.sql.init.mode` | 공통값 없음 → Spring 기본 `embedded` `[미확인: local 파일이 정의하는지 알 수 없음]` | `never` | `never` |
| Redis | — | `${REDIS_HOST:localhost}` / `${REDIS_PORT:6379}` | `${REDIS_HOST}` / `${REDIS_PORT:6379}` — 호스트는 필수 주입 |
| 쿠키 secure | 공통값 `false` | 공통값 `false` | `true` |
| 쿠키 SameSite | 공통값 `Lax` | 공통값 `Lax` | `None` |
| 쿠키 domain | 공통 정의 없음 (호스트 전용 쿠키) | 공통 정의 없음 | `.highteenday.org` (`app.cookie-domain`) |
| frontend-url | 공통값 `http://localhost:3000` | 공통값 | `https://www.highteenday.org` |
| CORS (`app.cors.allowed-origins`) | 공통 정의 없음 — 개인 파일 필요 | `${CORS_ORIGINS:http://localhost:3000}` | `https://highteenday.org,https://www.highteenday.org` 고정 |
| 로깅 | 공통 정의 없음 (Spring 기본 INFO) | 앱 INFO + `HotPostService`만 DEBUG | 앱·root INFO |
| p6spy | 공통 정의 없음 → 스타터 기본값(활성) `[미확인: 실행으로 확인하지 않음]` | `enable-logging=false`, 로거 warn | `enable-logging=false`, 로거 off |
| actuator | 공통값: `/actuator` 베이스, 노출은 `health`만 | 관리 포트 **8081**로 분리 (`management.server.port`) | 관리 포트 **8081**로 분리 + `health.show-details=when-authorized` — 공개 ALB로 지표가 새는 것을 막기 위함. perf 프로파일은 이를 다시 메인 포트로 되돌린다 (Prometheus 스크레이프 경로 유지) |
| Swagger 서버 URL | 정의 없음 | 정의 없음 | `app.server-url=https://api.highteenday.org` (HTTPS 강제) |
| OAuth2 redirect-uri | 공통값 `{baseUrl}/oauth2/login/code/{registrationId}` | 공통값 | `https://api.highteenday.org/oauth2/login/code/google`로 고정 재정의 |
| 시드·초기화 실행 | 실행됨 | 실행됨 | 실행 안 됨 |

공통(모든 프로파일 동일): 톰캣 스레드/커넥션 튜닝, multipart 5MB 제한, `cloud.aws.region.static=ap-northeast-2`, slow threshold 300ms — [07-performance.md](../07-performance.md) 참고.

## 시드 실행 조건 (@Profile 실측)

- `initializers/AppStartupRunner.java` — 클래스에 `@Profile("!prod")`, `ApplicationReadyEvent`에서 시드 사용자·게시글, 학교/급식 데이터 초기화를 실행한다. 즉 **prod를 제외한 모든 프로파일**(local, dev, 그리고 프로파일 미지정 실행 포함)에서 돈다. 상세 절차는 [00-quickstart.md](../00-quickstart.md) 4단계.
- `src/main/resources/data.sql`(10만 건 적재)은 시드와 별개의 수동 스크립트다 — dev·prod 모두 `spring.sql.init.mode=never`라 자동 실행되지 않는다.

## 코드 좌표

| 개념 | 위치 |
|---|---|
| 공통 설정 + 기본 프로파일 | `src/main/resources/application.properties` |
| dev 설정 | `src/main/resources/application-dev.properties` |
| prod 설정 | `src/main/resources/application-prod.properties` |
| local 파일 배제 규칙 | `.gitignore · **/application-local.properties` |
| 시드 실행 조건 | `initializers/AppStartupRunner.java · @Profile("!prod")` |
| 쿠키 속성 소비처 | `services/security/JwtCookieService.java` `[미확인: 키 이름 매칭만 확인, 조립 로직 상세는 crosscutting/security 문서(Phase 2) 범위]` |

## 알려진 문제·미확인 사항

- [KI-02](../KNOWN-ISSUES.md#ki-02-기본-프로파일-local의-프로퍼티-파일이-없음) local 프로퍼티 파일 부재
- `[미확인]` 3건: local의 `sql.init.mode`·p6spy 실효값(개인 파일에 좌우), 쿠키 조립 로직 상세

마지막 검증일: 2026-08-11
