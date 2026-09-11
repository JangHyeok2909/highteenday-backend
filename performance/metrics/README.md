# Metrics

지표는 “느리다”를 확인하는 값과 “왜 느린가”를 설명하는 값을 구분한다.

## 판정 지표

- 요청 p95, p99, 평균
- 오류율과 check 성공률
- RPS와 완료 iteration
- timeout 또는 dropped iteration

## 원인 지표

| 계층 | 우선 확인할 값 |
|---|---|
| 부하 발생기 | CPU throttling, dropped iteration |
| 애플리케이션 | CPU, heap, GC pause, JVM thread state |
| 요청 처리 | Tomcat busy/max |
| DB 풀 | Hikari active/max, pending, acquire p95, timeout |
| MySQL | QPS, threads running, slow query, lock wait, rows read |
| Redis | ops/s, hit ratio, memory, eviction, blocked client |

수집 가능한 전체 지표와 PromQL은 `tools/lib/metrics-catalog.js`가 정본이다. 회귀 판정에
사용하는 항목과 임계값은 `regression/rules.json`에서 관리한다.

## 읽는 순서

1. 실행 조건과 측정 무결성을 확인한다.
2. 오류율과 timeout 검열 여부를 확인한다.
3. p95가 어느 구간에서 변했는지 본다.
4. 같은 시간축에서 먼저 한계에 닿은 자원을 찾는다.
5. 기능 또는 엔드포인트별로 영향 범위를 좁힌다.
6. 코드·로그·대조 실험으로 원인 고리를 확인한다.

상관 지표만으로 원인을 확정하지 않는다. 자세한 규칙은
[measurement contract](../reference/measurement-contract.md)를 따른다.
