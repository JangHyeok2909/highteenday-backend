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
├── render-report.js      저장된 run.json 으로 report.html 만 다시 생성 (관측값은 안 건드린다)
├── lib/
│   ├── plan.js             계획 검증·주입 시각·구간 창·phase 이름 되돌리기 (순수, 테스트 대상)
│   ├── driver.js           정해진 시각에 주입, 어떤 경우에도 원상복구
│   ├── toxiproxy.js        toxiproxy HTTP API
│   ├── docker.js           docker stop/start/pause/kill + pumba
│   ├── health.js           /actuator/health 폴러
│   ├── http.js             Node 16 용 작은 HTTP 클라이언트
│   ├── appconfig.js        타임아웃·풀·폴러 설정값과 그 출처 (순수, 테스트 대상)
│   ├── faultmetrics.js     앱이 기록한 응답(status·outcome·예외)과 JVM 스레드 상태
│   ├── recovery.js         회복 시간·탐지 지연 (순수, 테스트 대상 — 새로 수집하지 않는다)
│   ├── invariants.js       불변식 카탈로그 — 읽을 집계와 만족해야 할 등식 (순수, 테스트 대상)
│   ├── integrity.js        불변식 표본 채취 — 실행 도중 네 시각에 MySQL·Redis 집계를 뜬다
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
#    실행 시작 시 Redis FLUSHALL 이 기본이다. 남은 캐시가 pre 기준을, 남은 조회 중복
#    마커가 조회수 계산을 흔들기 때문이다. 끄려면 --no-flush-redis.
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

`lib/report.js` 를 고친 뒤에는 이미 저장된 실행의 HTML 도 새 모양으로 다시 만든다. 장애를
다시 주입하면 **다른 실행**이 되므로, 원자료(`run.json`)는 그대로 두고 표현만 갱신한다.

```bash
node resilience/render-report.js                 # 저장된 실행 전부
node resilience/render-report.js redis-crash-2026-09-09T01-54-40   # 하나만
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
  "integrity": { "probes": ["viewcount-conservation", "counter-drift"], "drainWaitSec": 90 },
  "watch": ["pool.tomcatBusy", "http.failedLatency"]
}
```

- `at`: `fault.start` · `fault.end` · `run.start` · `run.end`, 거기에 `+N`/`-N` 초, 또는 숫자(실행 시작 기준 초)
- `tool`: `toxiproxy`(add/remove/enable/disable) · `docker`(stop/start/pause/unpause/kill/restart) · `pumba`(`args` 배열) · `shell`(`argv` 배열)
- `expect`: 가설. 비어 있으면 실행기가 거부한다 — 가설 없는 실험은 관측이 아니라 구경이다
- `integrity.probes`: 검사할 불변식 이름. 이름만 고르고 **등식과 질의는 `lib/invariants.js` 가 갖는다** —
  계획 파일은 절차이지 도메인 지식이 아니고, JSON 안의 SQL 에는 테스트가 붙지 않는다.
  모르는 이름은 실행 전에 거부한다. 생략하면 정확성 검사를 하지 않는다
- `integrity.drainWaitSec`: 마지막 표본 전에 기다릴 초. 비동기로 DB 에 내려가는 값을 읽는 불변식만
  쓴다(`needs.drain`). 마지막 스케줄러 주기가 돌아야 "결국 DB 까지 갔는가"에 답할 수 있다 —
  덜 기다리면 유실이 **과소** 보고된다(아직 버퍼에 남은 몫은 사라진 것으로 세지 않는다)
- `watch`: 보고서에서 먼저 볼 지표 이름. 정보용

### 지금 있는 불변식

| 이름 | 식 | 읽는 곳 |
|---|---|---|
| `viewcount-conservation` | 유실 = (올랐어야 할 조회수) − (DB `PST_view_count` 증가분) | 부하 카운터 + MySQL + Redis |
| `counter-drift` | Δ`posts.PST_like_count` 합 == Δ 유효 게시글의 LIKE 반응 행 수 (싫어요도 따로) | MySQL |

#### viewcount-conservation — 이 도구의 본래 목적

조회는 DB 가 아니라 Redis `INCR` 로만 기록되고, `ViewCountScheduler` 가 60초마다 DB 로 내린다.
Redis 가 죽으면 `tryMarkViewed` 가 실패하고 `ResilientRedisAspect` 가 `false` 를 돌려줘서
**조회수 증가가 아예 시도되지 않는다.** 사용자는 HTTP 200 을 받고 오류율은 0 에 가깝다. 이 검사가
없으면 그 실행은 "폴백 정상 동작"으로 읽힌다.

