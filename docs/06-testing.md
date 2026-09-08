# 06. Testing — 실행, 구조, 작성 가이드

## 이 문서가 답하는 질문

- 어떤 테스트가 있고, 각각 어떤 방식(Mockito, 슬라이스, 아키텍처 테스트)인가?
- `./gradlew test`는 인프라 없이 어디까지 도는가?
- 이 코드베이스의 테스트 컨벤션은 무엇이고, 새 테스트는 어떻게 작성하는가?
- 커버리지의 공백은 어디인가?

## 3줄 요약

- 테스트 클래스 54개, `@Test`·`@ParameterizedTest` 약 600건. 서비스 단위 테스트(Mockito)가 가장 두껍고(`ChatServiceTest` 114건, `UserServiceTest` 46건 등), `@Nested` + 한글 `@DisplayName` + AssertJ가 표준 스타일이다.
- 전부 MySQL·Redis 없이 돈다 — `src/test/resources/application-test.properties`(H2 + 인메모리 파일 저장소)가 `@SpringBootTest`·`@DataJpaTest`·웹 슬라이스를 받친다. CI(`ci.yml`, `deploy.yml`의 `test` 잡)가 같은 명령을 병합·배포 게이트로 돌린다.
- 2026-08-28에 웹 슬라이스·보안 테스트 기반(`support/WebSliceTest`, `spring-security-test`)이 깔렸고, 결함 수정마다 "그 결함의 증상 자체를 잡는" 회귀 테스트를 함께 넣는 것이 관례다 ([KNOWN-ISSUES.md](KNOWN-ISSUES.md)의 "회귀 방지" 줄).

## 테스트 인벤토리

`src/test/java` 전체 58개 파일 = 테스트 클래스 54개 + 지원 코드 4개(`support/WebSliceTest`, `support/WebSliceSecuritySupport`, `support/TestPrincipals`, `configs/TestFileStorageConfig` + `services/global/LocalFileStorageAdapter`). 건수는 `grep -c "@Test"` 기준 대략치다 (2026-09-05).

