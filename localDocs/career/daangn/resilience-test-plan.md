# 회복탄력성 관측 실험 구상 — "장애 시 어떻게 되나요"에 실측으로 답하기

> 만든 날: 2026-09-08 · 대상: **당근 Feed Infra 직무 면접 대비**
> 짝 문서: [daangn-feed-infra.md](daangn-feed-infra.md) 6.3 "보강 대상 1(타임아웃·폴백·부분 실패)",
> [video-interview-guide.md](video-interview-guide.md) 카드 3 꼬리 3, 3.7 절,
> 포트폴리오 10.3 절(그림 9 "의존성 장애 시 반환값")
> 성격: **구상.** 코드는 아직 없다. 각 실험의 "예상"은 코드를 읽고 세운 가설이며 실측으로 뒤집힐 수 있다.

---

## 0. 결론 — 다섯 문장

1. 현재 저장소는 "Redis가 **죽으면**" 만 방어하고 있고, "Redis가 **멈추면**(응답 없이 매달림)"
   은 방어가 없다. Lettuce 명령 타임아웃 기본값 60초 때문에 요청 스레드가 60초씩 묶여 전면
   장애로 번질 가능성이 크다. 이것이 가장 먼저 겪어 볼 실험이다.
2. 레벨(컴포넌트 → 네트워크 → 리소스 → 트래픽 → 복합)로 나누는 것보다, **"장애 형태 × 확인할
   보장"** 두 축의 표로 짜는 편이 낫다. 면접관은 레벨 순서로 묻지 않고 의존성 하나를 골라
   "그게 죽으면요?"라고 묻는다. 답은 표의 한 칸이다.
3. 복합 카오스는 레벨의 꼭대기가 아니라 **순서 실험(장애 → 복구)** 으로 바꾼다. 놀라운 결과는
   장애 중이 아니라 복구 직후(스탬피드, 준안정 상태)에 나온다.
4. **성능 측정과 분리한다.** 장애 실험은 회귀 판정이 아니라 관측이다. 기준선 선택·상대 비교·
   PASS/FAIL 게이트는 쓰지 않고, 부하 발생기·Prometheus·지표 카탈로그·보고서 생성만 빌려 쓴다.
   기준은 다른 실행이 아니라 **같은 실행의 장애 전 구간(pre)** 이다. (3장, 2026-09-08 개정)
5. 주입은 스크립트가 아니라 **toxiproxy(연결 경로)와 pumba(컨테이너)** 로 한다. "MySQL을
   느리게"는 코드로 못 만들지만 toxiproxy의 latency toxic 한 줄로 만든다.
6. 면접 전(9/14)까지 할 것은 실험 다섯 개다. R-01·R-02(한 저녁), R-03(한 저녁), R-04(R-01에
   붙어 옴), R-05(한 시간). R-08은 KI-54 구현(9/11~13) 뒤에 붙인다.

---

## 1. 지금 무엇이 있고 무엇이 없는가 — 사실

### 1.1 있는 것

| 자산 | 위치 | 상태 |
|---|---|---|
| Redis 장애 격리 두 층 | `aop/ResilientRedisAspect.java`, `docs/crosscutting/redis.md` | `DataAccessException`만 잡아 기본값 반환. 목록·건수·토큰·인기글은 DB 폴백 |
| 조회수 정산의 실패 격리 | `schedulers/ViewCountScheduler.java` | 성공분만 `DECRBY`, 실패분은 다음 주기 재시도 |
| 장애 주입 시나리오 | `performance/scenarios/failover.js`, `chaos.js` | **진단 전용.** 150 VU·100 VU 고정, phase 없음, 주입 시각은 사람이 벽시계로 맞춤, threshold `rate<1`(기록용) |
| 주입 도구 | `performance/tools/chaos-redis-flap.sh`, `chaos-cpu-squeeze.sh` | Redis stop/start 반복, `docker update --cpus` |
| 회귀 판정 체계 | `tools/lib/conditions.js`, `regression/rules.json`, `saturation.js` | 선언 조건만 비교 기준, 포화 실행은 상대 비교 제외 |
| 실패 모드 그림 | 포트폴리오 10.3 그림 9 | Redis 두 층 / MySQL 방어 없음(풀 10·30초) / NEIS 예외 삼킴 / 클라이언트 재시도가 토글 뒤집음 |

### 1.2 없는 것 (코드·설정에서 직접 확인)

| 항목 | 확인 방법 | 결과 |
|---|---|---|
| Redis 명령 타임아웃 | `grep spring.data.redis.timeout src/main/resources/` | **없음** → Lettuce 기본 60초 |
| Redis 연결 타임아웃 | `spring.data.redis.connect-timeout` | **없음** → 기본 10초 |
| HikariCP 획득 타임아웃·풀 크기 | `grep hikari src/main/resources/` | **없음** → 기본 30초·10개 |
| 헬스 지표 구성 | `grep management.health src/main/resources/` | **없음** → Redis·DB 인디케이터가 기본 활성 |
| 장애 실행의 별도 저장소 | `performance/reports/` 외 | **없음.** failover 실행이 성능 이력 `index.json`에 같이 들어간다 |
| 장애 전·중·후 구간 집계 | `failover.js`·`chaos.js` | **없음.** phase 없이 전체 구간 단일 집계 |
| 연결 경로 장애 주입 | 도구 없음 | **없음.** slow·hang을 만들 수단이 `docker pause`뿐 |
| 실행 뒤 데이터 대조 | 도구 없음 | 데이터셋 검증기(불일치 13,284건 발견)는 있으나 실행 뒤 자동 실행 경로 없음 |

