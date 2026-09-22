# Resilience testing

장애 주입기는 Redis와 MySQL이 죽거나 느려질 때 실패 범위와 회복 시간을 측정한다. 실행 중
의존성을 실제로 중단할 수 있으므로 로컬 성능 환경에서만 사용한다.

## 실행

계획을 먼저 검증한다.

```bash
node resilience/fault-run.js resilience/faults/redis-crash.json --dry-run
```

검증된 계획을 실행한다.

```bash
node resilience/fault-run.js resilience/faults/redis-crash.json \
  --note "변경 전"
```

Toxiproxy 계획은 fault overlay를 함께 기동한다.

```bash
docker compose \
  -f environment/docker-compose.perf.yml \
  -f environment/docker-compose.fault.yml \
  --env-file environment/.env.perf up -d
```

## 안전 조건

- 주입 대상이 성능 환경의 컨테이너인지 확인한다.
- 앱이 실제로 프록시 또는 중단 대상 Redis에 연결됐는지 확인한다.
- 계획 JSON의 pre, fault, post 시간과 복구 동작을 검토한다.
- 정상 종료, 실패, Ctrl+C 뒤 컨테이너와 toxic 상태를 직접 확인한다.
- Redis 데이터 불변식을 측정할 때는 이전 캐시와 중복 조회 키의 영향을 제거한다.
- 실행 중 생성된 `run.json`, `k6.json`, `report.html`을 수정하지 않는다.

## 결과

`resilience/reports/<runId>/`에 원자료와 HTML이 생성된다.

```text
run.json      실행 신원, 구간, 주입 시각, 지표와 불변식
k6.json       k6 원본 출력
report.html   run.json을 렌더링한 화면
```

저장된 원자료는 다시 렌더링할 수 있다.

```bash
node resilience/render-report.js <runId>
```

결과는 실행 신원, 주입 성공, pre/fault/post 오류와 지연, timeout 군집, 기능별 영향,
HikariCP와 Tomcat 시계열, health, 데이터 불변식 순서로 읽는다. health poll timeout은 앱이
DOWN을 응답했다는 뜻이 아니라 제한 시간 안에 응답하지 못했다는 관측이다.

측정 해석은 [METHOD.md](../METHOD.md), 현재 Redis 장애 결론은
[redis-failure-cascade.md](../cases/redis-failure-cascade.md)가 소유한다.