**올랐어야 할 조회수는 부하 발생기가 센다**(`scripts/posts.js` 의 `view_expected`). 서버는 셀 수
없다 — 사라진 조회는 Redis 에도 DB 에도 흔적이 없어서, 실행이 끝난 뒤 어디를 뒤져도 나오지 않는다.

세는 규칙은 서버와 같다. 서버는 `viewed:{postId}:{userId}` 키로 중복을 접고 TTL 이 1시간이라,
실행(몇 분) 안에서는 **(글, 사용자) 쌍마다 딱 한 번** 오른다. VU 는 사용자 하나에 고정되므로
(`myUser()`), VU 마다 "이번 실행에서 읽은 글"을 기억하면 같은 규칙이 된다.

**Redis 버퍼는 식에 안 들어간다.** 끝에 버퍼가 비었는지 확인하는 용도다. 버퍼에 남은 것은 사라진
게 아니라 아직 DB 로 안 간 것이라, 그 상태로 빼면 없는 유실이 잡힌다. 그래서 버퍼가 비지 않았으면
숫자를 내지 않고 "더 기다려야 한다"고 표시한다. 드레인 대기(`drainWaitSec`)가 있는 이유도 이것이다.

없앨 수 없는 오차가 하나 있다. **타임아웃된 요청**은 서버가 조회수를 올렸는지 알 수 없다. 그 건수를
따로 세서 `유실 203건 (불확실 79건)` 처럼 폭과 함께 적는다.

결과가 상한으로 밀리는 조건 두 가지도 표시한다. 실행 시작 시 `viewed:*` 키가 남아 있으면 서버는
중복으로 접는데 부하 쪽은 새 조회로 센다 — **실행 시작 시 FLUSHALL 이 기본이라 보통은 일어나지 않고**, 남은 검사는 `--no-flush-redis` 로 껐을 때를 위한 안전망이다. VU 수가 데이터셋 사용자 수를
넘으면 두 VU 가 같은 계정을 써서 역시 과다 계상된다(medium 은 사용자 1,000명).

#### counter-drift — 성격이 다르다

반응 카운터는 `PostReactionService.syncCounts()` 가 같은 트랜잭션 안에서 행을 세어 채운다.
Redis 를 거치지 않으므로 **장애가 이 검사를 위협하지 않고, 거의 항상 정합이 나온다.** 장애의 결과를
보는 값이 아니라 상시 정합성 검사로 얹어 둔 것이다(KI-53 이 이 종류의 드리프트였다).
실행당 1.6초라 켜 둘 값은 한다.

좋아요와 싫어요를 따로 보는 이유는, 합치면 좋아요가 싫어요로 잘못 반영된 경우가 서로를 상쇄해
정상으로 보이기 때문이다. 반응 행 집계는 게시글에 조인해 **유효한 글의 반응만** 센다 — 조인을 빼면
부하가 글을 지울 때마다(`writeCycle`) 결함이 아닌 불일치가 나온다. 반대로 `view_count` 는
`is_valid` 로 거르지 **않는다** — 거르면 게시글 삭제가 곧 조회수 유실로 보인다.

Redis 버퍼는 `SCAN` + `GET` 을 도는 Lua 한 번으로 읽는다. `KEYS` 를 쓰면 앱이 가진 문제(KI-17)를
관측 도구가 그대로 반복해, 재려던 장애 대신 도구가 만든 멈춤을 재게 된다.

## 보고서가 보여 주는 것

맨 위에 **요약 그리드**가 있다. 장애 중 오류율·p95, 실패까지 걸린 시간, 회복 시간, 탐지 지연,
데이터 유실, 최대 포화, 못 보낸 요청 — 이 값 하나가 다르면 결론이 바뀌는 것들만 모았다.
아래 각 절의 요약이지 별도 계산이 아니고, 판정도 아니다. 어디부터 볼지를 정하는 용도다.

1. 가설 목록과 "관측:" 빈칸 — **실행 뒤 사람이 채운다**
2. **주입한 장애** — 계획에 적힌 toxic 의 종류·강도·속성과 실제 실행 기록을 한 표에.
   같은 `toxiproxy add` 라도 `timeout(0)`(응답 없음)과 `latency(500ms)`(느려짐)는 전혀 다른
   장애다. 도구가 돌려준 실제 응답과, 실행되지 않은 계획 단계도 함께 나온다