### 1.3 perf 환경의 Redis는 재시작하면 비어 있다

`performance/environment/redis/redis-perf.conf`: `save ""`, `appendonly no`, `maxmemory 384mb`,
`maxmemory-policy allkeys-lru`. 즉 `docker stop/start`는 **전체 키 소실**을 뜻한다. 조회수 버퍼
`post:views:*`(TTL 없음)도 함께 사라진다. 이 사실이 R-04(복구 직후)와 R-07(메모리 압박)의 전제다.
prod Redis의 정책은 저장소에 없다(`redis.md` 말미 `[미확인]`).

### 1.4 기존 failover.js의 문제 — 포화와 장애가 섞인다

`failover.js`는 150 VU 고정(closed model)이다. 포트폴리오 6장의 실측으로 200 VU에서 p95 10초,
초당 5건에서 이미 포화(도달률 77%)다. 150 VU는 포화 근처이므로 **장애 효과와 포화 효과를 가를 수
없다.** 포화 분류기가 그 실행을 SATURATED로 판정해 상대 비교에서 빼 버릴 것이다. 회복탄력성
실험은 확립된 비포화 운용점(**open model, `RATE=4`**)에서 돌려야 장애만 변수가 된다. 이것은 이
저장소 자체의 규칙("한 번에 변수 하나")을 적용한 결과다.

---

## 2. 분류 축 — 레벨 사다리 대신 2축 표

### 2.1 제안한 5레벨의 문제

| 레벨 | 문제 |
|---|---|
| 컴포넌트 실패 vs 네트워크 실패 | 앱 입장에서 둘은 같은 것으로 보인다. Redis 프로세스가 죽든 네트워크가 끊기든 앱이 보는 것은 "연결 거부 / 응답 없음 / 느림" 셋 중 하나다. 구분해야 할 것은 원인이 아니라 **앱이 관측하는 형태**다 |
| 리소스 고갈 | 결과가 대개 위 셋 중 "느림"으로 나타난다. 별도 레벨이 아니라 "느림"을 만드는 방법 하나다 |
| 트래픽 폭증 | 이미 `spike.js`·포화 분류가 있다. 회복탄력성 질문은 "정점을 버티나"가 아니라 "**부하가 빠진 뒤 돌아오나**"다 |
| 복합 카오스 | 두 변수를 같이 바꾸면 어느 쪽 효과인지 모른다. 면접에서 2분 안에 설명할 수 없는 결과가 나온다 |

레벨은 순서를 암시한다. 그런데 면접에서 가장 가치 있는 답은 가장 단순한 실험(Redis 정지 하나)에서
나온다. 사다리를 오르는 구조는 그 답을 뒤로 미룬다.

### 2.2 대안 — 장애 형태 × 확인할 보장

**축 1. 앱이 관측하는 장애 형태** (원인이 아니라 형태로 나눈다)

| 형태 | 뜻 | 주입 방법 |
|---|---|---|
| **crash** | 즉시 오류. 연결 거부 | pumba `stop`/`kill`, 또는 toxiproxy 프록시 disable |
| **hang** | 응답 없음. 타임아웃까지 대기 | toxiproxy `timeout` toxic (의존성은 멀쩡, 앱만 못 받음). 의존성 자체를 멈추려면 pumba `pause` |
| **slow** | 응답은 오나 느림 | toxiproxy `latency` toxic, pumba `stress`(CPU 압박) |
| **wrong** | 응답은 오나 내용이 틀림 | 재시작으로 비운 캐시, 메모리 압박으로 축출된 키 |
| **recover** | 위 상태에서 정상으로 복귀 | toxic 제거, pumba `--restart` |

**축 2. 확인할 보장** (면접관이 실제로 묻는 것)

| 보장 | 질문 형태 | 재는 것 |
|---|---|---|
| **폭발 반경** | "그게 죽으면 어떤 기능이 죽나요" | 엔드포인트별 오류율·p95. Redis를 안 쓰는 엔드포인트가 같이 죽는지 |
| **실패 지연** | "사용자는 얼마나 기다리나요" | 실패 응답까지의 시간. 즉시 실패 vs 30초/60초 |
| **데이터 결과** | "장애 중 데이터는요" | 유실 / 중복 / 오래된 값 / 불일치. 실행 뒤 대조로 잰다 |
| **복구** | "살아나면 바로 정상인가요" | 기준 p95로 돌아오는 시간(RTO). 돌아오지 않는 준안정 상태 여부 |
| **관측 정직성** | "그걸 어떻게 알아채나요" | 헬스체크가 사실을 말하는가. "없는 날"과 "못 가져옴"이 구분되는가 |

실험 하나는 표의 **한 열(형태) × 한 의존성**이고, 결과는 **다섯 행(보장) 각각의 값**이다.
"복합"은 형태 두 개를 시간 순서로 잇는 것(hang → recover)으로만 쓴다.

---

## 3. 관측 체계 — 성능 측정과 분리하되 배관은 빌려 쓴다

> 2026-09-08 개정. 초판은 장애 계획을 `conditions.js` 조건으로 넣고 `rules.json`에 구간별
> 판정 규칙을 두어 **회귀 게이트**로 만들려 했다. 버렸다. 이유는 3.1.

### 3.1 왜 회귀 판정이 아니라 관측인가

