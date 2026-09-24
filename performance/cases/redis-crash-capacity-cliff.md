# Redis 중단 상태에서 부하를 올리자 처리 지연이 급증한 사례

> 상태: needs-evidence — 고부하 지연과 도착률 미달은 관측, 임계 도착률은 미확정
> 영향도: high — 요청 성공률만 보면 수 초 지연과 처리량 부족을 놓침
> 발견 실행: `redis-crash-breakpoint-2026-09-17T01-30-55`

## 요약

Redis를 중단한 채 도착률을 40→55→70→85→100 iteration/s로 높인 실행에서
fault 구간 HTTP p95는 4,057ms, post p95는 5,774ms였다. 전체 실행에서
dropped iteration 2,429건이 발생해 계획한 도착률을 전부 걸지도 못했다.
HikariCP active와 Tomcat busy는 각각 최대 60/60, 50/50이었다. 오류율은
fault 약 0.05%로 낮았지만 지연과 부하 발생 실패는 심각했다.

## 재현 조건과 영향

warm 캐시, medium 데이터 지문 `24ddff07519b`, HikariCP 최대 60,
Tomcat 최대 50, Redis 중단 600초, pre 120초·post 180초의 계단형 계획이다.
주입·복구 이벤트는 성공했다. 앱 이미지가 기록된 소스의 최신 입력보다 약 23.7시간
오래됐고 실행 커밋에 `+dirty`가 붙어 있다. 따라서 이 결과를 현재 코드의 용량
상한으로 그대로 옮기지 않는다.

| 구간 | HTTP p95 | HTTP 오류율 | 완료 HTTP 요청 |
|---|---:|---:|---:|
| pre, 40/s | 79ms | 0% | 18,112건 |
| fault, 계단형 40~100/s | 4,057ms | 0.046% | 144,941건 |
| post, 40/s | 5,774ms | 0.149% | 51,103건 |

fault의 p95는 다섯 도착률을 합친 값이다. 어느 계단에서 500ms를 넘었는지,
어느 계단부터 VU 부족으로 도착률이 미달했는지는 이 요약값만으로 판정하지 않는다.
post는 장애 제거 후에도 높은 지연을 기록했지만, 밀린 요청과 빈 Redis 캐시의
기여를 이 실행으로 분리할 수 없다.

## 원인과 확신도

Redis 중단 동안 캐시 경로가 DB 폴백으로 넘어가고, 요청 대기와 DB 작업량이
늘 수 있다. 같은 구간의 HikariCP·Tomcat 최고치와 긴 지연은 자원 포화 설명을
**지지**한다. 다만 2,429 dropped iteration 때문에 계획된 최고 부하가 그대로
전달된 것도 아니다. 단계별 요청 지연·풀 점유·DB 작업량을 대조하지 않고
"장애 중 안전 상한은 N/s"라고 결론내릴 수 없다. 특정 계단에서 풀은 여유인데
지연만 급증한다면 다른 병목을 조사해야 한다.

## 조치와 검증 계획

고정 도착률 60/s의 별도 두 실행에서는 서킷브레이커 적용 상태가 Redis 반복
대기와 풀 점유를 완화하는 방향으로 관측됐다. 조건과 앱 이미지가 다른 이
계단형 실행의 After로 사용할 수는 없다. 해당 비교는
[커넥션 점유 Case](db-connection-held-during-redis-wait.md)에 기록했다.

현재 코드의 서킷브레이커와 명령 타임아웃을 적용한 신선한 앱 이미지에서 같은
계단형 계획을 다시 실행한다. 계단별 p95·p99, 완료 iteration, dropped iteration,
HikariCP active·pending, Tomcat busy와 MySQL 작업량을 묶어 최초 목표 위반
단계를 찾는다. 부하 발생기의 VU도 목표 도착률을 낼 수 있게 먼저 검증한다.
같은 조건의 무장애 계단 실행이 있어야 Redis 장애로 줄어든 여유를 계산할 수 있다.

## 남은 위험과 근거

이 실행의 조회수 차이는 [조회수 유실 Case](redis-viewcount-loss-on-fallback.md)의
문제와 같은 방향이나, 계단형 부하의 손실률을 이 한 번의 실행으로 일반화하지 않는다.
수정 전 헬스 폴러의 TIMEOUT 표본도 실제 서버 무응답으로 단정하지 않는다.

- 실행: [report.html](../resilience/reports/redis-crash-breakpoint-2026-09-17T01-30-55/report.html) · [run.json](../resilience/reports/redis-crash-breakpoint-2026-09-17T01-30-55/run.json)
- 계획: [redis-crash-breakpoint.json](../resilience/faults/redis-crash-breakpoint.json)
