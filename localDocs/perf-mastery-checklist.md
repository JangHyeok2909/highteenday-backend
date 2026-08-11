# 성능 운영 시스템 완전 파악 — 단계별 학습 장부

이 시스템을 "AI가 짜준 것"에서 "내가 아는 것"으로 바꾸기 위한 진도표.
데이터가 흐르는 순서대로 8단계이고, 각 단계에서 **정상 동작과 그 자리에 있던 결함을
함께** 본다. 결함은 그 단계의 핵심을 가장 정확히 짚어주는 교보재다.

이 문서는 파일을 많이 읽었다는 사실을 기록하는 목록이 아니다. 각 단계에서 실제 데이터를
보고, 코드 없이 자기 말로 설명하고, 남은 선택지 중 하나를 결정하는 것이 목적이다.

---

## 30초 큰 그림

성능 결과 하나가 만들어지고 사용되는 흐름을 순서대로 배우는 구조다.

| 단계 | 쉬운 설명 | 이 단계가 답해야 하는 질문 |
|---:|---|---|
| 0 | 전체 지도를 먼저 본다 | 이 시스템은 왜 존재하고 큰 부품은 무엇인가? |
| 1 | 측정이 일어나는 실험실을 본다 | CPU·메모리·데이터 조건이 정말 고정돼 있는가? |
| 2 | k6가 만드는 사용 행동을 본다 | 가상 사용자가 실제 사용자처럼 행동하는가? |
| 3 | k6 결과가 처음 저장되는 지점을 본다 | 원자료가 어떤 요약값으로 바뀌는가? |
| 4 | Prometheus에서 서버 상태를 가져오는 과정을 본다 | CPU·DB·Redis 지표가 같은 시간대를 설명하는가? |
| 5 | 이전 실행과 비교해 판정하는 과정을 본다 | 누구와 비교하고 어떤 규칙으로 FAIL을 만드는가? |
| 6 | HTML과 이력 화면을 본다 | 정확한 데이터가 사람에게 왜곡 없이 전달되는가? |
| 7 | 종료 코드와 CI를 본다 | 실패 판정이 실제로 머지나 배포를 막는가? |
| 8 | 전체를 다시 조립한다 | 다른 프로젝트에도 옮길 수 있도록 경계를 설명할 수 있는가? |

0~4단계는 **숫자를 만드는 과정**, 5단계는 **숫자를 판단으로 바꾸는 과정**, 6~7단계는
**그 판단을 사람과 자동화에 전달하는 과정**이다.

## 사용법

### 체크 규칙

각 단계는 세 종류의 항목으로 구성된다.

| 표시 | 의미 | 체크 조건 |
|---|---|---|
| **A. 읽기** | 파일을 열어 확인 | 열어봤으면 체크 |
| **B. 실행** | 명령을 직접 돌림 | 돌려서 출력을 봤으면 체크 |
| **C. 자가진단** | 질문에 답 작성 | **답을 직접 써야 체크** — 이게 진짜 완료 기준 |

**자가진단 답은 코드를 보지 않고 쓴다.** 못 쓰겠으면 A/B로 돌아간다.
막혀도 괜찮다 — 막힌 지점을 답란에 "여기서 막힘: ○○을 모르겠다"라고 적어두면
그게 다음 대화의 출발점이 된다. 빈칸보다 훨씬 유용하다.

### 읽기 항목 표기 규칙

읽기 항목은 **"어디까지 읽나"와 "그중 무엇에 집중하나"를 분리**해서 적는다.

```
- [ ] performance/PERFORMANCE-MANAGEMENT.md §1, §2      ← 읽는 범위
      볼 것: §2.1 "왜 2단계로 나눴나"의 세 가지 이유      ← 그중 집중할 곳
```

- **왼쪽(파일 + 장/줄)이 읽는 범위다.** 그 범위는 다 읽는다
- **"볼 것"은 그 범위 안에서 특히 중요한 지점**이다. 읽는 양을 줄이라는 뜻이 아니다
- 파일 전체를 읽어야 할 때는 범위를 안 적거나 "전체"라고 적는다

긴 문서는 장을 쪼개 여러 단계에 나눠 배치했다. 아래 배치표 참고.

### PERFORMANCE-MANAGEMENT.md 장별 배치

이 문서(425행)는 한 번에 다 읽지 않는다. 해당 계층을 배울 때 그 장을 읽는 게 남는다.

| 장 | 제목 | 읽는 단계 |
|---|---|---|
| §1 | 왜 바꿨나 — 이전 구조의 한계 | 0단계 |
| §2 | 아키텍처 (2.1 왜 2단계로, 2.2 왜 파일인가) | 0단계 |
| §3 | 사용법 | 0단계 (훑기) |
| §4.1–4.2 | 저장되는 것 — 실행 메타데이터, k6 지표 | 3단계 |
| §4.3 | 저장되는 것 — 운영 지표 | 4단계 |
| §5 | 회귀 판정 | 5단계 |
| §6 | 병목 가설 자동 지목 | 5단계 |
| §7 | 리포트 | 6단계 |
| §8 | 개선 우선순위 | 8단계 |
| §9 | 알려진 한계 | 8단계 |
| §10 | 파일 지도 | 0단계 |

### AI 도우미가 이 문서를 읽는 방식

AI 도우미는 이 파일을 읽고 다음을 판단한다.

- **어디까지 진행했나** — 아래 진도 요약표
- **얼마나 이해했나** — 자가진단 답의 내용. 체크만 되어 있고 답이 비어 있으면 미완료로 본다
- **무엇을 설명할 때 배경을 생략해도 되나** — 완료된 단계의 개념은 전제하고 말한다
- **어디서 막혔나** — "여기서 막힘"이라고 적힌 곳을 우선 설명한다

그러니 답은 **자기 말로** 쓸 것. 코드를 복사해 넣으면 이해도 판단이 안 된다.

### 진도 요약표

| 단계 | 주제 | 읽기 | 실행 | 자가진단 | 완료일 |
|---|---|---|---|---|---|
| 0 | 전체 지도 | ☐ | ☐ | ☐ | |
| 1 | 환경 — 무엇을 측정하는 판인가 | ☐ | ☐ | ☐ | |
| 2 | 부하 생성 — k6가 무엇을 보내나 | ☐ | ☐ | ☐ | |
| 3 | 1차 기록 — handleSummary | ☐ | ☐ | ☐ | |
| 4 | 지표 수집 — Prometheus 조회 | ☐ | ☐ | ☐ | |
| 5 | 판정 — 기준선·규칙·엔진 | ☐ | ☐ | ☐ | |
| 6 | 표시 — 리포트·이력 | ☐ | ☐ | ☐ | |
| 7 | 집행 — 게이트·CI | ☐ | ☐ | ☐ | |
| 8 | 종합 — 추출 설계 | ☐ | ☐ | ☐ | |

### 결정 안건 진행표

학습 직후에 내리는 것이 가장 정확하다. 결정하면 `localDocs/perf-review-summary.md`의
해당 항목 상태도 같이 갱신한다.

| 안건 | 어느 단계 후 | 결정됨 |
|---|---|---|
| E-01 부하 발생기 격리 | 1단계 후 | ☐ |
| S-01 시작 로그인 몰림 처리 | 2단계 후 | ☐ |
| S-03 Zipf 파라미터 | 2단계 후 | ☐ |
| S-06 open vs closed 모델 | 2단계 후 | ☐ |
| T-03 측정 윈도우 일치 | 4단계 후 | ☐ |
| T-29 / E-39 MySQL 내부 지표를 어디까지 | 4단계 후 | ☐ |
| T-02 기준선 비교 가능성 | 5단계 후 | ☑ (2026-08-09) |
| T-08 게이트 지표 결측 처리 | 5단계 후 | ☐ |
| T-22 시나리오군별 규칙 | 5단계 후 | ☐ |
| 회귀 표의 SKIP 행 표시 | 6단계 후 | ☐ |
| E-23/24 CI 전략 | 7단계 후 | ☐ |

### 경로 규칙

이 문서의 모든 경로는 **저장소 루트 기준**이다.
명령은 별도 표시가 없으면 `performance/` 디렉터리에서 실행한다.
줄 번호는 2026-08-06 기준 — 코드를 고치면 밀리므로 함수명으로 찾는 게 안전하다.

---

# 0단계 · 전체 지도

> **목표:** 이 시스템이 무엇에 답하려고 만들어졌는지, 큰 덩어리가 몇 개인지 파악한다.
> **예상:** 40분

**쉽게 말하면:** 세부 코드를 읽기 전에 “요청을 보내고, 숫자를 모으고, 이전 결과와 비교하고,
리포트를 만드는 시스템”이라는 전체 흐름을 머릿속에 그리는 단계다.

**완료 기준:** run 하나의 최상위 구조와 2단계 수집 이유를 코드 없이 설명할 수 있다.

