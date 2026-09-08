# 성능 로드맵 — 개인 실행 계획 (ROADMAP.md 에서 분리)

> 2026-09-05 에 `performance/docs/planning/ROADMAP.md` 에서 떼어 낸 절이다.
> "다음 작업일의 실제 진행 순서"와 "밤새 무인으로 돌려 둘 실행 목록"은 개인 작업 일정과
> 이 PC 의 실행 환경(Node 절대 경로, 야간 실행 시간표)을 전제로 쓴 것이라 공개 문서에 맞지 않았다.
> 내용은 원문 그대로다. 로드맵의 P0~P3 본문은 공개 저장소에 그대로 남아 있다.

## 다음 작업일의 실제 진행 순서

하루에 전부 처리하려 하지 않는다. 다음 작업일에는 아래까지만 끝내도 충분하다.

1. **P0-0 노출 여부 확인** — 외부 시스템 변경이 필요하면 별도 승인 후 즉시 대응한다.
2. **P0-1 시더 결과 모델 설계 및 구현** — 단계별 성공·실패 수와 fail-fast부터 만든다.
3. smoke가 아니라 **small 전체 생성**으로 실패 전파와 무결성 검사를 검증한다.
4. small이 완전히 통과한 뒤에만 large 재생성을 시작한다.

large 생성은 오래 걸린다는 이유로 검증을 생략하지 않는다. P0-1이 끝나지 않았다면 large 생성부터
돌리지 않는다.

## 밤새 무인으로 돌려 둘 실행 목록

> **2026-09-01 상태.** 이 목록은 2026-08-18 에 세운 계획이고, **2·3·7번은 이미 돌았다.**
> 세 실행이 답하려던 질문("세션이 바뀌면 왜 45% 달라지는가")은 2026-08-21 에 닫혔다 —
> 원인은 환경 열화가 아니라 **포화 상태에서 측정한 것**이었다. 그래서 아래 2·3·7번의
> 배경 설명은 **당시 가설을 남긴 기록**으로 읽어야 하고, 지금 다시 걸 이유는 없다.
> 1·4·5·6번은 그대로 유효하다.

**결론부터.** 밤에 걸 가치가 있는 실행은 "오래 걸린다"가 아니라 **길이 자체가 답인 실험**뿐이다.
짧게 여러 번 돌려서 같은 답이 나오는 실행은 낮에 지켜보며 하는 편이 낫다. 아래 네 가지가
그 기준을 통과한 것들이고, 마지막 절에 **밤을 태워도 못 쓰는 결과가 나오는 실행**을 따로
적었다.

### 공통 규칙

1. **동시에 두 개 이상 돌리지 않는다.** 전부 같은 Windows 호스트와 WSL2 VM을 공유하므로
   서로의 측정값을 오염시킨다. 아래 순서대로 하나씩 이어 붙인다.
2. **Node 18 이상으로 실행한다.** 현재 셸 기본이 `v16.20.2`이고, 그대로 실행하면 도구가
   `전역 fetch 없음`으로 **즉시 죽는다**(실제로 겪었다). `nvm use 22` 를 먼저 하거나
   nvm 이 설치한 Node 22 실행 파일을 절대 경로로 쓴다.

3. **시작 직전에 `node tools/cpu-bench.js` 를 한 번 찍는다.** VM·Docker 재시작 직후 3회는
   5~14% 느리다([perf-session-drift.md](../../performance/docs/investigations/perf-session-drift.md) 5절). 값이 평소(single 약
   4,950~5,050ms)로 돌아온 뒤 시작한다.
4. **도구를 고친 직후라면 걸지 않는다.** `performance/docs/README.md` 의 smoke 규칙대로 3~5분짜리
   확인을 먼저 통과시킨다. 밤새 돌려놓고 아침에 배관 오류로 전부 버리는 것이 최악이다.

### 목록

