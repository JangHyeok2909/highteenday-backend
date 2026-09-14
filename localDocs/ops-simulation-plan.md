# 운영 시뮬레이션 시스템 구축 계획

작성일 2026-09-14. 실사용자가 없는 상태에서 운영 트래픽과 장애 대응을 다뤄 보기 위한
별도 환경의 구축 계획이다.

> **이 문서는 `performance/` 의 측정 시스템을 다루지 않는다.** 오히려 그것과 **격리**하는
> 것이 이 계획의 핵심 제약이다. 두 환경은 요구하는 데이터 정책이 정반대다 — 측정은 데이터가
> 변하면 안 되고, 운영 시뮬레이션은 데이터가 자라야 한다. 격리 규칙은 5장에 있다.

---

## 1. 이 문서가 답하는 질문

- 실사용자 없이 "운영해 본 경험"을 만들려면 무엇을 갖춰야 하는가
- 이미 있는 k6 부하 시스템으로는 왜 안 되는가
- 무엇을 새로 설치하고 무엇은 직접 써야 하는가
- 검토했다가 버린 대안은 무엇이고 왜 버렸는가

---

## 2. 배경 — 있는 것과 없는 것

`performance/` 에는 k6 시나리오 16개, 사용자 여정 9종(`scenarios/lib/workload.js`),
Prometheus·Grafana, toxiproxy·pumba 기반 장애 주입(`resilience/`)이 있다. 부하를 만들고
재는 일은 이미 된다.

없는 것은 부하가 아니라 **루프**다. 운영 경험은 다음 여섯 칸이 한 바퀴 돌 때 생긴다.

```
트래픽이 흐른다 → 고장이 난다 → 안 보고 있을 때 알림이 온다
  → 지표에서 이상을 찾고 로그에서 원인을 찾는다 → 고친다 → 왜 늦게 알았는지 기록한다
```

현재 저장소는 1번 칸(k6)과 2번 칸(resilience)만 갖고 있다. 3번 칸이 비어 있는 게 결정적이다.
`environment/prometheus/prometheus.yml` 에 `rule_files` 도 `alerting:` 블록도 없고
`docker-compose.perf.yml` 에 Alertmanager 서비스가 없다(2026-09-14 grep 확인). 지금 구조에서는
내가 Grafana 화면을 보고 있을 때만 이상을 안다. 그건 관찰이지 운영이 아니다. 실제 운영에서
배우는 것은 **다른 일을 하다가 알림을 받고 맥락 없이 상황 파악을 시작하는 경험**이기 때문이다.

---

## 3. 목표와 비목표

**목표**

- 며칠~몇 주 동안 끊기지 않는 트래픽을 흘려 데이터가 실제로 쌓이게 한다
- 예고 없이 고장을 내고, 알림으로 인지해 진단하고 복구하는 과정을 반복한다
- 그 과정을 기록해 같은 장애를 두 번째부터는 더 빨리 처리한다

**비목표**

- 성능 수치를 재지 않는다. 판정은 `performance/` 가 계속 담당한다
- 최대 부하를 찾지 않는다. 이 환경의 부하는 의도적으로 낮다(8장 참고)
- 실사용자 운영을 대체하지 않는다. 못 주는 것은 9장에 적었다

---

## 4. 구성 요소별 결정과 버린 대안

localDocs 기록 규칙에 따라 **버린 대안과 이유**를 각 항목에 함께 적는다.

### 4.1 트래픽 생성 — Locust

**결정**: `locustio/locust` 도커 이미지를 상주시키고 `locustfile.py` 를 직접 쓴다.

**k6 재사용을 버린 이유.** k6의 실행 모델이 상주 트래픽과 네 군데에서 어긋난다.

1. **VU 번호가 사용자 정체성을 대신한다.** `performance/scripts/lib/data.js` 의 `myUser()` 는
   `users[(exec.vu.idInTest - 1) % users.length]` 로 계정을 고른다. `normal-day.js` 의
   `preAllocatedVUs` 기본값이 100이므로 VU 번호는 1~100 범위에서만 나온다. large 데이터셋의
   계정 10,000개 중 실제 로그인하는 건 100개, 즉 1%다. 관측되는 증상은 `users` 테이블 행은
   10,000개인데 `posts.user_id` 의 distinct 값이 100개에 머무는 형태다.
