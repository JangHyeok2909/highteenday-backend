# MySQL이 느릴 때 오류 없이 전 기능의 응답이 길어진 사례

> 상태: open — DB 대기 상한 설정 뒤에도 20초 안팎의 p95가 재현됨
> 영향도: high — 성공 응답과 헬스 UP만 보면 사용자 지연을 놓침
> 변경 전: `mysql-slow-2026-09-21T00-05-32`
> 변경 후: `mysql-slow-2026-09-21T04-33-28`

## 요약

MySQL 연결의 응답 방향에 300±50ms 지연을 120초 주입하자 장애 구간 HTTP
p95는 변경 전 20,116ms였다. Hikari 1초·JDBC 소켓 2초·쿼리 1.5초 설정 뒤에도
p95는 19,894ms였다. 두 실행 모두 HTTP 오류율 0%, HikariCP active 최대 60/60,
Tomcat busy 최대 50/50이었다. 이 설정은 **느리지만 계속 응답하는 DB**의
요청 전체 지연을 해결하지 못했다.

## 재현 조건과 영향

두 실행의 medium 데이터 지문은 `24ddff07519b`이고 warm 캐시, 도착률 4/s,
HikariCP 최대 60, Tomcat 최대 50, pre·fault·post 각 120초다. 같은
`mysql-slow.json`으로 Toxiproxy 지연을 주입했고 제거도 성공했다. 앱 이미지는
타임아웃 설정 변경을 포함하도록 바뀌었다.

| 지표 | 변경 전 | 변경 후 |
|---|---:|---:|
| fault HTTP p95 | 20,116ms | 19,894ms |
| fault HTTP 오류율 | 0% | 0% |
| fault 완료 요청 | 1,394건 | 1,412건 |
| dropped iteration | 42건 | 40건 |
| HikariCP active 최대 | 60/60 | 60/60 |
| Tomcat busy 최대 | 50/50 | 50/50 |
| 인기글 기능 fault p95 | 23,075ms | 23,221ms |
| 급식 기능 fault p95 | 6,587ms | 6,019ms |

변경 후 `post_list_nonempty` 등 네 내용 검사 모두 fault에서 통과했다. 응답
내용이 있어도 수 초~수십 초 뒤에 온다는 문제다. 변경 전 헬스는 fault
19회 UP·5회 TIMEOUT으로 기록됐지만, 이 시기의 [폴러 결함](health-poller-false-timeout.md)
때문에 TIMEOUT 5회를 실제 서버 무응답으로 단정하지 않는다.

## 원인과 확신도

주입은 SQL 하나가 아니라 TCP 응답 방향에 걸린 지연이다. 요청이 여러 DB
작업과 네트워크 왕복을 거치면 각 대기가 더해질 수 있다. 변경 후 fault의
계측 문장 수는 요청당 약 17.25개이고 HikariCP·Tomcat 모두 최고치에 닿았다.
지연 주입과 동시에 모든 기능의 p95가 상승하고, 주입 제거 뒤 전체 p95가
약 50ms로 돌아온 것은 DB 지연 전파를 **지지**한다.

그러나 17.25개는 평균 SQL 문장 수이지 요청별 왕복 횟수나 각 대기 시간의
기록이 아니다. Hikari/소켓/쿼리 타임아웃은 각 단계에 적용되고 요청 전체
마감은 아니다. 이 실행은 어떤 경로가 20초를 구성했는지, 풀 포화가 지연의
얼마를 더했는지 분리하지 못한다. 요청별 DB 호출 수와 대기 시간을 수집한 뒤
지연이 누적되지 않는다면 이 설명을 수정한다.

## 조치와 재검증 결과

기존 변경은 커넥션 획득 1초, TCP 연결 1초, 소켓 읽기 2초와 쿼리 힌트
1.5초를 설정했다. 무응답·중단 DB의 긴 대기에는 효과가 있었지만
[해당 Case](mysql-unavailable-wait-bound.md), 이 slow 실행의 p95 변화는
222ms에 그쳤고 두 실행 모두 풀·워커 최고치에 닿았다. 20초 지연을
해결했다고 판정할 수 없다. `+dirty` 이미지 사이의 변경을 원자료가 완전히
재구성하지 못하므로 222ms도 설정의 순수 효과로 귀속하지 않는다.

다음 변경은 요청 단위로 DB 호출·커넥션 획득·소켓 읽기 시간을 기록해 가장
큰 누적 경로를 찾은 뒤 결정한다. 반복 왕복을 줄이거나 요청 전체의 시간
예산을 적용하는 후보를 각각 한 번에 하나씩 검증한다. 빠른 실패를 택할 경우
오류율 증가와 HTTP 상태, 내용 검사를 같은 조건에서 함께 제시해야 한다.

## 남은 위험과 근거

MySQL이 계속 응답하지만 느린 상태에서는 지금의 장애 알림과 타임아웃만으로
사용자 지연을 막지 못한다. 정상 응답률과 별도로 기능별 p95·p99, 풀 점유,
dropped iteration을 본다.

- 변경 전: [report.html](../resilience/reports/mysql-slow-2026-09-21T00-05-32/report.html) · [run.json](../resilience/reports/mysql-slow-2026-09-21T00-05-32/run.json)
- 변경 후: [report.html](../resilience/reports/mysql-slow-2026-09-21T04-33-28/report.html) · [run.json](../resilience/reports/mysql-slow-2026-09-21T04-33-28/run.json)
- 주입 계획: [mysql-slow.json](../resilience/faults/mysql-slow.json)