## A. 읽기

> 이 단계에서 `PERFORMANCE-MANAGEMENT.md`는 **§1, §2, §3, §10만** 읽는다.
> §4~§9는 해당 계층을 배우는 단계에서 읽는다 (위 장별 배치표 참고).

- [x] `performance/PERFORMANCE-MANAGEMENT.md` **§1 + §2** (약 90행)
      **볼 것:** §2.1 "왜 2단계로 나눴나"의 세 가지 이유. 이게 이 시스템의 근본 설계 판단이라
      Q0-2에서 그대로 묻는다. §2.2(왜 DB가 아니라 파일인가)는 Q0-4로 묻는다
- [x] `performance/PERFORMANCE-MANAGEMENT.md` **§3 사용법** (약 35행) — 훑기
      **볼 것:** `perf-run.js` 래퍼가 필요한 이유 3가지. 명령어는 외울 필요 없다(부록에 정리돼 있음)
- [x] `performance/PERFORMANCE-MANAGEMENT.md` **§10 파일 지도** (약 30행)
      **볼 것:** 디렉터리별 책임. 지금 전부 이해할 필요 없고 "이런 게 있다" 수준으로
- [x] `performance/README.md` **전체** — 전체 개요
- [x] `performance/experiments/README.md` **전체**
      **볼 것:** EXP-000은 Before 반복 측정과 원인 분석까지 진행됐고 After가 남아 있다.
      EXP-001~005는 계획 상태다. 실험마다 가설·변경 변수·판정 기준을 먼저 고정하는 방식을 본다

## B. 실행

- [x] 저장된 실행 하나의 최상위 구조 보기

```bash
node -e "
const r=JSON.parse(require('fs').readFileSync('reports/runs/normal-day-2026-08-05T09-39-43/run.json','utf8'));
console.log('최상위 키:', Object.keys(r));
console.log('run 키   :', Object.keys(r.run));
console.log('k6 키    :', Object.keys(r.k6));
console.log('infra 키 :', Object.keys(r.infra));
console.log('regression 키:', Object.keys(r.regression));
"
```

- [x] 리포트 하나를 브라우저로 열기 —
      `performance/reports/runs/normal-day-2026-08-05T09-39-43/report.html`
      **볼 것:** 섹션 순서. 왜 병목 가설이 맨 위에 있는지 생각해볼 것
- [x] 이력 대시보드 — `node tools/history.js --print`

## C. 자가진단

**Q0-1.** 이 시스템이 답하려는 질문은 무엇인가? (설계 문서 1장 기준 3가지)

> **A.** 


**Q0-2.** k6 안에서 바로 Prometheus를 조회해 리포트까지 만들면 더 단순한데, 왜 2단계로 나눴나? 세 가지 이유를 각각 한 문장으로.

> **A.**
> 1.그 모든 과정이 동기식이기 때문에 k6, 프로메테우스의 정보를 가지고와 리포트까지 만드는 과정에서 하나라도 실패하면 전부 실패함. 
 2단계로 나누면 만약 프로메테우스가 실패할경우 k6+프로메테우스의 운영데이터 측정까지는 완료된 상태이기에 프로메테우스 데이터 가져오기+리포트작성만 다시하면 됨
> 2.


**Q0-3.** `run.json` 하나에 들어 있는 5개 최상위 키는 각각 무슨 역할인가? 그중 어떤 것이 "원본"이고 어떤 것이 "가공물"인가?

> **A.**

**Q0-4.** 왜 이력을 DB가 아니라 파일로 저장했나? 나중에 DB로 옮길 수 있게 남겨둔 장치는 무엇인가?

> **A.**

## E. 추출 관점

- [ ] 이 시스템에서 **HighTeenDay 전용인 부분**과 **어떤 프로젝트에서도 쓸 수 있는 부분**의
      경계가 대략 어디일지 첫인상을 적어둔다. 8단계에서 이 답과 비교한다

> **첫인상:**

---

# 1단계 · 환경 — 무엇을 측정하는 판인가

> **목표:** 측정이 이뤄지는 물리적 조건을 안다. 여기서 정해진 것이 모든 숫자의 상한이다.
> **예상:** 1시간 30분

**쉽게 말하면:** 같은 코드도 노트북 CPU, Docker 메모리, DB 캐시 크기가 다르면 다른 숫자가
나온다. 이 단계는 애플리케이션보다 먼저 “실험실 조건”을 확인하는 과정이다.

**완료 기준:** 각 컨테이너의 자원 한계, 데이터셋 전환 절차, 현재 관측할 수 없는 호스트 지표를
설명할 수 있다.

## A. 읽기

| 파일 | 볼 것 |
|---|---|
| `performance/environment/README.md` | 토폴로지 다이어그램과 원칙. 특히 32-33행의 "k6와 대상 분리" 선언 |
| `performance/environment/docker-compose.perf.yml:11` (mysql) | `:49` 한계 `cpus: 2.0, memory: 2g` |
| 같은 파일 `:56` (redis) | `:67` 한계 `cpus: 1.0, memory: 512m` |
| 같은 파일 `:74` (app) | `:129` 한계 `cpus: 2.0, memory: 2560m`. JVM 힙(`-Xmx`)과 컨테이너 한계의 차이 |
| 같은 파일 `:131`~`:181` | prometheus/grafana/exporter들 — **`deploy.resources`가 없다**는 점 확인 |
| `performance/environment/prometheus/prometheus.yml` | job 4개(spring-app/mysql/redis/containers), `scrape_interval` 5s, `evaluation_interval` 15s |
| `performance/datasets/profiles.json:2-6` | 프로파일 5종의 규모 차이 (smoke 50글 ~ xlarge 50만글) |
| `performance/datasets/seed.js` | API 기반 시딩인 이유(서비스 로직을 그대로 태운다). `zipfIndex` 유사 로직 위치 |
| `performance/environment/bootstrap.js:129` | `daily_hot_post` 테이블 생성 (BTL-009 대응) |
| 같은 파일 `:146` | Redis FLUSHALL — 프로파일 전환 시 필수인 이유 |
| `performance/environment/docker-compose.seed.yml` | 시드 전용 오버라이드. Hikari 10→50, 힙 1g→2g |

## B. 실행

- [ ] 현재 프로파일 확인: `performance/environment/.env.perf`의 `DATASET_PROFILE`
- [ ] 스택이 떠 있다면 실제 적용된 한계 확인

```bash
docker inspect perf-app --format '{{.HostConfig.NanoCpus}} {{.HostConfig.Memory}}'
docker stats --no-stream
```

- [ ] Prometheus 타깃 상태: http://localhost:9090/targets
      **볼 것:** 4개 job이 전부 UP인가. containers(cAdvisor)가 실제로 데이터를 주는가
- [ ] cAdvisor가 컨테이너별 시리즈를 만드는지 확인 (Windows Docker Desktop에서 실패하는 것이 알려져 있음)

```bash
curl -s 'http://localhost:9090/api/v1/query?query=container_cpu_usage_seconds_total{name="perf-app"}' | head -c 400
```

## C. 자가진단

**Q1-1.** 앱·MySQL·Redis에 걸린 CPU 한계의 합은 몇 코어인가? 여기에 관측 스택과 k6까지 더하면 당신 PC의 코어 수와 어떤 관계인가? 그게 측정에 어떤 영향을 주나?

> **A.**

**Q1-2.** 데이터셋을 small에서 large로 바꾸면 데이터는 200배가 된다. 그런데 **같이 바뀌지 않는 것**을 세 가지 이상 대라. 각각이 측정 결과를 어떻게 왜곡하나?

> **A.**

**Q1-3.** 이 환경에서 **원리적으로 측정할 수 없는 것**을 대라. (힌트: 익스포터 목록에서 빠진 것, 컨테이너 지표의 환경 의존성)

> **A.**

**Q1-4.** 시드 데이터는 측정할 때와 다른 앱 설정으로 만들어진다. 무엇이 다르고, 왜 그게 데이터의 성질을 바꾸나?

> **A.**

**Q1-5.** `bootstrap.js`가 하는 일 4가지를 대라. CI 워크플로가 이걸 건너뛰면 정확히 어디서 터지나?

> **A.**

## D. 이 단계의 결함

`localDocs/perf-findings-environment.md`에서 확인:

- [ ] **E-01** 부하 발생기가 SUT와 같은 호스트 — 원칙 선언은 있는데 강제 장치가 없다
- [ ] **E-02** 관측 계층에 리소스 한계 없음
- [ ] **E-09** node_exporter 부재 → E-01의 오염을 측정할 수단이 없다
- [ ] **E-10** Docker Desktop에서 cAdvisor 불능 → 컨테이너 지표 전멸 가능
- [ ] **E-04** 프로파일이 바뀌어도 버퍼풀/maxmemory 고정
- [ ] **E-15/E-16** 채팅 메시지·알림 미시드, medium 프로파일 미생성
- [ ] **E-22** Redis가 프로파일 전환을 넘어 표류

