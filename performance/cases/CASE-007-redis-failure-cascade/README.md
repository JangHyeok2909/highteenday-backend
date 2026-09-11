# CASE-007: Redis 장애가 전체 API로 전파됨

> 상태: `diagnosed`
> 영향도: 치명적
> 기준 실행: `redis-crash-2026-09-11T00-47-40`
> 실행일: 2026-09-11
> 관련 이슈: [AUTH-001, AUTH-002, RES-001, DATA-001](../../../docs/issues/)

## 결론

Redis 프로세스를 60초 동안 정지했을 때 애플리케이션은 즉시 폴백하지 않았다. 실패 요청은
30초 또는 60초 부근에 몰렸고, fault 구간 p95는 60초였다. 같은 시간에 HikariCP가
10/10까지 사용되고 대기열이 급증하면서 Redis를 직접 사용하지 않는 기능까지 실패했다.

현재 코드에는 DB 트랜잭션 안에서 Redis를 호출하는 경로가 있고, 인증은 매 요청마다 DB에서
사용자를 읽는다. 인증 필터는 모든 `RuntimeException`을 토큰 실패처럼 삼킨 뒤 익명 요청으로
계속 진행한다. 이 조합은 관측된 풀 포화와 401 응답을 설명한다.

다만 실행 앱 이미지는 소스보다 오래됐고 실행 작업 트리도 dirty였다. 따라서 “Redis 대기 중
어떤 메서드가 커넥션 10개를 각각 점유했는가”와 “401 38건이 전부 커넥션 획득 실패였는가”는
앱 로그나 스레드 덤프 없이 확정하지 않는다.

## 실행 신뢰도

| 항목 | 값 | 해석 |
|---|---|---|
| 커밋 기록 | `d3bde00d+dirty` | 깨끗한 커밋 재실행 필요 |
| 앱 이미지 | `8fb9157900fe`, 2026-09-04 생성 | 최신 소스보다 약 5일 오래됨 |
| 데이터셋 | `medium`, `24ddff07519b` | 실행에 기록됨 |
| 구간 | pre 90초 / fault 60초 / post 60초 | 계획대로 주입됨 |
| 부하 | open model 4 iteration/s | 장애 중 dropped iteration 87건 |
| Redis 초기화 | 실행 전 flush | 복구 후 빈 Redis 조건 |

이 실행은 장애 현상과 자원 상관관계의 근거로 사용할 수 있다. 현재 소스의 정확한 호출 경로를
증명하는 기준 실행으로는 부족하다.

## 사용자와 데이터 영향

| 영향 | 관측값 |
|---|---:|
| fault 오류율 | 45.7% |
| fault p95 | 60,001ms |
| 실패 응답 | 107건 |
| 실패 상태 | 무응답 31건, 401 38건, 500 38건 |
| HikariCP | active 10/10, 시계열 pending 최대 177 |
| Tomcat busy | 시계열 최대 192/400 |
| 헬스 체크 | fault 표본 12건 모두 4초 상한 초과 |
| 조회수 | 기대 증가 758, DB 증가 661, 최대 97 부족 |
| 복구 후 지연 | post p95 4,604ms, pre p95 92ms |

조회수 차이 97은 확정 유실량이 아니라 상한이다. 클라이언트 타임아웃 10건은 서버 반영 여부를
판별하지 못했으며 최종 Redis 버퍼는 비어 있었다.

## 기능별 폭발 반경

| 기능 | fault 오류율 | fault p95 |
|---|---:|---:|
| `auth` | 32.3% | 41.9초 |
| `post` | 47.1% | 60초 |
| `comment` | 40.0% | 60초 |
| `board` | 26.9% | 60초 |
| `reaction`, `scrap`, `hot` | 100% | 약 60초 |
| `notification` | 87.5% | 30초 |
| `friend`, `mypage`, `school`, `chat` | 100% | 약 30초 |

요청 수가 한 자릿수인 기능이 있으므로 작은 표본의 오류율은 범위 확인에만 사용한다.

## 원인 사슬

