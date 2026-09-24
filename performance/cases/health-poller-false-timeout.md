# 장애 실험의 헬스 폴러가 성공 가능한 요청을 TIMEOUT으로 기록한 사례

> 상태: fixed — 요청 단위 마감과 소켓 재사용 중단 뒤 재실행에서 재현되지 않음
> 영향도: medium — 과거 Redis 장애 실행의 헬스 무응답 횟수를 과장할 수 있음
> 변경 전 실행: `redis-crash-2026-09-22T07-21-15`
> 변경 후 실행: `redis-crash-2026-09-22T07-33-59`

## 요약

readiness 분리 직후 첫 장애 실행에서 폴러의 전체 51개 표본 중 22개가
`timeout after 4000ms`로 기록됐다. 그러나 이 표본의 계측 소요 시간은
0~2ms였다. 헬스 요청에 4초가 걸린 것이 아니라 폴러가 실패를 잘못 분류했다.
HTTP 클라이언트의 타임아웃을 요청 단위 마감으로 바꾸고 소켓 재사용을 끈 뒤,
동일 계획의 재실행에서 52개 표본 모두 UP, 기록된 TIMEOUT은 0개였다.

## 문제 개요와 재현 조건

두 실행은 같은 `redis-crash.json`, 60/s, warm 캐시, HikariCP 최대 60,
같은 데이터셋 지문과 같은 앱 이미지로 진행했다. 폴러 경로는 둘 다
`/actuator/health/readiness`였다. Redis 중단·복구 주입은 성공했다.
변경 대상은 앱이 아닌 `performance/resilience/lib/http.js`의 폴러 요청 방식이다.

| 실행 | 전체 헬스 표본 | UP | 거짓 TIMEOUT 기록 |
|---|---:|---:|---:|
| 변경 전 | 51 | 29 | 22 |
| 변경 후 | 52 | 52 | 0 |

표본 수 51과 52의 차이는 폴링 시작·구간 경계의 차이다. fault 구간만 보면
변경 전은 UP 6·TIMEOUT 4, 변경 후는 UP 11·TIMEOUT 0이다. HTTP p95나
오류율은 이 도구 변경의 효과를 판단하는 지표가 아니며 실행 간 변동도 있었다.

## 원인과 확인 범위

기존 `req.setTimeout(4000)`은 요청 전체의 마감이 아니라 소켓 유휴
타임아웃이었다. 폴링 간격 5초가 이보다 길고 Node 기본 agent가 소켓을
재사용했다. 직전 요청의 유휴 타이머가 남은 소켓을 다음 요청이 잡으면 바로
타임아웃으로 끝날 수 있다. 4초 timeout이라고 적힌 표본이 0~2ms 만에
끝난 사실과 이 코드 경로가 직접 맞는다.

요청마다 `setTimeout` 마감을 만들고 완료 시 해제하며 `agent: false`로
재사용을 막았다. 같은 앱·계획의 재실행에서 거짓 TIMEOUT이 사라진 결과는
이 원인을 **지지**한다. 실제 느린 서버 응답이 함께 있었는지를 변경 전
TIMEOUT 표본만으로 복원할 수는 없다. 수정 후에도 4초보다 짧은 소요로
TIMEOUT이 다시 기록되면 이 설명을 재검토한다.

## 남은 위험과 후속 조치

수정 전 모든 장애 실행의 폴러 TIMEOUT 수는 실제 서버 무응답 수로 그대로
쓰지 않는다. 특히 [Redis 전파 Case](redis-failure-cascade.md)의 변경 전
12/12 TIMEOUT은 별도의 요청 지연·풀 계측과 함께 해석한다. 반면 정상적으로
받은 DOWN/UP 응답이 이 결함 때문에 반대로 바뀌었다는 근거는 없다.
같은 수정 전 폴러를 사용한 9월 21일 `mysql-slow`·`mysql-hang`·`mysql-crash`
실행의 TIMEOUT 표본도 이 제한을 받는다. MySQL 장애의 실제 HTTP 실패와
DOWN 응답은 각 실행의 상태 코드·요청 지연과 함께 판단한다.

## 근거

- 변경 전: [report.html](../resilience/reports/redis-crash-2026-09-22T07-21-15/report.html) · [run.json](../resilience/reports/redis-crash-2026-09-22T07-21-15/run.json)
- 변경 후: [report.html](../resilience/reports/redis-crash-2026-09-22T07-33-59/report.html) · [run.json](../resilience/reports/redis-crash-2026-09-22T07-33-59/run.json)
- 수정 코드: `performance/resilience/lib/http.js` (commit `8cfa5c49`)