| 순서 | 실행 | 소요 | 무엇을 푸는가 |
|---:|---|---:|---|
| 1 | **시나리오 스모크 순회** | **1시간 22분** | 15개 시나리오가 아예 도는지 (다른 항목의 선행 조건) |
| 2 | normal-day **5분 창 연속 10회** | **2시간 6분** | 세트 안 추세가 예열인가 아닌가 (완료) |
| 3 | normal-day **20분 세트 5회** | **2시간 27분** | 주계열 복귀 + 창 길이 비교 (완료) |
| 4 | **soak 2시간** 1회 | **2시간 15분** | 누수형 문제 (밤에만 가능) |
| 5 | **데이터 크기 대조** (medium→large→medium) | **3시간 9분** | 병목이 데이터가 커져도 앱 CPU인가 |
| 6 | normal-day **flush 리셋 5회** | **1시간 3분** | CV에서 JIT 웜업 성분 분리 |
| 7 | **유휴 cpu-bench 반복** | 남는 시간 전부 | 부하 없이도 환경이 열화하는가 (상시 계열로 전환) |

전부 이어 붙이면 12시간이 넘는다. **밤 길이에 맞춰 위에서부터 자른다.** 다만 **1번은 건너뛰지
말 것** — 4번(soak)을 포함해 이 목록의 대부분이 *한 번도 실행된 적 없는 스크립트*를 무인으로
돌리는 일이고, 1번이 그것을 먼저 확인한다.

소요는 추정이 아니라 실측이다. 회차 간 실제 간격이 20분 세트는 1,753~1,775초, 5분 세트는
746~757초였다(2026-08-18 실행 기록).

---

### 1. 시나리오 스모크 순회 — 다른 항목의 선행 조건

**실행 기록을 세어 보니 시나리오 17개 중 `normal-day` 하나만 돌아간 적이 있다.** 나머지
16개는 저장된 실행이 0건이다 — 즉 **끝까지 도는지 아무도 확인한 적이 없다.** 이 목록의
4번(soak, 2시간)도 그중 하나다. 검증 없이 걸면 아침에 "3분 만에 죽어 있음"을 발견하게 된다.

`performance/docs/README.md` 의 규칙("긴 실행을 걸기 전에 3~5분짜리 smoke 로 배관을 확인한다")이
정확히 이 상황을 위한 것이다. 확인 대상은 성능이 아니라 **도구가 망가지지 않았는지**다.

```bash
# ① HOLD·VUS·WARMUP 을 받는 10개 — 1분짜리로 줄여서 확인
for s in read-heavy peak-hour exam-week chat-heavy notification-heavy \
         registration-day write-heavy cache-warm cold-start soak; do
  node tools/perf-run.js scenarios/$s.js --dataset smoke --vus 5 \
    --warmup 30 --hold 1m --loadgen docker --no-gate --note "스모크 배관 확인"
done

# ② DURATION 을 받는 3개
for s in deep-paging chaos failover; do
  node tools/perf-run.js scenarios/$s.js --dataset smoke --vus 5 \
    --duration 1m --loadgen docker --no-gate --note "스모크 배관 확인"
done

# ③ 손잡이 이름이 다른 2개
node tools/perf-run.js scenarios/breakpoint.js --dataset smoke --loadgen docker --no-gate \
  -e RAMP=2m -e MAX_VUS=50 -e TARGET_RATE=20 --note "스모크 배관 확인"
node tools/perf-run.js scenarios/spike.js --dataset smoke --loadgen docker --no-gate \
  -e SPIKE_VUS=20 --note "스모크 배관 확인"

# ④ 길이 손잡이가 아예 없는 1개 — 27분 그대로 걸린다. 맨 뒤에 둔다
node tools/perf-run.js scenarios/stress.js --dataset smoke --loadgen docker --no-gate \
  --note "스모크 배관 확인"
```

**왜 넷으로 나누는가.** 시나리오마다 길이를 줄이는 환경변수가 다르다. `spike` 는
`SPIKE_VUS` 로 크기만 바꿀 수 있고 길이는 650초로 고정이며, **`stress` 는 환경변수를 하나도
읽지 않아** 13단계 27분이 통째로 돈다. 이 둘이 순회 시간의 절반을 차지한다.

아침에 볼 것은 세 가지뿐이다.

- 실행이 오류 없이 끝났는가
- `phases.measure` 가 비어 있지 않은가 (구간 태깅이 동작하는가)
- `infra.flat` 항목 수가 정상인가 (Prometheus 연결이 살아 있는가)

**성능 수치는 보지 않는다.** smoke 데이터셋은 게시글 50건이라 전부 버퍼풀에 들어가고,
medium(10,000건)과는 다른 병목이 나온다. smoke 는 도구 확인용이고 판정은 medium 이상이다.

### 2. normal-day 5분 창 연속 10회 — 예열 판별 (완료)

