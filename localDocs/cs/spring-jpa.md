# Spring·JPA

판정 기준과 칸 설명은 [README](README.md)에 있다.

22문항 중 15문항에 사례가 있어 분산 다음으로 많다. 트랜잭션 경계(SP-07, SP-08, SP-16)는 장애
실험으로 측정까지 했다. 스프링 핵심 원리(SP-01, SP-02, SP-09)는 사례가 붙기 어려운 질문이라 B면
충분하다.

SP-20의 "(기록 없음)"은 겪었지만 저장소 어디에도 적혀 있지 않은 사례다. 잊기 전에 `notes/SP-20.md`로
남길 후보다.

| # | 질문 | 겪은 사례 | 정리한 곳 | 판정 |
|---|---|---|---|:-:|
| SP-01 | IoC와 DI란? 생성자 주입을 권하는 이유는? | 생성자 주입과 `final` 필드 규칙: [저장소 규칙][rules] 구현 규칙 절 | | |
| SP-02 | 빈의 생명주기와 스코프는? | | | |
| SP-03 | Spring AOP는 어떻게 동작하나(프록시)? 같은 클래스 안에서 호출하면 왜 안 먹나? | `ResilientRedisAspect`, `SchedulerJobAspect`, `ExecutionLoggingAspect` | [concepts 3.6][concepts] | |
| SP-04 | `@Transactional`은 어떻게 동작하나? 적용되지 않는 경우는? | | [concepts 3.4][concepts] | |
| SP-05 | 트랜잭션 전파 속성(`REQUIRED`·`REQUIRES_NEW` 등)은? | | [concepts 3.4][concepts] | |
| SP-06 | `readOnly` 트랜잭션은 무엇을 바꾸나? | | | |
| SP-07 | 트랜잭션 안에서 외부 호출(Redis·HTTP)을 기다리면 무슨 일이 생기나? | 트랜잭션이 커넥션을 쥔 채 Redis를 기다려 풀 고갈: [Redis 장애 전파][cascade]. 트랜잭션 안 Redis 호출은 7,400건 중 580건(7.8%)뿐이라 다른 원인이 있음: [Redis 대기 중 커넥션 점유][conn-held] | 금지 규칙: [저장소 규칙][rules] 구현 규칙 절 | |
| SP-08 | 커밋 뒤에만 해야 하는 작업은 어떻게 분리하나? | 캐시 갱신을 커밋 뒤로 미루는 `AfterCommitExecutor` | [concepts 3.5][concepts] | |
| SP-09 | `DispatcherServlet`부터 컨트롤러까지 요청은 어떻게 흐르나? | | | |
| SP-10 | 필터와 인터셉터의 차이는? | 요청당 쿼리 수를 서블릿 필터에서 기록(`QueryCountMetricsTest`) | | |
| SP-11 | `@ControllerAdvice`로 예외를 어떻게 다루나? | 재시도로 풀리는 인프라 실패는 503, 나머지는 500으로 분리: [GlobalExceptionHandler][handler], [부하 시 500][unmapped-500] | [concepts 8.3][concepts] | |
| SP-12 | Spring Security 필터 체인은? `web.ignoring`과 `permitAll`은 무엇이 다른가? | 로드밸런서가 매초 치는 `/actuator/health/**`를 필터 체인에서 뺌: [SecurityConfig][security], 커밋 `dfd771dc` | | |
| SP-13 | 영속성 컨텍스트, 1차 캐시, 더티 체킹은? | | [concepts 3.1][concepts] | |
| SP-14 | 지연 로딩과 즉시 로딩의 차이는? 프록시는 언제 초기화되나? | | [concepts 3.3][concepts] | |
| SP-15 | N+1의 해법(fetch join·배치 크기·DTO 조회)은 각각 언제 쓰나? | 반응 상태 일괄 조회 + 작성자 fetch join: [댓글 쿼리 증폭][n-plus-1] | [concepts 3.2][concepts] | |
| SP-16 | OSIV란? 켜 두면 무엇이 문제인가? | 커넥션 점유가 SQL 시간이 아니라 요청 시간을 따라감, 끄면 깨지는 호출 14곳: [Redis 대기 중 커넥션 점유][conn-held] | [concepts 3.3][concepts] | |
| SP-17 | 엔티티를 HTTP 응답으로 바로 내보내면 안 되는 이유는? | 금지 규칙: [저장소 규칙][rules] 코드 구조 절 | [concepts 8.2][concepts] | |
| SP-18 | 스프링 부트 자동 설정은 어떻게 동작하나? | 코드에 없는 `RedisHealthIndicator`가 클래스패스로 자동 등록됨: [헬스 판정][readiness] | | |
| SP-19 | Actuator 헬스 그룹, readiness와 liveness는? | [헬스 판정][readiness], `HealthGroupTest` | | |
| SP-20 | 프로파일과 설정 우선순위는? | 기본 `application.properties`에 둔 `spring.datasource.url`이 prod 프로파일의 같은 키에 덮여 `socketTimeout`이 빠질 뻔함. `data-source-properties`로 옮겨 해결 (기록 없음) | | |
| SP-21 | `@Scheduled`는 어떻게 동작하나? 인스턴스가 여러 개면 무엇이 문제인가? | `ViewCountScheduler`와 서킷 개방 시 정산 누락: [정산 건너뜀][settlement]. 회사: 파드 간 중복 실행을 분산 락으로 막음 | [concepts 8.5][concepts] | |
| SP-22 | `@SpringBootTest`와 `@DataJpaTest`는 각각 언제 쓰나? | `HealthGroupTest`는 헬스 그룹 배선을 보려고 전체 컨텍스트를 띄움 | 쿼리·트랜잭션 검증 규칙: [저장소 규칙][rules] 테스트 절 | |

[concepts]: ../career/toss-interview-concepts.md
[rules]: ../../CLAUDE.md
[cascade]: ../../performance/cases/redis-failure-cascade.md
[conn-held]: ../../performance/cases/db-connection-held-during-redis-wait.md
[n-plus-1]: ../../performance/cases/comment-query-amplification.md
[unmapped-500]: ../../performance/cases/unmapped-500-under-load.md
[readiness]: ../../performance/cases/redis-health-readiness.md
[settlement]: ../../performance/cases/circuit-open-skips-viewcount-settlement.md
[handler]: ../../src/main/java/com/example/highteenday_backend/exceptions/GlobalExceptionHandler.java
[security]: ../../src/main/java/com/example/highteenday_backend/security/SecurityConfig.java
