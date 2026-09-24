# Redis가 느리지만 살아 있을 때 요청 지연이 누적된 사례

> 상태: open — 지연 현상은 재현, 개선 변경과 같은 조건의 재검증은 없음
> 영향도: medium — HTTP 오류나 헬스 DOWN 없이 사용자 응답 시간이 늘어남
> 발견 실행: `redis-slow-2026-09-14T00-14-46`

## 요약

Redis 응답에 50±10ms 지연을 120초간 주입하자 HTTP p95가 pre 61ms에서 fault
216ms로 올랐다. Redis 명령 p95는 60.36ms였지만 폴백은 0회, HTTP 오류율은 0%,
`/actuator/health`는 24/24회 UP이었다. 타임아웃 100ms보다 짧게 느려지는 장애는
실패 처리로 넘어가지 않으면서 요청 지연을 키웠다.

## 문제 개요와 영향

Toxiproxy `downstream` latency toxic을 120초 적용했다. 도착률 4/s, cold 캐시,
HikariCP 최대 10, pre 300초·fault 120초·post 300초다. 주입과 제거는 성공했다.

| 구간 | HTTP p95 | HTTP 오류율 | 헬스 판정 |
|---|---:|---:|---|
| pre | 61ms | 0% | 60/60 UP |
| fault | 216ms | 0% | 24/24 UP |
| post | 42ms | 0% | 59/59 UP |

fault의 HTTP 최대 지연은 10,542ms였다. 이 극단값 하나를 Redis 지연만으로
설명할 요청별 추적은 없다. `post_list_nonempty` 검사도 fault 146건 중 11건이
실패했다. HTTP 상태 0% 오류와 별개인 내용 검사이며, Redis 지연이 빈 목록의
원인인지 이 실행만으로 판정할 수 없다.

## 탐지와 원인

Redis 명령 지연은 fault p95 60.36ms, p99 61.28ms로 주입 크기와 일치했다.
Redis 폴백 0회와 조회수 보존 차이 0건은 명령이 타임아웃 경계를 넘지 않고 성공한
경로를 지지한다. 같은 기간 Tomcat busy 최대 6개, HikariCP pending 최대 0개라
앞선 60초 대기처럼 풀 포화가 일어난 것은 아니다.

HTTP p95 상승은 주입 시점에 맞고 toxic 제거 뒤 내려갔으므로 Redis 지연의
요청 전파를 **지지**한다. 한 요청이 Redis를 몇 번 순차 호출했는지, 경로별 지연이
얼마나 더해졌는지는 이 집계로 확인하지 않았다. 동일 부하에서 Redis 명령 지연만
올랐는데 HTTP 경로별 지연이 그대로라면 이 설명을 수정해야 한다.

## 조치와 검증 상태

기존 100ms 명령 타임아웃은 응답이 없는 hang에 대한 상한이다. 이 실행의
60ms 안팎 명령을 실패시키지 않았으므로 slow 상태의 지연을 제거하는 조치는 아니다.
이 Case를 대상으로 한 코드 변경과 같은 조건의 After 실행은 아직 없다.

다음 실험에서는 지연 주입을 여러 단계로 높이고, 요청별 Redis 호출 횟수와 각 호출의
소요 시간을 함께 기록한다. 그런 다음 반복·순차 호출을 줄이거나 느린 Redis를
우회하는 변경 하나만 적용해 같은 데이터셋·캐시·도착률에서 재검증한다.
`post_list_nonempty` 실패는 실패 요청의 응답 본문과 데이터 상태를 따로 수집해
원인을 가른다. 100ms 타임아웃을 더 낮추는 결정은 정상 지연 분포와 폴백 시
정합성 손실도 함께 측정한 뒤 내려야 한다.

## 남은 위험과 근거

현재 헬스의 UP은 응답 속도가 사용자 목표 안이라는 뜻이 아니다. readiness 분리 뒤에도
이 지연을 감지하려면 HTTP 지연과 Redis 명령 지연을 별도로 봐야 한다.

- 실행: [report.html](../resilience/reports/redis-slow-2026-09-14T00-14-46/report.html) · [run.json](../resilience/reports/redis-slow-2026-09-14T00-14-46/run.json)
- 주입 계획: [redis-slow.json](../resilience/faults/redis-slow.json)
