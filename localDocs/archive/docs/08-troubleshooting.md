# 08. Troubleshooting — 로컬 개발 중 자주 만나는 문제

## 이 문서가 답하는 질문

- 서버가 안 뜰 때 무엇부터 확인하는가?
- 자주 겪는 실패 증상과 그 원인은 무엇인가?
- SQL·성능 문제를 로컬에서 어떻게 관찰하는가?

운영 환경 장애 대응은 [operations/runbook.md](operations/runbook.md), 프론트엔드 문제는 `highteenday-frontend/docs/KNOWN-ISSUES.md`를 본다.

## 3줄 요약

- 부팅 실패의 대부분은 프로파일(local 기본값)·환경변수(JWT_KEY 등)·인프라(MySQL/Redis 미기동) 셋 중 하나다.
- `docker compose up -d` 한 번으로 MySQL·Redis·앱이 뜬다. 앱만 IDE에서 띄울 때는 dev 프로파일을 쓴다 ([00-quickstart.md](00-quickstart.md)).

- SQL 관찰은 dev 프로파일에서 p6spy를 켜면 된다.

## 증상별 원인과 해법

### 부팅이 안 된다

| 증상 | 원인 | 해법 |
|---|---|---|
| 아무 옵션 없이 `./gradlew bootRun` → 프로퍼티 오류 | 기본 프로파일 local은 개인 설정 파일을 전제한다 | `application-local.properties.example`을 복사해 만들거나 `--args='--spring.profiles.active=dev'`로 실행 ([00-quickstart.md](00-quickstart.md)) |
| `Could not resolve placeholder` 류 오류 | prod 프로파일은 기본값이 없어 환경변수를 주입하지 않으면 부팅에 실패한다 (dev는 전부 로컬용 기본값이 있다) | prod는 `DB_URL`·`JWT_KEY` 등을 전부 주입한다 ([operations/deploy.md](operations/deploy.md)의 환경변수 표) |
| MySQL 접속 거부 | MySQL 미기동 또는 비밀번호 불일치 (dev 기본값: root / 빈 문자열) | `DB_PASSWORD` 환경변수로 맞추기 |
| 부팅이 수 분씩 걸린다 (!prod) | 학교·급식 테이블이 비어 있으면 부팅 초기화가 NEIS에서 전량 수집한다 (`initializers/AppStartupRunner`) | `schoolData/` JSON이 있으면 파일에서 적재한다. RestTemplate에 타임아웃이 없어 NEIS 무응답 시 무기한 대기하는 점 주의 ([KI-44](KNOWN-ISSUES.md)) |

### 실행은 되는데 동작이 이상하다

| 증상 | 원인 | 참고 |
|---|---|---|
| 만료 토큰으로 요청했는데 401 대신 익명 취급 후 일괄 401 | 인증 필터가 토큰 예외를 삼키는 구조 | [04-request-flow.md](04-request-flow.md), [KI-07](KNOWN-ISSUES.md) |
| 재부팅할 때마다 시드 게시글이 늘어난다 | 시드 일부가 멱등하지 않음 (`initializers/DataInitializer`) | [00-quickstart.md](00-quickstart.md) ⑤ — DB를 비우고 재기동하면 초기 상태 |
| 조회수가 바로 안 오른다 | Redis 버퍼 → 60초 배치 반영 구조 | [domains/post-board.md](domains/post-board.md) |
| 좋아요 취소가 핫게시글 점수에 안 보인다 | 취소 시 이벤트 미발행 | [KI-37](KNOWN-ISSUES.md) |
| 반응 API 응답의 `isLiked`/`isDisliked`가 항상 false | 토글 후 상태를 다시 조회하지 않는다 | [KI-38](KNOWN-ISSUES.md) — 상태는 `GET /api/posts/{id}`로 재조회 |

### 테스트가 실패한다

| 증상 | 원인 | 해법 |
|---|---|---|
| `@DataJpaTest`에서 `created_at` NOT NULL 위반 | JPA Auditing 설정이 `configs/JpaAuditingConfig`로 분리돼 슬라이스 테스트가 자동으로 올리지 않는다 | 테스트 클래스에 `@Import(JpaAuditingConfig.class)` 추가 ([KI-43](KNOWN-ISSUES.md) 부수 수정 참고) |
| `PostMediaFlowTest`가 안 돈다 | `@Disabled` 상태 (실 S3·DB·인증 필요) | 정상. 웹 슬라이스·보안 테스트 기반은 [KI-52](KNOWN-ISSUES.md) 갱신 참고 |

## SQL·성능 관찰 방법

- dev 프로파일에서 `application-dev.properties`의 `decorator.datasource.p6spy.enable-logging=true`로 바꾸면 실행 SQL이 전부 로그에 찍힌다 (포맷은 `src/main/resources/spy.properties`). 끝나면 반드시 원복 — 성능 오버헤드가 있다.
- 느린 요청은 `aop/ExecutionLoggingAspect`가 300ms 초과 시 WARN으로 남긴다 (`app.execution-logging.slow-threshold-ms`).
- 요청당 쿼리 수는 `metrics/QueryCountFilter`가 `http.server.queries` 지표로 남기고, dev는 `app.query-metrics.detail-enabled=true`라 어떤 SQL이 몇 번 반복됐는지 로그 한 줄에 찍힌다 — N+1을 부하 없이 확정하는 근거다 ([KI-27](KNOWN-ISSUES.md) 해소 기록 참고).


## 코드 좌표

| 개념 | 위치 |
|---|---|
| 부팅 초기화 진입점 | `initializers/AppStartupRunner.java · onApplicationReady()` |
| p6spy 설정 | `application-dev.properties`, `src/main/resources/spy.properties` |
| 느린 실행 로깅 | `aop/ExecutionLoggingAspect` |
| dev 환경변수 기본값 | `src/main/resources/application-dev.properties` |

## 알려진 문제·미확인 사항

- 이 문서의 증상들은 대부분 KNOWN-ISSUES 항목의 재현 절차를 증상 관점으로 재배열한 것이다 — 원인 상세는 각 KI 항목을 따른다.
- `[미확인]` Windows 환경에서 `./gradlew` 대신 `gradlew.bat` 사용 시의 차이 — 실측하지 않음.

마지막 검증일: 2026-09-05