| 영역 | 클래스 (건수) | 유형 |
|---|---|---|
| 도메인 서비스 | `services/domain/` 15개 — `ChatServiceTest`(114), `UserServiceTest`(46), `FriendServiceTest`(29), `CommentServiceTest`(21), `MediaProcessingServiceTest`(19), `TokenServiceTest`(19), `PostServiceTest`(18), `NotificationServiceTest`(17), `HotPostServiceTest`(15), `CommentReactionServiceTest`(11), `PostReactionServiceTest`·`ScrapServiceTest`·`MediaServiceTest`(8), `CommentAnonymizationServiceTest`(8, 순수 JUnit), `redisService/RedisPostsCacheTest`·`ViewCountServiceTest`(9) | Mockito 단위 |
| 그 외 서비스 | `services/TimetableTemplateServiceTest`(27), `services/security/CustomOAuth2UserServiceTest`(8)·`JwtCookieServiceTest`(11), `services/global/AfterCommitExecutorTest`(5) | Mockito 단위 |
| 보안 | `security/TokenProviderTest`(6), `TokenAuthenticationFilterTest`(10), `WebSocketAuthChannelInterceptorTest`(16), `CsrfOriginValidationFilterTest`(10 — 필터 직접 호출 + `FilterChainProxy` 등록 확인), `AuthorizationMatrixTest`(파라미터화 — 공개 7경로·보호 18경로의 비로그인 응답 표) | 단위 + 웹 슬라이스 |
| 웹 슬라이스 | `controllers/PostControllerWebSliceTest`(5 — 매핑·`@Valid`·직렬화·비로그인 쓰기 차단), `exceptions/GlobalExceptionHandlerTest`(6 — 응답 본문에 내부 문자열이 없는지) | `@WebMvcTest` (`support/WebSliceTest`) |
| 구조 규칙 | `controllers/HandlerMethodVisibilityTest`(1), `controllers/RequestBodyValidationTest`(2 — 모든 `@RequestBody`에 `@Valid`), `ci/CiTestGateTest`(4)·`ci/DeploymentHealthCheckTest`(4 — 워크플로 YAML을 파싱해 게이트·헬스체크·롤백 존재를 단언) | 클래스패스·파일 스캔 |
| JPA 슬라이스 | `domain/friends/FriendRepositoryTest`(8 — soft delete 필터), `FriendReqRepositoryTest`(3), `domain/comments/CommentRepositoryTest`(4 — Hibernate 통계로 실행 문장 수 고정) | `@DataJpaTest` (H2, `@Import(QueryDslConfig, JpaAuditingConfig)`) |
| AOP·스케줄러·리스너 | `aop/ResilientRedisAspectTest`(9, 위빙 + Logback `ListAppender`), `SchedulerJobAspectTest`(3), `ExecutionLoggingAspectTest`(4), `schedulers/ViewCountSchedulerTest`(6 — `InOrder`로 반영 → 차감 순서), `HotScoreSchedulerTest`(2), `eventEntities/eventListeners/*`(4·3) | 위빙 / Mockito |
| 인프라·계측 | `infrastructure/redis/RedisHotPostRankingTest`(2 — TTL 호출), `metrics/QueryCountMetricsTest`(7, `@SpringBootTest`), `QueryCountRecorderTest`(6) | 단위 / 통합 |
| VO·DTO·유틸 | `domain/users/vo/*`(6개 클래스, 23), `dtos/Login/OAuth2UserInfoTest`(8), `utils/HotScoreCalculatorTest`(8), `utils/PageUtilsTest`(9) | 순수 JUnit |
| 외부 API·초기화 | `api/SchoolMealServiceTest`(3 — 삭제 → 저장 순서), `initializers/SchoolDataProdInitializerTest`(3) | Mockito |
| 통합 | `HighteendayBackendApplicationTests`(1, `@SpringBootTest` contextLoads — test 프로파일로 통과), `PostMediaFlowTest`(2, 실 S3·DB 필요 — **@Disabled**) | `@SpringBootTest` |

지원 코드의 역할: `TestFileStorageConfig` + `LocalFileStorageAdapter`는 `test` 프로파일에서 S3 어댑터(`@Profile("!test")`) 자리를 인메모리 구현으로 채운다. `WebSliceSecuritySupport`는 `SecurityConfig`가 주입받는 OAuth2 협력자 3개의 목이고, `TestPrincipals`는 `@WithMockUser` 대신 실제 `CustomUserPrincipal`을 심는 헬퍼다.

## 컨벤션

실제 파일에서 확인되는 표준 스타일 세 가지. 새 테스트도 이 형태를 따른다.

**1. `@Nested` + 한글 행동 서술 `@DisplayName`** — 메서드 단위로 `@Nested` 클래스를 만들고, 각 케이스를 "상태 → 결과" 형태의 한글로 서술한다 (`services/domain/PostReactionServiceTest`):

```java
@Nested
@DisplayName("likeReact")
class LikeReact {

    @Test
    @DisplayName("좋아요 상태 → 좋아요 취소, 이벤트 발행 없음")
    void cancelsLike_withoutEvent() { ... }
```

`controllers/TokenControllerTest`는 클래스에 `@DisplayName("TokenController")`, `@Nested`에 `@DisplayName("POST /api/token/refresh")`처럼 엔드포인트를 쓴다.

**2. AssertJ** — 단언은 전부 `assertThat`/`assertThatThrownBy` (JUnit `assertEquals` 미사용).

**3. 부작용 검증: `verify(...)` + `never()`** — 이벤트 발행처럼 "일어나지 않아야 하는 일"을 명시적으로 검증한다 (`PostReactionServiceTest · cancelsLike_withoutEvent`):

```java
verify(eventPublisher, never()).publishEvent(any());
```

`verify(never())` 패턴은 스케줄러·리스너·서비스 테스트 10개 파일에서 반복된다. 그 외: 상태 검증에 `ArgumentCaptor`, 일부 클래스는 `@MockitoSettings(strictness = Strictness.LENIENT)`로 공용 stub(`setUp`의 `stubCounts`)을 허용한다.