| 단계 | 설명 | 근거 | 확신도 |
|---|---|---|---|
| C1 | Redis 명령이 예외로 바뀌기 전까지 오래 기다림 | 실패 지연 60초 군집, 명령 timeout 기본값 기록 | 강하게 지지 |
| C2 | `@ResilientRedis`는 대기를 중단하지 않고 예외 발생 후 기본값을 반환함 | Aspect 코드 | 확인 |
| C3 | 일부 트랜잭션 경로가 Redis 호출까지 포함함 | `HotPostService`, `ScrapService` 현재 코드 | 확인 |
| C4 | fault 중 DB 풀이 포화되고 DB 처리량은 감소함 | active 10/10, pending 급증, MySQL QPS 256→2.9 | 확인 |
| C5 | DB를 쓰는 무관한 요청도 커넥션 획득을 기다림 | 30초 실패 군집과 기능별 전파 | 강하게 지지 |
| C6 | 인증이 매 요청마다 User를 DB 조회함 | `TokenProvider.getAuthentication()` | 확인 |
| C7 | 인증 중 인프라 예외도 익명 요청으로 전환되어 보호 API가 401을 반환함 | 필터의 광범위한 catch와 401 분포 | 지지, 로그 필요 |
| C8 | Redis 정지 동안 조회수 버퍼가 사라져 일부 증가를 복구하지 못함 | 불변식 표본 | 확인 |

## 반증 조건

- Redis 명령 timeout을 짧게 한 뒤에도 실패 지연이 60초에 몰리면 C1은 틀리다.
- Redis 호출을 트랜잭션 밖으로 옮긴 뒤에도 HikariCP가 10/10이 되면 C3만으로 풀 포화를
  설명할 수 없다.
- 인증 필터에서 DB 획득 예외를 분리했는데도 같은 401 분포가 나오면 C7은 틀리다.

## 조치

| 우선순위 | 변경 | 기대 효과 | 검증 |
|---:|---|---|---|
| P0 | Redis 연결·명령 timeout을 명시 | 실패 상한을 서비스 응답 예산 안으로 제한 | 60초 지연 군집 제거 |
| P0 | Redis 호출을 DB 트랜잭션 밖으로 이동 | 장애 중 DB 커넥션 점유 차단 | active/pending 비교 |
| P0 | 인증 예외에서 JWT 오류와 인프라 오류 분리 | 잘못된 401 제거 | 상태 코드와 예외 로그 대조 |
| P1 | 요청마다 수행하는 User 조회 제거 또는 제한 | 인증 경로의 풀 의존도 감소 | 요청당 SQL과 장애 반경 비교 |
| P1 | 조회수 유실 허용 범위와 복구 방식을 결정 | 데이터 손실을 명시적 정책으로 전환 | 불변식 재실행 |
| P1 | 헬스 체크의 Redis 의존성과 시간 예산 재설계 | 장애 탐지 가능성 회복 | fault 중 health 응답 확인 |

## 검증 계획

같은 `redis-crash.json` 계획을 깨끗한 커밋과 최신 이미지로 다시 실행한다.

| 지표 | Before | 목표 |
|---|---:|---:|
| fault p95 | 60,001ms | 합의한 요청 상한 이내 |
| Hikari active max | 10/10 | 풀 포화 없음 |
| Hikari pending max | 177 | 지속 대기 없음 |
| 인프라 장애 기인 401 | 최대 38건 | 0건 |
| fault health timeout | 12/12 | 0건 또는 의도한 상태 코드 |
| 조회수 차이 | 최대 -97 | 채택한 데이터 정책 충족 |

## 증거

- [자동 생성 리포트](../../resilience/reports/redis-crash-2026-09-11T00-47-40/report.html)
- [실행 원자료](../../resilience/reports/redis-crash-2026-09-11T00-47-40/run.json)
- [`ResilientRedisAspect`](../../../src/main/java/com/example/highteenday_backend/aop/ResilientRedisAspect.java)
- [`HotPostService`](../../../src/main/java/com/example/highteenday_backend/services/domain/HotPostService.java)
- [`ScrapService`](../../../src/main/java/com/example/highteenday_backend/services/domain/ScrapService.java)
- [`TokenProvider`](../../../src/main/java/com/example/highteenday_backend/security/TokenProvider.java)
- [`TokenAuthenticationFilter`](../../../src/main/java/com/example/highteenday_backend/security/TokenAuthenticationFilter.java)
- 이전 작성본: [legacy EXP-007](../../archive/legacy-docs/2026-09-11/experiments/EXP-007-redis-crash/README.md)

