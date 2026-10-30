# 장애 주입 실험

장애 주입기는 Redis와 MySQL이 죽거나 느려지거나 응답이 유실될 때, 실패가 어디까지 퍼지고 언제
회복하는지 측정한다. 실행 중 의존성을 실제로 중단하므로 로컬 성능 환경에서만 사용한다.
여기서 확인한 문제는 [사례 색인](../cases/README.md)에 사례 문서로 남는다.

## 주입 종류

계획 파일은 [faults/](faults/)에 있다. 파일마다 실험이 답하려는 질문(`question`)을 먼저 적는다.

| 계획 | 대상 | 주입 방식 |
|---|---|---|
| `redis-crash`, `redis-crash-breakpoint` | Redis | 컨테이너 정지(`docker stop`) 뒤 재시작. breakpoint는 정지 상태에서 도착률을 단계적으로 올림 |
| `redis-hang` | Redis | Toxiproxy `timeout` toxic. 연결은 유지하고 응답만 막음 |
| `redis-slow` | Redis | Toxiproxy `latency` toxic, 50ms ± 10ms |
| `mysql-crash` | MySQL | 컨테이너 정지 뒤 재시작 |
| `mysql-freeze` | MySQL | 컨테이너 일시 정지(`docker pause`) |
| `mysql-hang` | MySQL | Toxiproxy `timeout` toxic |
| `mysql-slow` | MySQL | Toxiproxy `latency` toxic, 300ms ± 50ms |
| `retry-storm` | 앱 응답 경로 | Toxiproxy로 연결의 30%에서 응답을 끊고 클라이언트가 한 번 재시도 |
| `retry-storm-baseline` | 앱 응답 경로 | `retry-storm`과 같고 toxic 비율만 0. 판정 도구 자체를 확인 |
| `smoke` | Redis | 도구 동작 확인용. 결과를 판단에 쓰지 않음 |

## 실행

명령은 `performance/`에서 실행한다. 일반 부하 실험의 스택과 데이터셋이 준비돼 있어야 한다
([성능·장애 실험](../README.md)의 준비 절차).

1. 계획 파일의 `requires.proxy`가 true인 계획은 fault overlay를 먼저 띄운다. 대상은 mysql-crash,
   mysql-freeze, mysql-hang, mysql-slow, redis-hang, redis-slow, retry-storm, retry-storm-baseline이다.
   overlay를 띄우면 앱이 Toxiproxy를 거쳐 MySQL·Redis에 연결된다. redis-crash, redis-crash-breakpoint,
   smoke는 필요 없다.

   ```bash
   docker compose \
     -f environment/docker-compose.perf.yml \
     -f environment/docker-compose.fault.yml \
     --env-file environment/.env.perf up -d
   ```

2. 사전 점검만 돌린다. `--dry-run`은 앱 헬스와 Prometheus 연결을 확인하고, Toxiproxy를 쓰는 계획에서는
   프록시 경유 여부를 확인한 뒤 남아 있는 Toxiproxy 장애 설정을 초기화한다. k6 실행과 보고서 생성만
   생략하므로 스택이 떠 있어야 한다.

   ```bash
   node resilience/fault-run.js resilience/faults/mysql-slow.json --dry-run
   ```

3. 실행한다.

   ```bash
   node resilience/fault-run.js resilience/faults/mysql-slow.json --note "변경 전"
   ```

4. 실험이 끝나면 overlay를 걷는다. overlay를 둔 채 일반 부하 실행(`perf-run.js`)이나 overlay가 필요 없는
   계획을 돌리면 Toxiproxy 경유 구간이 측정에 섞이고, 도구는 이를 막지 않는다. 아래 명령은 앱을 MySQL·Redis
   직접 연결로 되돌리고 Toxiproxy 컨테이너를 지운다.

   ```bash
   docker compose -f environment/docker-compose.perf.yml \
     --env-file environment/.env.perf up -d --remove-orphans
   ```

응답 경로에 장애를 거는 계획(`retry-storm`)은 `BASE_URL`을 앱 앞 프록시 주소로 바꿔서 실행한다.
기본값은 앱을 직접 가리키므로 장애 설정이 요청에 닿지 않는다.

```bash
BASE_URL=http://localhost:18081 \
  node resilience/fault-run.js resilience/faults/retry-storm.json --note "멱등 전환 전"
```

포트는 `TOXIPROXY_APP_HOST_PORT`(기본 18081)다. 주소를 바꾸지 않으면 사전 점검이 실행을 멈춘다.
앱에 직접 연결하면 재시도가 한 건도 생기지 않아 결함이 없는 것처럼 보이기 때문이다.

`retry-storm`을 돌리기 전에 `retry-storm-baseline`을 한 번 돌린다. 둘은 Toxiproxy 설정의 `toxicity`
하나만 다르다(0과 0.3). 기준선에서 액션별 의도 수와 DB 행 증가분이 다르면 판정 도구나 프록시 경로를
먼저 의심한다. 이 확인 없이 본 실행을 돌리면 도구 문제를 앱 결함으로 읽게 된다.
2026-10-13 기준선에서는 게시글 작성에 재시도 1건이 생겨 증가분이 의도보다 1 많았다. 이 기록과
해석은 [응답 유실 재시도 사례](../cases/retry-after-lost-response.md)에 있다.

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
run.json         실행 신원, 구간, 주입 시각, 지표와 불변식
k6.json          k6 원본 출력
k6.summary.txt   k6 종료 요약(액션별 의도·재시도 수 등)
report.html      run.json을 렌더링한 화면
```

저장된 원자료는 다시 렌더링할 수 있다. 실행 ID를 빼면 전체를 다시 렌더링한다.

```bash
node resilience/render-report.js <runId>
```

결과는 실행 신원, 주입 성공, pre/fault/post 오류와 지연, timeout 군집, 기능별 영향,
HikariCP와 Tomcat 시계열, health, 데이터 불변식 순서로 읽는다. health poll timeout은 제한
시간 안에 응답하지 못했다는 관측이고, 앱이 DOWN을 응답했다는 뜻으로 읽지 않는다.

측정 해석은 [측정 방법](../METHOD.md), 실험별 결론은 [사례 색인](../cases/README.md)에서 다룬다.
