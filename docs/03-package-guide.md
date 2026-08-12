# 03. Package Guide — 패키지 지도와 함정

## 이 문서가 답하는 질문

- 각 패키지에는 무엇이 들어 있고, 새 코드는 어디에 두어야 하는가?
- 이름만 보고 오해하기 쉬운 패키지는 어디인가?
- 명명 규칙의 예외(오타·대소문자 불일치)는 어디에 있고, 왜 알아야 하는가?

## 3줄 요약

- 최상위는 역할별 패키지(controllers, services, domain, infrastructure, ...)이고, domain 안은 서브도메인별로 다시 나뉜다.
- 명명이 일관되지 않은 지점이 여럿 있다(대문자 패키지, 오타 패키지). IDE 자동완성·검색 시 함정이 되므로 표로 정리했다.
- `services/` 바로 아래에 있는 서비스 2개는 실행시간 로깅 AOP의 적용 범위 밖이다 — 새 서비스는 반드시 `services/domain/`에 만든다.

## 패키지 지도

`src/main/java/com/example/highteenday_backend/` 기준.

| 패키지 | 내용 | 새 코드를 둘 때 |
|---|---|---|
| `controllers/` | REST 컨트롤러 16개 + `controllers/testing/` (부하테스트 검증용, `@Profile("!prod")`) | 도메인당 1 컨트롤러 원칙 |
| `services/domain/` | 핵심 비즈니스 서비스 (`PostService`, `ChatService` 등) | **새 서비스는 여기** (아래 함정 F-1 참고) |
| `services/domain/redisService/` | DB fallback이 필요한 Redis 캐시 서비스 (`RedisPostsCache`, `ViewCountService` 등) | Port로 격리하기 애매한 캐시 로직 |
| `services/security/` | 인증 관련 서비스 (`CustomOAuth2UserService`, `JwtCookieService` 등) | |
| `services/global/` | 횡단 서비스: `FileStoragePort` + `S3FileStorageAdapter` | |
| `services/testing/` | `PostConsistencyService` — k6 부하테스트 정합성 검증 전용 | 프로덕션 기능 금지 |
| `domain/{서브도메인}/` | 엔티티 + 리포지토리 (boards, posts, comments, chat, friends, hot, medias, notification, schedule, schools, scraps, users) | 엔티티와 리포지토리는 항상 같은 패키지에 |
| `domain/base/` | `BaseEntity` (isValid soft delete, audit 필드) | |
| `domain/port/` | Redis Port 인터페이스 3개 | 인프라 추상화 인터페이스 |
| `domain/users/vo/` | 값 객체: `Email`, `Nickname`, `Password`, `PhoneNumber`, `UserName`, `BirthDate` | 형식 검증은 VO 생성자에서 |
| `domain/posts/queryDsl/` | `PostRepositoryCustom(Impl)` — 동적 검색·커서 페이징 | QueryDSL 커스텀 리포지토리 |
| `infrastructure/redis/` | Port 구현체 3개 | Port의 구현은 항상 여기 |
| `security/` | 필터, `TokenProvider`, `SecurityConfig`, WebSocket 인터셉터 | |
| `dtos/` | 요청/응답 DTO 전부 (서브폴더: `Chat/`, `Friends/`, `Login/`, `paged/`) | 엔티티 직접 노출 금지, `fromEntity()` 정적 팩토리 관례 |
| `enums/` | 공용 열거형 (Role, Provider, ErrorCode 등) | |
| `eventEntities/` | Spring Event 정의(`events/`)와 리스너(`eventListeners/`) | 이름과 달리 JPA 엔티티가 아님 (함정 F-6) |
| `exceptions/` | `CustomException`, `GlobalExceptionHandler` 등 | 도메인 오류는 `CustomException(ErrorCode)` |
| `aop/` | `ExecutionLoggingAspect`, `ResilientRedis(Aspect)`, `SchedulerJob(Aspect)` | |
| `schedulers/` | 배치 4종 ([02-architecture.md](02-architecture.md#스케줄러-요약)) | `@SchedulerJob` 필수 부착 관례 |
| `api/` | NEIS 외부 API 연동 (`SchoolInfoService`, `SchoolMealService` 등) | 이름과 달리 "REST API 레이어"가 아님 (함정 F-5) |
| `initializers/` | 시드·기초데이터 로더 (`AppStartupRunner`는 `@Profile("!prod")`) | |
| `configs/` | Bean 설정 (Redis, S3, Swagger, WebSocket, AppConfig) | |
| `constants/` | `SchoolFileConstants` (급식 JSON 경로) | |
| `utils/` | `HotScoreCalculator`, `MediaUtils`, `PageUtils` | (과거 `Utils/` 대문자 표기였다가 소문자로 정리됨) |
| `queryDsl/` | `QueryDslConfig` (JPAQueryFactory 빈) | 위치가 configs가 아닌 점 주의 |

## 함정 목록 — 알고 시작해야 헤매지 않는 것들

### F-1. `services/` 직속 서비스 2개는 로깅 AOP 사각지대
`TimetableTemplateService`, `UserTimetableService`만 `services/domain/`이 아닌 `services/` 바로 아래에 있다. `aop/ExecutionLoggingAspect`의 포인트컷은 `services.domain..*` 범위라 이 두 서비스는 실행시간 로깅이 되지 않는다. 새 서비스를 `services/`에 직접 만들면 같은 사각지대에 빠진다.

### F-2. 대소문자가 일관되지 않은 패키지
자바 관례(소문자 패키지)를 벗어난 곳들. import 자동완성이나 파일 검색 시 실제 경로를 그대로 써야 한다.

| 실제 경로 | 관례대로라면 |
|---|---|
| `domain/Token/` | `domain/token/` |
| `domain/schools/UserTimetables/` | `domain/schools/usertimetables/` |
| `dtos/Chat/`, `dtos/Friends/`, `dtos/Login/` | 소문자 (`dtos/paged/`만 관례를 따름) |

### F-3. 오타가 고착된 식별자
검색할 때 올바른 철자로 찾으면 안 나온다.

| 실제 이름 | 의도한 이름 | 위치 |
|---|---|---|
| `timetableTamplates` | timetableTemplates | `domain/schools/timetableTamplates/` 패키지 |
| `getLikeSatateDto` | getLikeStateDto | `services/domain/PostReactionService`, `CommentReactionService` 양쪽 |
| `MainHader` | MainHeader | 프론트엔드 `src/components/Header/MainHader/` (참고용) |

### F-4. Redis 코드가 두 곳에 나뉘어 있는 이유
`infrastructure/redis/`(Port 구현)와 `services/domain/redisService/`(DB fallback 포함 캐시 서비스)는 역할이 다르다. 구분 기준은 [02-architecture.md](02-architecture.md#portadapter-목록) 참고. "Redis 관련 코드를 전부 infrastructure에서 찾으면 절반만 보인다."

### F-5. `api/` 패키지는 외부 API "클라이언트"다
이름만 보면 REST API 레이어 같지만, 내용물은 NEIS(나이스) 교육청 API 연동 코드다. HTTP 엔드포인트는 전부 `controllers/`에 있다.

### F-6. `eventEntities/`는 엔티티가 아니다
JPA 엔티티가 아니라 Spring Event 클래스(record)와 리스너다. DB와 무관하다.

### F-7. 테스트 전용 코드가 프로덕션 소스 트리에 있다
`controllers/testing/PostConsistencyController` + `services/testing/PostConsistencyService`는 k6 부하테스트의 정합성 검증용이며 `@Profile("!prod")`로 prod에서 제외된다. 일반 기능을 여기에 추가하지 않는다.

### F-8. 사용되지 않는 코드가 남아 있는 곳
열어보고 "어디서 쓰이지?"를 오래 찾게 되는 파일들. 참조가 없음을 확인한 목록이며, 정리 전까지는 새 코드에서 사용하지 않는다.

- `services/domain/redisService/CursorCacheService` — 본문 전체가 주석인데 `@Service`로 빈 등록됨
- ~~`domain/hot/RecentHotPost` + `RecentHotPostRepository` — 주입처 없음~~ → 2026-08에 삭제됨
- `domain/schedule/PersonalSchedule` + `PersonalScheduleRepository` — 주입처 없음
- `services/security/CustomUserDetailsService` — formLogin/httpBasic이 비활성이라 호출 경로 없음 (`security/SecurityConfig.java · filterChain()`)

## 코드 좌표

| 개념 | 위치 |
|---|---|
| 로깅 AOP 포인트컷 범위 | `aop/ExecutionLoggingAspect` |
| 컨트롤러 핸들러 public 강제 배경 | `src/test/.../controllers/HandlerMethodVisibilityTest` (javadoc에 CGLIB 프록시 원인 설명) |
| DTO 변환 관례 | 각 DTO의 `fromEntity()` 정적 메서드 (예: `dtos/PostDto`) |
| 예외 관례 | `exceptions/CustomException` + `enums/ErrorCode` |

## 알려진 문제·미확인 사항

- F-8의 미사용 코드들은 삭제 대상 후보다 — 정리 여부는 별도 작업으로 결정한다.
- 이 문서의 함정 목록은 Phase 1 시점 기준이다. 패키지 정리(리네임) 작업이 이뤄지면 이 문서를 함께 갱신해야 한다.

마지막 검증일: 2026-07-30 (2026-08-11 코드 변경 반영분은 본문의 갱신 표시 참고)