```bash
node tools/repeatability.js scenarios/normal-day.js --runs 10 \
  --warmup 180 --hold 5m --dataset medium --env perf --loadgen docker --reset restart \
  --note "반복성 — 5분 창 연속 10회"
```

2026-08-18 오전 5회 세트에서 **아무것도 바꾸지 않았는데 p95 가 한 시간 만에 11.2%
좋아졌다**(15,564 → 13,823ms, 회차와의 순위상관 −0.90). 같은 구간에 Windows 호스트의 CPU
실동작 주파수가 86.0 → 107.8% 로 같이 올랐다. 두 가지 해석이 가능하다.

- **예열** — 호스트가 저전력 상태에서 시작해 반복 부하로 클럭이 올라간 것
- **누적 열화** — 환경이 한 시간 규모에서도 계속 느려지는 것

**연속 10회가 이 둘을 가른다.** 예열이면 1~5회차에서 내려간 뒤 6~10회차가 평평해지고,
드리프트면 끝까지 내려간다.

**반드시 한 번에 돌려야 한다.** 5회씩 두 번 나눠 재면 사이의 공백에서 호스트가 다시 식어
두 가설이 같은 예측을 내놓는다 — 실험이 성립하지 않는다.

아침에 볼 것: 회차별 p95 를 6회차 기준으로 앞뒤로 나눠 각각 기울기를 낸다. 뒤 절반의
기울기가 0에 가까우면 예열이다.

**결과(2026-08-21).** 두 가설 다 아니었다 — 이 세트는 200 VU 포화 상태였고, 회차 간
변동은 큐 길이의 흔들림이었다. 포화 이하로 내리면 사라진다.

### 3. normal-day 20분 measure 5회

```bash
node tools/repeatability.js scenarios/normal-day.js --runs 5 \
  --dataset medium --env perf --loadgen docker --reset restart \
  --note "반복성 — 재부팅 후 20분 창 세트"
```

`--warmup`·`--hold` 를 주지 않는 것이 핵심이다. 시나리오 기본값(warmup 300초 / measure
1,200초)이 그대로 적용돼 **주계열 `seriesHash=4307755dd860`** 에 붙는다. 세션 A(08-16)·
C(08-18 새벽)·D와 자동 비교되는 유일한 설정이다.

**이 한 세트가 남은 실험 두 개를 동시에 끝낸다.**

- **실험 2 (재부팅 후 반복 측정)**: 5분 창에서는 2026-08-18 오전 5회로 해소됐고 결론은
  바뀌지 않았다(재부팅해도 복귀하지 않음). 다만 **20분 창은 여전히 실행 62 하나뿐**이라,
  주계열에서 확정하려면 이 세트가 필요하다.
- **실험 6 (measure 창을 5분으로 줄여도 되는가)**: 이건 **추가 실행 0회로 끝난다.**
  remote-write가 켜져 있어 k6 지표가 Prometheus에 시계열로 남으므로, 20분 실행 하나를
  5분씩 네 토막으로 잘라 p95를 다시 계산하면 된다. 한 실행 안을 자르는 것이므로 창 길이만
  다른 비교가 성립한다. 지금까지 그 데이터를 가진 실행이 없어서 막혀 있었다.

아침에 볼 것: `measure p95`의 세트 평균이 08-16 세션 A(12,231ms) 쪽인지, 08-18 세션 C/D
(16,344~18,501ms) 쪽인지. 후자면 재부팅 무효가 n=6으로 확정된다.

### 4. soak 2시간 1회 — 밤에만 가능한 유일한 실행

```bash
node tools/perf-run.js scenarios/soak.js --dataset medium --loadgen docker
```

옵션을 주지 않으면 기본값이 150 VU · warmup 5분 · **measure 2시간** · rampdown 5분이다.

> **1번을 먼저 통과시킬 것.** `soak` 는 저장된 실행이 0건이다 — 2시간을 무인으로 걸기 전에
> 1분짜리로 끝까지 도는지 확인한다.

**왜 밤에만 가능한가.** 누수는 정의상 시간에 비례해 쌓이므로 12분짜리 실행으로는 원리적으로
보이지 않는다. 대상은 네 가지다.

- 힙 사용량과 Old Gen의 **기울기** (메모리 누수)
- `pool.hikariActive` 의 우상향 (커넥션 누수)
- WebSocket 세션 누적 (끊긴 세션 미정리)
- ViewCount·HotScore 스케줄러의 flush 지연 누적