## E. 추출 관점

- [ ] 이 계층에서 **프로젝트 전용**인 것:

> **A.** _(힌트: 컨테이너명 `perf-app`/`perf-mysql`, Spring Actuator 전제, 스키마 부트스트랩)_

- [ ] **일반화 가능**한 것:

> **A.** _(힌트: compose로 한계를 고정한다는 발상, 프로파일 개념, 스크레이프 설정)_

## F. 결정 안건 — 여기까지 했으면 결정할 수 있다

**E-01. 부하 발생기를 격리할 것인가?**

- 선택지 A. 두 번째 머신/노트북에서 k6를 돌린다 → 원칙대로지만 장비와 네트워크 설정 필요
- 선택지 B. 같은 호스트를 유지하되 node_exporter를 추가해 **오염을 측정하고 기록**한다 → 현실적, "한계를 아는 측정"이 됨
- 선택지 C. 현행 유지 + 문서에 한계만 명시 → 비용 0, 신뢰도 낮음

> **내 결정:**
>
> **이유:**

---

# 2단계 · 부하 생성 — k6가 무엇을 보내나

> **목표:** VU 하나가 무엇을 하는지 코드 수준에서 재구성할 수 있게 된다.
> **예상:** 3시간 (가장 오래 걸리는 단계)

**쉽게 말하면:** 성능 테스트의 입력은 단순한 “요청 수”가 아니라 사용자 행동 모델이다. 로그인,
조회, 쓰기, 대기 시간이 잘못되면 서버가 정확해도 실험 결론은 틀린다.

**완료 기준:** VU 한 명의 iteration을 처음부터 끝까지 설명하고, 선언한 저니 비율과 실제 요청
비율이 왜 다른지 말할 수 있다.

## A. 읽기

### 공통 라이브러리 (여기가 핵심)

| 파일:줄 | 볼 것 |
|---|---|
| `performance/scripts/lib/config.js:10` | `BASE_URL` 기본값 — 발생기가 로컬을 가리킨다 |
| 같은 파일 `:16` | `DATASET` 기본 `small` |
| 같은 파일 `:21` | `THINK` — uniform(1,4). 모든 저니가 같은 분포를 쓴다 |
| 같은 파일 `:42` | `BREAKDOWN_FEATURES` — 분해축으로 쓸 기능 목록 |
| 같은 파일 `:47` | `BREAKDOWN_THRESHOLDS` — `p(99)<600000` 더미 임계값. **왜 이게 필요한지가 시험 포인트** |
| 같은 파일 `:61` | `DEFAULT_THRESHOLDS` — 진짜 SLO + 더미가 합쳐진 것 |
| `performance/scripts/lib/session.js:17` | `login()` — 태그가 `op:write`인 것 확인 |
| 같은 파일 `:51` | `withAuth()` — 401 시 refresh 후 재시도 |
| 같은 파일 `:71` | `ensureSession()` — **쿠키 자가 iteration마다 리셋된다는 주석을 정독할 것** |
| `performance/scripts/lib/data.js:28` | `myUser()` — `vu.idInTest % users.length` |
| 같은 파일 `:39` | `zipfIndex()` — 수식을 종이에 써볼 것 |
| 같은 파일 `:46` | `hotPost()` |
| 같은 파일 `:51` | `randomPost()` — **호출처가 있는지 grep 해볼 것** |

### 저니와 시나리오

| 파일:줄 | 볼 것 |
|---|---|
| `performance/scenarios/lib/workload.js:34` | `journeyBrowse()` — 목록 조회 흐름 |
| 같은 파일 `:58` | `journeyEngage()` |
| 같은 파일 `:78` | `journeyWrite()` |
| 같은 파일 `:105` | `journeyChatWs()` — 15~30초 점유 |
| 같은 파일 `:120` | `journeyNotification()` — 상태를 소모한다 |
| 같은 파일 (하단) | `PROFILE_*` 가중치 정의와 `mixedIteration()` |
| `performance/scenarios/normal-day.js:19` | `options` — executor 종류, `:24` stages, `:32` thresholds |
| `performance/scenarios/stress.js` / `spike.js` | executor가 `ramping-vus`인 것과 자체 thresholds로 교체하는 것 |
| `performance/scenarios/breakpoint.js` | 유일한 `ramping-arrival-rate` |
| `performance/scenarios/README.md` | 시나리오 카탈로그와 의도 |

## B. 실행

- [ ] `zipfIndex`가 실제로 뱉는 분포 확인 — **직접 돌려볼 것**

```bash
node -e "
const zipf=(n,skew=0.7)=>Math.floor(Math.pow(n,Math.pow(Math.random(),1+skew)))%n;
const N=500, hits={};
for(let i=0;i<100000;i++){const x=zipf(N); hits[x]=(hits[x]||0)+1;}
const top=Object.entries(hits).sort((a,b)=>b[1]-a[1]).slice(0,5);
console.log('상위 5개 인덱스와 비중:');
top.forEach(([k,v])=>console.log('  index '+k+' : '+(v/1000).toFixed(1)+'%'));
console.log('index 0 등장 횟수:', hits[0]||0);
console.log('서로 다른 인덱스 수:', Object.keys(hits).length, '/', N);
"
```

- [ ] 페이지 번호 분포도 같은 방법으로 (`zipfIndex(5)`) — 0페이지가 몇 번 나오는지
- [ ] 실제 런에서 로그인이 몇 번 일어났는지 확인

```bash
node -e "
const r=JSON.parse(require('fs').readFileSync('reports/runs/normal-day-2026-08-04T06-38-42/run.json','utf8'));
const m=r.k6.rawMetrics;
console.log('iterations :', m.iterations.values.count);
console.log('http_reqs  :', m.http_reqs.values.count);
const login=Object.keys(m).filter(k=>k.includes('login'));
console.log('로그인 관련 메트릭:', login);
console.log('breakdown 축:', Object.keys(r.k6.breakdown));
console.log('feature별:', Object.keys(r.k6.breakdown.feature||{}));
"
```

- [ ] 짧은 스모크 실행 (스택이 떠 있을 때). k6 콘솔 출력의 checks/http_req_failed를 눈으로 확인

```bash
node tools/perf-run.js scripts/boards.js --vus 5 --duration 30s --no-collect --note "학습용 스모크"
```

## C. 자가진단

**Q2-1.** `normal-day` 시나리오에서 VU 하나가 한 iteration 동안 하는 일을 순서대로 서술하라. (`mixedIteration` 진입부터 종료까지)

> **A.**

**Q2-2.** 저니 가중치(browse 40%, engage 15% 등)는 **요청 비율과 다르다.** 이유를 두 가지 대라. 하나는 로그인과 관련 있고, 하나는 iteration 길이와 관련 있다.

> **A.**

**Q2-3.** k6가 `http_req_duration{feature:posts}` 같은 서브메트릭을 만들어주는 조건은 무엇인가? `stress.js`가 `DEFAULT_THRESHOLDS`를 버리고 자체 thresholds를 쓰면 어떤 일이 생기나?

> **A.**

**Q2-4.** `op:write` SLO(p95<500ms)는 실제로 무엇의 응답시간을 재고 있었나? 도메인 쓰기 성능 회귀가 이 게이트에 잡히기 어려운 이유는?

> **A.**

**Q2-5.** `zipfIndex(500)`을 10만 번 호출하면 index 0은 몇 번 나오나? 왜 그런가? 수식의 어느 부분 때문인가?

> **A.**

**Q2-6.** closed 모델(`ramping-vus`)과 open 모델(`ramping-arrival-rate`)의 차이는? 한계 용량을 찾는 테스트에 closed 모델을 쓰면 왜 한계를 못 찾나?

> **A.**

## D. 이 단계의 결함

`localDocs/perf-findings-scripts.md`:

- [ ] **S-01** 매 iteration 로그인은 해결됨. 시작 시 VU 전원이 동시에 로그인해 짧은 실행의
      p95를 오염하는 후속 문제를 확인
- [ ] **S-02** 쓰기 SLO의 75%가 auth
- [ ] **S-03** zipfIndex가 index 0을 못 뽑고 index 1에 20~28% 집중
- [ ] **S-04** 게시판 0페이지가 전 시나리오에서 미조회
- [ ] **S-06** stress/spike/soak이 closed 모델 → coordinated omission
- [ ] **S-07** VU 수 > 시드 계정 수 → 계정 공유
- [ ] **S-09** 한계탐색 시나리오에 breakdown·check 게이트 없음
- [ ] **S-11/S-12** 런이 데이터셋을 오염, 상태 소모 저니가 중도 무력화
- [ ] **S-15** `randomPost()`가 죽은 코드 → 콜드 읽기 경로 부재
- [ ] **S-16** 체크가 상태코드만 검증 (`200 []`도 통과)

