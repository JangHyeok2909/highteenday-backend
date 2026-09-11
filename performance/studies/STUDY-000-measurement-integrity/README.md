# STUDY-000: 부하 발생기 위치가 측정에 주는 영향

> 상태: `incomplete`
> 최초 실행: 2026-08-11
> 원래 질문: Windows에서 실행한 k6를 Docker로 옮기면 반복성과 관측 가능성이 좋아지는가

## 현재 결론

Before만 실행했고 사전 등록한 After 실험을 완료하지 않았다. 따라서 Docker 부하기가
반복성을 높였다는 Before/After 결론은 없다.

확인된 사실은 두 실행 방식의 네트워크 경로와 관측 범위가 다르다는 점이다. Windows에서
직접 실행한 k6는 cAdvisor가 수집하지 못하고 `localhost:18080` 경로를 사용한다. Docker의
k6는 컨테이너 자원 지표를 남기며 `app:8080`으로 접근한다. 두 방식은 같은 비교 계열로
섞으면 안 된다.

## Before 관측

- 조건: VU 20, 90초, 10회, 환경 `perf-mi-before`
- HTTP 오류율 0%, check 성공률 100%
- p95 평균 277.3ms, CV 108.77%, 범위 110.1~1,052.4ms
- p90 CV 2.73%, p99 CV 6.81%

p95만 불안정한 것은 지연 분포의 두 집단 사이에 p95 경계가 놓인 결과로 해석할 수 있다.
기존 자료는 로그인과 이 경계를 연결하지만 BCrypt 실행 시간이나 동시 실행 수를 직접
계측하지 않았으므로 원인 확정에는 사용하지 않는다.

## 판정

| 가설 | 판정 | 이유 |
|---|---|---|
| Docker 부하기가 p95 반복성을 개선함 | 판정 불가 | After 미실행 |
| 두 부하기 위치를 동일 조건으로 비교할 수 있음 | 기각 | 경로와 관측 범위가 다름 |
| Windows 로컬 부하기 자원도 충분히 관측됨 | 기각 | 수집기가 해당 프로세스를 보지 못함 |

## 후속 작업

이 Study를 재개한다면 현재 코드로 Before와 After를 모두 새로 실행한다. 과거 Before에 새
After만 붙이지 않는다.

## 원자료

- 반복 세트: `reports/repeatability/perf-mi-before-2026-08-11T03-38-11.json`
- 이전 원문: [legacy EXP-000](../../archive/legacy-docs/2026-09-11/experiments/EXP-000-measurement-integrity/README.md)