판정은 절대값이 아니라 **기울기가 0인가**다. 우상향하면 누수다.

주의 두 가지. 첫째, 측정 구간 오류율이 2%를 넘으면 k6가 자동 중단하므로 아침에 실행이
일찍 끝나 있으면 그것 자체가 결과다. 둘째, 2시간 동안 데이터가 계속 늘어나므로 끝난 뒤
데이터셋 상태가 스냅샷과 크게 벌어진다. 다음 실행이 `guard=strict` 로 자동 복원하지만,
복원에 MySQL·앱 재기동이 들어가 몇 분 더 걸린다.

### 5. 데이터 크기 대조 — medium → large → medium

**아직 아무도 답하지 않은 질문이다: 지금의 병목(앱 CPU 2코어)이 데이터가 커져도 그대로인가.**
지금까지의 판정은 전부 `medium` 에서 나왔는데, 두 프로파일은 **버퍼풀 경계를 사이에 두고
갈라진다.**

| | medium | large |
|---|---:|---:|
| MySQL 볼륨 | 510MB | **2,703MB** |
| InnoDB 버퍼풀 | 1GB | 1GB |
| 버퍼풀에 다 들어가는가 | **예** (적중률 100%) | **아니오** |

즉 medium 에서는 디스크 I/O 가 사실상 0 이라 MySQL 이 CPU 만 쓴다. large 에서는 읽기 미스가
생겨 **병목이 앱 CPU 에서 MySQL I/O 로 옮겨갈 수 있다.** 만약 그렇다면 EXP-002~005 의
우선순위가 통째로 바뀐다 — 커넥션 풀이나 N+1 보다 데이터 접근 패턴이 먼저가 된다.

```bash
node tools/repeatability.js scenarios/normal-day.js --runs 5 --warmup 180 --hold 5m \
  --dataset medium --env perf --loadgen docker --reset restart --note "크기 대조 A1 medium"
node tools/repeatability.js scenarios/normal-day.js --runs 5 --warmup 180 --hold 5m \
  --dataset large  --env perf --loadgen docker --reset restart --note "크기 대조 B large"
node tools/repeatability.js scenarios/normal-day.js --runs 5 --warmup 180 --hold 5m \
  --dataset medium --env perf --loadgen docker --reset restart --note "크기 대조 A2 medium"
```

**왜 medium 을 두 번 재는가 — 이게 이 실험의 핵심이다.** medium 5회 → large 5회로 끝내면
large 가 항상 **나중에** 측정된다. 그런데 8절에서 확인했듯 세트 안에는 시간에 따른 추세가
있어서, 뒤에 온 쪽이 유리해진다. **"large 가 빨랐다"가 데이터 크기 때문인지 순서 때문인지
구분되지 않는다.** medium 을 앞뒤로 두 번 재면 그 사이의 추세 크기를 직접 알 수 있고,
large 값에서 그만큼을 빼면 크기만의 효과가 남는다.

`--env` 를 `perf` 로 두어도 안전하다. 데이터셋은 **blocking 비교 조건**이라 medium 실행이
large 실행의 기준선으로 잘못 선택되는 일이 없다.

소요에는 large 복원 시간이 포함돼 있다 — 볼륨이 2.7GB 라 회당 82초로, medium 보다 회차마다
약 1분씩 더 걸린다.

아침에 볼 것: `mysql.bufferPoolHitPct` 가 large 에서 100% 밑으로 떨어졌는가, 그리고
`efficiency.dbCpuUsPerQuery` 와 앱 CPU throttling 중 어느 쪽이 움직였는가.

### 6. normal-day flush 리셋 5회 — CV의 구성 요소 분리

```bash
node tools/repeatability.js scenarios/normal-day.js --runs 5 \
  --warmup 180 --hold 5m --dataset medium --env perf-flush \
  --loadgen docker --reset flush \
  --note "CV 분해 — 앱 재시작 없이 Redis만 비움(JIT 웜업 성분 제거)"
```

**무엇을 가르는 실험인가.** 지금 기록된 CV(5분 창 4.55~5.83%)는 `--reset restart` 로 잰
값이라 **매번 콜드 JVM에서 시작하는 데서 오는 JIT 웜업 편차가 섞여 있다.** 앱을 재시작하지
않고 Redis만 비우는 `flush` 모드로 같은 5회를 돌리면 그 성분만 빠진다.

