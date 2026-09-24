# Redis 장애 중 성공 응답 뒤 조회수가 기록되지 않은 사례

> 상태: open — 응답 가용성은 확보했으나 조회수 보존은 미해결
> 영향도: high — 게시글 조회가 성공해도 조회수 증가분이 남지 않을 수 있음
> 대표 실행: `redis-hang-2026-09-14T00-00-27`

## 요약

Redis 응답을 2분간 막은 실행에서 HTTP 오류율은 0%, fault p95는 224ms였다. 그러나
계측기가 기대한 조회수 증가분 2,572건 중 413건은 실행 종료 뒤 MySQL 증가분과 Redis
대기 버퍼 어디에도 없었다. 명령 타임아웃 100ms와 폴백이 요청 장애의 확산은 막았지만
조회수 보존까지 보장하지는 않았다.

## 문제 개요와 영향

이 실행은 Toxiproxy가 Redis 연결을 유지한 채 응답을 보내지 않는 `redis-hang`이다.
도착률 4/s, cold 캐시, HikariCP 최대 10, pre 300초·fault 120초·post 300초였다.
명령 타임아웃은 100ms다. 주입과 제거는 모두 성공했다. fault 구간의 HTTP 요청은
1,757건, 오류율 0%, HikariCP pending 최대 0개, Tomcat busy 최대 3개였다.

조회수 보존 검사는 실행 전체의 시작·종료 표본을 사용한다. 기대 증가분 2,572건에
대해 MySQL 조회수는 2,159건 증가했고 종료 시 Redis 대기 버퍼 증감은 0건이었다.
차이 **413건**은 이 실행에서 기록되지 않은 증가분이다. 개별 요청과 특정 손실 건을
연결한 추적은 없으므로 장애 구간 안의 정확한 유실 시각은 알 수 없다.

## 탐지와 원인

`RedisViewCountStore.tryMarkViewed()`와 `incrementCount()`는 Redis 호출 실패 시
`@ResilientRedis` 폴백을 탄다. `tryMarkViewed()`의 폴백 값은 `false`라 뒤의 증가
호출을 건너뛴다. 조회 API는 이 실패를 사용자 오류로 돌려주지 않는다. fault 구간의
`tryMarkViewed` 폴백은 계측기 추정 약 513회이며, 이는 413건 유실과 같은 방향이다.
두 수치의 집계 범위와 뜻이 달라 1:1로 대응시키지는 않는다.

이 설명은 코드 경로와 조회수 불변식이 **지지**한다. 개별 사용자 요청에서 Redis 실패가
어느 증가분을 없앴는지는 확인하지 않았다. 반증하려면 장애 중 조회 성공 요청의 증가분이
다른 영속 저장소나 Redis 버퍼에 모두 남는다는 요청별 추적이 필요하다.

## 조치와 검증 결과

명령 타임아웃 100ms는 hang 중 요청 스레드의 긴 대기를 막았다. 같은 실행에서
fault p95 224ms, HTTP 오류율 0%, 풀 획득 대기 0개였다. 이는 가용성 조치의
검증이며 조회수 유실 해결의 검증이 아니다.

다른 장애 방식인 `redis-crash-2026-09-11T06-37-20`에서도 100ms 타임아웃과 HTTP
오류율 0% 상태에서 기대 905건 중 484건이 DB·버퍼에 남지 않았다. crash는 60초,
hang은 120초이고 환경도 달라 두 유실 건수를 Before/After로 비교하지 않는다.
`redis-slow-2026-09-14T00-14-46`에서는 50±10ms 지연에 폴백 0회, 조회수 차이
0건이었다. 이 실행도 별도 장애 조건이며 손실 임계값을 확정하지 않는다.

## 남은 위험과 후속 조치

현재 조회수는 Redis를 유일한 대기 버퍼로 쓴다. Redis 장애 중 조회 성공을 우선하는
정책 때문에 조회수 유실은 [DATA-001](../../docs/issues.md)의 허용 위험으로 남아 있다.
정확성 요구가 바뀐다면 Redis 실패 시에도 증가분을 보존할 영속 경로를 정하고, 동일
hang/crash 조건에서 **HTTP 결과와 DB·버퍼 증가분을 함께** 재검증해야 한다. 우선
요청별 증가 시도·폴백·최종 DB 반영을 연결하는 계측으로 실제 손실 경로를 확인한다.

서킷 개방 중 MySQL 반영 뒤 Redis 차감이 거절된 별도 위험은
[정산 Case](circuit-open-skips-viewcount-settlement.md)에서 다룬다.

## 근거

- hang: [report.html](../resilience/reports/redis-hang-2026-09-14T00-00-27/report.html) · [run.json](../resilience/reports/redis-hang-2026-09-14T00-00-27/run.json)
- crash: [report.html](../resilience/reports/redis-crash-2026-09-11T06-37-20/report.html) · [run.json](../resilience/reports/redis-crash-2026-09-11T06-37-20/run.json)
- slow: [report.html](../resilience/reports/redis-slow-2026-09-14T00-14-46/report.html) · [run.json](../resilience/reports/redis-slow-2026-09-14T00-14-46/run.json)
- 코드: `ViewCountService`, `RedisViewCountStore`, `ResilientRedisAspect`