## E. 추출 관점

- [ ] 프로젝트 전용:

> **A.**

- [ ] 일반화 가능:

> **A.** _(힌트: 저니/가중치 프로파일이라는 구조, 태그 축 선언으로 분해를 만드는 기법)_

## F. 결정 안건

**S-01. 시작 시 BCrypt 로그인 몰림을 어떻게 처리할 것인가?**

VU별 쿠키 저장소로 세션을 재사용하는 수정은 완료됐다. 이제 남은 문제는 모든 VU가 t=0에
로그인하면서 2 CPU에서 BCrypt가 한꺼번에 경합하는 현상이다.

- 선택지 A. VU를 서서히 늘려 첫 로그인을 자연스럽게 분산 → 실제 유입과 가깝지만 램프 구간 정의 필요
- 선택지 B. 첫 로그인 전에 VU별 작은 무작위 지연을 둠 → 구현이 단순하지만 지연 분포 근거 필요
- 선택지 C. 시작 로그인을 warmup으로 분리하고 판정 구간에서 제외 → 기능 성능은 깨끗해지지만
  세션 생성 비용은 별도 지표와 시나리오로 보존해야 함

어느 선택을 하든 `auth.js`의 로그인 전용 성능 측정은 유지하고, 전체 지표와 기능별 지표를 함께
검증해야 한다.

> **내 결정:**
>
> **이유:**

**S-03. Zipf 파라미터를 어떻게 정할 것인가?**

- 문서는 s≈1.07(80-20)을 말하고, 구현은 멱변환 근사(skew 0.7)에 `%n` 랩어라운드
- 정할 것: ① 진짜 역CDF를 쓸 것인가 ② s값을 얼마로 할 것인가 ③ 근거는 무엇인가

> **내 결정:**
>
> **이유(s값 근거):**

**S-06. 어떤 시나리오를 open 모델로 바꿀 것인가?**

- 최소: stress/breakpoint (한계 탐색이 목적)
- 확장: spike(스파이크 재현), soak
- 유지: normal-day(사용자 수 기반 모델이 자연스러움)

> **내 결정:**
>
> **이유:**

---

# 3단계 · 1차 기록 — handleSummary

> **목표:** k6 프로세스가 죽기 직전 무엇을 어떻게 남기는지 안다. 이후 모든 것의 원본.
> **예상:** 1시간

**쉽게 말하면:** k6가 끝난 직후의 첫 저장 단계다. 여기서 잘못 계산해 파일에 넣은 값은 이후
수집기와 리포트가 아무리 정확해도 계속 틀린 채 남는다.

**완료 기준:** `k6.json`, `summary.txt`, `run.json`의 역할 차이와 raw metric이 headline·breakdown으로
바뀌는 과정을 설명할 수 있다.

## A. 읽기

- [ ] `performance/PERFORMANCE-MANAGEMENT.md` **§4.1 + §4.2** (실행 메타데이터 / k6 지표)
      **볼 것:** RPS와 TPS를 구분하는 이유, `scriptVersion`의 목적, `rawMetrics`를 통째로 남기는 이유

| 파일:줄 | 볼 것 |
|---|---|
| `performance/scripts/lib/summary.js` 상단 주석 | 여기서 Prometheus를 조회하지 않는 이유 3가지 |
| 같은 파일 `metadata()` | 환경변수로 주입되는 메타데이터 목록. `startedAt`을 역산하는 방식 |
| 같은 파일 `trendStats()` | **없는 분위수를 0으로 안 채우는 이유** — 주석 정독 |
| 같은 파일 `breakdown()` | 서브메트릭 태그 파싱. 다중 태그를 제외하는 이유 |
| 같은 파일 `:150` `overall` | RPS와 TPS를 구분하는 이유. `failedRequests`의 passes/fails 주석 |
| 같은 파일 하단 | `thresholdsPassed`, runId 생성, 반환하는 파일 경로들 |
| `performance/tools/perf-run.js:55` | `TREND_STATS` — 이게 없으면 p99가 계산조차 안 된다 |
| 같은 파일 `:80` `gitMeta()` | 커밋/브랜치/실행자 수집, `+dirty` 표시 |
| 같은 파일 `:99` `scriptVersion()` | 스크립트 지문. **무엇을 해싱하고 무엇을 빠뜨리는가** |
| 같은 파일 `:42` `stagedRunIds()` | 실행 전후 diff로 runId를 식별하는 새 로직 |

## B. 실행

- [ ] 스테이징 파일과 정리된 파일의 관계 확인

```bash
ls reports/runs/ | head -20
ls reports/runs/normal-day-2026-08-05T09-39-43/
```

- [ ] 원본 k6.json과 최종 run.json의 차이

```bash
node -e "
const fs=require('fs');
const d='reports/runs/normal-day-2026-08-05T09-39-43/';
const k=JSON.parse(fs.readFileSync(d+'k6.json','utf8'));
const r=JSON.parse(fs.readFileSync(d+'run.json','utf8'));
console.log('k6.json 최상위 :', Object.keys(k));
console.log('run.json 최상위:', Object.keys(r));
console.log('collect가 추가한 것:', Object.keys(r).filter(x=>!Object.keys(k).includes(x)));
console.log('phase:', k.phase, '->', r.phase);
"
```

- [ ] `--summary-trend-stats` 없이 k6를 직접 돌려 p99가 사라지는 것 확인 (선택)

## C. 자가진단

**Q3-1.** `runId`는 언제, 어디서, 무엇으로 만들어지나? 이 타이밍 때문에 `perf-run.js`가 겪었던 문제는 무엇인가?

> **A.**

**Q3-2.** `handleSummary` 안에서 Prometheus를 조회하지 않는 이유 세 가지를 대라.

> **A.**

**Q3-3.** p99가 측정되지 않았을 때 `0`으로 채우면 무슨 일이 생기나? `missingPercentiles`는 누가 어떻게 쓰나?

> **A.**

**Q3-4.** `thresholdsPassed`는 무엇들을 AND로 묶은 값인가? 그중 판정 의미가 없는 것이 섞여 있는데 무엇인가? 이 boolean이 어디에 쓰이길래 문제가 되나?

> **A.**

**Q3-5.** `scriptVersion`은 무엇의 해시인가? `scripts/lib/session.js`를 고치면 이 값이 바뀌나? 그게 왜 문제인가?

> **A.**

## D. 이 단계의 결함

- [ ] **S-05** `failedRequests`가 성공 요청 수를 셌음 (해결)
- [ ] **S-17** 다중 태그 서브메트릭 오파싱 (해결)
- [ ] **T-07** scriptVersion이 진입 파일만 해싱, 라이브러리 변경을 놓침 (미해결)
- [ ] **L6** thresholdsPassed가 더미 threshold까지 포함 (미해결)
- [ ] **S-08** overall이 램프업 포함 전구간 집계 (미해결 — 4단계 T-03과 한 쌍)

## E. 추출 관점

- [ ] 프로젝트 전용 / 일반화 가능:

> **A.** _(힌트: handleSummary로 자기완결 레코드를 남긴다는 발상 자체는 k6를 쓰는 누구에게나 유효)_

---

# 4단계 · 지표 수집 — Prometheus 조회

> **목표:** "왜 느린가"에 답하는 데이터가 어떻게 만들어지는지 안다.
> **예상:** 2시간

**쉽게 말하면:** CPU와 DB 지표는 이미 숫자 하나로 존재하는 것이 아니다. 어느 라벨을 고르고,
몇 초 간격으로 보고, 평균·최댓값 중 무엇을 취하느냐에 따라 전혀 다른 결론이 나온다.

**완료 기준:** 지표 하나가 catalog → PromQL → time series → aggregate → `infra.flat`으로 저장되는
경로와 결측이 생기는 지점을 설명할 수 있다.

## A. 읽기

- [ ] `performance/PERFORMANCE-MANAGEMENT.md` **§4.3** (운영 지표)
      **볼 것:** Prometheus 원본을 복사하지 않고 구간 요약만 저장하는 이유,
      avg·max·p95를 셋 다 저장하는 이유, 포화도를 파생하는 이유, CPU throttling을 1급 지표로 올린 이유