2. **사용자별 상태가 프로세스보다 오래 못 산다.** k6 VU의 전역 변수는 프로세스 안에서만 산다.
   그래서 "어제 쓴 글에 오늘 댓글이 달려 원작자에게 알림이 가고, 원작자가 그걸 열어 답글을
   단다"는 연쇄가 안 만들어진다. 지금 `journeyEngage()` 는 `hotPost()` 로 인기글을 뽑아 댓글을
   다는데 그 글을 누가 썼는지는 보지 않는다. 알림 행은 쌓이지만 받는 쪽과 읽는 쪽이 안 이어진다.
   운영에서 터지는 상황이 대개 이 연쇄다. 인기 글 하나에 댓글 500개가 달리면 원작자 앞으로
   알림 500건이 쌓이고, 그 사람이 앱을 열 때 `/api/notifications/unread-count` 와
   `/api/notifications?page=0&size=20` 이 동시에 무거워진다.
3. **실행 중 부하를 못 바꾼다.** `options.scenarios` 의 stages 는 실행 시작 전에 확정된다.
4. **세션 사이 휴식이 없다.** `thinkTime()` 의 1~4초는 세션 *안*의 화면 전환 간격이다.

**Locust 가 이 넷 중 셋을 기본 기능으로 해결한다.**

| k6에서 안 되던 것 | Locust의 해당 기능 |
|---|---|
| ① VU 번호 = 사용자 | `User` 인스턴스가 사용자 하나. 인스턴스 속성이 태스크 사이 유지됨 |
| ② 상태 소멸 | `on_start` 에서 로그인하고 그 세션을 끝까지 씀. 프로세스를 띄워 두면 며칠 유지 |
| ③ 실행 중 부하 고정 | `LoadTestShape.tick()` 이 초당 1회 호출되어 `(user_count, spawn_rate)` 반환 |
| ④ 세션 간 휴식 없음 | `wait_time` 이 태스크 사이 대기 담당 |

②에서 SQLite 같은 외부 저장소가 필요할 것 같지만 아니다. "내가 쓴 글 id 목록"은
`self.my_post_ids = []` 한 줄이다.

**Node 자작 데몬(700~900줄)을 버린 이유.** 이산 사건 스케줄러, 사용자 상태 저장, 비정상
포아송 도착 과정을 전부 직접 구현하는 안이었다. Locust 의 `LoadTestShape` 와 `User` 인스턴스가
같은 일을 이미 하므로 순수 중복이다.

**k6/experimental/redis 나 xk6-kv 로 상태를 빼는 안을 버린 이유.** k6 자체에 VU 간 가변 상태
공유 수단이 없어서 나온 우회책이고 실제로 쓰인다. ①과 ②는 풀리지만 ③과 ④는 안 풀린다.
그리고 "누가 언제 접속하는가"를 정하는 스케줄러를 k6 밖에 둬야 하므로 k6는 요청을 쏘는
실행기 역할만 남는다.

**호스트에 파이썬을 설치하지 않는다.** 도커 이미지로만 쓴다.

### 4.2 알림 — Alertmanager + ntfy

**결정**: Alertmanager 컨테이너 → ntfy 로 휴대폰 푸시.

**Grafana OnCall OSS 를 버린 이유.** 2025-03-11 유지보수 모드에 들어갔고 2026-03-24 저장소가
아카이브됐다. 아카이브 후 클라우드 연결이 끊겨 **모바일 푸시·SMS·전화 알림이 동작하지 않는다.**
몇 년 전 글들이 아직 OnCall 을 추천하는데 그대로 따라 하면 푸시가 안 온다.

ntfy 는 Go 바이너리 하나와 YAML 하나로 돌고 Android/iOS 앱이 긴 연결로 구독한다. 개인용은
1 vCPU / 512MB 면 충분하다. Discord webhook 으로 대체해도 되지만, 휴대폰 잠금화면까지
도달하는지가 이 칸의 목적이므로 알림 채널 설정을 확인하고 쓴다.

**처음 넣을 규칙 4개**