성능 측정 체계는 "어제보다 느려졌는가"에 자동으로 답하는 장치다. 그래서 기준선 자동 선택,
조건 비교, PASS/FAIL 게이트가 있다. 장애 실험은 질문이 다르다. **"이 장애에서 무엇이 어떻게
깨지는가, 그래서 무엇을 고칠 것인가."** 답은 숫자 하나가 아니라 시간축 위의 거동이고, 판정
기준은 실험을 돌려 보기 전에는 정할 수 없다. 규칙을 미리 박으면 규칙이 맞는지부터 검증해야
하는데, 그 검증이 곧 이 실험이다.

성능 이력과 섞으면 생기는 구체적인 피해도 있다.

- toxiproxy를 끼우면 앱→DB 경로에 홉이 하나 늘어 지연 자체가 달라진다. 성능 기준선과
  비교할 수 없는 실행이 `index.json`에 들어가 기준선 후보를 오염시킨다
- 장애 실행은 정의상 포화·오류율 초과를 만든다. 절대 게이트가 매번 FAIL을 내고, 그 FAIL은
  정보가 아니라 소음이다

그래서 **기준은 다른 실행이 아니라 같은 실행 안의 장애 전 구간(pre)** 이다. 비교 대상이 실행
안에 있으므로 조건 비교도 기준선 선택도 필요 없다.

고친 뒤 재실행은 한다. 다만 회귀 게이트가 아니라 **실험의 After**다. 같은 장애 계획으로 다시
돌려 두 보고서를 사람이 나란히 놓는다. 자동 선택·자동 판정은 없다. 설정이 나중에 되돌아가는
것을 막고 싶다면 부하 테스트가 아니라 **설정 값 단위 테스트**(타임아웃 프로퍼티가 존재하고
상한 이하인지)가 싸고 정확하다. 그건 `src/test/`의 일이다.

### 3.2 빌려 쓰는 것과 끊는 것

| 빌려 쓴다 | 이유 |
|---|---|
| `scenarios/lib/workload.js`, `scripts/*.js` | 부하 형태는 같아야 한다. 장애만 변수 |
| `environment/docker-compose.perf.yml` + Prometheus·Grafana·exporter | 관측 배관. 오버레이 파일 하나만 얹는다 |
| `tools/lib/promql.js`, `tools/lib/metrics-catalog.js`(`GROUPS`), `collect.js`의 `collectInfra(prom, window)` | 이미 정의된 지표를 **구간마다** 한 번씩 조회하면 장애 전·중·후 표가 된다 |
| `tools/lib/grafana.js` `buildLinks` | 장애 시각이 박힌 딥링크 |
| `tools/lib/phases.js`, `format.js` | 구간 계산과 표시 |
| `tools/snapshot.js` | 실행 전 데이터 복원 |

| 끊는다 | 이유 |
|---|---|
| `repository.js`(`reports/index.json`, `findBaseline`) | 성능 이력 오염 방지. 장애 실행은 **별도 저장소**에 |
| `regression.js`, `rules.json`, `comparability.js`, `conditions.js` | 판정·비교를 하지 않는다 |
| `saturation.js`의 **판정** | 포화는 장애 실행의 정상 상태다. 다만 신호 값(CPU·pending·도달률)은 관측값으로 표에 싣는다 |
| exit code 게이트 | 실행은 항상 0으로 끝난다. 결과는 보고서에 있다 |

### 3.3 새로 만드는 것 — `performance/resilience/`

> **2026-09-08 구현됨.** 아래 구조가 실제로 있다. 실행기 `fault-run.js`, 계획 5개(redis-crash ·
> redis-hang · mysql-slow · mysql-hang · smoke), k6 시나리오 `scenarios/fault-window.js`, 라이브러리
> 7개, 테스트 16건. 우선순위표는 [resilience-scenarios.md](resilience-scenarios.md).
> smoke 실행(Redis 20초 pause, 도착률 2/s)이 끝까지 돌았고 첫 관측은 8장 아래에.

`regression/`의 형제 디렉터리. `performance/` 아래에 두는 이유는 위 표의 배관이 전부
`performance/`에 있어서다. 저장소만 `resilience/reports/`로 분리한다.

```
performance/resilience/
├── README.md              무엇을 관측하는가, 성능 측정과 무엇이 다른가
├── faults/                장애 계획 (JSON 하나 = 실험 하나의 주입 절차)
│   ├── redis-crash.json
│   ├── redis-hang.json
│   ├── mysql-slow-300ms.json
│   └── mysql-hang.json
├── fault-run.js           실행기: 스냅샷 복원 → k6 + 주입 드라이버 → 구간별 수집 → 보고서
├── lib/
│   ├── toxiproxy.js       toxiproxy HTTP API 클라이언트 (toxic 추가·제거)
│   ├── pumba.js           pumba 컨테이너 실행 래퍼
│   └── report.js          관측 보고서 (판정 없음)
└── reports/<runId>/       run.json · k6.json · events.json · report.html
```

**장애 계획 파일**은 절차와 가설을 함께 든다. 가설은 보고서에 관측값 옆에 그대로 찍힌다.
판정은 사람이 한다.