3. 시간축 — RPS·오류율·p95·Tomcat busy·Hikari pending/active·MySQL threads_running 위에 주입 시각과 fault 구간.
   축의 수집이 실패하면 "값 0"이 아니라 **수집 실패**로 표시된다.
   그래프에 마우스를 올리면 그 표본의 원값·경과 초·구간·벽시계 시각(KST)이 나온다 — 벽시계는
   Grafana 에서 같은 순간을 찾을 때 쓴다. 지연 그래프(k6 p95, 헬스 응답 지연)는 **로그 축**이다.
   선형 축은 상한을 최댓값에 맞추므로, 60초 타임아웃 한 점이 섞이면 평소의 수십 ms 가 축 바닥에
   눌려 0 처럼 보인다 — 자릿수가 갈리는 지표는 배수로 읽어야 한다
4. **회복과 탐지** — 3번 그래프를 눈으로 읽던 것을 규칙으로 고정한 값이다(`lib/recovery.js`).
   - **회복 시간**: 지표별로 pre 구간 중앙값을 기준 삼아 정상 대역을 만들고, 장애를 걷은 뒤 그
     대역 안으로 들어와 **30초 연속 머문** 첫 시각까지를 잰다. 유지 조건이 있어야 복구 직후의
     2차 스파이크(빈 캐시 스탬피드)를 회복으로 잘못 읽지 않는다. 결과는 초 단위 값이거나
     `미회복`·`확인 불가`·`영향 없음`·`자료 없음` 중 하나다 — **모르는 것을 0 으로 적지 않는다**
   - **탐지 지연**: 실제 주입 시각부터 `/actuator/health` 가 처음 비정상을 보고하기까지, 그리고
     장애를 걷은 뒤 다시 UP 이 되기까지. 알람 규칙이 없는 지금 MTTD 를 대신하는 값이고, 해제
     지연은 앞단이 인스턴스를 다시 넣기까지의 하한이다
   - ⚠ 오류율·p95·RPS 는 30초 이동창 위에서 계산되므로 **실제 회복은 표의 값보다 최대 30초 빠르다**.
     보정하지 않고 그 사실을 함께 표시한다. 게이지(Tomcat busy·Hikari pending)에는 이 지연이 없다
5. 구간별 요약(k6) + `dropped_iterations`(도착률을 못 지킨 횟수 — 장애 중 VU 부족의 신호)와 이 실행의 maxVUs,
   그리고 전체 실행의 **check 통과율** — HTTP 200 인데 응답 내용이 틀린 경우는 오류율에 안 잡힌다
6. **데이터 정확성 — 불변식 대조** (`lib/invariants.js` · `lib/integrity.js`). 앞의 표들은 "얼마나 실패했나"에
   답하고, 이 절은 **실패하지 않은 요청의 결과가 맞았나**에 답한다. Redis 호출 실패는
   `ResilientRedisAspect` 가 삼키고 기본값을 돌려주므로, 데이터가 사라지는 동안에도 사용자는 HTTP 200 을
   받고 오류율은 0 에 가깝다 — 정확성을 안 재면 그 실행은 "폴백 정상 동작"으로 읽힌다.
   - 계획이 고른 불변식마다 **구간(pre·fault·post·전체) × 증가분** 대조표가 나온다. 증가분으로 보는
     이유는, 절대값에는 지난 실행이 남긴 기존 드리프트가 섞여 이번 장애가 만든 몫을 가려낼 수 없어서다
   - 표본은 네 시각(S0 부하 직전 · S1 주입 직전 · S2 제거 직후 · S3 수집 뒤)에 뜬다. 표본을 못 뜬 구간은
     `확인 불가`이고 **정합의 증거가 아니다** — 장애 대상이 MySQL 이면 채취가 실패하는 것이 정상이다
   - **불일치는 느린 것이 아니라 틀린 것이다.** 오류율·지연이 정상이어도 여기가 깨지면 `docs/KNOWN-ISSUES.md` 의 KI 로 올린다
7. **실패 응답의 지연 분포** — 즉시 실패인가, 한참 기다린 뒤 실패인가. 대조할 상한(커넥션 획득·소켓·Redis 명령)은
   상수가 아니라 **이 실행에 기록된 설정값**에서 만든다
8. **실패의 종류** — 오류율은 "얼마나"만 말한다. 같은 실패를 세 방향에서 본다.
   - 구간 × HTTP 상태 코드 (클라이언트가 받은 것): `0`(응답 없음)·500·503 은 고칠 곳이 다르다
   - 구간 × 앱이 기록한 응답 (서버가 본 것): status·outcome·예외 클래스.
     양쪽 건수가 어긋나면 요청이 서버에 닿지 못했거나, 구간 경계에서 갈린 것이다
   - 구간 × JVM 스레드 상태: `timed-waiting` 이 오르면 상한 있는 대기, `runnable` 이 오르면
     응답 없는 소켓에 매달린 것 — 후자는 스스로 풀리지 않는다