- 5분 구간 5xx 비율 1% 초과
- 5분 구간 p95 응답시간이 평소의 3배 초과
- `up{job="spring-app"} == 0` 1분 지속
- HikariCP 커넥션 풀 사용률 90% 초과

SLO 번레이트 알림(Sloth, Pyrra)은 뒤로 미룬다. 규칙 4개를 손으로 쓰는 것보다 도입 비용이 크고,
알림을 몇 번 받아 보고 "이 알림은 쓸모없다 / 이 상황은 안 잡힌다"를 겪은 다음이 순서다.

### 4.3 외부 감시 — Uptime Kuma

**결정**: `louislam/uptime-kuma:2` 컨테이너 하나. HTTP 응답을 앱 밖에서 보고 자체 알림 채널로 통보.

**Prometheus 알림과 중복 아닌 이유.** Prometheus 가 죽으면 Prometheus 기반 알림도 같이 죽는다.
Uptime Kuma 는 별도 프로세스라 그 상황을 잡는다. 감시 시스템이 감시 대상과 함께 죽는 것을
막는 게 이걸 따로 두는 목적이다.

### 4.4 로그 — Loki + Grafana Alloy

**결정**: Loki 와 Alloy 컨테이너를 붙이고 기존 Grafana 에 데이터소스로 등록.

**왜 필요한가.** 지표는 "뭔가 이상하다"까지만 알려주고 "왜"는 로그에 있다. 장애 진단의 절반이
로그 검색이므로 이게 빠지면 훈련이 반쪽이다. 실제로 필요한 동작은 Grafana 대시보드에서 급등
구간을 드래그해 그 시각의 로그로 바로 넘어가는 것이고, 같은 Grafana 에 Loki 를 붙이면 된다.

### 4.5 고장 주입 — 새로 도입하지 않음

**결정**: `performance/resilience/` 의 toxiproxy + pumba 를 그대로 쓰고, cron 으로 무작위 시각에
`fault-run.js` 를 실행한다.

**Chaos Mesh 와 LitmusChaos 를 버린 이유.** 둘 다 쿠버네티스 커스텀 리소스로 동작해서
docker compose 환경에 못 쓴다.

**Chaos Toolkit 을 버린 이유.** 실험을 JSON 으로 선언하고 정상 상태 가설(steady state
hypothesis)을 먼저 검사한 뒤 고장을 넣는 구조인데, `resilience/faults/*.json` 과
`resilience/lib/invariants.js` 가 이미 같은 일을 한다.

**여기서 빠진 것은 도구가 아니라 스케줄이다.** 내가 시각을 정해 두면 예고 없는 장애가 아니다.

### 4.6 대응 기록 — 포스트모템 템플릿

**결정**: `dastergon/postmortem-templates` 의 템플릿을 가져와 장애 1건당 1개를 쓴다.

기록할 것: 타임라인, 알림에서 인지까지 걸린 시간, 인지에서 복구까지 걸린 시간, 재발 방지 항목.
혼자라도 쓴다. 이 기록이 없으면 같은 장애를 세 번 겪고도 매번 처음부터 진단하게 된다.

### 4.7 검토했으나 이 계획에 안 들어간 것

| 후보 | 버린 이유 |
|---|---|
| GoReplay, Keploy (트래픽 리플레이) | 기록할 실제 트래픽이 없다는 게 애초의 전제다. Locust 트래픽이 흐르기 시작한 뒤 회귀 테스트 생성용으로는 재검토 가치 있음 |
| LLM 에이전트 사용자 (UXAgent, Agent A/B) | 에이전트 1,000명이면 요청 1,000건이 아니라 LLM 호출 수만 건이다. arXiv 2601.17087 은 시뮬레이션 사용자가 사람의 신뢰할 만한 대리가 아니라고 보고한다(사용 LLM에 따라 성공률이 9%p까지 흔들림) |
| OpenTelemetry Demo, DeathStarBench | 설치 즉시 루프가 돌지만 **내 앱이 아니다.** 데모의 고장은 미리 만들어 둔 고장이라 어디를 볼지가 이미 정해져 있어 배운 게 내 서비스로 안 옮겨간다 |
| TRex, WARP17 | "stateful traffic generator" 로 검색하면 걸리지만 DPDK 기반 L1~L7 패킷 생성기다. 네트워크 장비 시험용이라 용도가 다르다 |
| Markov 체인 워크로드 모델 (WESSBAS) | 모델을 학습시킬 실제 세션 로그가 없다. Locust 트래픽을 몇 주 돌려 로그가 쌓인 뒤에 의미가 생긴다 |

