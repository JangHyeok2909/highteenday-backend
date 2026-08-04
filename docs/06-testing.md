# 06. Testing — 실행, 구조, 작성 가이드

## 이 문서가 답하는 질문

- 어떤 테스트가 있고, 각각 어떤 방식(Mockito, 슬라이스, 아키텍처 테스트)인가?
- `./gradlew test`는 인프라 없이 어디까지 도는가?
- 이 코드베이스의 테스트 컨벤션은 무엇이고, 새 테스트는 어떻게 작성하는가?
- 커버리지의 공백은 어디인가?

## 3줄 요약

- 서비스 단위 테스트(Mockito)가 두껍고(전체 약 180개 `@Test` 중 대다수), `@Nested` + 한글 `@DisplayName` + AssertJ가 표준 스타일이다.
- 대부분 인프라 없이 돌지만 `HighteendayBackendApplicationTests`(@SpringBootTest)는 테스트 프로파일이 없어 실패할 수 있고, CI에는 테스트 단계 자체가 없다 ([KI-12](KNOWN-ISSUES.md#ki-12-테스트가-ci에서-실행되지-않음)).
- 컨트롤러 HTTP 슬라이스(@WebMvcTest 0건)·보안(spring-security-test 의존성 부재)·통합(@Disabled 1건뿐) 테스트가 공백이다.

## 테스트 인벤토리

`src/test/java` 전체 30개 파일 = 테스트 클래스 27개 + 헬퍼 2개(`TestFileStorageConfig`, `LocalFileStorageAdapter`) + `@SpringBootTest` 스모크 1개. `@Test` 수는 `grep -c "@Test"` 기준 대략치다.

| 테스트 클래스 (`src/test/java/.../` 이하) | @Test | 유형 | 상태 |
|---|---|---|---|
| `services/domain/FriendServiceTest` | 17 | Mockito 단위 | 활성 |
| `services/domain/NotificationServiceTest` | 16 | Mockito 단위 | 활성 |
| `services/domain/MediaProcessingServiceTest` | 16 | Mockito 단위 (`FileStoragePort` mock) | 활성 |
| `services/domain/HotPostServiceTest` | 15 | Mockito 단위 | 활성 |
| `services/domain/TokenServiceTest` | 15 | Mockito 단위 | 활성 |
| `services/domain/PostReactionServiceTest` | 8 | Mockito 단위 | 활성 |
| `services/domain/MediaServiceTest` | 8 | Mockito 단위 | 활성 |
| `services/domain/CommentAnonymizationServiceTest` | 8 | 순수 JUnit (의존성 없는 서비스 직접 생성) | 활성 |
| `services/domain/PostServiceTest` | 7 | Mockito 단위 | 활성 |
| `services/domain/ScrapServiceTest` | 7 | Mockito 단위 | 활성 |
| `services/domain/CommentReactionServiceTest` | 6 | Mockito 단위 | 활성 |
| `services/domain/redisService/ViewCountServiceTest` | 6 | Mockito 단위 | 활성 |
| `services/domain/redisService/RedisPostsCacheTest` | 3 | Mockito 단위 | 활성 |
| `security/TokenProviderTest` | 6 | Mockito 단위 | 활성 |
| `controllers/TokenControllerTest` | 5 | Mockito 단위 (컨트롤러 메서드 직접 호출 — HTTP 슬라이스 아님) | 활성 |
| `schedulers/ViewCountSchedulerTest` | 5 | Mockito 단위 | 활성 |
| `schedulers/HotScoreSchedulerTest` | 2 | Mockito 단위 | 활성 |
| `eventEntities/eventListeners/HotPostEventListenerTest` | 4 | Mockito 단위 | 활성 |
| `eventEntities/eventListeners/NotificationEventListenerTest` | 3 | Mockito 단위 | 활성 |
| `aop/ResilientRedisAspectTest` | 7 | Aspect 위빙 (SpringExtension + `@EnableAspectJAutoProxy` 최소 컨텍스트) | 활성 |
| `aop/SchedulerJobAspectTest` | 3 | Aspect 위빙 (동일 방식) | 활성 |
| `aop/ExecutionLoggingAspectTest` | 4 | 순수 JUnit (JoinPoint를 mock) | 활성 |
| `domain/friends/FriendRepositoryTest` | 4 | @DataJpaTest (H2, `@Import(QueryDslConfig)`) | 활성 |
| `controllers/HandlerMethodVisibilityTest` | 1 | 아키텍처 테스트 (클래스패스 스캔) | 활성 |
| `utils/HotScoreCalculatorTest` | 1 | 순수 JUnit | 활성 (단언 없음 — 아래 ⑤) |
| `HighteendayBackendApplicationTests` | 1 | @SpringBootTest (contextLoads) | 환경 따라 실패 ([KI-12](KNOWN-ISSUES.md#ki-12-테스트가-ci에서-실행되지-않음)) |
| `PostMediaFlowTest` | 2 | @SpringBootTest + MockMvc 통합 (실 S3·DB 필요) | **@Disabled** ("run manually") |

헬퍼 2개는 현재 어떤 테스트도 참조하지 않는다 (전체 grep 0건 — 아래 ⑤):

- `configs/TestFileStorageConfig` — `FileStoragePort`를 로컬 인메모리 구현으로 바꾸는 `@TestConfiguration`
- `services/global/LocalFileStorageAdapter` — S3 없이 동작하는 `FileStoragePort` 인메모리 구현

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

- **인프라 없이 도는 것**: Mockito 단위 전부, aspect 위빙 테스트(최소 Spring 컨텍스트만 생성), `FriendRepositoryTest`(H2 — `build.gradle`의 `testRuntimeOnly 'com.h2database:h2'`), `HandlerMethodVisibilityTest`.
- **안 도는 것**: `HighteendayBackendApplicationTests`는 전체 컨텍스트를 띄우는데 `src/test/resources`가 없어 테스트 전용 프로파일·설정이 없다. 기본 프로파일 local은 프로퍼티 파일이 저장소에 없으므로 ([KI-02](KNOWN-ISSUES.md#ki-02-기본-프로파일-local의-프로퍼티-파일이-없음)) 개인 `application-local.properties`와 실 DB가 없는 환경에서는 실패한다 ([KI-12](KNOWN-ISSUES.md#ki-12-테스트가-ci에서-실행되지-않음)). `PostMediaFlowTest`는 `@Disabled`라 항상 스킵된다.
- **CI**: `.github/workflows/deploy.yml`에 테스트 단계가 없고 `Dockerfile`도 `-x test`로 빌드한다 ([KI-12](KNOWN-ISSUES.md#ki-12-테스트가-ci에서-실행되지-않음)). 테스트는 현재 로컬에서만 도는 안전망이다.

## 커버리지의 형태

- **두꺼운 곳**: `services/domain/` 단위 테스트 — 반응·친구·알림·미디어·토큰 등 핵심 비즈니스 로직 분기.
- **공백 1 — 컨트롤러 HTTP 슬라이스**: `@WebMvcTest`가 0건이다. `TokenControllerTest`는 컨트롤러 자바 메서드를 직접 호출하므로 요청 매핑·바인딩·검증·상태코드 변환은 테스트되지 않는다.
- **공백 2 — 보안**: `build.gradle`에 `spring-security-test` 의존성이 없다. 필터 체인·인가 규칙([KI-04](KNOWN-ISSUES.md#ki-04-get-전체가-permitall인-블랙리스트-인가-구조) 같은 구조)을 검증할 수단이 없는 상태.
- **공백 3 — 통합**: 유일한 통합 테스트 `PostMediaFlowTest`가 `@Disabled`다. 미사용 헬퍼(`TestFileStorageConfig`/`LocalFileStorageAdapter`)는 이 공백을 메우려던 흔적으로 보이나 연결되지 않았다 `[미확인: 작성 의도는 기록이 없어 추정]`.
- `build.gradle`의 `it.ozimov:embedded-redis`도 어떤 테스트에서도 import되지 않는다 (CLAUDE.md의 "Embedded Redis 사용" 서술과 불일치 — 아래 ⑤).

## 좋은 사례: HandlerMethodVisibilityTest

`controllers/HandlerMethodVisibilityTest`는 "모든 `@RequestMapping` 핸들러 메서드는 public이어야 한다"를 클래스패스 스캔으로 강제하는 아키텍처 테스트다. 배경은 javadoc에 있다:

> 컨트롤러는 ExecutionLoggingAspect 의 within(controllers..*) 포인트컷 때문에 CGLIB 프록시로 감싸진다.
> 이때 핸들러 메서드가 private 이면 프록시가 target 으로 위임하지 못하고 프록시 인스턴스에서 직접 실행되어
> 주입된 필드가 모두 null 인 상태로 동작한다 (NPE → 500).

실제 장애 패턴을 한 번 겪은 뒤 재발을 컴파일 수준이 아닌 테스트로 막은 사례로, "규칙을 문서가 아니라 테스트로 남긴다"는 점에서 새 아키텍처 규칙을 추가할 때 참고할 만한 모형이다.

## 새 테스트 작성 가이드 (이 코드베이스 관례)

1. 위치·이름: `src/test/java`에서 대상 클래스와 같은 패키지, `{대상}Test`.
2. 서비스 로직이면 `@ExtendWith(MockitoExtension.class)` + `@Mock` 리포지토리/`@InjectMocks` 서비스. DB를 띄우지 않는다 (리포지토리 쿼리 자체를 검증할 때만 `FriendRepositoryTest`처럼 `@DataJpaTest` + `@Import(QueryDslConfig.class)` + H2 프로퍼티).
3. 메서드별 `@Nested` 클래스 + 한글 `@DisplayName`("상태 → 결과"), 단언은 AssertJ.
4. 부작용(이벤트·저장·삭제)은 `verify(...)`로, 일어나면 안 되는 것은 `verify(never())`로 명시한다.
5. 외부 인프라(S3·Redis)는 Port를 mock한다 (`MediaProcessingServiceTest`가 `FileStoragePort`를 mock하는 방식).
6. `@SpringBootTest`는 추가하지 않는 것이 현재로서는 안전하다 — 테스트 프로파일 부재로 CI는 물론 다른 개발자 로컬에서도 재현이 어렵다 ([KI-12](KNOWN-ISSUES.md#ki-12-테스트가-ci에서-실행되지-않음)).

## 코드 좌표

| 개념 | 위치 |
|---|---|
| 컨벤션 예시 (Nested/DisplayName/AssertJ/never) | `src/test/.../services/domain/PostReactionServiceTest.java`, `src/test/.../controllers/TokenControllerTest.java` |
| 아키텍처 테스트 | `src/test/.../controllers/HandlerMethodVisibilityTest.java · allHandlerMethodsArePublic()` |
| Aspect 위빙 테스트 | `src/test/.../aop/ResilientRedisAspectTest.java`, `SchedulerJobAspectTest.java` |
| JPA 슬라이스 테스트 | `src/test/.../domain/friends/FriendRepositoryTest.java` |
| 비활성 통합 테스트 | `src/test/.../PostMediaFlowTest.java` (@Disabled) |
| 미사용 헬퍼 | `src/test/.../configs/TestFileStorageConfig.java`, `src/test/.../services/global/LocalFileStorageAdapter.java` |
| 테스트 의존성 | `build.gradle · dependencies` (spring-boot-starter-test, H2, embedded-redis) |

## 알려진 문제·미확인 사항

- [KI-12](KNOWN-ISSUES.md#ki-12-테스트가-ci에서-실행되지-않음) 테스트가 CI에서 실행되지 않음 + @SpringBootTest 컨텍스트 로딩 실패
- [KI-02](KNOWN-ISSUES.md#ki-02-기본-프로파일-local의-프로퍼티-파일이-없음) local 프로파일 부재 — @SpringBootTest 실패의 원인
- [KI-50](KNOWN-ISSUES.md) 미사용 테스트 헬퍼 2개(`TestFileStorageConfig`, `LocalFileStorageAdapter`, 참조 0건) + `embedded-redis` 의존성 미사용 — CLAUDE.md "Embedded Redis 사용" 서술과 불일치
- [KI-51](KNOWN-ISSUES.md) `HotScoreCalculatorTest`에 단언이 없음 (System.out 출력만 — 항상 통과)
- [KI-52](KNOWN-ISSUES.md) 보안 테스트 불가: `spring-security-test` 의존성 부재, `@WebMvcTest` 0건
- `[미확인]` 1건: 미사용 헬퍼의 작성 의도

마지막 검증일: 2026-07-30