```json
{
  "id": "redis-hang",
  "question": "Redis가 응답 없이 멈추면 어떻게 되나",
  "load": { "scenario": "scenarios/normal-day.js", "rate": 4 },
  "phases": { "preSec": 300, "faultSec": 120, "postSec": 300 },
  "inject": [
    { "at": "fault.start", "tool": "toxiproxy", "proxy": "redis",
      "toxic": { "type": "timeout", "attributes": { "timeout": 0 } } },
    { "at": "fault.end",   "tool": "toxiproxy", "proxy": "redis", "remove": "timeout" }
  ],
  "expect": [
    "모든 Redis 호출이 명령 타임아웃(60초)까지 대기한다",
    "tomcat_threads_busy 가 400 에 닿고, 이후 Redis 를 안 쓰는 엔드포인트도 실패한다",
    "post 구간에서 스레드가 풀리면 회복한다 — 얼마나 걸리는지는 모른다"
  ],
  "watch": ["http.byEndpoint", "tomcat.threadsBusy", "pool.hikariPending", "health"]
}
```

**보고서**는 판정 대신 아래를 보여 준다.

1. 시간축: 요청률·오류율·p95 위에 주입 시각이 세로선으로
2. 구간 × 엔드포인트 표: 오류율, p95, **실패 응답의 지연 분포**(30초·60초에 몰리는가)
3. 스레드·풀·헬스 게이지의 구간별 최대·최소
4. `expect` 항목마다 "관측:" 빈칸 — 실행 뒤 사람이 채운다
5. 이 계획으로 돌린 이전 실행 목록 (링크만. 비교 수치는 만들지 않는다)

### 3.4 기록 위치 — 기존 분류를 따른다

포트폴리오 9.1의 구분(결함=틀린 것, 병목=느린 것, 측정 시스템=잘못 재는 것)을 그대로 쓴다.
"Redis가 멈추면 전면 장애"는 **결함(KI)** 이다. 느린 것이 아니라 가용성이 틀린 것이다.
실험 기록은 `experiments/EXP-007-…`부터 번호를 잇고, 원자료 링크는 `resilience/reports/`를
가리킨다.

---

## 3A. 주입 도구 — toxiproxy와 pumba의 역할 분담

### 3A.1 왜 둘인가

스크립트 코드로는 "MySQL을 느리게"를 만들 수 없다. `docker pause`는 hang만 만들고, `tc netem`은
Docker Desktop에서 컨테이너에 NET_ADMIN과 iproute2가 필요하다. 두 도구가 서로 다른 층을 맡는다.

| | toxiproxy | pumba |
|---|---|---|
| 층 | **연결 경로** (앱 ↔ 의존성 사이 TCP) | **컨테이너 자체** |
| 만드는 형태 | slow(latency+jitter), hang(timeout 0), 대역폭 제한, 연결 끊김(reset_peer), 응답 잘림(slicer), 완전 차단(proxy disable) | crash(kill/stop), hang(pause), CPU·메모리 압박(stress), 재시작 |
| 결정성 | 높다. HTTP API로 켜고 끄며 ms 단위로 지정 | 컨테이너 상태 전이라 결정적. netem은 환경 의존 |
| Docker Desktop | 컨테이너 하나 추가로 끝. 권한 불필요 | docker.sock 마운트만. netem은 시도해 보고 안 되면 버린다 |
| 의존성 쪽 상태 | **의존성은 멀쩡하다.** 앱 클라이언트의 거동만 격리해 본다 | 의존성이 실제로 죽거나 멈춘다. 복구 시 빈 캐시·재접속 거동까지 |

**격리 관점에서 toxiproxy가 더 좋은 실험이 많다.** R-01 hang을 `docker pause`로 하면 Redis가
멈춘 것과 Lettuce가 기다리는 것이 섞인다. toxiproxy `timeout` toxic은 Redis는 살아 있는데
앱만 응답을 못 받는 상황이라 **앱 쪽 타임아웃 설정의 효과만** 본다. 반대로 R-04(복구 직후
빈 캐시)는 Redis가 실제로 재시작해야 하므로 pumba(`stop/start`)여야 한다.

### 3A.2 끼우는 방법 — 오버레이 compose 하나

앱은 `DB_URL`과 `REDIS_HOST` 환경변수로 의존성에 붙는다(`docker-compose.perf.yml` 102·105행).
이미지를 건드리지 않고 두 값만 toxiproxy로 돌린다.

```yaml
# performance/environment/docker-compose.fault.yml
services:
  toxiproxy:
    image: ghcr.io/shopify/toxiproxy:2.9.0
    container_name: perf-toxiproxy
    command: ["-host", "0.0.0.0", "-config", "/config/toxiproxy.json"]
    volumes: ["./toxiproxy/toxiproxy.json:/config/toxiproxy.json:ro"]
    ports: ["127.0.0.1:18474:8474"]     # API. 루프백 전용(E-14와 같은 이유)
  app:
    environment:
      DB_URL: jdbc:mysql://toxiproxy:3306/${MYSQL_DATABASE:-highteenday}
      REDIS_HOST: toxiproxy
    depends_on: [toxiproxy]
```

```json
// performance/environment/toxiproxy/toxiproxy.json
[
  { "name": "mysql", "listen": "0.0.0.0:3306", "upstream": "mysql:3306" },
  { "name": "redis", "listen": "0.0.0.0:6379", "upstream": "redis:6379" }
]
```

```bash
docker compose -f docker-compose.perf.yml -f docker-compose.fault.yml up -d
```

**pre 구간은 toxic이 하나도 없는 상태다.** 프록시 홉 자체의 지연이 pre에 포함되므로 fault
구간과의 차이는 순수하게 toxic의 효과다. 이것이 "기준은 같은 실행의 pre"가 성립하는 근거이고,
동시에 이 실행을 성능 기준선과 비교하면 안 되는 이유다(홉이 하나 더 있다).