| 파일:줄 | 볼 것 |
|---|---|
| `performance/tools/lib/promql.js:31` | `toRangeSelector()` — `$RANGE` 치환 |
| 같은 파일 `:63` `PromClient` | 재시도·백오프 구조 |
| 같은 파일 `:104` `ping()` | 시작 시 1회만 확인한다는 점 |
| 같은 파일 `:168` `evalSpec()` | 카탈로그 항목 하나를 실행하는 경로 |
| `performance/tools/lib/metrics-catalog.js:56` | `gaugeStats()` — avg/max/p95 3종을 만드는 헬퍼. 서브쿼리 `[$RANGE:]` |
| 같은 파일 `:71` `GROUPS` | 9개 그룹: `:73` cpu, `:109` memory, `:132` heap, `:166` gc, `:221` mysql, `:283` redis, `:341` pool, `:384` network, `:415` disk |
| 같은 파일 `:447` `computeDerived()` | 포화도 파생. 105% 상한 처리 |
| `performance/tools/collect.js:68`~`:96` | `collectInfra()` — **`flat[spec.key]`로 평면 맵을 만드는 곳. T-01의 반대편** |
| 같은 파일 `:207` | warmup 만큼 창을 미는 곳 |
| 같은 파일 `:218` | 그 창이 Prometheus 조회에만 전달되는 것 확인 |

## B. 실행

- [ ] `infra.flat`의 키 모양을 직접 확인 (T-01을 이해하는 핵심)

```bash
node -e "
const r=JSON.parse(require('fs').readFileSync('reports/runs/normal-day-2026-08-05T09-39-43/run.json','utf8'));
console.log('infra.flat 키 (앞 8개):');
Object.keys(r.infra.flat).slice(0,8).forEach(k=>console.log('   \"'+k+'\"'));
console.log('');
console.log('k6.overall 키 (앞 8개):');
Object.keys(r.k6.overall).slice(0,8).forEach(k=>console.log('   \"'+k+'\"'));
console.log('');
console.log('infra.flat 은 중첩인가? flat.cpu =', r.infra.flat.cpu);
console.log('평면 키로는?      flat[\"cpu.cores.max\"] =', r.infra.flat['cpu.cores.max']);
"
```

- [ ] 측정 창 불일치 확인 (T-03)

```bash
node -e "
const fs=require('fs');
for(const id of ['normal-day-2026-08-05T09-39-43','comments-2026-08-05T08-52-13']){
  const r=JSON.parse(fs.readFileSync('reports/runs/'+id+'/run.json','utf8'));
  console.log(id);
  console.log('  k6 구간   :', r.run.durationSec+'초');
  console.log('  infra 구간:', r.infra.window.durationSec+'초 (warmup '+r.infra.window.warmupExcludedSec+'초 제외)');
}
"
```

