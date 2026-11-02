# MySQL 중단과 무응답의 긴 대기

> 상태: 부분 해결. 긴 대기는 줄었지만 DB 장애 중 요청 실패와 일부 5초 지연은 남았다.
> 영향도: 치명. DB 의존 요청이 장애 동안 최대 54초 대기한다.
> 실행: hang 변경 전 `mysql-hang-2026-09-21T00-18-27`, 변경 후 `mysql-hang-2026-09-21T04-43-50`.
> crash 변경 전 `mysql-crash-2026-09-21T01-30-04`, 변경 후 `mysql-crash-2026-09-22T07-57-12`

## 요약

DB 응답을 막은 hang과 MySQL 프로세스를 중단한 crash의 변경 전 실행에서 장애 구간 HTTP p95는
각각 51.3초, 52.1초였다. 변경 전 설정은 커넥션 획득 대기 30초, 소켓 대기 무제한이었고, 여러 DB
대기 단계가 요청에 누적됐다는 설명이 관측과 맞는다. Hikari 커넥션 획득, JDBC 연결, 소켓 읽기, 쿼리 타임아웃을 설정한 뒤
hang은 5.0초, crash는 1.0초로 줄었다. 실패가 빠른 503으로 바뀌었고, 장애 구간 성공 응답은
hang 167건에서 1건, crash 121건에서 3건으로 줄었다. 오류율은 hang 99.87%, crash 99.61%였다.

## 문제와 영향

네 실행은 medium 데이터 지문 `24ddff07519b`, warm 캐시, 도착률 4/s,
HikariCP 최대 60, Tomcat 최대 50, pre 60초·fault 60초·post 120초다.
MySQL은 Toxiproxy 경유로 연결한다. hang은 Redis를 건드리지 않고 MySQL 응답을
가로막았고, crash는 Docker로 MySQL을 멈췄다. 각 주입·해제 이벤트는 성공했다.

| 장애와 실행 | fault HTTP p95 | fault 오류율 | 실패 응답 중간값 | fault 완료 요청 |
|---|---:|---:|---:|---:|
| hang, 변경 전 | 51,325ms | 25.11% | 30,009ms | 223건 |
| hang, 변경 후 | 5,009ms | 99.87% | 1,008ms | 786건 |
| crash, 변경 전 | 52,060ms | 48.07% | 30,009ms | 233건 |
| crash, 변경 후 | 1,012ms | 99.61% | 1,007ms | 764건 |

성공 응답 수는 완료 요청 × (1 − 오류율)로 계산했다. hang은 223 × (1 − 0.2511) = 223 × 0.7489 = 167건에서
786 × 0.0013 = 1건, crash는 233 × 0.5193 = 121건에서 764 × 0.0039 = 3건이다. 변경 전 fault 최대
지연은 hang 53,609ms, crash 54,260ms였다.

변경 전 오류율이 낮아 보이는 것은 장애 중 보낸 요청 상당수가 DB가 돌아온 뒤에야 성공했기
때문이다(성공 응답 중간값 hang 28.1초, crash 31.2초). 변경 후에는 이 요청들이 1초 안팎의 503으로
끝나 오류율이 올랐고, 요청이 빨리 끝난 만큼 장애 중 보낸 요청 수(k6는 보낸 시각으로 구간을 나눔)도 늘었다. 오류율만으로 가용성 악화 또는 개선을 판정하지 않는다.
hang 변경 전 dropped iteration 77건, crash 변경 전 83건도 기록됐다.

## 원인과 확신도

변경 전 실행 기록에는 Hikari `connectionTimeout=30000ms`, JDBC
`socketTimeout=0`이 적혀 있다. 실패 응답의 중간값이 약 30초이고 p95가
50초를 넘는 현상은 여러 DB 대기 단계가 요청에 누적된다는 설명을 지지한다.
개별 요청의 커넥션 획득·쿼리 시각은 없어 50초 전부를 어느 한 타임아웃에
귀속하지 않는다. 변경 전 hang의 풀 지표는 장애 중 스크레이프가 빠져 0으로
기록된 항목이 있어, 풀 사용이 0이었다는 결론에 쓰지 않는다.