### 3A.3 실험별 주입 명령 — 드라이버가 실제로 치는 것

| 실험 | 도구 | 명령 |
|---|---|---|
| R-01 A crash | pumba | `pumba stop --restart --duration 60s perf-redis` (또는 `docker stop/start`) |
| R-01 B hang | toxiproxy | `POST /proxies/redis/toxics {"type":"timeout","attributes":{"timeout":0}}` |
| R-03 slow | toxiproxy | `POST /proxies/mysql/toxics {"type":"latency","attributes":{"latency":300,"jitter":50}}` |
| R-03 hang | toxiproxy | `POST /proxies/mysql/toxics {"type":"timeout","attributes":{"timeout":0}}` |
| R-04 복구 | pumba | R-01 A의 `start` 이후 post 구간 |
| R-06 정산 중 종료 | pumba | `pumba kill --signal SIGKILL perf-app` (정산 시각 맞춤) |
| R-07 메모리 압박 | redis-cli | `CONFIG SET maxmemory 2mb` (도구 불필요) |
| CPU 압박(보조) | pumba | `pumba stress --duration 5m --stressors "--cpu 2" perf-app` |

toxic의 `toxicity`(0~1)를 쓰면 "요청의 30%만 느리게" 같은 부분 장애도 된다. 부분 장애는 전면
장애보다 진단이 어렵다는 점에서 면접 소재가 되지만, 우선순위는 뒤다.

---

## 4. 실험 목록 — 우선순위순

각 실험은 open model `RATE=4`, medium 데이터셋, 5분 pre → 장애 → 5분 post 형태다.
실행 전 스냅샷 복원(`snapshot.js`)을 거친다. 쓰기 트래픽이 데이터를 바꾸기 때문이다.

### R-01. Redis crash vs hang — 가장 먼저, 가장 값싸게

**면접 질문.** "Redis가 죽으면 어떻게 되나요?"
**지금 준비된 답.** 카드 3 꼬리 3: "예외를 무시하고 정상 응답… 다만 타임아웃을 안 잡아서 멈추면
스레드가 기다린다. 아직 안 했다." → 이 실험이 그 "아직"을 **숫자로 바꾼다.**

| | A. crash | B. hang |
|---|---|---|
| 주입 | pumba `stop --restart` 60초 (Redis가 실제로 죽고 비어서 돌아온다) | toxiproxy `timeout` toxic 120초 (Redis는 멀쩡, 앱만 응답을 못 받는다) |
| 예상 [추론] | AOP가 즉시 기본값 반환. 인기글은 DB 폴백. p95 소폭 상승, 오류율 ~0 | 모든 Redis 호출이 60초 대기. 초당 4회 반복 × 요청당 Redis 호출 수만큼 스레드가 쌓여 Tomcat 400 스레드가 1~2분 안에 고갈. **Redis를 안 쓰는 엔드포인트까지 응답 불가** |
| 재는 것 | 엔드포인트별 오류율·p95, `tomcat_threads_busy`, 헬스체크 응답 | 같음 + 스레드가 400에 닿는 시각 |

**고치는 방법.** `spring.data.redis.timeout=200ms`, `spring.data.redis.connect-timeout=500ms`.
그런 뒤 같은 계획 파일로 B를 다시 돌린다. 이제 hang이 crash와 같은 거동(즉시 기본값)이
되어야 한다. 두 보고서가 이 실험의 Before/After다. 설정이 되돌아가는 것은 부하 실험이 아니라
프로퍼티 존재를 확인하는 단위 테스트로 막는다(3.1).

**타임아웃 값의 근거.** 이 환경의 Redis 왕복은 1ms 이하다(로컬 컨테이너). 200ms는 그 100배
이상이며, 정상 지연을 오류로 만들지 않으면서 hang을 빨리 끊는다. prod는 같은 EC2 안 localhost라
같은 논리가 선다. 값 자체보다 "정상 지연의 상한을 재고 그 여유 배수로 잡았다"는 절차를 말한다.

**말하면 안 되는 것.** "Redis 장애에 안전하다." 안전한 것은 crash이고, hang은 이 실험 전까지
검증한 적이 없다. 실험 뒤에는 "두 형태를 나눠 재서 hang이 뚫려 있던 것을 타임아웃으로 막았다"고
말한다.

### R-02. 헬스체크 정직성 — R-01과 같은 저녁에

**면접 질문.** "장애를 어떻게 알아채나요? 로드밸런서는요?"

R-01 A 진행 중 `curl localhost:18080/actuator/health`를 10초마다 찍는다.

**예상 [추론].** Spring Boot는 Redis 인디케이터를 기본 활성하고, 하나라도 DOWN이면 전체를
DOWN(503)으로 만든다. 즉 **앱은 폴백으로 잘 응답하고 있는데 헬스는 DOWN**이다. ALB가 이
엔드포인트를 보고 있다면 [추정: `application-prod.properties` 30번대 줄의 주석이 그 가능성을 언급]
타깃을 빼 버려 **부분 저하가 전면 장애로 승격**된다.

**고치는 방법.** 두 가지 중 하나를 고르고 이유를 적는다.
- `management.health.redis.enabled=false` — Redis는 가속 계층이라 생존 여부와 무관
- liveness/readiness 그룹 분리(`management.endpoint.health.group.readiness.include=db`) —
  Redis는 어느 그룹에도 안 넣는다

