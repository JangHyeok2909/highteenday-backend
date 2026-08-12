# 00. Quickstart — 클론에서 첫 로그인까지

## 이 문서가 답하는 질문

- 로컬에서 서버를 띄우려면 무엇이 필요한가?
- 왜 `docker compose up` 한 번으로 안 되는가?
- 띄운 뒤 무엇으로 동작을 확인하는가? (시드 계정, Swagger)
- 서버가 부팅될 때 자동으로 일어나는 일은 무엇인가?

## 3줄 요약

- 기본 프로파일(local)은 설정 파일이 없어 실패하므로 **dev 프로파일**로 띄운다 ([KI-02](KNOWN-ISSUES.md#ki-02-기본-프로파일-local의-프로퍼티-파일이-없음)).
- `docker compose up` 전체 기동은 현재 불가능하다 ([KI-01](KNOWN-ISSUES.md#ki-01-docker-composeyml이-실행-불가)) — Redis만 compose로 띄우고 MySQL과 앱은 개별 기동한다.
- 부팅하면 시드 데이터가 자동 생성되며 `test1@gmail.com / asd`로 로그인할 수 있다.

## 사전 요구사항

| 도구 | 버전 | 근거 |
|---|---|---|
| JDK | 17 | `build.gradle · java.toolchain` |
| MySQL | 8.x | `build.gradle`의 `mysql-connector-j`, `application.properties`의 MySQL8Dialect |
| Redis | 아무 최신 버전 (compose는 7-alpine) | `docker-compose.yml · redis` |
| Docker | 선택 (Redis·MySQL을 컨테이너로 띄울 경우) | — |

## 1. 인프라 기동 (Redis, MySQL)

Redis — compose 파일의 redis 서비스만 단독 기동한다 (전체 `up`은 KI-01로 실패):

```bash
docker compose up -d redis
```

MySQL — 로컬 설치본을 쓰거나 컨테이너로 직접 띄운다:

```bash
docker run -d --name highteenday-mysql -p 3306:3306 \
  -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=highteenday_db \
  mysql:8
```

dev 프로파일의 datasource 기본값은 `jdbc:mysql://localhost:3306/highteenday_db`, 사용자 `root`, 비밀번호 빈 문자열이다 (`application-dev.properties`). 위처럼 비밀번호를 설정했다면 환경변수로 덮어쓴다(아래 2단계).

## 2. 환경변수 설정

dev 프로파일이 요구하는 값 (`application-dev.properties` 기준). 기본값이 없는 항목은 반드시 넣어야 부팅된다:

| 환경변수 | 기본값 | 필수 여부 · 설명 |
|---|---|---|
| `DB_URL` | `jdbc:mysql://localhost:3306/highteenday_db` | 선택 |
| `DB_USERNAME` | `root` | 선택 |
| `DB_PASSWORD` | (빈 문자열) | MySQL 설정에 맞게 |
| `REDIS_HOST` / `REDIS_PORT` | `localhost` / `6379` | 선택 |
| `JWT_KEY` | 없음 | **필수.** HMAC-SHA512 서명 키이므로 64바이트 이상의 임의 문자열 권장 (`security/TokenProvider.java`) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | 없음 | **필수(부팅용).** 소셜 로그인을 실제로 쓸 게 아니면 임의 문자열로도 부팅은 된다. 실제 구글 로그인 테스트에는 유효한 자격증명 필요 |
| `NEIS_API_KEY` | 없음 | **필수(부팅용).** 급식 데이터 외부 수집을 쓰지 않으면 임의 문자열 가능. `[미확인: 급식 JSON 파일이 없는 달에는 부팅 시 NEIS 호출이 발생하는데(아래 4단계), 무효 키일 때의 정확한 동작은 실행으로 검증하지 않음]` |
| `S3_BUCKET` | `highteenday-bucket-0906` | 이미지 업로드를 실제 테스트할 때만 유효한 버킷·자격증명 필요 |

PowerShell 예시:

```powershell
$env:JWT_KEY = "local-dev-jwt-signing-key-must-be-at-least-64-bytes-long-0123456789abcdef"
$env:GOOGLE_CLIENT_ID = "dummy"; $env:GOOGLE_CLIENT_SECRET = "dummy"
$env:NEIS_API_KEY = "dummy"; $env:DB_PASSWORD = "root"
```

## 3. 서버 기동

```bash
./gradlew bootRun --args='--spring.profiles.active=dev'
```

스키마는 부팅 시 Flyway가 만든다 — 빈 DB라면 `db/migration/`의 마이그레이션(V1 baseline부터)이
순서대로 실행되어 전체 테이블이 생성된다. `ddl-auto`는 dev/prod 모두 `none`이라 엔티티를
수정해도 스키마가 자동으로 바뀌지 않는다. 스키마 변경 절차는 [MIGRATION.md](MIGRATION.md) 참고.

## 4. 부팅 시 자동으로 일어나는 일

prod가 아닌 프로파일에서는 `initializers/AppStartupRunner.java · onApplicationReady()`가 `ApplicationReadyEvent`에서 실행된다 (`@Profile("!prod")`):

1. `DataInitializer.dataInit()` — 시드 사용자·게시글·댓글·친구·시간표·알림 생성. 테스트 계정 `test1@gmail.com`, `test2@gmail.com` (비밀번호 `asd`)가 만들어진다 (`initializers/DataInitializer.java`).
2. School 테이블이 비어 있으면 `schoolData/schoolInfo/schools.json`에서 학교 데이터 import (`api/SchoolInfoService.java · loadAllSchools() / importSchoolsFromJson()`).
3. SchoolMeal 테이블이 비어 있으면 이번 달 급식 JSON(`schoolData/meals/meals-YYYY-MM.json`)이 있을 때 파일에서 로드하고, 없으면 NEIS API를 호출해 수집한다 (`api/SchoolMealInitializer`).

주의: 시드 중 게시글·댓글 생성은 부팅마다 반복 실행될 수 있다 `[미확인: 멱등성은 사용자 생성(findByEmail 체크)에만 확인됨 — 재부팅 시 게시글이 누적되는지는 실행으로 검증하지 않음]`.

## 5. 동작 확인

| 확인 | 방법 |
|---|---|
| 헬스체크 | `GET http://localhost:8081/actuator/health` → `{"status":"UP"}` — dev/prod는 액추에이터가 관리 포트 8081로 분리되어 있다 (`application-dev.properties · management.server.port`) |
| API 문서 | 브라우저에서 `http://localhost:8080/swagger-ui/index.html` (`configs/SwaggerConfig.java`) |
| 로그인 | `POST http://localhost:8080/api/user/login` body `{"email":"test1@gmail.com","password":"asd"}` — 응답 Set-Cookie로 `accessToken`, `refreshToken` 수신 (`controllers/UserController.java · login`) |
| 게시글 목록 | `GET http://localhost:8080/api/boards/1/posts?page=0` (시드가 게시판·게시글을 만들어 둠) |

## 6. 테스트 실행

```bash
./gradlew test
```

주의: 단위 테스트 대부분은 Mockito 기반이라 인프라 없이 돌지만, `HighteendayBackendApplicationTests`(@SpringBootTest)는 테스트 전용 프로파일이 없어 환경에 따라 실패한다 ([KI-12](KNOWN-ISSUES.md#ki-12-테스트가-ci에서-실행되지-않음)). 테스트는 H2로 돌므로 MySQL 문법인 Flyway 마이그레이션은 테스트에서 비활성화되어 있다 (`build.gradle · test` 태스크). 테스트 구조와 실행 전략은 [06-testing.md](06-testing.md)에서 다룬다.

## 코드 좌표

| 개념 | 위치 |
|---|---|
| 프로파일 기본값·공통 설정 | `src/main/resources/application.properties` |
| dev 프로파일 설정과 기본값 | `src/main/resources/application-dev.properties` |
| 부팅 시 초기화 진입점 | `initializers/AppStartupRunner.java · onApplicationReady()` |
| 시드 데이터 생성 | `initializers/DataInitializer.java · dataInit()` |
| 로컬 인프라 정의 | `docker-compose.yml` |
| 로그인 엔드포인트 | `controllers/UserController.java · login` |

## 알려진 문제·미확인 사항

- [KI-01](KNOWN-ISSUES.md#ki-01-docker-composeyml이-실행-불가) docker compose 전체 기동 불가
- [KI-02](KNOWN-ISSUES.md#ki-02-기본-프로파일-local의-프로퍼티-파일이-없음) local 프로파일 파일 부재
- [KI-09](KNOWN-ISSUES.md#ki-09-readme-실행-가이드가-현재-코드와-불일치) README 실행 가이드의 프로퍼티 키가 코드와 불일치 — 이 문서가 현행 기준이다
- `[미확인]` 항목 2건: NEIS 무효 키 시 부팅 동작, 시드 재실행 멱등성

마지막 검증일: 2026-08-11
