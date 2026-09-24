# 객체지향·설계 패턴·테스트

판정 기준과 칸 설명은 [README](README.md)에 있다.

패턴은 교과서 정의를 묻기보다 "프로젝트 어디에 썼나"로 이어지는 경우가 많다. 프록시·데코레이터·
옵저버·포트/어댑터는 코드에 실물이 있으니 그 위치를 댈 수 있으면 된다. 테스트 쪽(OO-10 ~ OO-14)은
저장소 규칙이 이미 기준을 정해 두었고, 그 규칙이 생긴 이유를 사례로 댈 수 있다.

| # | 질문 | 겪은 사례 | 정리한 곳 | 판정 |
|---|---|---|---|:-:|
| OO-01 | 객체지향의 네 가지 특성(캡슐화·상속·다형성·추상화)은? | | | |
| OO-02 | SOLID 원칙은 각각 무엇인가? 예를 들면? | | | |
| OO-03 | 상속보다 조합을 권하는 이유는? | | | |
| OO-04 | 싱글톤 패턴과 스프링 빈 싱글톤은 무엇이 다른가? | | | |
| OO-05 | 전략 패턴과 템플릿 메서드 패턴의 차이는? | | | |
| OO-06 | 프록시 패턴과 데코레이터 패턴의 차이는? | 프록시: Spring AOP(`ResilientRedisAspect`). 데코레이터: p6spy가 HikariCP `DataSource`를 감싸 쿼리를 기록(앱 기동 로그의 `p6SpyDataSourceDecorator -> HikariDataSource`) | | |
| OO-07 | 옵저버 패턴과 스프링 이벤트의 관계는? | 반응 뒤 `PostReactedEvent` 발행(`PostReactionService`) | [concepts 3.5][concepts] | |
| OO-08 | 계층형 아키텍처와 포트/어댑터(헥사고날)의 차이는? | `domain/`이 저장소 port를 두고 `infrastructure/`가 Redis adapter(`RedisTokenCacheStore`)를 구현: [저장소 규칙][rules] 코드 구조 절 | [concepts 8.1][concepts] | |
| OO-09 | DTO와 엔티티를 왜 분리하나? | 금지 규칙: [저장소 규칙][rules] 코드 구조 절 | [concepts 8.2][concepts] | |
| OO-10 | 단위 테스트와 통합 테스트의 경계는 어디인가? | | | |
| OO-11 | mock으로 대신하면 안 되는 테스트는? | 격리 수준 경합은 repository mock으로 재현되지 않아 실제 DB가 필요: [카운터 경합][lost-update] 조치 절. 규칙: [저장소 규칙][rules] 테스트 절 | | |
| OO-12 | 테스트 결과가 개발 장비 환경에 따라 달라지지 않게 하려면? | `HealthGroupTest`가 Redis 포트를 닫힌 6399로 줘 개발 장비에 떠 있는 Redis의 영향을 끊음 | | |
| OO-13 | 동시성 버그는 어떻게 테스트하나? | | | |
| OO-14 | 측정 도구 자체가 틀렸다는 것은 어떻게 알아채나? | 폴러의 "4,000ms 타임아웃" 표본이 실제로는 0~2ms에 끝났다는 모순으로 결함을 찾음: [헬스 폴러][poller] | [concepts 1.10][concepts] | |

[concepts]: ../career/toss-interview-concepts.md
[rules]: ../../CLAUDE.md
[lost-update]: ../../performance/cases/reaction-counter-lost-update.md
[poller]: ../../performance/cases/health-poller-false-timeout.md
