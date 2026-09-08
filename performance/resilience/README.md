# Resilience — 장애 관측 실험

**"이 의존성이 죽으면/멈추면/느려지면 무엇이 어떻게 깨지는가, 그래서 무엇을 고칠 것인가"**
에 실측으로 답하는 도구. 성능 회귀 판정(`../regression/`)과는 **다른 질문**이라 판정 체계를
공유하지 않는다. 배관(부하 발생기·Prometheus·지표 카탈로그·보고서 생성)만 빌려 쓴다.

## 무엇이 다른가 — 성능 측정과의 경계

| | 성능 측정 (`tools/perf-run.js`) | 장애 관측 (`resilience/fault-run.js`) |
|---|---|---|
| 질문 | 어제보다 느려졌는가 | 이 장애에서 무엇이 어떻게 깨지는가 |
| 기준 | 조건이 같은 **다른 실행**(기준선 자동 선택) | **같은 실행의 장애 전 구간(pre)** |
| 판정 | `rules.json` → PASS/WARN/FAIL, exit code 게이트 | **없다.** 계획의 가설(`expect`) 옆에 관측을 사람이 적는다 |
| 저장소 | `reports/runs/` + `reports/index.json` | `resilience/reports/<runId>/` — 성능 이력에 섞이지 않는다 |
| 부하 | 시나리오마다 다름 | open model, 세 구간 같은 도착률 (`RATE=4` 가 비포화 운용점) |
| 환경 | perf compose | perf compose + **toxiproxy 오버레이** (프록시 홉이 하나 더 있어 성능 수치와 비교 불가) |

**왜 회귀 게이트로 만들지 않았나.** 장애 실험은 판정 기준을 미리 정할 수 없다. "Redis 가 멈추면
오류율이 몇 % 여야 정상인가"는 실험을 돌려 보기 전에는 모르고, 규칙을 먼저 박으면 규칙이 맞는지부터
검증해야 하는데 그 검증이 곧 이 실험이다. 게다가 장애 실행은 정의상 포화·오류율 초과를 만들므로
절대 게이트가 매번 FAIL 을 내고, 그 FAIL 은 정보가 아니라 소음이다. 고친 뒤 재실행은 한다 — 회귀
게이트가 아니라 **실험의 After** 로. 같은 계획 파일로 다시 돌려 두 보고서를 사람이 나란히 놓는다.
설정이 되돌아가는 것을 막고 싶다면 부하 실험이 아니라 프로퍼티 존재를 확인하는 단위 테스트가 싸다.

## 구성

```
resilience/
├── faults/               장애 계획 — JSON 하나 = 실험 하나 (절차 + 가설)
│   ├── redis-crash.json    Redis 프로세스 정지·재시작 (docker)        → 폴백 동작, 복구 뒤 빈 캐시
│   ├── redis-hang.json     Redis 응답 없음 (toxiproxy timeout)       → Lettuce 기본 60초 타임아웃의 결과
│   ├── mysql-slow.json     MySQL +300ms (toxiproxy latency)          → 커넥션 풀 포화, 폭발 반경
│   ├── mysql-hang.json     MySQL 응답 없음 (toxiproxy timeout)       → 30초 대기 후 500
│   └── smoke.json          배관 확인용 80초
├── scenarios/fault-window.js   k6 부하 — pre/fault/post 같은 도착률, 기능×구간·실패지연 집계 축
├── fault-run.js          실행기
├── lib/
│   ├── plan.js             계획 검증·주입 시각·구간 창·phase 이름 되돌리기 (순수, 테스트 대상)
│   ├── driver.js           정해진 시각에 주입, 어떤 경우에도 원상복구
│   ├── toxiproxy.js        toxiproxy HTTP API
│   ├── docker.js           docker stop/start/pause/kill + pumba
│   ├── health.js           /actuator/health 폴러
│   ├── http.js             Node 16 용 작은 HTTP 클라이언트
│   └── report.js           관측 보고서 (판정 없음)
├── test/                 node:test — tools/test/all.js 가 함께 실행한다
└── reports/<runId>/      run.json · k6.json · report.html   (staging/ 은 k6 임시 출력)
```

## 실행

```bash
# 0. (toxiproxy 를 쓰는 계획만) 오버레이로 스택을 올린다 — app 이 프록시를 거치도록 재생성된다
docker compose -f environment/docker-compose.perf.yml -f environment/docker-compose.fault.yml \
  --env-file environment/.env.perf up -d

# 1. 배관 확인 (80초, docker pause 만 쓴다 — 프록시 불필요)
node resilience/fault-run.js resilience/faults/smoke.json

# 2. 계획 검증·사전 점검·주입 일정만 (아무것도 안 건드린다)
node resilience/fault-run.js resilience/faults/redis-hang.json --dry-run

# 3. 실험 (pre 300s / fault 120s / post 300s ≈ 12분)
node resilience/fault-run.js resilience/faults/redis-hang.json --note "타임아웃 설정 전"

# 4. 고친 뒤 같은 계획으로 다시
node resilience/fault-run.js resilience/faults/redis-hang.json --note "spring.data.redis.timeout=200ms"

# 원복 — 오버레이 없이 up 하면 app 이 원래 환경변수로 재생성된다
docker compose -f environment/docker-compose.perf.yml --env-file environment/.env.perf up -d
```