변경 후 설정은 Hikari 커넥션 획득 1초, JDBC 연결 1초, 소켓 읽기 2초,
JPA 쿼리 힌트 1.5초다. Hikari의 1초는 커넥션 획득 대기의 설정이며 요청
전체 마감이 아니다. crash 변경 후 실패 중간값 1,007ms와 전부 503인 상태
분포는 빠른 실패 경로와 맞는다. hang 변경 후 p95 5,009ms는 커넥션 획득 1초와 소켓 읽기 2초를
단순히 더한 3초보다 길다. 이 차이는 [별도 사례](mysql-freeze-timeout-gap.md)에서 조사한다.

## 조치와 검증

`application.properties`에 위 네 타임아웃을 명시했다. hang 전/후는 같은 계획·
데이터·자원·캐시 상태로 실행했고 앱 이미지가 설정 변경을 포함하도록 교체됐다.
긴 대기 감소는 관측됐지만, `+dirty` 소스 커밋이라 이미지 간 모든 차이를
원자료만으로 재현할 수 없다. crash 변경 후에는 readiness·폴러 수정도 포함된
다른 이미지가 쓰였다. 따라서 crash 수치 차이를 타임아웃 설정 단독 효과로
단정하지 않는다.

crash 변경 후 fault의 761개 실패는 모두 503이었다. post에는 오류율 3.76%가
남았고 p95는 99ms였다. hang 변경 후에도 post 구간 1,882건 중 2.66%(50건)가 503으로 끝났다. MySQL 재기동과 풀 커넥션 교체가 각각 언제 완료됐는지
분리한 로그가 없어 회복 지연의 원인을 확정하지 않는다. 보호 API가 인프라 장애를
401로 응답하는 현상은 이 변경 후 crash 실행에서는 관측되지 않았다.

## 남은 위험

- DB가 완전히 멈춘 동안 대부분의 요청은 실패한다. 이 사례의 성공 기준은 빠르고 올바른 실패다.
- 1초 설정이 요청 전체의 1초 상한은 아니다. hang과 freeze의 약 5초 꼬리
  지연을 요청별 추적으로 설명해야 한다.
- 변경 전 헬스 폴러의 TIMEOUT 수는 [폴러 결함](health-poller-false-timeout.md)
  때문에 실제 서버 무응답 수로 그대로 쓰지 않는다. 수정 후 crash에서는
  fault 12/12회 DOWN이 기록됐다.
- 장애 구간의 조회수 보존은 실행 전체의 DB·Redis 버퍼 차이에서 양의 결손이
  관측되지 않았지만, 다른 쓰기와 샘플 경계가 섞여 요청별 보존까지 확인한 것은 아니다.

## 후속 조치

같은 조건에서 타임아웃 변경 후에도 실패 중간값이 다시 30초에 몰린다면 이
완화 설명을 재검토한다. 재기동 시점, 풀 복구, 첫 정상 요청을 같은 시간축에
수집해 post 오류의 지속 시간을 확인한다.

## 근거

- hang 전: [`mysql-hang-2026-09-21T00-18-27`](../resilience/reports/mysql-hang-2026-09-21T00-18-27/) · [run.json](../resilience/reports/mysql-hang-2026-09-21T00-18-27/run.json)
- hang 후: [`mysql-hang-2026-09-21T04-43-50`](../resilience/reports/mysql-hang-2026-09-21T04-43-50/) · [run.json](../resilience/reports/mysql-hang-2026-09-21T04-43-50/run.json)
- crash 전: [`mysql-crash-2026-09-21T01-30-04`](../resilience/reports/mysql-crash-2026-09-21T01-30-04/) · [run.json](../resilience/reports/mysql-crash-2026-09-21T01-30-04/run.json)
- crash 후: [`mysql-crash-2026-09-22T07-57-12`](../resilience/reports/mysql-crash-2026-09-22T07-57-12/) · [run.json](../resilience/reports/mysql-crash-2026-09-22T07-57-12/run.json)
- 타임아웃 의미: [HikariCP 설정](https://github.com/brettwooldridge/HikariCP#frequently-used), [MySQL Connector/J 네트워크 설정](https://dev.mysql.com/doc/connector-j/en/connector-j-connp-props-networking.html)