---

## 5. `performance/` 와의 격리 규칙 (P0 제약)

**별도 compose 프로젝트 이름과 별도 볼륨을 쓴다. 두 환경을 동시에 돌리지 않는다.**

지키지 않으면 무엇이 깨지는지:

- **데이터 정책이 정반대다.** `performance/perf.config.json` 의 `datasetGuard: strict` 는
  데이터셋이 변하면 안 된다는 정책이고, large 데이터셋은 재현 불가능한 일회성 자산이라
  오염되면 되돌릴 방법이 스냅샷뿐이다. 운영 시뮬레이션은 반대로 데이터가 자라야 한다.
  같은 MySQL 볼륨을 쓰면 성능 기준선이 통째로 깨진다.
- **동시 실행은 통제 변수를 깨뜨린다.** 운영 데몬이 도는 DB 에서 k6 기준선을 재면 배경 부하가
  통제 밖에 있으므로 `performance/METHOD.md` 의 "실행 조건이 같을 때만 비교" 전제가 무너진다.
  증상은 p95 가 실행마다 흔들리는데 원인을 앱 변경으로 오해하는 형태로 나타난다.

운영 환경은 `medium` 스냅샷에서 **한 번만** 시드하고 이후 초기화하지 않는다. 여기서 나오는 게
데이터 누적으로만 드러나는 성능 저하다. 게시글이 백만 행을 넘으면 OFFSET 페이징이 느려지고,
Redis 가 `maxmemory` 에 닿으면 키를 쫓아내기 시작하고, MySQL binlog 와 로그 파일이 디스크를 채운다.

---

## 6. 단계별 실행 계획

순서가 중요하다. **알림이 첫 번째고 Locust 는 네 번째다.** 트래픽을 먼저 만들면 알림이 없어서
고장을 내가 보고 있을 때만 알게 되고, 그러면 이 구성 전체의 목적이 사라진다.

### 1단계 — 알림

설치: Alertmanager 컨테이너 1개, ntfy 컨테이너 1개. `prometheus.yml` 에 `rule_files` 와
`alerting:` 블록 추가. 규칙 4개 작성(4.2 참고).

**완료 조건**: 트래픽 없이 앱 컨테이너를 손으로 중지했을 때 휴대폰에 알림이 도착한다.

### 2단계 — 외부 감시

설치: Uptime Kuma 컨테이너 1개. 앱의 헬스 엔드포인트를 감시 대상으로 등록.

**완료 조건**: Prometheus 컨테이너를 중지해도 앱 다운 알림이 온다. 1단계 알림 경로와 독립인지가
확인 대상이다.

### 3단계 — 로그

설치: Loki, Alloy 컨테이너. Grafana 에 Loki 데이터소스 등록.

**완료 조건**: Grafana 대시보드에서 지표 급등 구간을 드래그해 같은 시각의 앱 로그로 넘어간다.

### 4단계 — 트래픽

설치: `locustio/locust`, `containersol/locust_exporter` 컨테이너. `prometheus.yml` 에
`job_name: locust` 스크레이프 블록 추가. Grafana 대시보드 ID **20462** 임포트.

작성: `locustfile.py`. `User` 클래스 3~4종과 `LoadTestShape` 하나.

**완료 조건 두 가지.** 24시간 곡선이 대시보드에 나타난다. 그리고 하루 뒤
`SELECT COUNT(DISTINCT user_id) FROM posts` 가 데이터셋 계정 수에 비례해 늘어난다 —
4.1 ①에서 지적한 "100개 계정만 활동" 문제가 재현되지 않는지 확인하는 것이다.

### 5단계 — 무작위 고장

설치: cron 한 줄. 주 2~3회, 사전에 알 수 없는 시각에 `resilience/fault-run.js` 를 실행하고
몇 분 뒤 되돌린다.