Windows 에서 k6 shim 이 막히면 `K6_BIN` 으로 실제 실행 파일을 지정한다(`tools/README.md` 와 같다).

**실행기가 확인하는 것.** toxiproxy 를 쓰는 계획인데 앱이 프록시를 거치지 않으면(`docker inspect`
의 `DB_URL`) 시작하지 않는다 — toxic 을 걸어도 앱에 닿지 않는 실험은 실험이 아니다. 남아 있던
toxic 은 실행 전에 reset 한다. pre 구간은 toxic 이 없는 상태여야 기준이 된다.

**원상복구.** 정상 종료·Ctrl+C·예외 어느 경로로 끝나도 계획에 등장한 프록시의 toxic 을 걷고
컨테이너를 running 으로 되돌린다(`lib/driver.js cleanup`). 그래도 실험 뒤에는 `docker ps` 로
한 번 본다.

## 계획 파일

```json
{
  "id": "redis-hang",
  "question": "Redis 가 응답 없이 멈추면 어떻게 되나",
  "requires": { "proxy": true },
  "load": { "rate": 4, "preVus": 100, "maxVus": 1000 },
  "phases": { "preSec": 300, "faultSec": 120, "postSec": 300 },
  "inject": [
    { "at": "fault.start", "tool": "toxiproxy", "action": "add", "proxy": "redis",
      "toxic": { "name": "hang", "type": "timeout", "stream": "downstream", "toxicity": 1.0, "attributes": { "timeout": 0 } } },
    { "at": "fault.end", "tool": "toxiproxy", "action": "remove", "proxy": "redis", "toxicName": "hang" }
  ],
  "expect": ["모든 Redis 호출이 60초 대기한다", "..."],
  "watch": ["pool.tomcatBusy", "http.failedLatency"]
}
```

- `at`: `fault.start` · `fault.end` · `run.start` · `run.end`, 거기에 `+N`/`-N` 초, 또는 숫자(실행 시작 기준 초)
- `tool`: `toxiproxy`(add/remove/enable/disable) · `docker`(stop/start/pause/unpause/kill/restart) · `pumba`(`args` 배열) · `shell`(`argv` 배열)
- `expect`: 가설. 비어 있으면 실행기가 거부한다 — 가설 없는 실험은 관측이 아니라 구경이다
- `watch`: 보고서에서 먼저 볼 지표 이름. 정보용

## 보고서가 보여 주는 것

1. 가설 목록과 "관측:" 빈칸 — **실행 뒤 사람이 채운다**
2. 시간축 — RPS·오류율·p95·Tomcat busy·Hikari pending/active·MySQL threads_running 위에 주입 시각과 fault 구간
3. 구간별 요약(k6) + `dropped_iterations`(도착률을 못 지킨 횟수 — 장애 중 VU 부족의 신호)
4. **실패 응답의 지연 분포** — 즉시 실패인가, 30,001ms(HikariCP)·60,001ms(Lettuce/k6) 뒤 실패인가
5. **폭발 반경** — 기능 × 구간의 요청·p95·오류율. 장애 의존성을 안 쓰는 기능이 같이 죽는지
6. 인프라 지표 구간별 — `tools/lib/metrics-catalog.js` 의 pool·cpu·mysql·redis·k6ts 그룹 그대로
7. 헬스체크 전이 — 앱은 응답 중인데 DOWN(503) 인 구간이 있는가
8. 주입 기록(계획 시각 vs 실제 시각), 환경(프록시 경유 여부·Hikari 크기·앱 이미지), 같은 계획의 다른 실행 링크

## 부하·구간 설계의 근거

- **open model, RATE=4.** 기존 `scenarios/failover.js` 는 150 VU closed model 이라 포화(200 VU 에서
  p95 10초)와 장애가 섞인다. 도착률을 고정하면 장애만 변수가 되고, 시스템이 못 따라오면
  `dropped_iterations` 로 드러난다.
- **phase 이름.** k6 스크립트는 공유 phase 기계(warmup/measure/rampdown)를 빌려 쓰고 실행기가
  pre/fault/post 로 되돌린다. `k6.json` 원본에는 k6 이름이 그대로 남는다.
- **t0.** k6 `setup()` 이 실행기의 로컬 HTTP 서버에 신호를 보내 그 시각을 기준으로 주입 타이머를
  건다. 신호가 없으면 spawn 시각으로 폴백하고 보고서에 경고를 남긴다.

## 관련 문서

- 왜 이 실험들인가, 면접 질문과의 대응: `localDocs/career/daangn/resilience-scenarios.md` (비공개)
- 실험 기록: `../experiments/EXP-007-…` 부터. 원자료는 이 디렉터리의 `reports/` 를 가리킨다
- 발견한 결함은 `docs/KNOWN-ISSUES.md` 의 KI 로 — "Redis 가 멈추면 전면 장애"는 느린 것이 아니라 **틀린 것**이다