- CV가 뚜렷하게 떨어지면 → 웜업 편차가 실측 노이즈의 주성분이다. MDE(최소 검출 가능
  개선폭)를 낮출 여지가 생기고, 측정 절차를 바꿀 근거가 된다.
- 거의 같으면 → 웜업은 편차 원인이 아니다. 후보 하나가 지워진다.

**`--env` 를 `perf-flush` 로 따로 두는 이유**가 2·3번과 다르다. 리셋 모드는 비교 조건
(`conditions.js`의 축)에 **기록되지 않는다.** 같은 `perf` 환경에 넣으면 restart 세트와
flush 세트가 절차가 다른 채로 섞이고, 기준선 자동 선택이 그걸 구분하지 못한다. 이 실험은
세트 **안**의 CV만 보면 되고 과거 실행과의 자동 비교가 필요 없으므로, 분리하는 쪽이 맞다.

### 7. 유휴 상태 cpu-bench 반복 — 비용 거의 0

부하 실행이 전부 끝난 뒤 남는 시간에 건다. 5초짜리 벤치라 호스트에 실질적 부하가 없다.

```bash
while true; do
  # --json 은 여러 줄로 나온다 — 줄바꿈을 지워야 한 줄에 한 레코드(JSONL)가 된다
  bench=$(node tools/cpu-bench.js --json | tr -d '\n')
  printf '{"at":"%s","bench":%s}\n' "$(date -u +%FT%TZ)" "$bench" >> reports/idle-cpu-bench.jsonl
  sleep 600
done
```

**왜 유휴 상태여야 하는가.** 환경 속도가 스스로 움직이는지를 앱 성능과 **분리해서** 재려면
부하가 없어야 한다. 그런데 지금 있는 cpu-bench 값은 전부 **부하 실행에
붙여서** 찍은 것이라, 값이 흔들려도 그게 시간 탓인지 부하 탓인지 가르지 못한다. 부하 없이
밤새 10분 간격으로 찍으면 **"부하와 무관하게 시간만 흘러도 환경이 느려지는가"** 에
독립적으로 답하는 시계열이 처음 생긴다.

아침에 볼 것: `single`·`parallel`·`ctxswitch` 세 축이 밤새 우상향하는가. 셋 다 오르면 CPU
클럭 층, `single`만 평평하면 스케줄링·시스템 콜 층이다.

**아침에 딱 하나만 먼저 할 것.** 예열 가설이 맞다면 **밤새 유휴 상태였던 직후의 첫 실행이
가장 느려야 한다.** 그러니 다른 작업을 하기 전에 `normal-day` 를 5분 창으로 한 번(12.5분)
먼저 재 둔다. p95 가 15,500ms 대에서 시작하면 예열 가설이 맞고, 13,800ms 대면 틀렸다.
비용 12분에 예측 하나를 검증한다.

---

### 밤에 돌리면 안 되는 것

**stress · spike · breakpoint 계열.** P1-7이 미해결이다. 요청 도착률이 서버 응답 속도에
묶여 있어(closed-loop), 서버가 느려지면 부하도 같이 줄어든다. 포화점과 최대 처리량을
묻는 시나리오에서 이건 치명적이라 **밤을 태워도 해석할 수 없는 숫자가 나온다.** 부하 모델을
고친 뒤에 돌린다.

**포화 이하 운용점을 확인하지 않은 시나리오의 기준선 대량 축적**(read-heavy, deep-paging,
write-heavy 등). 시나리오마다 용량이 다른데 `RATE=4` 는 `normal-day` 기준으로만 확인된
값이다. 용량 곡선을 그려 보지 않은 시나리오를 밤새 쌓으면 **포화 상태의 세트를 쌓게 되고**,
그 값은 애플리케이션 지연으로 인용할 수 없다. 시나리오별 보정 곡선을 먼저 그린다.

**EXP-002~005의 Before/After 쌍.** After는 코드 변경을 적용한 뒤에야 시작할 수 있어
사람이 중간에 개입해야 한다. 무인 실행에 맞지 않는다. 다만 **밤에 Before 만 걸고 아침에
After 를 잇는 것은 이제 가능하다** — 같은 운용점에서 재기만 하면 시간 간격은 문제가
아니다(4시간 간격 −1.5%). 무인 실행에 넣지 않는 이유는 재현성이 아니라 사람 개입뿐이다.