**완료 조건**: 내가 모르는 시각에 장애가 나고, 그것을 Grafana 가 아니라 알림으로 인지한다.

### 6단계 — 기록

**완료 조건**: 장애 1건당 포스트모템 1건. 알림에서 인지까지, 인지에서 복구까지의 시간이
기록에 남는다.

### 첫 2주는 고장을 넣지 않는다

1~4단계를 켜고 그냥 둔다. 아무것도 안 했는데 알림이 울리면 그건 규칙이 너무 민감하다는
증거이고, 임계값 튜닝이 5단계보다 먼저다. 잘못 튜닝된 상태로 5단계를 켜면 진짜 장애 알림이
평소 소음에 묻혀 인지 시간이 늘어난다.

---

## 7. 직접 써야 하는 것

`locustfile.py` 하나다. **어떤 도구를 써도 피할 수 없다.** 내 앱이
`/api/boards/{id}/posts?page=&sortType=&size=10` 같은 계약을 갖고 있다는 걸 아는 건 나뿐이기
때문이다.

분량 근거: `performance/scripts/*.js` 에서 `BASE_URL` 호출을 뽑아 중복 제거하면 엔드포인트
35개다(2026-09-14 grep). 그 파일들은 전부 1,309줄인데 절반 가까이가 k6의 `check`·`tags`·`Trend`
계측 코드다. Locust 의 `HttpUser` 는 내부적으로 `requests.Session` 을 쓰므로 쿠키를 알아서 들고
다니고, 그래서 `scripts/lib/session.js` 의 `vuJar`·`tags()`·`withAuth()` 같은 쿠키 저장소 관리
코드가 통째로 필요 없어진다. 옮겨야 할 것은 300줄 안팎으로 본다.

**WebSocket 채팅은 1단계에서 뺀다.** `scripts/chat-ws.js` 121줄에 `scripts/lib/stomp.js` 의
STOMP 프레이밍 직접 구현까지 포팅해야 해서 비용이 나머지 전부와 비슷하다. REST 채팅
(`chat-rest.js`)만으로도 채팅방과 메시지는 자란다.

**OpenAPI 스펙으로 초안을 뽑을 수 있다.** `build.gradle:57` 의 springdoc 이
`/swagger/api-docs` 로 스펙을 낸다. 다만 스펙이 알려주는 건 "어떤 필드를 보내야 하는가"까지고
"어떤 순서로 얼마나 자주 하는가"는 안 나온다. 골격 생성에만 쓰고 행동 확률은
`scenarios/lib/workload.js` 의 기존 여정 가중치를 옮긴다.

---

## 8. 트래픽 규모

부하를 정직하게 낮게 잡아야 노트북 한 대에서 몇 주를 돌릴 수 있다.

고등학생 커뮤니티 앱에서 활성 사용자 3,000명, 1인당 하루 4세션, 세션당 8요청을 가정하면
하루 요청은 3,000 × 4 × 8 = 96,000건이다. 96,000 ÷ 86,400초 = **평균 1.1 요청/초**다.
점심 피크가 평균의 6배라면 6.7 요청/초다.

`performance/scenarios/normal-day.js` 가 예상하는 45~55 요청/초와 비교하면 6.7 ÷ 50 ≈ 1/7.5
수준이다. 운영 경험은 부하의 크기가 아니라 시간과 누적에서 나오므로 이 정도가 맞다.

시간대별로 **양과 조합을 같이** 바꾼다. `LoadTestShape.tick()` 안에서 현재 시각의 시(hour)를
보고 아래 값을 반환한다.

| 시간대 | 요청/초 | 주된 행동 | 근거 |
|---|---|---|---|
| 01–06 | 0.2 | 눈팅 | 심야, 거의 없음 |
| 07–08 | 4 | 급식·시간표 조회 | 등교길 |
| 12–13 | 6 | 눈팅 | 점심 |
| 16–18 | 3 | 채팅 | 하교 후 |
| 21–24 | 5 | 글쓰기·댓글 | 야간 |

---

## 9. 이 구성이 주지 못하는 것

합성 트래픽으로 얻는 것은 **장애 대응 훈련**이고 실사용자 운영과는 다르다. 구체적으로
다음이 안 생긴다.