**면접 포인트.** "폴백이 있는 의존성을 헬스에 넣으면 폴백이 무의미해진다"는 문장. 대부분의 지원자는
폴백까지만 말한다.

### R-03. MySQL slow — 폭발 반경과 벌크헤드 부재

**면접 질문.** "DB가 느려지면요? 한 소스가 느리면 전체가 멈추나요?" (3.7 절의 두 질문)
**지금 준비된 답.** "DB 커넥션을 30초 기다린 뒤 500. 기본값을 그대로 쓰고 있었다."

| | 주입 (toxiproxy `mysql` 프록시) |
|---|---|
| slow | `latency` toxic, latency 300ms, jitter 50ms, 120초 |
| hang | `timeout` toxic, timeout 0, 60초 |

둘 다 MySQL은 멀쩡하다. 앱의 커넥션 풀과 스레드가 어떻게 반응하는지만 본다. slow를 먼저
돌린다. hang은 R-01 B와 같은 원리(스레드 고갈)가 DB 쪽에서도 성립하는지 확인용이다.

**예상 [추론].** 커넥션 10개에 요청이 줄을 서고 30초 뒤 500. 그동안 Tomcat 스레드가 소진되어
**Redis만 쓰는 인기글 목록도 응답 불가.** 폭발 반경이 "DB를 쓰는 기능"이 아니라 "전부"다.
이유는 벌크헤드(의존성별 스레드 격리)가 없기 때문이다.

**재는 것.** 엔드포인트별 실패 지연 분포(30초에 몰리는가), `hikaricp_connections_pending`,
`tomcat_threads_busy`, 인기글 엔드포인트의 오류율(폭발 반경의 직접 증거).

**고치는 방법 — 일부만.** `spring.datasource.hikari.connection-timeout=3000`으로 실패 지연을
30초 → 3초. 벌크헤드는 **구현하지 않는다.** 설계로만 말한다. "타임아웃은 사용자를 덜 기다리게 하고,
격리는 무관한 기능을 살린다. 전자는 설정 한 줄이라 했고 후자는 구조 변경이라 안 했다."

**타임아웃 값의 근거.** 포트폴리오 6장 표: 비포화(`RATE=4`)에서 p95 402ms, 커넥션 대기 0.
3초는 정상 획득 시간의 수십 배 여유다. 단, 3초로 줄이면 R-05 스파이크에서 오류율이 올라간다.
그 교환을 R-05에서 잰다.

### R-04. Redis 복구 직후 — 스탬피드 (R-01 A에 붙어 온다)

**면접 질문.** "살아나면 바로 정상인가요?"

R-01 A의 `docker start` 뒤 5분이 그대로 이 실험이다. 1.3에서 확인했듯 재시작한 Redis는
비어 있다. 초당 4회 반복이 동시에 미스를 내며 DB로 간다.

**예상 [추론].** `mysql_threads_running` 스파이크, `board:*:posts`·`hot:leaderboard` 재적재
구간에 p95 상승. 어느 정도인지는 모른다. BTL-004가 "의심" 상태인 이유가 실측이 없어서다.

**재는 것.** 복구 시각부터 p95가 pre의 1.2배 안으로 돌아오는 시간(RTO). Redis hit ratio 곡선
(요청 0건일 때 0%로 나오는 문제 T-18 주의 — BTL-004 선행조건 ①).

**고치지 않는다.** 숫자만 얻는다. "복구 뒤 N초 동안 p95가 M배였고, 원인은 동시 미스다. 재구축
잠금이나 조기 갱신이 대응인데 아직 안 했다"까지가 답이다.

### R-05. 스파이크 뒤 준안정 상태 — 트래픽 폭증의 회복탄력성 판본

**면접 질문.** "트래픽이 갑자기 몰리면요?" → 진짜 질문은 "**빠진 뒤 돌아오나요?**"

`spike.js`는 100→600 VU closed model이라 이 목적에 안 맞는다(1.4와 같은 이유). open model로
`RATE 4 → 20(60초) → 4(5분)`인 변형을 하나 만든다. 코드는 `normal-day.js`의 `ratesFor`를
재사용하면 한 시간 거리다.

**예상 [추론].** 두 가능성이 있고 어느 쪽인지 모른다.
- 회복: 부하가 빠지면 60초 안에 p95가 pre로 복귀
- 준안정: 30초 대기 중인 요청 400개가 풀을 계속 점유해, 부하가 빠져도 몇 분간 포화 유지

준안정이 나오면 그것이 이 실험 최고의 결과다. "부하가 빠졌는데 왜 안 돌아오나"는 피드 인프라
조직이 실제로 겪는 문제이고, 답(타임아웃 단축·부하 차단)이 R-03의 설정과 이어진다.

**재는 것.** post 구간의 RTO, `hikaricp_connections_pending`이 0으로 돌아오는 시각.
R-03의 3초 타임아웃 적용 전후로 한 번씩 돌리면 "타임아웃이 회복 시간을 줄이는가"까지 답한다.

### R-06. 정산 도중 프로세스 종료 — 문서화된 한계를 증명 (선택)

포트폴리오 3장: "DB 커밋 뒤 `DECRBY` 전에 종료되면 다음 주기에 한 번 더 반영될 수 있다."
이걸 실제로 만든다. `ViewCountScheduler` 정산 중 `docker kill -s KILL perf-app`, 재기동 뒤
조회수 DB 값과 Redis 잔량을 대조해 **중복을 확인**한다.