9. **폭발 반경** — 기능 × 구간의 요청·p95·오류율. 장애 의존성을 안 쓰는 기능이 같이 죽는지
10. **자원 사용 구간별** — CPU·메모리·Heap·HikariCP·Tomcat·MySQL 커넥션의 **한계 대비 포화도**를
   pre/fault/post 나란히 막대로 본다. 어디가 먼저 찼는지가 병목 판단의 1차 기준이다.
   `tools/lib/metrics-catalog.js` 가 모은 지표 원자료는 그룹마다 접어 둔다 — 펼쳐 두면 165개 값이
   화면을 채워 정작 볼 것이 아래로 밀린다
11. 헬스체크 전이 — **세 가지를 구분한다.** `DOWN`(앱이 응답하며 스스로 보고 — 앞단이 인스턴스를 뺀다),
   `무응답`(폴러가 상한 안에 응답을 못 받음 — **앱 장애의 증거가 아니다**), `연결 실패`(프로세스·포트 수준).
   헬스 응답 지연도 구간별로 보여 준다 — 로드밸런서 헬스체크 상한을 넘기면 앱이 정상이어도 빠진다
12. **무엇을 쟀는가** — 브랜치·커밋(+dirty 여부), 앱 이미지 해시와 빌드 시각, 소스 대비 낡았는지(stale),
   부하 스크립트 지문, k6 버전. `tools/lib/appimage.js` 와 `perf-run.js` 의 `gitMeta` 를 그대로 쓴다
13. **어떤 조건에서 쟀는가** — 도착률·VU·데이터셋과 그 지문·연결 경로(프록시 경유 여부)·초기화 여부·t0 기준·k6 종료 코드
14. **실패 지연을 만드는 설정** — HikariCP 획득 타임아웃, MySQL 소켓·접속 타임아웃, Lettuce 명령·접속
    타임아웃, Tomcat 스레드 상한, 그리고 **헬스 폴러 자신의 상한**. 값과 함께 **어디서 읽었는지**를
    남기고, 아무 데도 설정이 없어 프레임워크 기본값을 적어 둔 항목은 노란 줄로 "가정"임을 표시한다
15. 같은 계획의 다른 실행 링크 (커밋이 같은지 여기서 먼저 확인한다)

**예외 열이 비어 있는 것은 정상이다.** 이 저장소는 도메인 오류를 `GlobalExceptionHandler`
(`@RestControllerAdvice`)가 잡아 응답으로 바꾸므로, Micrometer 에는 "처리된 예외"로 남아
`exception` 라벨이 `none` 이 된다. 즉 예외 클래스가 표에 뜬다면 그건 **핸들러를 거치지 않고
새어 나간** 예외라는 뜻이라, 뜨는 것 자체가 신호다. (2026-09-09 redis-crash 실행에서 앱이
HTTP 500 을 17건 냈는데 예외 라벨이 전부 `none` 이었던 것을 확인하고 이렇게 바꿨다.)

보고서 맨 위 "주의" 블록은 **이 실행의 수치를 그대로 믿으면 안 되는 이유**만 모은다: 프록시
미경유, 주입 실패, 이미지가 소스보다 낡음, 커밋되지 않은 변경, 시계열 수집 실패, k6 비정상 종료.

## 부하·구간 설계의 근거

- **open model, RATE=4.** 기존 `scenarios/failover.js` 는 150 VU closed model 이라 포화(200 VU 에서
  p95 10초)와 장애가 섞인다. 도착률을 고정하면 장애만 변수가 되고, 시스템이 못 따라오면
  `dropped_iterations` 로 드러난다.
- **phase 이름.** k6 스크립트는 공유 phase 기계(warmup/measure/rampdown)를 빌려 쓰고 실행기가
  pre/fault/post 로 되돌린다. `k6.json` 원본에는 k6 이름이 그대로 남는다.
- **t0.** k6 `setup()` 이 실행기의 로컬 HTTP 서버에 신호를 보내 그 시각을 기준으로 주입 타이머를
  건다. 신호가 없으면 spawn 시각으로 폴백하고 보고서에 경고를 남긴다.

## 관련 문서

- 실험 기록: [`../experiments/EXP-007-redis-crash/`](../experiments/EXP-007-redis-crash/README.md) 부터. 원자료는 이 디렉터리의 `reports/` 를 가리킨다
- 해석 문서 양식: [`../experiments/TEMPLATE-FAULT.md`](../experiments/TEMPLATE-FAULT.md) — 성능 개선용 `TEMPLATE.md` 와 다르다(판정·Before/After 절이 없고 "관측하지 못한 것" 절이 있다)
- 발견한 결함은 `docs/KNOWN-ISSUES.md` 의 KI 로 — "Redis 가 멈추면 전면 장애"는 느린 것이 아니라 **틀린 것**이다
