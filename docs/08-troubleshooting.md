# 08. Troubleshooting — 로컬 개발 중 자주 만나는 문제

## 이 문서가 답하는 질문

- 서버가 안 뜰 때 무엇부터 확인하는가?
- 자주 겪는 실패 증상과 그 원인은 무엇인가?
- SQL·성능 문제를 로컬에서 어떻게 관찰하는가?

운영 환경 장애 대응은 [operations/runbook.md](operations/runbook.md), 프론트엔드 문제는 `highteenday-frontend/docs/KNOWN-ISSUES.md`를 본다.

## 3줄 요약

- 부팅 실패의 대부분은 프로파일(local 기본값)·환경변수(JWT_KEY 등)·인프라(MySQL/Redis 미기동) 셋 중 하나다.
- `docker compose up` 전체 기동은 원래 실패한다 ([KI-01](KNOWN-ISSUES.md)) — [00-quickstart.md](00-quickstart.md)의 개별 기동 절차를 따른다.
- SQL 관찰은 dev 프로파일에서 p6spy를 켜면 된다.

## 증상별 원인과 해법

### 부팅이 안 된다

| 증상 | 원인 | 해법 |
|---|---|---|
| `docker compose up` 이 `depends on undefined service "mysql"` 로 실패 | compose 파일의 mysql 서비스가 비어 있음 ([KI-01](KNOWN-ISSUES.md)) | Redis만 `docker compose up -d redis`, MySQL·앱은 개별 기동 ([00-quickstart.md](00-quickstart.md)) |
| 아무 옵션 없이 `./gradlew bootRun` → datasource 오류 | 기본 프로파일 local의 프로퍼티 파일이 저장소에 없음 ([KI-02](KNOWN-ISSUES.md)) | `--args='--spring.profiles.active=dev'`로 실행 |
| `Could not resolve placeholder 'JWT_KEY'` 류 오류 | dev 프로파일의 기본값 없는 환경변수 미설정 (`application-dev.properties`) | [00-quickstart.md](00-quickstart.md)의 환경변수 표대로 설정 (GOOGLE_*, NEIS_API_KEY는 더미 가능) |
| MySQL 접속 거부 | MySQL 미기동 또는 비밀번호 불일치 (dev 기본값: root / 빈 문자열) | `DB_PASSWORD` 환경변수로 맞추기 |
| 부팅이 수 분씩 걸린다 (!prod) | 부팅 초기화가 학교·급식 데이터를 로드하고, `SchoolInfoInitializer`는 조건 없이 NEIS 전량 크롤을 수행 ([KI-45](KNOWN-ISSUES.md)) | `schoolData/` JSON이 있는 상태에서 실행하면 크롤이 줄어든다. RestTemplate에 타임아웃이 없어 NEIS 무응답 시 무기한 대기하는 점 주의 ([KI-44](KNOWN-ISSUES.md)) |

### 실행은 되는데 동작이 이상하다

| 증상 | 원인 | 참고 |
|---|---|---|
| 만료 토큰으로 요청했는데 401 대신 익명 취급 후 일괄 401 | 인증 필터가 토큰 예외를 삼키는 구조 | [04-request-flow.md](04-request-flow.md), [KI-07](KNOWN-ISSUES.md) |
| `POST /api/token/refresh` 가 401이 아닌 500 | TokenService의 raw RuntimeException | [KI-14](KNOWN-ISSUES.md) |
| 비로그인으로 보호 GET 호출 시 500 (NPE) | `GET /**` permitAll + principal null 미체크 | [KI-04](KNOWN-ISSUES.md) |
| 닉네임/비밀번호 형식 오류가 500으로 응답 | catch(Exception)이 400을 INTERNAL_ERROR로 변환 | [KI-15](KNOWN-ISSUES.md) |
| 재부팅할 때마다 시드 게시글이 늘어난다 | 시드 일부가 멱등하지 않음 (`initializers/DataInitializer`) | [00-quickstart.md](00-quickstart.md) ⑤ — DB를 비우고 재기동하면 초기 상태 |
| 조회수가 바로 안 오른다 | Redis 버퍼 → 60초 배치 반영 구조 | [domains/post-board.md](domains/post-board.md) |
| 좋아요 취소가 핫게시글 점수에 안 보인다 | 취소 시 이벤트 미발행 | [KI-37](KNOWN-ISSUES.md) |

### 테스트가 실패한다

| 증상 | 원인 | 해법 |
|---|---|---|
| `HighteendayBackendApplicationTests` 컨텍스트 로딩 실패 | 테스트 전용 프로파일 부재 + 실 인프라 요구 | [KI-12](KNOWN-ISSUES.md). 나머지 Mockito 단위 테스트는 인프라 없이 돈다 — [06-testing.md](06-testing.md) |
| `PostMediaFlowTest`가 안 돈다 | `@Disabled` 상태 (실 S3·DB·인증 필요) | 정상. 통합 테스트 공백은 [KI-52](KNOWN-ISSUES.md) |

## SQL·성능 관찰 방법

- dev 프로파일에서 `application-dev.properties`의 `decorator.datasource.p6spy.enable-logging=true`로 바꾸면 실행 SQL이 전부 로그에 찍힌다 (포맷은 `src/main/resources/spy.properties`). 끝나면 반드시 원복 — 성능 오버헤드가 있다.
- 느린 요청은 `aop/ExecutionLoggingAspect`가 300ms 초과 시 WARN으로 남긴다 (`app.execution-logging.slow-threshold-ms`).
- N+1 재현 예시: 로그인 상태로 댓글 많은 글 조회 → 쿼리 수 폭증 ([KI-27](KNOWN-ISSUES.md)).

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

마지막 검증일: 2026-07-30