타이밍을 맞추기 어려우면 perf 프로파일에서만 DB 반영과 차감 사이에 지연을 넣는 훅을 두는
방법이 있는데, 테스트용 코드가 본 코드에 들어가므로 권하지 않는다. 시간이 남을 때만.

**가치.** "한계를 문서에 적었다"와 "한계를 재현해 봤다"는 면접에서 무게가 다르다.

### R-07. Redis 메모리 압박 — 축출 정책이 조회수를 지운다 (선택, 30분)

`redis-cli CONFIG SET maxmemory 2mb` 후 정상 부하. perf 정책은 `allkeys-lru`라 TTL 없는
`post:views:*`도 축출 대상이다. 반대로 `noeviction`이면 `INCR`가 OOM 오류를 내고 AOP가 삼켜
**조용히 유실**된다.

**면접 포인트.** "어느 정책이 나은가"가 아니라 "**둘 다 조회수를 잃는데 한쪽은 로그라도 남는다**"는
관찰. prod 정책이 미확인이라는 사실과 함께 말한다.

### R-08. 재시도 폭풍과 비멱등 토글 — KI-54 구현 뒤 (9/13 이후)

**면접 질문.** "클라이언트가 재시도하면요?"

R-03의 slow 주입 중 k6에 "5xx나 타임아웃이면 1회 재시도" 정책을 넣고 반응 토글을 돌린다.
실행 뒤 DB 대조로 **의도와 반대로 뒤집힌 상태 수**를 센다.

KI-54(토글 → PUT/DELETE 멱등 재설계) 전후로 같은 계획 파일을 돌린다. 전: 뒤집힘 N건.
후: 0건. 이 대조는 실행 뒤 DB 감사 스크립트가 세며, 보고서의 `expect` 옆에 적는다.

---

## 5. 면접 질문 ↔ 실험 ↔ 답의 뼈대

| 질문 | 실험 | 답의 뼈대 (실측 뒤 숫자를 채운다) |
|---|---|---|
| Redis가 죽으면 | R-01 | "죽는 것과 멈추는 것을 나눠 쟀다. 죽으면 폴백이 즉시 동작(오류율 _%). 멈추면 60초 타임아웃에 스레드가 묶여 _초 만에 전면 장애. 타임아웃 _ms로 잡은 뒤 멈춤도 폴백으로 흡수(오류율 _%)" |
| 장애를 어떻게 아나 | R-02 | "헬스가 폴백 중인 앱을 DOWN으로 보고했다. 가속 계층은 헬스에서 뺐다" |
| DB가 느려지면 | R-03 | "커넥션 10개에 줄 서고 30초 뒤 500. 인기글처럼 DB를 안 쓰는 기능도 같이 죽었다(오류율 _%). 스레드 격리가 없어서다. 타임아웃을 3초로 줄여 실패 지연은 잡았고 격리는 설계만" |
| 살아나면 바로 정상인가 | R-04 | "복구 뒤 _초 동안 p95가 _배. 재시작한 Redis가 비어 동시 미스가 DB로 갔다" |
| 트래픽이 몰리면 | R-05 | "정점보다 빠진 뒤를 봤다. _초 만에 복귀 / 또는 _분간 준안정" |
| 장애 중 데이터는 | R-01·R-06·R-07 | "조회수는 유실은 허용하고 중복은 막는 설계. 유실 _건 중복 0건 확인 / 종료 시점 중복은 재현함" |
| 클라이언트가 재시도하면 | R-08 | "토글이라 뒤집혔다(_건). 멱등 재설계 뒤 0건" |
| 어떻게 재현했나 | 3장·3A | "장애 계획을 JSON으로 선언하고 toxiproxy·pumba로 주입했다. 성능 회귀 판정과는 분리했다. 기준은 같은 실행의 장애 전 구간이고, 판정은 규칙이 아니라 가설 옆에 관측을 적는 방식이다" |
| 왜 회귀 게이트로 안 만들었나 | 3.1 | "장애 실험은 판정 기준을 미리 정할 수 없다. 기준을 정하려면 먼저 겪어 봐야 한다. 설정이 되돌아가는 건 단위 테스트로 막는 게 싸다" |

빈칸(_)은 실측 전에는 채우지 않는다. 채우기 전에 면접이 오면 "실험을 설계했고 예상은 이렇다,
숫자는 아직"이라고 말한다. 이 저장소의 원칙("측정 없이는 단정하지 않는다")과 같다.

---

## 6. 하지 않는 것과 이유

| 항목 | 이유 |
|---|---|
| 디스크 가득 참 | 로컬 볼륨을 망가뜨리고 복구 비용이 크다. 설계로만 말한다 |
| 다중 인스턴스 간 분단 | 단일 인스턴스 전제. 스케줄러 중복 실행은 카드 3 "무너지는 자리"에 답이 있다 |
| WebSocket 브로커 | BTL-006. Feed Infra 범위 밖 |
| S3 지연 | `S3Config`에 타임아웃 설정 없음은 확인했으나 피드 경로가 아니다. "확인만 했고 안 쟀다"로 |
| NEIS 외부 API | 포트폴리오 10.3에 이미 정리됨. 실험 없이 그 답을 유지 |
| 서킷 브레이커 구현 | 의존성 셋에 Resilience4j를 얹는 것은 14일 캡 안에서 변수를 늘린다. 타임아웃(설정)까지만 하고 서킷은 "다음 단계"로 |

