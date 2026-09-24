# Redis 장애를 인스턴스 장애로 판정한 헬스체크

> 상태: 코드·실험 검증 완료, 운영 로드밸런서 설정 미확인
> 영향도: high — 폴백으로 요청을 처리해도 로드밸런서가 인스턴스를 제외할 수 있음
> 발견 실행: `redis-crash-2026-09-11T06-37-20`
> 수정 검증: `redis-crash-2026-09-22T07-33-59`

## 요약

Redis를 60초 중단한 9월 11일 실행에서 HTTP 오류율은 0%였지만 집계
`/actuator/health`는 fault 구간 12/12회 DOWN(503)이었다. Redis 장애를 앱의
트래픽 처리 불능과 동일하게 판정한 셈이다. readiness 그룹을 `readinessState`만
포함하도록 분리하고 폴러를 그 경로로 돌린 9월 22일 실행에서는 fault 11/11회
UP이었다. 운영 ALB가 실제로 새 경로와 포트를 쓰는지는 확인하지 않았다.

## 문제 개요와 영향

기존 집계 헬스는 Redis 인디케이터를 포함한다. Redis가 DOWN이면 다른 경로가
폴백으로 응답해도 집계 응답은 503이다. 9월 11일 실행에서는 fault HTTP 972건,
오류율 0%, p95 224ms였는데 헬스만 12회 모두 DOWN이었다. ALB 타겟 그룹이 이
경로를 사용한다면 실패 임계값 이후 타겟을 unhealthy로 판정할 수 있다. 실제 운영
라우팅 중단이나 컨테이너 교체는 이 실험에서 관측하지 않았다. 별도
`redis-hang-2026-09-14T00-00-27` 실행도 fault HTTP 오류율 0%인데 집계 헬스는
24/24회 DOWN이었다. 이는 같은 판정 문제가 crash뿐 아니라 무응답 주입에서도
나타난 독립 관측이며, 부하 조건이 달라 수치를 합치지는 않는다.

## 탐지와 원인

9월 11일 헬스의 DOWN은 HTTP 503과 Redis 인디케이터 상태로 확인된다.
이는 [폴러의 거짓 TIMEOUT 문제](health-poller-false-timeout.md)와 다르다.
수정 전 구조가 Redis를 집계 헬스에 넣고, 폴백이 가능한 요청과 동일한 기준으로
트래픽 가능 여부를 판단하지 않은 것이 원인이다.

이 설명은 동일 Redis 장애 중 **요청 성공과 집계 헬스 DOWN의 동시 관측**, 그리고
Redis만 실패했을 때 집계 헬스 503·readiness 200을 확인하는 `HealthGroupTest`로
**확인**된다. Redis만 실패했는데 readiness도 DOWN이면 분리 설명을 재검토한다.

## 조치와 검증 결과

`application.properties`에서 probes를 켜고
`management.endpoint.health.group.readiness.include=readinessState`로 설정했다.
헬스 하위 경로의 보안 접근도 허용하고, 장애 실행기의 폴러 경로를
`HEALTH_PATH`로 지정할 수 있게 했다. 집계 `/actuator/health`는 의존성 상태를
보는 경로로 남는다.

| 실행 | 폴러 경로 | fault 헬스 | fault HTTP 오류율 |
|---|---|---:|---:|
| 9월 11일 crash | `/actuator/health` | DOWN 12/12 | 0% |
| 9월 22일 crash | `/actuator/health/readiness` | UP 11/11 | 0.12% |

두 실행은 모두 Redis 중단이지만 도착률 4/s와 60/s, HikariCP 최대 10과 60,
캐시 상태 및 앱 이미지가 다르다. 따라서 HTTP 지연·오류율 개선의 직접 Before/After로
읽지 않는다. **헬스 경로의 판정 변화**는 설정·테스트와 수정 후 실행이 함께
뒷받침한다. 수정 후 실행은 [폴러 타이머 수정](health-poller-false-timeout.md)
뒤의 원자료다.

## 남은 위험과 후속 조치

운영 ALB 타겟 그룹이 `/actuator/health/readiness`와 실제 actuator 포트를
사용하도록 설정됐는지 확인해야 한다. 저장소 설정과 로컬 장애 실행만으로 운영
반영을 선언할 수 없다. readiness가 UP이어도 사용자 요청 지연이나 조회수 유실은
감지하지 못한다. 각각 [slow Case](redis-slow-latency-without-fallback.md)와
[조회수 Case](redis-viewcount-loss-on-fallback.md)의 지표를 별도로 본다.

## 근거

- 발견: [report.html](../resilience/reports/redis-crash-2026-09-11T06-37-20/report.html) · [run.json](../resilience/reports/redis-crash-2026-09-11T06-37-20/run.json)
- hang 관측: [report.html](../resilience/reports/redis-hang-2026-09-14T00-00-27/report.html) · [run.json](../resilience/reports/redis-hang-2026-09-14T00-00-27/run.json)
- 수정 검증: [report.html](../resilience/reports/redis-crash-2026-09-22T07-33-59/report.html) · [run.json](../resilience/reports/redis-crash-2026-09-22T07-33-59/run.json)
- 코드: `application.properties`, `SecurityConfig`, `performance/resilience/fault-run.js`, `HealthGroupTest`