## 실행 방법과 현황

```bash
./gradlew test
```

- **인프라 없이 전부 돈다**: `build.gradle · test` 태스크가 `spring.profiles.active=test`와 `spring.flyway.enabled=false`를 넣고, `src/test/resources/application-test.properties`가 H2(MySQL 모드)·인메모리 파일 저장소로 갈아끼운다. 스키마는 Hibernate가 엔티티에서 만든다 — MySQL 문법인 Flyway 마이그레이션은 테스트에서 실행되지 않으므로, 마이그레이션 자체의 검증은 [MIGRATION.md](MIGRATION.md)의 임시 컨테이너 절차로 따로 한다.
- **CI**: `.github/workflows/ci.yml`이 develop 대상 PR과 develop push에서, `deploy.yml`의 `test` 잡이 main push에서 같은 명령을 돌린다. `build`가 `needs: test`라 테스트가 실패하면 이미지 빌드도 배포도 시작되지 않는다 ([KI-12](KNOWN-ISSUES.md#ki-12-테스트가-ci에서-실행되지-않음) 갱신). `Dockerfile`은 여전히 `-x test`다 — 게이트 잡이 이미 통과한 뒤라 같은 검증을 두 번 하지 않는다.
- **안 도는 것**: `PostMediaFlowTest`만 `@Disabled`다 (실 S3 필요).

## 커버리지의 형태

- **두꺼운 곳**: `services/domain/` 단위 테스트 — 반응·친구·알림·미디어·토큰·채팅의 비즈니스 분기. 결함 수정마다 붙은 회귀 테스트는 예외만 보지 않고 **부수 효과가 없었는지**까지 본다 (예: 타인 요청이 403이면서 본문·`isValid`·캐시·댓글 수가 하나도 안 바뀌는지 — `PostServiceTest.Ownership`).
- **구조를 단언하는 테스트**가 넷 있다. 개별 요청 테스트로는 못 잡는 종류의 결함(제약을 붙여도 무시되는 `@Valid`, private 핸들러, 워크플로에서 빠진 게이트)을 리플렉션·파일 스캔으로 막는다.
- **공백 1 — 웹 슬라이스 범위**: `@WebMvcTest`는 `PostController`와 예외 핸들러, 인가 매트릭스에만 있다. 나머지 컨트롤러의 매핑·바인딩·상태코드는 테스트되지 않는다.
- **공백 2 — 통합**: 실 브로커(STOMP)·실 Redis·실 S3를 띄우는 테스트가 없다. Redis 장애 시 `DailyHotPost` fallback이 의도대로 노출되는지도 실측이 없다.
- **공백 3 — 마이그레이션**: Flyway 스크립트는 테스트 스위트 밖이다 (위 참고).

## 좋은 사례: HandlerMethodVisibilityTest

`controllers/HandlerMethodVisibilityTest`는 "모든 `@RequestMapping` 핸들러 메서드는 public이어야 한다"를 클래스패스 스캔으로 강제하는 아키텍처 테스트다. 배경은 javadoc에 있다:

> 컨트롤러는 ExecutionLoggingAspect 의 within(controllers..*) 포인트컷 때문에 CGLIB 프록시로 감싸진다.
> 이때 핸들러 메서드가 private 이면 프록시가 target 으로 위임하지 못하고 프록시 인스턴스에서 직접 실행되어
> 주입된 필드가 모두 null 인 상태로 동작한다 (NPE → 500).

실제 장애 패턴을 한 번 겪은 뒤 재발을 컴파일 수준이 아닌 테스트로 막은 사례로, "규칙을 문서가 아니라 테스트로 남긴다"는 점에서 새 아키텍처 규칙을 추가할 때 참고할 만한 모형이다.

## 새 테스트 작성 가이드 (이 코드베이스 관례)

1. 위치·이름: `src/test/java`에서 대상 클래스와 같은 패키지, `{대상}Test`.
2. 서비스 로직이면 `@ExtendWith(MockitoExtension.class)` + `@Mock` 리포지토리/`@InjectMocks` 서비스. DB를 띄우지 않는다 (리포지토리 쿼리 자체를 검증할 때만 `@DataJpaTest` + `@Import(QueryDslConfig.class, JpaAuditingConfig.class)` — Auditing 설정을 빼먹으면 `created_at` NOT NULL에 걸린다).
3. 메서드별 `@Nested` 클래스 + 한글 `@DisplayName`("상태 → 결과"), 단언은 AssertJ.
4. 부작용(이벤트·저장·삭제)은 `verify(...)`로, 일어나면 안 되는 것은 `verify(never())`로 명시한다. 커밋 후 작업(`AfterCommitExecutor`)은 예약된 람다를 일부러 실행하지 않고 "메서드가 끝난 시점까지 아무 일도 없었는지"를 본다.
5. 외부 인프라(S3·Redis)는 Port를 mock한다 (`MediaProcessingServiceTest`가 `FileStoragePort`를 mock하는 방식).
6. 컨트롤러의 매핑·검증·직렬화·인가는 `@WebSliceTest`(= `@WebMvcTest` + test 프로파일 + `SecurityConfig` import)로 쓴다. 로그인 사용자는 `TestPrincipals`로 심는다 — `@WithMockUser`는 `@AuthenticationPrincipal CustomUserPrincipal`을 null로 만든다.
7. 결함을 고칠 때는 **그 결함의 증상 자체가 재현되는 테스트**를 먼저 쓴다 — "던지긴 하는데 클라이언트는 여전히 500을 받는" 식으로 타입만 맞는 통과를 피하기 위해 `ErrorCode`와 HTTP 상태까지 단언한다 (`TokenServiceTest.FailureStatus`).

## 코드 좌표

| 개념 | 위치 |
|---|---|
| 컨벤션 예시 (Nested/DisplayName/AssertJ/never) | `src/test/.../services/domain/PostReactionServiceTest.java`, `src/test/.../controllers/TokenControllerTest.java` |
| 아키텍처 테스트 | `src/test/.../controllers/HandlerMethodVisibilityTest.java`, `RequestBodyValidationTest.java`, `src/test/.../ci/` |
| 웹 슬라이스 기반 | `src/test/.../support/WebSliceTest.java`, `WebSliceSecuritySupport.java`, `TestPrincipals.java` |
| Aspect 위빙 테스트 | `src/test/.../aop/ResilientRedisAspectTest.java`, `SchedulerJobAspectTest.java` |
| JPA 슬라이스 테스트 | `src/test/.../domain/friends/FriendRepositoryTest.java`, `domain/comments/CommentRepositoryTest.java` |
| 비활성 통합 테스트 | `src/test/.../PostMediaFlowTest.java` (@Disabled) |
| 테스트 프로파일·파일 저장소 대체 | `src/test/resources/application-test.properties`, `src/test/.../configs/TestFileStorageConfig.java` |
| 테스트 의존성 | `build.gradle · dependencies` (spring-boot-starter-test, spring-security-test, H2) |

## 알려진 문제·미확인 사항

- [KI-12](KNOWN-ISSUES.md#ki-12-테스트가-ci에서-실행되지-않음) 테스트가 CI에서 실행되지 않음 — 해소
- [KI-50](KNOWN-ISSUES.md) 미사용 테스트 헬퍼·의존성 — 해소 (헬퍼는 test 프로파일에서 사용, `embedded-redis` 제거)
- [KI-51](KNOWN-ISSUES.md) `HotScoreCalculatorTest`에 단언이 없음 — 해소
- [KI-52](KNOWN-ISSUES.md) 보안·웹 슬라이스 테스트 기반 부재 — 해소. 다만 슬라이스가 적용된 컨트롤러는 아직 일부다
- 통합 테스트 공백(브로커·Redis·S3)은 그대로다

마지막 검증일: 2026-09-05