---

## 7. 환경 제약 — 실행 전에 알아야 하는 것

- **Windows + Docker Desktop(WSL2).** toxiproxy는 컨테이너 하나라 제약이 없다. pumba는
  `/var/run/docker.sock` 마운트로 `stop/kill/pause/stress`가 된다. `netem`은 쓰지 않는다
  (slow는 toxiproxy가 맡는다).
- **toxiproxy 홉.** 오버레이를 얹은 실행은 앱→DB 경로가 다르다. 성능 기준선과 절대 비교하지
  않는다. `perf-run.js`로 이 환경을 돌리지도 않는다. 두 compose 조합을 구분하는 표시를
  `fault-run.js`가 `run.json`에 남긴다.
- **k6 실행 경로.** PATH shim이 막혀 chocolatey lib 아래 실제 exe로 실행한다(메모리 참조).
- **run-lock.** `tools/lib/run-lock.js`는 성능 실행끼리의 잠금이다. `fault-run.js`도 같은
  잠금을 잡아 두 종류가 동시에 돌지 않게 한다. 관측 배관(Prometheus)이 공유되기 때문이다.
- **데이터 복원.** 쓰기 트래픽이 섞이므로 실행 전 `snapshot.js` 복원. Redis는 `FLUSHALL`로
  cold/warm 상태를 명시한다(BTL-004 선행조건 ②).
- **Redis stop 뒤 healthcheck.** compose의 `restart: unless-stopped`는 `docker stop`에는
  재시작하지 않으나 `docker kill`에는 재시작한다. crash 주입은 `stop`을 쓴다.

---

## 8. 일정 — 9/14 지원 마감 기준

| 날 | 할 것 | 산출물 |
|---|---|---|
| ~~9/8~9~~ **9/8 완료** | 오버레이 compose + toxiproxy 설정, `fault-run.js`(사전 점검 → k6 + 주입 드라이버 + 헬스 폴러 → 구간별 `collectInfra` + 시계열 → 보고서) | `performance/resilience/` |
| 9/9 저녁 | R-01 A/B + R-02 + (자동으로) R-04 | EXP-007, KI 신규 1건(Redis hang), 설정 2줄 |
| 9/10 저녁 | R-03 hang(가능하면 slow) | EXP-008, 설정 1줄 |
| 9/10 | R-05 변형 시나리오 + 1회 실행 | EXP-009 |
| 9/11~13 | KI-54 구현(기존 계획) | — |
| 9/13 | R-08 전후 | EXP-010 |
| 9/14 | 카드 3 꼬리 3, 3.7 절, 포트폴리오 10.3 표에 숫자 반영 | 문서 갱신 |

R-06·R-07은 위가 끝나고 남을 때만. 셋 이상 미루면 R-05를 먼저 뺀다. R-01·R-03이 없으면
"보강 대상 1"이 그대로 공백이지만, R-05가 없어도 답은 된다.

### 8.1 smoke 실행의 첫 관측 (2026-09-08, 판단에 쓰지 않는 배관 확인이지만 방향은 보인다)

조건: 도착률 2/s, pre 30s / fault 20s(perf-redis `docker pause`) / post 30s, 프록시 없음.

| 구간 | 요청 | p95 | max | 오류율 | Hikari active / pending | Tomcat busy |
|---|---:|---:|---:|---:|---|---:|
| pre | 187 | 88ms | 247ms | 0% | 0 / 0 | 1 |
| fault | 46 | 19,507ms | 19,757ms | **0%** | **10 / 8** | 21 |
| post | 315 | 122ms | 1,558ms | 0% | — | — |

- **오류율 0%인데 p95가 19.5초.** Redis가 멈춘 20초 동안 요청은 실패하지 않고 그만큼 **매달렸다.**
  `@ResilientRedis`는 예외가 와야 동작하는데 예외가 안 왔다. R-01 B(hang)의 가설과 같은 방향이다.
  20초가 아니라 60초를 멈추면 Lettuce 타임아웃(60초)에 걸려 그때야 예외가 올 것이다.
- **Hikari active 10 / pending 8.** Redis를 기다리는 동안 DB 커넥션을 쥔 채였다. Redis 장애가
  **DB 커넥션 풀 고갈로 번진다** — 계획에 없던 관측이고, 벌크헤드 부재의 두 번째 증거다.
- **헬스체크가 34.7초에 UNREACHABLE.** DOWN(503)이 아니라 4초 안에 응답 자체를 못 했다. Redis
  인디케이터가 멈춘 Redis에 ping을 보내고 같이 매달린 것으로 추정한다. R-02의 가설(DOWN)보다
  나쁜 형태다 — 로드밸런서 입장에서는 타임아웃이라 역시 타깃에서 뺀다.
- dropped_iterations 18. 도착률 2/s에서도 fault 중 VU가 모자랐다. 본실험은 maxVUs 1000으로 둔다.
- 복구는 빨랐다. post p95 122ms. 20초 정지라 캐시가 지워지지 않아(pause는 메모리를 보존)
  스탬피드는 없었다. crash(stop/start)에서 다시 본다.

이 표는 배관 확인이므로 숫자를 인용하지 않는다. 다만 R-01 B의 예상 순서를 이렇게 고친다:
Redis 호출 대기 → **Hikari 풀 고갈(먼저)** → Tomcat 스레드 고갈 → 헬스 응답 불능.