- **예상 못 한 입력.** 시뮬레이터는 내가 쓴 코드대로만 요청하므로, 내가 상상 못 한 요청은
  영원히 안 온다.
- **크롤러와 취약점 스캐너.** 서비스를 공개하면 며칠 안에 온다. 이게 로그의 상당 부분을 채우고,
  "이 404 폭증은 공격인가 버그인가"를 판단하는 경험이 거기서 나온다.
- **기기와 네트워크의 다양성.** 끊기는 모바일 네트워크, 구버전 앱, 이상한 User-Agent.
- **압박.** 내 실수가 남에게 영향을 준다는 감각은 합성 트래픽이 만들지 못한다.

**가장 효과가 큰 보완책은 실제로 공개해서 사용자를 열 명이라도 받는 것이다.** 열 명이면 부하는
없는 것이나 마찬가지지만 위 네 가지가 전부 생긴다. 합성 트래픽은 그 위에 "부하가 있을 때의
거동"을 얹는 역할이다. 둘은 대체재가 아니라 보완재다.

이 계획의 결과를 밖에 설명할 때도 같은 구분을 유지한다. "장애 주입과 알림 기반 대응을 반복해
인지 시간과 복구 시간을 측정했다"는 사실이고, "실사용자 트래픽을 운영했다"는 사실이 아니다.

---

## 10. 출처

트래픽·부하

- [Custom load shapes — Locust docs](https://docs.locust.io/en/stable/custom-load-shape.html)
- [Writing a locustfile — Locust docs](https://docs.locust.io/en/stable/writing-a-locustfile.html)
- [ContainerSolutions/locust_exporter](https://github.com/ContainerSolutions/locust_exporter)
- [Locust Prometheus 대시보드 ID 20462](https://grafana.com/grafana/dashboards/20462-locust-prometheus-monitoring-modern-2025/)
- [k6 issue #4670 — 장시간 실행 시 TrendSink 메모리 증가](https://github.com/grafana/k6/issues/4670)
- [Making k6/experimental/redis part of core (grafana/k6 #3153)](https://github.com/grafana/k6/issues/3153)

알림·관측

- [Grafana OnCall OSS 유지보수 모드 공지](https://grafana.com/blog/grafana-oncall-maintenance-mode/)
- [Archived: Grafana OnCall OSS](https://github.com/grafana-cold-storage/oncall)
- [ntfy.sh](https://ntfy.sh/) · [self-hosted ntfy 로 인프라 알림 보내기](https://stackharbor.com/en/knowledge-base/ntfy-self-hosted-push-alerts/)
- [Uptime Kuma](https://uptime.kuma.pet/)
- [Docker OpenTelemetry LGTM](https://grafana.com/docs/opentelemetry/docker-lgtm/)
- [Google SRE — Alerting on SLOs](https://sre.google/workbook/alerting-on-slos/)

장애 훈련

- [dastergon/wheel-of-misfortune](https://github.com/dastergon/wheel-of-misfortune)
- [dastergon/postmortem-templates](https://github.com/dastergon/postmortem-templates)
- [REL12-BP05 Conduct game days regularly — AWS Well-Architected](https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/rel_testing_resiliency_game_days_resiliency.html)
- [Chaos Toolkit — Concepts](https://chaostoolkit.org/reference/concepts/)

버린 대안의 근거

- [Load Generator | OpenTelemetry Demo](https://opentelemetry.io/docs/demo/services/load-generator/)
- [DeathStarBench socialNetwork](https://github.com/delimitrou/DeathStarBench/tree/master/socialNetwork)
- [GoReplay — Shadow Testing](https://goreplay.org/shadow-testing/) · [Keploy](https://github.com/keploy/keploy)
- [Lost in Simulation: LLM-Simulated Users are Unreliable Proxies (arXiv 2601.17087)](https://arxiv.org/abs/2601.17087)
- [WESSBAS — 세션 기반 워크로드 모델 추출](https://link.springer.com/article/10.1007/s10270-016-0566-5)
- [TRex (Cisco)](https://github.com/cisco-system-traffic-generator/trex-core)

진단 훈련 (이 계획과 별개로 병행 가능)

- [SadServers](https://sadservers.com/scenarios) · [Killercoda](https://killercoda.com/)
