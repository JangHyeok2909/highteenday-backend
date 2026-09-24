# MySQL 실행 중 정지에서 요청 대기가 3초 예상치를 넘은 사례

> 상태: open — 약 5초 실패 지연의 경로는 미확인
> 영향도: high — 설정된 대기 시간의 단순 합을 요청 상한으로 믿을 수 없음
> 발견 실행: `mysql-freeze-2026-09-22T08-19-21`
> 같은 이미지의 다른 주입: `mysql-crash-2026-09-22T07-57-12`

## 요약

MySQL 컨테이너를 `docker pause`로 60초 얼린 실행에서 실패 응답의 중간값은
1,007ms였지만 p95는 5,007ms, 최대는 5,028ms였다. 당시 Hikari 커넥션
획득 1초, JDBC 소켓 읽기 2초, 쿼리 힌트 1.5초가 설정돼 있었다.
커넥션 대기 1초와 소켓 대기 2초를 더한 **요청 전체 3초 상한**은 이 실행에서
성립하지 않았다.

## 재현 조건과 사용자 영향

medium 데이터 지문 `24ddff07519b`, warm 캐시, 도착률 4/s, HikariCP 최대
60, Tomcat 최대 50, pre 60초·fault 60초·post 120초다. pause/unpause
이벤트는 성공했다. 장애 구간 HTTP 오류율은 98.76%이고 799개 실패는 모두
503이었다. HikariCP active 최대 31/60, pending 최대 19, Tomcat busy 최대
27/50이었다. post 오류율은 0.11%, p95는 237ms였다.

같은 앱 이미지·데이터·부하·자원 조건의 `mysql-crash` 재실행에서는 MySQL
프로세스를 중단했다. 그 fault 실패 응답 p95는 1,012ms, 최대는 1,101ms였다.
두 실행은 **주입 방식이 다른 독립 관측**이며 freeze의 Before/After가 아니다.
프로세스가 죽어 새 연결을 못 얻는 경우와 이미 연결된 상태에서 서버 응답이
멈추는 경우의 지연 모양이 다르다는 점만 확인한다.

## 원인 분석과 확신도

Hikari `connectionTimeout`은 한 번의 커넥션 획득 대기, Connector/J
`socketTimeout`은 소켓 네트워크 작업의 타임아웃이다. 어느 것도 HTTP 요청
전체의 마감으로 설정한 값은 아니다. 한 요청에 여러 번 획득·검증·쿼리 호출이
발생하면 시간이 누적될 수 있다. `run.json`의 설정 해석은 Hikari
`validationTimeout`을 미설정 기본값 5초로 표시한다. 이것도 5초 꼬리의
**후보**지만, 실제 풀에 적용된 유효값과 어떤 호출이 5초를 썼는지는 계측하지
않았다. 숫자가 같다는 이유로 원인으로 확정하지 않는다.

이 설명을 가르려면 5초 실패 요청 한 건의 커넥션 획득 시작·종료, 유효성 검사,
각 JDBC 호출, 예외를 한 추적에 묶어야 한다. 5초가 단일 유효성 검사인지
여러 1초 대기의 누적인지 확인한다. 런타임 Hikari 설정값과 앱 로그의 예외
종류도 함께 남긴다. 모든 단계가 3초 안에 끝났는데 HTTP만 5초라면 다른
요청 단계나 재시도를 조사한다.

## 조치와 검증 계획

이 문제를 겨냥한 추가 설정·코드 변경은 아직 없다. 현재 설정 주석이
“스레드 점유 상한 3초”라고 단정하던 부분은 관측 범위에 맞게 고쳤다.
진단 뒤 특정 단계가 원인이면 그 단계의 타임아웃·재시도만 조정하고 동일
freeze 조건으로 p95와 실패 상태, post 복구를 다시 측정한다. 요청 전체의
상한이 제품 요구라면 단계별 타임아웃 합산 대신 요청 단위 마감과 취소의
실제 동작을 별도 검증해야 한다.

## 남은 위험과 근거

unpause 직후 MySQL에 클라이언트가 포기한 쿼리나 세션이 남았는지는 이 실행의
집계 지표로 확인하지 못했다. 실행 전후 조회수 총량에는 양의 결손이 보이지
않지만, 다른 쓰기와 샘플 경계가 섞여 개별 쓰기의 지연 커밋·중복을 판정할
수 없다. 복구 중 `processlist`, 실행 중 쿼리, 잠금 대기와 요청별 쓰기 ID를
수집해야 한다.

- freeze: [report.html](../resilience/reports/mysql-freeze-2026-09-22T08-19-21/report.html) · [run.json](../resilience/reports/mysql-freeze-2026-09-22T08-19-21/run.json)
- crash 대조: [report.html](../resilience/reports/mysql-crash-2026-09-22T07-57-12/report.html) · [run.json](../resilience/reports/mysql-crash-2026-09-22T07-57-12/run.json)
- 계획: [mysql-freeze.json](../resilience/faults/mysql-freeze.json)
- 설정 의미: [HikariCP 설정](https://github.com/brettwooldridge/HikariCP#frequently-used), [MySQL Connector/J 네트워크 설정](https://dev.mysql.com/doc/connector-j/en/connector-j-connp-props-networking.html)