- [ ] Prometheus에서 카탈로그 쿼리 하나를 직접 실행 (http://localhost:9090 그래프 탭)
      예: `increase(mysql_global_status_slow_queries[2m])` — 결과가 정수가 아닌 것 확인
- [ ] **카탈로그에 없는데 Prometheus엔 있는 지표 찾아보기** (T-29 확인)

```bash
# 전부 값이 나오는데 metrics-catalog.js 에는 등록돼 있지 않다
for q in mysql_global_status_innodb_row_lock_time \
         mysql_global_status_innodb_row_lock_time_max \
         mysql_global_status_created_tmp_disk_tables; do
  echo "$q"
  curl -s "http://localhost:9090/api/v1/query?query=$q" | grep -o '"value":\[[^]]*\]'
done
# 풀스캔 지표 (라벨로 나뉘어 있어 grep 으로는 안 보인다)
curl -s 'http://localhost:9090/api/v1/query?query=mysql_global_status_handlers_total%7Bhandler%3D%22read_rnd_next%22%7D' | grep -o '"value":\[[^]]*\]'
```

- [ ] 수집 오류 목록 확인

```bash
node -e "
const r=JSON.parse(require('fs').readFileSync('reports/runs/normal-day-2026-08-05T09-39-43/run.json','utf8'));
console.log('수집 실패 항목:', r.infra.errors.length);
r.infra.errors.slice(0,5).forEach(e=>console.log('  ', e.key, '—', e.error));
console.log('값이 null 인 지표 수:', Object.values(r.infra.flat).filter(v=>v==null).length);
"
```

## C. 자가진단

**Q4-1.** `$RANGE`는 무엇으로 치환되나? 26초짜리 런에서 `increase(...[$RANGE])`가 왜 신뢰하기 어려운 값이 되나?

> **A.**

**Q4-2.** 지표 하나에 avg·max·p95를 모두 저장하는 이유는? 셋 중 하나만 본다면 각각 어떤 오판을 하게 되나?

> **A.**

**Q4-3.** 포화도(`saturation.*`)를 따로 파생하는 이유는? 절대값(CPU 1.4코어)과 비교해 어떤 장점이 있나?

> **A.**

**Q4-4.** `infra.flat`과 `k6.overall`의 자료구조는 어떻게 다른가? 왜 그렇게 설계됐나? 이 차이가 만든 함정은?

> **A.**

**Q4-5.** Prometheus가 통째로 죽으면 수집 결과와 최종 판정은 어떻게 되나? 익스포터 하나만 죽으면?

> **A.**

**Q4-6.** 새 지표를 하나 추가하려면 어느 파일 어디를 고치면 되나? 왜 한 곳만 고쳐도 되나?

> **A.**

## D. 이 단계의 결함

- [ ] **T-03** warmup이 k6 지표에는 미적용 → 두 숫자가 다른 시간대 (미해결)
- [ ] **T-18** PromQL 품질 묶음: `increase` 외삽, `rate[$RANGE]` 전구간 평균, 서브쿼리 해상도 15s, `max()` 폴드, job 셀렉터 누락, `redis.hitRatioPct` 0% 오경보
- [ ] **T-29** 락·트랜잭션·풀스캔 지표가 Prometheus에 오는데 카탈로그에 미등록 —
      **BTL-003이 "확정" 병목인데 락 대기 시간을 잴 수단이 없다** (미해결)
- [ ] **E-39** 익스포터가 기본 collector만 → 쿼리별 digest 없음 → "어느 쿼리인가"에 답 불가 (미해결)
- [ ] **E-40** 실행계획은 시계열이 아니라 수집 대상이 아니다 — 원인 규명 단계의 수동 도구 (판단 기록)
- [ ] **E-11** 스크레이프 5s vs 짧은 런 → 샘플 5~10개
- [ ] **E-10** cAdvisor 불능 시 컨테이너 지표 전멸

## E. 추출 관점

- [ ] 프로젝트 전용:

> **A.** _(힌트: 컨테이너명, Spring/Micrometer 메트릭명, MySQL/Redis 익스포터 전제)_

- [ ] 일반화 가능:

> **A.** _(힌트: 카탈로그로 지표를 선언하는 구조, `$RANGE` 치환, 포화도 파생 개념)_

## F. 결정 안건

**T-03. 측정 창을 어떻게 일치시킬 것인가?**

- 선택지 A. k6 지표도 warmup 구간을 잘라낸다 → 시나리오에 phase 태그를 넣고 태그별 집계
- 선택지 B. infra도 전구간으로 맞춘다 → 간단하지만 램프업 자원 사용이 섞임
- 선택지 C. warmup을 없애고 **워밍업 트래픽 스테이지**를 시나리오에 넣는다 → 정석이지만 시나리오 전부 수정
- 어느 쪽이든: warmup 값을 인덱스에 저장해 기준선 비교 시 창이 다르면 경고

> **내 결정:**
>
> **이유:**

**T-29 / E-39. MySQL 내부 지표를 어디까지 볼 것인가?**

세 가지가 성격이 완전히 다르다. 하나로 묶어 결정하면 안 된다.

| 대상 | 성격 | 비용 | 상태 |
|---|---|---|---|
| 락 대기·롤백·풀스캔·임시테이블 | 시계열 (**이미 수집 중**) | 카탈로그 6줄, 오버헤드 0 | 등록만 하면 끝 |
| 쿼리별 digest | 시계열이나 고카디널리티 | 익스포터 플래그 + **리포트 표현 설계** + 관측 오버헤드 | 새 설계 필요 |
| 실행계획(EXPLAIN) | 시계열 아님 | — | 수집 대상 아님 (E-40) |

- **1번은 사실상 결정할 게 없다.** BTL-003이 "확정" 병목인데 락 대기 시간을 못 재는 상태다.
  다만 T-08(결측 처리) 방침을 먼저 정하는 게 안전하다 — 안 그러면 새 지표가 결측일 때
  또 조용히 SKIP→PASS 된다
- **2번이 진짜 결정 안건이다.** 선택지 A. 상시 켠다 / B. `docker-compose.deep.yml` 오버레이로
  분석할 때만 / C. 당분간 안 한다(EXP-005에서 필요해지면 그때)

> **1번 (락·트랜잭션 지표 등록) — 언제 할 것인가:**
>
> **2번 (digest) — 내 결정:**
>
> **이유:**

---

# 5단계 · 판정 — 기준선·규칙·엔진

> **목표:** PASS/WARN/FAIL이 만들어지는 전 과정을 재구성할 수 있다. **이 시스템의 심장부.**
> **예상:** 3시간

**쉽게 말하면:** 현재 값 자체만 보는 절대 기준과 이전 실행 대비 변화를 보는 상대 기준을 합쳐
판정한다. 잘못된 이전 실행을 고르거나 기준선이 없는데도 PASS처럼 보이면 전체 시스템의 결론이
무너진다.

**완료 기준:** 기준선 선택 조건, SKIP·suppressed 차이, gate가 종료 코드에 영향을 주는 과정을
설명하고 EXP-000에서 왜 기준선이 12회 모두 null이었는지 말할 수 있다.

## A. 읽기

### 설계 의도부터

- [ ] `performance/PERFORMANCE-MANAGEMENT.md` **§5 회귀 판정**
      **볼 것:** 오탐 4장치, 기준선 선택 원칙, gate를 아껴 배분한 이유
- [ ] `performance/PERFORMANCE-MANAGEMENT.md` **§6 병목 가설 자동 지목**
      **볼 것:** 지목 규칙 표. "가설이지 확정된 원인이 아니다"라고 못박는 이유
- [ ] `performance/regression/README.md` **전체** — 필드별 의미
- [ ] `performance/experiments/EXP-000-measurement-integrity/README.md` **§6~§7**
      **볼 것:** 같은 조건 10회의 p95 CV가 108.77%였던 이유와, threshold 실패 필터 때문에
      기준선 후보가 전부 사라진 흐름. T-02와 S-10을 실제 실행에서 확인한 사례다

### 규칙

- [ ] `performance/regression/rules.json` 전체 훑기
      **볼 것:** ① `gate: true`가 몇 개, 무엇인가 ② key 접두사가 `k6.overall.*`인지 `infra.flat.*`인지
      ③ `noiseFloor`/`minBaseline`이 지표마다 다른 이유

### 기준선 선택

| 파일:줄 | 볼 것 |
|---|---|
| `performance/tools/lib/repository.js:217` | `findPrevious()` — 필터 조건 4개. **무엇을 보고 무엇을 안 보는가** |
| 같은 파일 `:225` | `thresholdsPassed !== false` — 3단계의 그 boolean이 여기 쓰인다 |
| 같은 파일 `:107` | `toIndexEntry()` — 인덱스에 저장되는 필드. `dataset`, `vusMax`가 있는데 필터엔 안 쓰인다 |

### 판정 엔진 (이 순서로)

| 파일:줄 | 볼 것 |
|---|---|
| `performance/tools/lib/regression.js:37` | `pick()` — **T-01의 자리.** 평면 키 우선 로직 |
| 같은 파일 `:55` | `validateRules()` — 새로 추가된 규칙 검증 |
| 같은 파일 `:103` | `evaluateRule()` — 절대 게이트 → 노이즈 하한 → 상대 비교 순서 |
| 같은 파일 `:216` | `baselineScriptChanged()` — 스크립트 지문 비교 |
| 같은 파일 `:223` | `analyze()` — 전체 조립 |
| 같은 파일 `:232`~`:234` | **게이트의 실체 3줄.** `gate:true`인 FAIL만 verdict를 FAIL로 |
| 같은 파일 `counts` 블록 | `skipped`(평가 불가)와 `suppressed`(노이즈 억제) 분리 |
| 같은 파일 `:283` | `bottleneckHints()` — 판정과 별개 경로. 브래킷 접근이라 T-01을 피해갔다 |
| `performance/tools/collect.js:224` | `analyze()` 호출 지점 |

### 테스트를 명세로 읽기

- [ ] `performance/tools/test/regression.test.js` — 특히 "T-01 회귀 테스트" 주석 케이스

## B. 실행

- [ ] 테스트 실행: `npm test`
- [ ] **일부러 깨보기 (강력 추천).** `pick()`을 옛 버전으로 되돌리고 테스트를 돌린다

```bash
# regression.js:37 의 pick 본문을 아래 한 줄로 임시 교체
#   return dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
npm test    # T-01 회귀 테스트가 빨갛게 뜨는지 확인 → 되돌리기
```

- [ ] 저장된 런을 현재 엔진으로 재분석 (파일은 안 바뀜)

```bash
node -e "
const {analyze}=require('./tools/lib/regression');
const r=JSON.parse(require('fs').readFileSync('reports/runs/normal-day-2026-08-05T09-39-43/run.json','utf8'));
const res=analyze(r,null);
console.log('counts:', JSON.stringify(res.counts));
res.comparisons.filter(c=>c.verdict!=='PASS').forEach(c=>
  console.log(' ', c.verdict.padEnd(4), c.key.padEnd(38), c.current==null?'(값없음)':Number(c.current).toFixed(2)));
"
```

- [ ] 기준선이 어떻게 선택됐는지 확인

```bash
node -e "
const fs=require('fs');
for(const id of ['normal-day-2026-08-05T09-39-43','friends-2026-08-05T09-00-06']){
  const r=JSON.parse(fs.readFileSync('reports/runs/'+id+'/run.json','utf8'));
  const g=r.regression;
  console.log(id);
  console.log('  기준선:', g.baselineRunId, '('+g.baselineStartedAt+')');
  console.log('  현재 dataset/vus:', r.run.dataset, '/', r.k6.overall.vusMax);
  const idx=JSON.parse(fs.readFileSync('reports/index.json','utf8'));
  const b=idx.runs.find(x=>x.id===g.baselineRunId);
  if(b) console.log('  기준선 dataset/vus:', b.dataset, '/', b.vusMax);
}
"
```

## C. 자가진단

**Q5-1.** 기준선은 어떤 조건으로 선택되나? 조건을 전부 나열하고, **인덱스에 저장돼 있는데 조건에 안 쓰이는 필드**를 대라.

> **A.**

**Q5-2.** 오탐을 줄이는 4가지 장치를 대고, **각각이 없으면 구체적으로 무슨 일이 생기는지** 예를 들어 설명하라.

> **A.**

**Q5-3.** `gate: true`와 `false`의 차이는 verdict와 종료 코드에 어떻게 반영되나? 지금 게이트로 지정된 10개는 무엇인가?

> **A.**

**Q5-4.** 규칙 하나가 SKIP이 되는 경우는 언제인가? SKIP은 최종 verdict에 어떻게 반영되나? 그게 왜 위험한가?

> **A.**

**Q5-5.** `scriptChanged`면 FAIL을 WARN으로 낮춘다. 이 설계의 의도는 무엇이고, 어떤 구멍이 있나?

> **A.**

**Q5-6.** `counts.skipped`와 `counts.suppressed`는 각각 무엇을 세나? 왜 분리해야 했나?

> **A.**

**Q5-7.** normal-day 런의 p95가 60000ms로 기록됐다. 이 숫자를 그대로 믿으면 안 되는 이유는? 다음 런이 훨씬 더 나빠지면 판정이 어떻게 되나?

> **A.**

## D. 이 단계의 결함

`localDocs/perf-findings-tools.md`:

- [ ] **T-01** pick 평면 키 (해결)
- [ ] **T-26** rules.json 무검증 (해결)
- [x] **T-02** 기준선이 dataset/VU를 무시 (해결 — 2026-08-09)
- [ ] **T-08** 결측 = SKIP = 사실상 PASS (미해결)
- [ ] **T-04** N=1 비교, 타임아웃 검열 미감지 (미해결)
- [ ] **T-07** scriptVersion 범위 + 게이트 전면 해제 (미해결)
- [ ] **T-22** 시나리오 무관 단일 규칙 (미해결)
- [ ] **T-23/24** 게이트 선택이 진단 가치와 반대, 강상관 지표 5개 동시 게이트 (미해결)

## E. 추출 관점

- [ ] 프로젝트 전용:

> **A.**

- [ ] 일반화 가능 (아마 여기가 CLI의 핵심 가치):

> **A.** _(힌트: rules.json 스키마, 4장치, 파일 기반 이력, 기준선 자동 선택)_

## F. 결정 안건 — 여기가 가장 중요하다

**T-02. 무엇이 "비교 가능한 런"인가?**

- 선택지 A. `dataset` + `vusMax`까지 일치해야 기준선으로 인정 → 엄격하지만 조건을 바꾸면 기준선이 사라짐
- 선택지 B. 불일치해도 비교하되 리포트에 **경고 배지** 표시 (scriptChanged와 같은 방식) → 이력 유지
- 선택지 C. 불일치 시 상대 비교는 생략하고 절대 게이트만 적용 → 안전하지만 회귀 탐지력 상실
- 추가 고려: warmup, 스크립트 라이브러리 해시, 시더 버전도 비교 가능성에 포함할 것인가?

> **내 결정:** 전역으로 A/B/C 중 하나를 고르지 않고 **필드별 등급**으로 나눴다.
> 데이터셋·부하 프로파일·시나리오·환경은 blocking(=C, 상대 비교 생략),
> 부하 스크립트 지문은 degrading(=B, 경고 후 비교).
>
> **이유:** 불일치의 성격이 필드마다 다르다. 데이터셋이 다른 두 실행의 P95를 나란히 놓는 건
> "믿을 수 없는 비교"가 아니라 애초에 비교가 아니다 — `+59,000% 악화`라는 표 한 줄을
> 사람에게 보여주는 것은 침묵보다 나쁘다. 반면 스크립트 지문 변화는 대개 주석 편집이고
> 수치는 대체로 유효하므로 이력을 끊을 이유가 없다.
> A를 전역으로 적용하지 않은 이유는 따로 있다: 순진하게 `vusMax`를 조건에 넣으면
> 그건 관측값이라 arrival-rate 시나리오에서 서버가 느려질수록 올라가고, 결국 회귀가
> 심할수록 기준선이 탈락해 게이트가 열린다. 조건 키는 전부 선언값이어야 한다.
> C의 "회귀 탐지력 상실" 우려는 절대 게이트가 기준선과 무관하게 계속 도는 것으로 메운다.
> 다만 그러려면 "비교 안 함"이 "문제 없음"처럼 보이면 안 되므로 `baselineStatus`를 함께 넣었다.
> warmup·시더 버전·인프라 스펙은 같은 표에 한 줄씩 추가하는 형태로 열어 뒀다(미구현).

**T-08. 게이트 지표를 측정하지 못했을 때 어떻게 판정할 것인가?**

- 선택지 A. `gate: true` 규칙이 결측이면 **FAIL** → "확인 못 했으면 통과시킬 근거가 없다". 관측 스택이 흔들리면 빌드가 멈춤
- 선택지 B. 별도 상태 `UNMEASURED`를 만들고 verdict는 WARN → 눈에 띄되 빌드는 통과
- 선택지 C. 현행 유지(SKIP=무영향) + 리포트에 경고만 → 지금 고친 표시 개선으로 충분하다고 볼 수도

> **내 결정:**
>
> **이유:**

**T-22. 시나리오군별로 규칙을 나눌 것인가?**

- stress/spike/breakpoint/chaos는 p95>500ms·오류>1%를 넘는 것이 **목적**이라 현재 규칙으로는 구조적 FAIL
- 선택지 A. `rules.<시나리오군>.json`으로 파일 분리
- 선택지 B. rules.json 안에 `appliesTo: ["normal","load"]` 필드 추가
- 선택지 C. 한계탐색형은 게이트를 아예 끄고 기록만

> **내 결정:**
>
> **이유:**

---

# 6단계 · 표시 — 리포트·이력

> **목표:** 데이터가 사람의 판단으로 바뀌는 지점을 안다. 여기서 왜곡되면 앞의 정확성이 무의미하다.
> **예상:** 1시간 30분

**쉽게 말하면:** 리포트는 숫자를 보여주는 화면이 아니라 사용자의 결론을 유도하는 인터페이스다.
결측 행을 숨기거나 “첫 실행”이라고 잘못 표시하면 계산값보다 더 큰 오해를 만든다.

**완료 기준:** 리포트가 무엇을 위에 배치하고 무엇을 숨기는지, 이력 추세가 어떤 표본을 묶는지
설명할 수 있다.

## A. 읽기

| 파일:줄 | 볼 것 |
|---|---|
| `performance/tools/lib/report.js:187` | `ICON` — 색만으로 의미를 전달하지 않는 3중 표기 |
| 같은 파일 `:451` `sectionRegression()` | **`.filter(c => c.verdict !== 'SKIP')` — 증거를 지운 자리** |
| 같은 파일 하단 요약 문구 | skipped/suppressed를 구분해 설명하도록 고친 부분 |
| 같은 파일 `:518` `sectionHints()` | 병목 가설 표시. "가설이지 원인이 아니다" 문구 |
| 같은 파일 `:562` `sectionThresholds()` | 더미 threshold를 정규식으로 걸러내는 부분 |
| `performance/tools/history.js:50` | `trendStat()` — 전반/후반 중앙값 비교 |
| 같은 파일 `:71` | `TREND_METRICS` — report.js와 중복 유지되는 목록 |
| 같은 파일 `:94` `renderHistory()` | 시나리오별 그룹핑. dataset/환경은 안 나눈다 |
| `performance/tools/lib/grafana.js:42` | `buildLinks()` — 앞뒤 2분 여유, 패널을 제목으로 찾기 |
| `performance/PERFORMANCE-MANAGEMENT.md` §7 | 리포트 설계 원칙 4가지 |

## B. 실행

- [ ] 회귀 표에 인프라 행이 없는 것 직접 확인

```bash
node -e "
const h=require('fs').readFileSync('reports/runs/normal-day-2026-08-05T09-39-43/report.html','utf8');
const sec=h.slice(h.indexOf('<h2>Regression'), h.indexOf('<h2>Infrastructure'));
(sec.match(/<tr>[\s\S]*?<\/tr>/g)||[]).forEach(r=>{
  const t=r.replace(/<[^>]+>/g,'|').split('|').filter(s=>s.trim());
  console.log('  ', (t[0]||'').trim().slice(0,36));
});
"
```

- [ ] 같은 리포트를 브라우저로 열어 **병목 가설(CPU throttling 발생)과 회귀 표(해당 행 없음)의 모순** 확인
- [ ] 이력 대시보드 생성 후 열기: `node tools/history.js` → `reports/history.html`
- [ ] 리포트 한 개를 재생성해 인프라 판정이 채워지는 것 확인 (T-02 해결 후이므로 조건이
      다른 과거 런은 기준선에서 제외되고 "비교 가능한 기준선 없음"으로 표시된다)

```bash
node tools/collect.js normal-day-2026-08-05T09-39-43 --force --no-wait
```

## C. 자가진단

**Q6-1.** 리포트가 외부 CDN/폰트/스크립트를 쓰지 않는 이유는? 어떤 상황을 대비한 설계인가?

> **A.**

**Q6-2.** 회귀 표에서 제외되는 행은 무엇인가? 그 필터가 T-01과 겹쳤을 때 어떤 결과가 됐나?

> **A.**

**Q6-3.** `history.html`의 누적 저하 감지는 어떻게 계산되나? 양 끝점 2개를 비교하지 않고 전반/후반 중앙값을 쓰는 이유는?

> **A.**

**Q6-4.** Grafana 딥링크에 테스트 구간 앞뒤로 2분 여유를 두는 이유는?

> **A.**

**Q6-5.** 리포트가 결론(병목 가설)을 맨 위에 두는 이유는? 이 시스템이 상정한 독자는 누구이고 첫 질문은 무엇인가?

> **A.**

## D. 이 단계의 결함

- [ ] **T-25** SKIP을 노이즈 억제로 설명한 문구 (해결)
- [ ] 회귀 표의 SKIP 행 제외 — 증거 삭제 (미해결, 아래 결정 안건)
- [ ] **T-27** history의 이전 중앙값 0이면 추세 드롭, 시나리오만으로 그룹핑 (미해결)
- [ ] **T-21** 증감률 계산 4중 구현, TREND_METRICS 2벌 (미해결)
- [ ] **E-29** Pages 게시 시 내부 메타데이터 무여과 (미해결)

## E. 추출 관점

- [ ] 프로젝트 전용 / 일반화 가능:

> **A.** _(힌트: 자기완결 HTML, 결론 우선 배치, 색+아이콘+텍스트 3중 표기는 전부 일반 원칙)_

## F. 결정 안건

**회귀 표에서 평가 불가 항목을 표시할 것인가?**

- 선택지 A. 회색 행으로 표시하고 사유 칸에 "값 없음" → 정직하지만 표가 32행으로 길어짐
- 선택지 B. 접이식(collapsed) 블록으로 따로 묶기 → 기본은 깔끔, 필요하면 펼침
- 선택지 C. 지금처럼 숨기되 요약 문구로만 알림 → 현재 상태

> **내 결정:**
>
> **이유:**

---

# 7단계 · 집행 — 게이트·CI

> **목표:** 판정이 실제로 무언가를 막는 경로를 안다. 여기가 비면 앞의 전부가 참고자료로 전락한다.
> **예상:** 1시간 30분

**쉽게 말하면:** FAIL이라는 글자를 만드는 것과 PR을 실제로 막는 것은 다른 일이다. 종료 코드가
정확히 전달되고 워크플로가 올바른 이벤트에서 실행돼야 자동 게이트가 된다.

**완료 기준:** k6와 수집기의 종료 코드가 어떻게 합쳐지는지, 현재 워크플로가 왜 PR을 막지
못하는지 설명할 수 있다.

## A. 읽기

| 파일:줄 | 볼 것 |
|---|---|
| `performance/tools/collect.js:292`~`:315` | `gateFailed` 집계와 종료 코드 3종(0/1/2) |
| `performance/tools/perf-run.js:137` `main()` | k6 실행 → runId 식별 → 수집기 호출 → 종료 코드 합성 |
| 같은 파일 (하단) | `col.status == null` 처리 — 시그널 종료를 0으로 새지 않게 |
| `performance/regression/perf-regression.yml:17`~`:21` | 트리거: push(develop), schedule, workflow_dispatch. **`pull_request`가 없다** |
| 같은 파일 `:71` | `node datasets/seed.js --profile smoke` — bootstrap을 건너뛴다 |
| 같은 파일 `:86` | perf-run 호출부, `PERF_ENV: ci` |
| 같은 파일 캐시 관련 부분 | 이력을 Actions 캐시로 보존하는 방식과 그 한계 |
| `.github/workflows/` (저장소 루트) | **perf-regression.yml이 여기 없다**는 것 확인 |
| `.github/workflows/perf-reports-pages.yml` | Pages 게시 워크플로 |

## B. 실행

- [ ] 종료 코드를 직접 확인

```bash
node tools/collect.js normal-day-2026-08-05T09-39-43 --force --no-wait --quiet
echo "exit=$?"      # 게이트 실패면 1
node tools/collect.js 없는런아이디 --no-wait --quiet
echo "exit=$?"      # 수집 실패면 2
```

- [ ] 워크플로가 설치돼 있지 않은 것 확인: `ls ../.github/workflows/`
- [ ] 실행 기록의 환경 필드가 전부 로컬인 것 확인

```bash
node -e "
const idx=JSON.parse(require('fs').readFileSync('reports/index.json','utf8'));
const by={};
idx.runs.forEach(r=>{const k=r.environment+' / '+r.executor; by[k]=(by[k]||0)+1;});
console.log(by);
"
```

## C. 자가진단

**Q7-1.** 종료 코드 0/1/2는 각각 무슨 의미이고, 어느 파일 어디에서 만들어지나?

> **A.**

**Q7-2.** k6 threshold 실패(exit 99)와 회귀 게이트 실패는 최종 종료 코드로 어떻게 합쳐지나?

> **A.**

**Q7-3.** 지금 `perf-regression.yml`을 `.github/workflows/`로 복사해 돌리면 **어느 단계에서 실패하나?** 왜 그런가?

> **A.**

**Q7-4.** 이 워크플로가 설치돼서 정상 동작하더라도 성능 회귀가 있는 PR을 막지 못한다. 왜인가? 무엇을 바꿔야 막을 수 있나?

> **A.**

**Q7-5.** GitHub 호스팅 러너에서 부하 테스트를 돌리는 것의 문제는 무엇인가? 그럼에도 CI에서 뭔가를 하려면 무엇을 해야 의미가 있나?

> **A.**

## D. 이 단계의 결함

- [ ] **T-16** 종료 코드 오류 (해결)
- [ ] **T-14** 수집 대상 오선택 (해결)
- [ ] **E-23** 워크플로 미설치, 실행 이력 0 (미해결)
- [ ] **E-24** pull_request 트리거 없음 → 머지 후 검출 (미해결)
- [ ] **E-25** CI seed 단계 확정 실패 (미해결)
- [ ] **E-26** ubuntu-latest 부적합 + 노이즈보다 좁은 게이트 (미해결)
- [ ] **E-27** Actions 캐시 이력의 브랜치 스코프 한계 (미해결)
- [ ] **E-30** 시크릿 미사용, 실패 진단 없음 (미해결)

## E. 추출 관점

- [ ] 프로젝트 전용 / 일반화 가능:

> **A.** _(힌트: "CI 한 줄로 게이트"가 CLI의 핵심 판매 포인트가 될 부분)_

## F. 결정 안건

**E-23/24. CI 전략을 어떻게 가져갈 것인가?**

- 선택지 A. 부하는 로컬 전용 유지 + CI는 **리포트 게시와 이력 커밋만** → 노이즈 문제 회피, 게이트는 수동
- 선택지 B. CI에서 축소 시나리오(3분)를 돌리되 **게이트는 큰 회귀만**(예: p95 +50%) → 러너 노이즈를 감안한 느슨한 기준
- 선택지 C. self-hosted 러너를 두고 제대로 게이트 → 가장 정석, 장비 필요
- 부속 결정: `pull_request` 트리거를 넣을 것인가? seed 경로를 bootstrap 포함으로 고칠 것인가?

> **내 결정:**
>
> **이유:**

---

# 8단계 · 종합 — 추출 설계

> **목표:** 전체를 남에게 설명할 수 있고, 무엇을 떼어내 CLI로 만들지 판단할 수 있다.
> **예상:** 2시간

**쉽게 말하면:** 지금까지 배운 내용을 파일 목록이 아니라 책임과 경계로 다시 정리한다. HighTeenDay
전용 설정과 어떤 서비스에도 재사용할 수 있는 수집·판정 엔진을 구분하는 단계다.

**완료 기준:** 새 지표·시나리오·규칙을 추가하는 경로를 설명하고, Node/PostgreSQL 프로젝트로
옮길 때 코어와 어댑터를 어떻게 나눌지 제안할 수 있다.

## A. 읽기

- [ ] 1~7단계의 **추출 관점** 답변을 전부 다시 읽는다
- [ ] `performance/PERFORMANCE-MANAGEMENT.md` **§8 개선 우선순위**
      **볼 것:** Must/Should/Could 분류와 "지금은 하지 말 것". 당신의 리뷰 결과와 비교해볼 것 —
      이 우선순위표가 여전히 맞는지가 8단계의 판단 대상이다
- [ ] `performance/PERFORMANCE-MANAGEMENT.md` **§9 알려진 한계**
      **볼 것:** 여기 적힌 6가지가 일반화(추출) 대상 목록과 상당 부분 겹친다
- [ ] `localDocs/perf-review-summary.md` — 남은 P0/P1/P2 중 추출 전에 반드시 해소할 것 고르기

## B. 실행

- [ ] **그림 없이 말로** 전체 파이프라인을 5분간 설명해보고 녹음하거나 적어본다
- [ ] 새 지표 하나를 실제로 추가해본다 (예: `mysql.tmpDiskTables`)
      → `metrics-catalog.js`에 한 줄 추가 → 재수집 → 리포트에 나타나는지 확인
- [ ] 새 규칙 하나를 rules.json에 추가하고 `npm test`가 통과하는지 확인

## C. 자가진단

**Q8-1.** 이 시스템의 전체 흐름을 8단계로 나눠 각 단계의 입력·출력·책임 파일을 말하라.

> **A.**

**Q8-2.** 새 지표를 추가하려면? 새 시나리오를 추가하려면? 판정 기준을 바꾸려면? 각각 어느 파일 몇 곳을 고쳐야 하나?

> **A.**

**Q8-3.** 이 시스템을 **다른 프로젝트(예: Node/Express + PostgreSQL)에 그대로 옮긴다면** 무엇을 바꿔야 하나? 계층별로 목록화하라.

> **A.**

**Q8-4.** CLI로 추출한다면 **패키지 경계를 어디에 그을 것인가?** 무엇을 코어에 넣고 무엇을 사용자 설정으로 뺄 것인가?

> **A.**

**Q8-5.** 이 시스템에서 **가장 잘 설계된 부분**과 **가장 약한 부분**을 하나씩 고르고 이유를 대라. (면접에서 자주 나오는 질문 형태)

> **A.**

**Q8-6.** 0단계에서 적은 "첫인상"과 지금의 판단은 어떻게 다른가?

> **A.**

## D. 산출물

- [ ] `localDocs/`에 **추출 설계 초안** 작성 — 코어/어댑터 경계, v0.1 범위, 제외할 것
- [ ] `localDocs/perf-review-summary.md`의 P0/P1/P2 우선순위를 학습 결과에 맞게 재조정
- [ ] 결정 안건 10개가 전부 채워졌는지 확인 (상단 결정 안건 진행표)

---

## 부록 · 자주 쓰는 명령

```bash
# 전부 performance/ 에서 실행

npm test                                    # 도구 단위테스트
node tools/history.js --print               # 이력 표
node tools/history.js                       # history.html 생성
node tools/history.js --rebuild             # index.json 재생성
node tools/collect.js <runId> --force --no-wait   # 리포트만 재생성
node tools/perf-run.js scenarios/normal-day.js --note "메모"

# 스택
docker compose -f environment/docker-compose.perf.yml up -d
node environment/bootstrap.js
node datasets/seed.js --profile small
```

## 부록 · 막혔을 때

답을 못 쓰겠는 항목은 답란에 이렇게 적어둔다.

```
> **A.** 여기서 막힘 — evaluateRule의 절대 게이트와 상대 비교가
>         왜 이 순서인지 모르겠다
```

다음 대화에서 이 문서를 근거로 그 지점부터 설명한다.
