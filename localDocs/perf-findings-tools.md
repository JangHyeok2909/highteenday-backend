# performance/tools 분석 도구 발견 사항

검토일: 2026-08-05
추가 조사일: 2026-08-06
쉬운 설명 기준 재정리: 2026-08-11

라인 번호는 검토 당시 HEAD 기준이다. 이후 코드가 변경되면 실제 위치와 다를 수 있다.
항목 번호는 기존 조사에서 사용한 식별자를 그대로 유지했다.

해결 또는 부분 해결로 표시한 변경 사항은 별도 표기가 없으면 2026-08-05 작업 내용을 기준으로 하며, 검토 당시 아직 커밋되지 않은 상태였다. T-02는 2026-08-09 작업분으로 커밋까지 완료됐다(`8c42e16`, `ce85e04`, `56cb73e`).

## 이 문서가 답하는 질문

이 문서는 k6가 만든 숫자가 `run.json`과 HTML 리포트로 바뀌는 과정이 정확한지 검토한다.
구체적으로 다음 단계를 다룬다.

```text
k6 원자료
   → summary 저장
   → Prometheus 조회
   → 이전 실행 선택
   → 절대·상대 규칙 평가
   → PASS/WARN/FAIL
   → HTML 리포트와 이력
```

어느 한 단계에서 값을 잘못 읽거나 비교 대상을 잘못 고르면, 원자료가 정확해도 최종 판정은
틀릴 수 있다. 그래서 각 항목은 “코드 버그가 있는가?”뿐 아니라 “사람이 리포트를 보고 어떤
잘못된 결론을 내리는가?”까지 설명한다.

## 먼저 알아야 할 결론

- 과거에는 점이 포함된 인프라 키를 읽지 못해 규칙 32개 중 25개가 SKIP됐다. T-01에서 수정했다.
- **비교 가능한 기준선의 정의가 없다**는 문제는 T-02에서 해결했다. 실행 조건을 일급 개념으로
  분리해, 데이터셋이나 부하 프로파일이 다른 실행은 기준선에서 제외하고 그 사유를 리포트에
  표시한다. 다만 **느린 실행이 기준선 후보에서 사라지는 문제는 그대로 남아 있다**(S-10).
- **“문제 없음”과 “측정하지 못함”이 분리되지 않던 문제는 T-08에서 해결했다**(2026-08-13).
  판정(`verdict`)과 나란한 측정 상태(`measurementStatus`) 축을 만들고, 필수 지표 결측은
  전용 종료 코드 3으로 끝낸다. 판정을 값이 아니라 **표본 수**로 시작하는 것이 핵심이다 —
  k6는 표본이 0건인 서브메트릭도 0으로 채워 주기 때문에, 값만 보면 “요청 0건”이 “P95 0ms에
  오류 0%”인 완벽한 실행으로 둔갑한다.
- 일부 PromQL은 짧은 피크, 컨테이너 재시작, 트래픽 0인 Redis를 실제와 다르게 표현한다(T-18).
- MySQL 락·트랜잭션·풀스캔 원자료가 이미 Prometheus에 있지만 수집 카탈로그가 읽지 않는다(T-29).
- 자동 테스트는 추가됐고 기준선 선택은 T-02 작업에서 회귀 테스트로 덮였다. 그러나 Prometheus
  결측과 시나리오별 규칙은 아직 보호되지 않는다(T-19).

## 항목을 읽는 순서

각 발견은 가능한 한 다음 내용을 포함한다.

- **문제:** 코드가 현재 무엇을 잘못하고 있는가
- **영향:** 리포트와 의사결정이 어떻게 틀어지는가
- **근거:** 코드 위치와 실제 실행값은 무엇인가
- **해결 내용:** 이미 수정했다면 무엇을 바꾸고 어떻게 검증했는가
- **필요한 조치:** 아직 해결되지 않았다면 다음 결정과 구현은 무엇인가

처음 읽는 사람은 T-01 → T-02 → T-08 → T-18 → T-29 순서로 보면 전체 위험을 가장 빨리
이해할 수 있다.

## 용어

- **게이트**: 성능 결과가 허용 기준을 넘었는지 판정해 빌드의 통과 또는 실패를 결정하는 규칙
- **기준선**: 현재 성능 결과와 비교할 이전 실행 결과
- **결측 지표**: 수집 실패 등으로 현재 값을 확인할 수 없는 지표
- **SKIP**: 값을 평가하지 않고 판정을 생략한 상태
- **노이즈 억제**: 변화가 너무 작거나 기준값이 너무 낮아 의미 있는 비교가 아니라고 판단해 판정을 생략하는 처리

## 현재 현황

| 심각도 | 해결 | 부분 해결 | 미해결 |
|---|---:|---:|---:|
| CRITICAL | 2 | 0 | 0 |
| HIGH | 4 | 0 | 4 |
| MEDIUM | 3 | 1 | 5 |
| LOW | 1 | 0 | 2 |
| **합계** | **10** | **1** | **11** |

## CRITICAL

### T-01. 인프라 규칙 32개 중 25개가 실제로 평가되지 않음 — 상태: 해결

**문제**

`performance/tools/lib/regression.js:30-32`의 `pick()`은 점으로 구분된 키를 중첩 객체 경로로 해석한다. 예를 들어 `infra.flat.saturation.cpuPct`를 다음과 같은 중첩 구조에서 찾으려고 한다.

```text
infra
└─ flat
   └─ saturation
      └─ cpuPct
```

하지만 실제 `infra.flat`은 중첩 객체가 아니라, 키 자체에 점이 들어 있는 평면 맵이다.

```text
infra.flat["saturation.cpuPct"]
```

실제 데이터 구조는 `performance/tools/lib/metrics-catalog.js:477-489`와 `performance/tools/collect.js:90-91`에서 확인할 수 있다.

**영향**

`pick()`이 인프라 지표를 찾지 못해 현재 값을 모두 `undefined`로 반환했다. 그 결과 인프라 규칙은 실패 여부를 평가하지 않고 전부 SKIP 처리됐다.

특히 `throttledPct`, `slowQueries`, `hikariTimeouts`는 게이트 지표인데도 이 문제가 생긴 이후 한 번도 정상적으로 작동할 수 없었다.

**근거**

`normal-day-2026-08-05T09-39-43/run.json`에는 다음 결과가 저장돼 있다.

```text
counts = { total: 32, fail: 5, skipped: 25 }
```

같은 파일의 `infra.flat`에는 다음과 같은 실제 값이 존재했다.

- `cpu.throttledPct = 99.98`
- `pool.hikariTimeouts = 5316`
- `pool.hikariPending.max = 205`

그런데 회귀 비교 표에서는 해당 지표가 모두 “현재 값 없음”으로 표시됐다.

반면 `regression.js:239-245`의 `bottleneckHints`는 브래킷 방식으로 키를 조회하기 때문에 정상 작동했다. 이 때문에 같은 리포트 안에서 병목 설명은 “CPU throttling 발생”이라고 표시하면서, 회귀 비교 표는 “현재 값 없음”이라고 표시하는 모순도 발생했다.

**해결 내용**

`pick()`이 남은 경로 전체와 일치하는 키가 있으면 그 키를 먼저 사용하도록 수정했다.
`performance/tools/test/regression.test.js`에 회귀 테스트도 추가했다.

문제가 발생했던 normal-day 실행을 다시 분석한 결과는 다음과 같다.

- skipped: 25개 → 0개
- throttling 및 Hikari 관련 게이트: 총 6건이 정상적으로 FAIL 처리

**남은 작업**

이미 저장된 과거 실행 결과에는 잘못된 판정이 그대로 남아 있다. 필요한 경우 다음 명령으로 다시 판정해야 한다.

```bash
node tools/collect.js --all --force --no-wait
```

### T-02. 부하 조건이 다른 실행을 기준선으로 선택함 — 상태: 해결 (2026-08-09, 커밋 `8c42e16`·`ce85e04`·`56cb73e`)

**문제**

`performance/tools/lib/repository.js:203-214`의 `findPrevious()`는 다음 세 조건만 사용해 기준선을 선택한다.

- 시나리오가 같은가
- 실행 환경이 같은가
- 이전 실행의 임계값 검사가 실패하지 않았는가

하지만 데이터 크기, 최대 VU, 실행 시간은 비교하지 않는다. `toIndexEntry()`가 `dataset`과 `vusMax`를 저장하고 있지만(124행, 130행), 기준선을 찾을 때는 사용하지 않는다.

**영향**

부하 규모가 전혀 다른 두 실행을 비교해 정상적인 차이를 성능 회귀로 오판할 수 있다. 반대로 더 약한 조건의 실행을 기준선으로 사용하면 실제 회귀를 과장하거나 잘못 해석할 수 있다.

**근거**

large 데이터셋, 200 VU, 1650초로 실행한 normal-day 결과가 다음 실행을 기준선으로 선택했다.

- 실행 ID: `normal-day-2026-08-04T06-38-42`
- 데이터셋: small
- 최대 VU: 15
- 실행 시간: 545초

리포트는 p95가 101ms에서 60001ms로 증가했다고 보고했다. 하지만 현재 실행은 기준선보다 부하가 약 13배 크고 데이터도 약 100배 많아 직접 비교할 수 있는 조건이 아니었다.

**해결 내용**

원인을 “필터에 조건 두 개가 빠졌다”가 아니라 **서로 다른 두 질문이 하나로 뭉뚱그려져 있었다**고 정리했다.

- 시간축 질문: 이력상 직전 실행은 무엇인가
- 실험 설계 질문: 이 실행의 대조군으로 유효한 실행은 무엇인가

기존 `findPrevious()`는 앞의 질문만 답하면서 뒤의 질문은 “시나리오가 같으면 조건도 같겠지”라고 가정하고 있었다.

그래서 **실행 조건(conditions)을 일급 개념으로 분리**해 `performance/tools/lib/comparability.js`를 새로 만들었다. 이 파일의 `CONDITIONS` 표 한 곳에 조건을 선언하면 기준선 선택, 리포트 표시, 추세 계열 분리가 모두 따라온다. 조건이 하나 늘 때마다 판정 엔진에 분기를 덧대지 않아도 된다.

조건마다 불일치의 성격이 다르므로 **등급(materiality)** 을 두 가지로 나눴다.

| 등급 | 의미 | 처리 |
|---|---|---|
| `blocking` | 수치가 무의미해짐 | 기준선 자격 박탈, 상대 비교 생략 |
| `degrading` | 수치가 의심스러움 | 비교는 하되 경고 표시, FAIL을 WARN으로 완화 |

데이터셋이 다른 두 실행의 p95를 나란히 놓는 것은 “믿을 수 없는 비교”가 아니라 애초에 비교가 아니다. 반면 부하 스크립트 지문이 바뀐 경우는 대개 주석 한 줄 수정이고 수치는 대체로 유효하다. 그래서 앞의 넷은 `blocking`, 스크립트 지문은 `degrading`으로 뒀다(`comparability.js:54-89`).

기준선 탐색 함수는 `findPrevious()`에서 `findBaseline()`으로 교체했다(`repository.js:231`). 이 함수는 “직전 실행”이 아니라 **비교 가능한 가장 최근 실행**을 고르고, 탈락한 후보와 그 사유를 함께 돌려준다. 조건이 엄격해지면 기준선 없는 실행이 흔해지는데, 그때 필요한 것은 침묵이 아니라 “8월 4일 실행이 있었지만 데이터셋이 small에서 large로 바뀌어 비교하지 않았다”는 문장이기 때문이다.

함께 처리한 것은 다음과 같다.

- **부하 프로파일을 실제로 기록하기 시작했다.** k6의 `handleSummary(data)`가 받는 `data.options`에는 `summaryTrendStats`, `summaryTimeUnit`, `noColor` 세 개뿐이고 부하 설정이 들어 있지 않다(실측 확인). 대신 k6가 해석을 끝낸 선언 값인 `exec.test.options.scenarios`를 저장한다.
- **`baselineStatus`를 신설했다**(`regression.js:259`). 값은 `compared`, `incomparable`, `first-run` 셋이다. 기준선이 없다는 사실이 조용한 PASS로 새면 고치기 전보다 나쁘기 때문에 상태를 명시한다. 이때도 절대 게이트는 계속 동작한다.
- **추세 계열을 분리했다.** `recentRuns()`가 시나리오 이름만으로 묶고 있어서 small/15VU 실행과 large/200VU 실행이 한 선에 섞이고 있었다. 기준선 선택과 똑같은 결함이 추세 그래프에도 있었던 것이다. 이제 `seriesHash`로 계열을 가른다(`repository.js:274-281`).
- `analyze()`에 있던 `scriptVersion` 사후 강등 특수 분기를 위 등급 메커니즘으로 흡수했다.

**선택하지 않은 대안**

가장 먼저 떠오르는 방법은 k6 요약의 `vusMax`를 조건에 넣는 것이었지만 **버렸다.** `vusMax`는 설정값이 아니라 `vus_max` 지표의 최대치, 즉 **관측값**이기 때문이다.

`ramping-vus` 시나리오에서는 설정한 피크와 값이 같아 문제가 드러나지 않는다. 그러나 `scenarios/breakpoint.js`가 쓰는 `ramping-arrival-rate`는 목표 도착률을 유지하려고 VU를 동적으로 할당한다. 즉 **서버가 느려질수록 `vusMax`가 올라간다.** 이것을 조건으로 쓰면 다음 순서가 만들어진다.

```text
진짜 회귀 발생 → vusMax 상승 → 기준선 부적격 → 상대 비교 생략 → 게이트 통과
```

회귀가 심할수록 검사에서 면제되는, 스스로를 무력화하는 필터가 된다. 그것도 한계 탐색이 목적인 유일한 시나리오에서 그렇게 된다. 같은 이유로 `durationSec`(실제 수행 시간)도 조건에서 뺐다. 조건은 선언된 `stages`이고, 실제로 얼마나 걸렸는지는 결과다.

**검증**

- 회귀 테스트로 고정했다: `performance/tools/test/comparability.test.js`, `repository.test.js`, `regression.test.js`
- 실측 확인 결과는 다음 세 가지다.
  - 같은 조건 → 정상 비교
  - 부하 또는 데이터셋 변경 → 상대 비교 생략 + 사유 표시
  - 스크립트만 변경 → 경고 후 비교

**남은 작업**

- **데이터셋 시드 매니페스트 해시**가 없다. 프로파일 이름만으로는 다른 `seed.js`가 만든 `large`를 구분하지 못한다.
- **인프라 스펙 해시**가 없다. `docker-compose.seed.yml`의 HikariCP 50, `sync_binlog=0` 설정을 되돌리지 않은 채 측정하는 실패 모드를 잡지 못한다.

둘 다 `comparability.js`의 `CONDITIONS` 표에 한 줄씩 추가하면 된다.

저장된 과거 실행은 조건 정보가 없어 기준선 후보에서 제외된다. 이는 의도된 동작이다(사용자 결정).

## HIGH

### T-03. `--warmup`이 인프라 지표에만 적용됨 — 상태: **해결** (2026-08-12, 미커밋)

> warmup/measure/rampdown을 k6 실행 계획의 1급 개념으로 승격했다. 신규
> `performance/scripts/lib/phases.js`(`buildPhasePlan`/`phaseAt`/`stagesFor`/`scopeThresholds`
> 등 순수 함수)를 각 시나리오가 가져다 `run.phasePlan`을 구성하고,
> `scripts/lib/config.js`의 `tags()`/`check()`가 `exec.instance.currentTestRunDuration`
> 기준으로 요청마다 `phase` 태그를 다시 계산해 붙인다(캐시하지 않음 — iteration이 경계를
> 넘는 경우 대응). `scripts/lib/summary.js`는 `k6.overall`을 `k6.all`(전체 구간, 진단용)과
> `k6.phases.{warmup,measure,rampdown}`(phase 태그로 분리 추출, 게이트용)으로 나눠 기록한다.
> `performance/tools/collect.js`의 `measureWindow()`는 `record.run.phasePlan`
> (`measureStartOffsetSec`/`measureSec`)만으로 Prometheus 창을 계산한다 — CLI `--warmup`
> 인자를 더 이상 받지 않는다(`parseArgs`에서 제거). `perf-run.js --warmup <sec>`는 이제
> collect.js가 아니라 k6에 `-e WARMUP=<sec>`로 직접 전달되어 시나리오의 ramp-up stage
> 길이 자체를 바꾼다. `regression/rules.json`의 `k6.overall.*` 7개 키를
> `k6.phases.measure.*`로 옮겨 Node 회귀 게이트도 같은 구간을 보게 했다.
> `tools/lib/conditions.js`에 `measurementProfile`(mode/warmupSec/measureSec/rampdownSec/
> gatePhase) blocking 조건을 추가해, 측정 구간 설계가 다른 실행끼리는 기준선으로 못 쓰게 막았다.
>
> **고민한 대안과 버린 이유**
> (a) k6 지표도 collect.js에서 시간 기준으로 재계산 — k6 raw metric은 태그별로만
> 분리되지 시각 기준 슬라이싱을 지원하지 않아 불가능. (b) 모든 시나리오를 phase별로
> 별도 k6 scenario로 분리(cache-warm 방식) — 일반 회귀 시나리오는 VU별 쿠키 세션
> 연속성이 깨져서 기각, cache-warm처럼 애초에 phase 간 세션 연속성이 필요 없는 경우만
> 예외로 허용했다. (c) k6 builtin `iterations`에 동적 phase 태그를 실어 TPS를 phase별로
> 내는 방법 — k6가 iteration 완료 시점에 직접 기록하는 값이라 스크립트가 태그를 못
> 붙인다. 대신 `workload.js`에 `phase_iterations` 커스텀 Counter를 추가해 iteration
> 끝에서 직접 세는 방식으로 대체했다.
>
> **검증**: `cd performance && node --test tools/test/*.test.js` — phases.js 순수 로직
> 19개, `metricsByPhase`(S-17 회귀 포함) 8개, collect.js `measureWindow` 8개(rampdown
> 제외·조기 종료 clamp·재수집 재현성 포함), comparability `measurementProfile` 10개 등
> 총 100개 테스트 통과. k6 바이너리가 이 환경에 없어 실제 부하 실행 검증은 못 했다 —
> 아래 T-03 관련 후속 작업 참고.
>
> **남은 부작용/후속 작업**: 저장된 과거 `run.json`은 `k6.overall`/`infra.window.
> warmupExcludedSec` 스키마 그대로 남는다(재해석하지 않음) — `k6.phases.measure`가
> 없으므로 `pick()`이 새 rules.json 키를 못 찾아 SKIP되고, 재수집(`--force`) 해도
> `run.phasePlan`이 없어 그 사실이 그대로 유지된다(의도된 동작). 실제 k6 실행 환경에서
> `k6 inspect`/실측 실행으로 phase 태그가 기대대로 붙는지 확인이 아직 안 됐다.
>
> **후속 수정 (2026-08-13, 미커밋): threshold 평가 범위를 measure 구간으로 일원화.**
> 최초 구현은 `PHASED_THRESHOLDS`에 `DEFAULT_THRESHOLDS`(태그 없는 SLO)를 그대로 얹어서,
> 같은 기준이 전체 구간과 measure 구간에 이중으로 걸렸다. warmup 구간의 느린 응답 하나로
> measure 결과와 무관하게 k6가 FAIL을 내는 상태였고, 이는 warmup을 선언한 목적 자체를
> 무효로 만든다. 시나리오별 커스텀 threshold(`name:login`, `op:write` 단독 abortOnFail 등)도
> 같은 이유로 전체 구간을 평가하고 있었다 — 램프업 중 로그인 폭주로 조기 중단될 수 있었다.
>
> 수정 내용: `config.js`에 기준값만 담은 `COMMON_SLO_THRESHOLDS`를 분리하고,
> `DEFAULT_THRESHOLDS`(= 분해축 + 공통 SLO, 전체 구간)와 `PHASED_THRESHOLDS`(= 분해축 +
> phase 진단축 + measure로 스코프된 공통 SLO)가 그 하나의 정의에서 갈라져 나오게 했다.
> `PHASED_THRESHOLDS`에는 태그 없는 SLO가 더 이상 없다. 시나리오 고유 기준은 새 헬퍼
> `measureOnly()`(= `scopeThresholds(t, {phase:'measure'})`)를 통과시켜 9개 phase
> 시나리오(cache-warm·chat-heavy·exam-week·notification-heavy·peak-hour·read-heavy·
> registration-day·soak·write-heavy) 전부를 measure 스코프로 옮겼다. 단독 스크립트 13개와
> 진단 시나리오 5개는 `DEFAULT_THRESHOLDS`를 그대로 써서 전체 구간 판정을 유지한다.
>
> 덮어쓰기 성립 여부를 확인했다: `buildSelector()`가 태그 키를 정렬하므로 시나리오가 만든
> `http_req_failed{phase:measure}`·`http_req_duration{op:write,phase:measure}`는 공통 게이트와
> 문자열이 동일한 키다. 따라서 시나리오 값이 공통 값을 대체하며 한 대상에 두 기준이
> 겹치지 않는다(peak-hour 2% vs 공통 1% 같은 모순 제거). `chat_ws_rtt`처럼 커스텀 메트릭도
> `chat-ws.js`가 `phaseTag()`로 phase를 실어 보내므로 서브메트릭이 실제로 존재한다.
>
> **abortOnFail 평가 시점도 함께 옮겼다.** k6의 `delayAbortEval`은 threshold 스코프와 무관하게
> 테스트 시작부터 세므로, measure로 스코프해도 지연이 warmup보다 짧으면 표본 몇 건으로 평가가
> 시작된다. 새 헬퍼 `abortDelayAfterMeasure(PLAN, N)`이 `measureStartOffsetSec + N`을 계산해
> 넘긴다(chat-heavy 7분, peak-hour 5분, registration-day 4분, soak 15분, write-heavy 6분 —
> 전부 "measure 시작 + 원래 관측 시간"). 기준 수치 자체는 하나도 바꾸지 않았다. 진단 시나리오
> 5개(stress/spike/breakpoint/chaos/failover)의 중단 정책은 손대지 않았다.
>
> **threshold 정의를 `scripts/lib/thresholds.js`로 분리했다** — config.js는 `k6/http`를
> import해서 Node 테스트가 로드할 수 없다. 순수 데이터만 옮기고 config.js가 재수출하므로
> 호출부(시나리오·스크립트 30여 개)는 그대로다. 새 테스트 `tools/test/thresholds.test.js`(19건)와
> `tools/test/scenario-thresholds.test.js`(7건, 시나리오 소스 감사)를 추가했다.
>
> **k6 실측으로 검증했다** (k6 v2.1.0, [[k6-binary-path-workaround]] 경로). `k6 inspect`로
> 시나리오 9개의 해석된 threshold 키에 bare 공통 SLO가 하나도 없고 게이트가 전부
> `{...,phase:measure}`임을 확인했다. 임시 프로브 스크립트와 로컬 스텁 서버로 판정 4사례를
> 실행했다: warmup 불량+measure 정상 → PASS(exit 0), warmup 정상+measure 불량 → FAIL(exit 99),
> cold-start 전 구간 불량 → FAIL, 단독 스크립트 전 구간 불량 → FAIL(bare 키 위반).
>
> 그 과정에서 두 가지 실제 동작을 발견해 반영했다.
>   1. 진단축 `http_req_failed{phase:X}: rate<1`은 warmup 요청이 **전부** 실패하면 rate가
>      정확히 1이 되어 FAIL 한다 — 집계 축이 판정에 끼는 셈이라 `rate<=1`로 고쳤다
>      (`tools/lib/report.js`의 느슨한 threshold 필터 정규식도 함께 갱신).
>   2. k6는 **등록되지 않은 메트릭**에 걸린 threshold를 만나면 실행을 시작하지 못하고 중단한다
>      (`invalid threshold defined on phase_iterations{phase:measure}`). PHASED_THRESHOLDS를
>      쓰는 시나리오는 그 Counter를 만드는 `scenarios/lib/workload.js`를 반드시 로드해야 한다는
>      뜻이라, 감사 테스트로 고정했다.

**문제**

`performance/tools/collect.js:200-204`는 warmup 시간을 Prometheus 조회 구간에서만 제외한다. k6의 p95와 오류율은 warmup을 포함한 전체 실행 구간으로 계산한다.

따라서 같은 리포트 안에서도 다음 두 종류의 지표가 서로 다른 시간대를 설명한다.

- k6 지표: warmup을 포함한 전체 구간
- 인프라 지표: warmup을 제외한 구간

**영향**

서로 다른 시간 범위에서 측정한 값을 같은 실행 결과처럼 비교하게 된다.

또한 warmup 값은 `infra.window`에만 저장되고 인덱스와 기준선 조건에는 포함되지 않는다. warmup 길이가 다른 실행끼리 비교하면 `gc.count`나 `slowQueries`처럼 구간 누적값을 사용하는 지표가 시간 차이만큼 증가하거나 감소한 것처럼 보일 수 있다.

**필요한 조치**

k6 지표와 인프라 지표가 같은 분석 구간을 사용하도록 맞춰야 한다. 기준선을 선택할 때도 warmup 조건이 같은지 확인해야 한다.

### T-04. 한 번씩만 실행한 결과를 비교하며 타임아웃 상한도 인식하지 못함 — 상태: 미해결

이 항목에는 서로 연결된 두 가지 문제가 있다.

#### 문제 1: 반복 실행 없이 한 번의 결과만 비교함

현재 판정은 현재 실행 한 번과 기준선 실행 한 번을 비교한다. 실행 편차나 분산을 측정하지 않는다.

`performance/regression/rules.json:19`에는 “반복 실행 편차 근거”라는 설명이 있지만 실제 구현은 없다.

노이즈 하한도 상대 비율이 아니라 절대값으로 적용한다. 요청량이 적은 시나리오에서는 큰 비율의 변화도 작은 절대 변화로 판단해 무시할 수 있다.

**근거**

실제 실행에서 RPS가 17.3% 감소했지만 다음과 같은 이유로 PASS 처리됐다.

```text
변화 0.92 < 하한 1.00
```

#### 문제 2: 타임아웃 때문에 잘린 값을 실제 지연 시간처럼 비교함

p95가 `60000.96ms`로 표시된 사례가 있다. 이는 실제 응답 시간이 아니라 k6의 60초 타임아웃 상한에 걸려 잘린 값이다.

현재 게이트는 이 값이 측정 상한이라는 사실을 모른다. 이후 시스템이 더 느려져도 결과가 계속 약 60초로 표시되므로 변화율은 0%에 가까워지고 PASS할 수 있다.

같은 실행에서 다음 신호도 함께 나타났다.

- `errorRate = 0.558`
- `checkRate = 0.443`

두 지표를 함께 보면 요청 절반 이상이 정상 처리되지 않았음을 알 수 있지만, 현재 판정 로직은 이를 타임아웃 검열 신호로 사용하지 않는다.

**필요한 조치**

반복 실행 결과로 정상 편차 범위를 계산해야 한다. 타임아웃 상한에 걸린 지연 시간은 일반적인 p95 변화율로 비교하지 말고 오류율, checkRate와 함께 별도의 실패 상태로 판정해야 한다.

### T-07. 스크립트 버전 판정이 실제 변경 범위를 제대로 반영하지 못함 — 상태: 미해결

이 항목에도 반대 방향의 두 가지 문제가 있다.

#### 문제 1: 실제 요청 동작이 바뀌어도 버전이 같다고 판단할 수 있음

`performance/tools/perf-run.js:88-95`는 시나리오 진입 파일 하나만 SHA-256으로 해시한다.

하지만 실제 요청 구성과 실행 동작은 다음 공통 파일에도 들어 있다.

- `performance/scripts/lib/session.js`
- `performance/scripts/lib/data.js`
- `performance/scripts/lib/config.js`
- `performance/scenarios/lib/workload.js`

이 파일들이 바뀌어도 `scriptVersion`은 바뀌지 않는다. 따라서 서로 다른 동작의 실행 결과를 같은 버전으로 비교할 수 있다.

#### 문제 2: 진입 파일이 조금만 바뀌어도 실패 판정이 약해짐

`performance/tools/lib/regression.js:183-188,200`은 `scriptChanged`가 참이면 FAIL을 WARN으로 낮춘다.

진입 파일에 주석 한 줄만 추가해도 스크립트 변경으로 판단한다. 이 상태에서는 실제 성능 회귀가 발생해도 빌드가 게이트를 통과할 수 있다. 이를 강제로 실패 처리할 `--strict` 같은 옵션도 없다.

**필요한 조치**

실제 실행에 영향을 주는 모든 파일을 버전 계산에 포함해야 한다. 단순히 스크립트가 바뀌었다는 이유만으로 모든 실패를 WARN으로 낮추지 말고, 필요하면 엄격하게 판정할 수 있는 정책을 제공해야 한다.

### T-08. 필수 지표를 수집하지 못해도 테스트가 통과함 — 상태: **해결** (2026-08-13, 미커밋)

> **무엇을 어떻게 고쳤나 — 2층 구조**
>
> *1층 (`scripts/lib/phases.js`의 `metricsByPhase`)*: 표본이 0건인 phase의 통계를 `null`로
> 되돌린다. 판정 근거는 값이 아니라 표본 수다 — `http_reqs{phase:X}` 서브메트릭이 요약에
> 존재하고 그 `count`가 0이며, iteration 수도 0/미집계일 때만 결측으로 본다. 그때
> `avg/min/med/max/p90/p95/p99`와 `rps·errorRate·checkRate`를 전부 `null`로 만들고,
> `httpReqs`(0)와 `iterations`(null)는 결측의 증거로 남긴다.
>
> *2층 (`tools/lib/regression.js`의 `analyze`)*: `null`을 세 갈래로 나눈다. 새 함수
> `isApplicable()`이 "이 실행에 해당 없는 규칙"(진단 시나리오의 measure 규칙)을 먼저
> 걸러내고, `isRequired()`가 나머지를 필수/참고로 가른다. 결과로
> `measurementStatus`(MEASURED/PARTIAL/UNMEASURED)와 `missingRequired`·`missingOptional`·
> `notApplicable`을 `verdict`와 **별도 필드로** 반환한다. `collect.js`가 이미 계산해 두고
> 리포트 표시에만 쓰던 `window.incomplete`도 여기서 PARTIAL 강등 조건으로 연결했다.
>
> *필수의 정의*: `gate: true`를 그대로 쓴다. 면제 조건은 둘 — measure 게이트는
> `phasePlan.gatePhase === 'measure'`인 실행에서만, 인프라 게이트는 `rules.json`의 새
> `requirements.infraRequiredEnvironmentPrefixes`(`["perf"]`)에 prefix가 걸리는 환경에서만
> 필수다. `validateRequirements()`가 그 블록의 형식을 검증한다.
>
> *종료 코드*: `collect.js`에 3(측정 불가)을 신설했다. 게이트 회귀(1)와 동시에 성립하면
> 3이 이기고, 두 사실 모두 콘솔에 출력된다. `--no-gate`는 0을 유지한다. `perf-run.js`는
> 수집 종료 코드를 그대로 전달하므로 수정하지 않았다.
>
> *파급*: `repository.js`의 인덱스 엔트리에 `measurementStatus`를 넣고 `findBaseline()`이
> `UNMEASURED` 실행을 기준선 후보에서 제외한다. 리포트는 요약 지표보다 위에 측정 상태
> 배너를 그리고(`sectionMeasurement`), "평가 불가" 집계를 필수/참고/해당없음 셋으로 쪼갠다.
>
> **고민한 대안과 버린 이유**
>
> - *`rules.json`에 독립 `required` 필드를 추가한다*(원래 계획, `NEXT-DAY-PERF-TASKS.md`):
>   버렸다. `gate:true`가 이미 "이 지표가 나쁘면 빌드를 세운다"는 선언이고, 그 지표가 없으면
>   빌드를 세울 방법이 없으므로 게이트 규칙은 정의상 필수다. 별도 필드를 두면
>   `gate:true, required:false`("실패시키긴 하는데 없어도 됨") 같은 모순 조합만 가능해지고,
>   32개 규칙 전부에 유지해야 할 필드가 하나 늘어난다. 예외가 실제로 생기면 그때
>   `required:false` 오버라이드를 더하는 편이 낫다.
> - *`regression.js`에서 `null`만 검사한다*(첫 설계): **실측으로 기각했다.** k6는 threshold가
>   참조한 서브메트릭을 표본이 0건이어도 0으로 채워 요약에 실어 준다. 그래서 measure 구간이
>   비면 값이 `null`이 아니라 0으로 들어오고, `p95:0`은 절대 게이트(500ms 상한)를 통과하며
>   기준선 대비로는 "100% 개선"으로 읽힌다. 값만 보는 층에서는 이걸 가려낼 수 없어서 1층이
>   필요했다.
> - *표본 0건이면 phase 버킷 자체를 만들지 않는다*: 버렸다. 버킷이 없으면 "그 구간을
>   선언하지도 않았다"와 "선언했는데 못 쟀다"가 다시 구별되지 않는다. 버킷은 만들되 통계만
>   `null`로 두어, 저장된 `run.json`만 보고도 결측을 재구성할 수 있게 했다.
> - *`http_reqs` 서브메트릭이 없으면 결측으로 본다*: 버렸다. 서브메트릭 부재는 "0건"이 아니라
>   "그 축을 선언하지 않았다"는 뜻이다. 기존 테스트(`phases.test.js`)가 이 구분을 바로
>   잡아냈다. 적극적 증거(축이 존재하고 count가 0)가 있을 때만 결측으로 판정한다.
> - *`iterations` 없이 `http_reqs`만 본다*: 버렸다. WebSocket 위주 구간은 HTTP 요청이 0이어도
>   iteration이 실제로 돈다. 한쪽만 보면 정상 구간을 결측으로 오판한다.
> - *진단 시나리오의 measure 결측을 "참고 결측"으로 센다*: 버렸다. 그러면 진단 실행이 항상
>   PARTIAL로 표시돼, 정작 익스포터가 죽었을 때의 PARTIAL 신호가 묻힌다. `isApplicable()`로
>   "해당 없음"을 세 번째 분류로 분리한 이유다.
> - *환경을 정확히 일치로 판정한다*: 버렸다. 실제 이력의 환경 값이
>   `perf`·`perf-mi-smoke`·`perf-mi-before`·`perf-s02-ab`라, 정확히 일치로 걸면 변형 셋이 전부
>   면제된다. prefix 판정으로 바꿨다.
> - *`UNMEASURED`를 `verdict`의 네 번째 값으로 만든다*: 버렸다. "서버가 느리다"와 "재지
>   못했다"는 고칠 대상도 고칠 사람도 달라서, 한 필드에 넣으면 다시 섞인다. 종료 코드도
>   1과 3으로 갈랐다.
> - *게이트 회귀(1)를 측정 불가(3)보다 우선한다*: 버렸다. 게이트 회귀는 측정을 고치면 다음
>   실행에서 다시 잡히는 재발견 가능한 신호지만, 측정 파이프라인이 깨진 상태를 방치하면 이후
>   모든 실행의 판정이 계속 무의미해진다. 계통적 고장을 먼저 알린다.
>
> **어떻게 검증했나**
>
> ⑴ *k6 실측* (v2.1.0, [[k6-binary-path-workaround]] 경로). measure executor 없이
> `{phase:measure}` threshold만 선언한 프로브를 돌려 빈 서브메트릭의 실제 모양을 확인했다.
> `http_req_duration{op:read,phase:measure}`는 p(95)=0, `http_req_failed{phase:measure}`는
> rate=0으로 요약에 존재했고, **`checks{phase:measure}`는 rate가 0인데도 `rate>0.99`가
> PASS로 보고됐다**(k6는 표본 없는 지표의 threshold를 통과 처리한다). 실행 종료 코드 0.
> 즉 `thresholdsPassed`는 이 상황에서 신뢰할 수 없다.
>
> ⑵ *수정 전 도구 동작 실측*. 저장된 실제 런을 세 고장 상황으로 바꿔 `analyze()`에 넣었다.
> Prometheus 사망 → PASS(32개 중 25개 SKIP), 게이트 인프라 3개 결측 → WARN(게이트 실패 0건),
> measure 표본 0건 → FAIL이지만 사유가 "Check 성공률 0% — SLO 미달"이었다(성능 오진).
>
> ⑶ *수정 후 같은 사례 재실행*: Prometheus 사망 → PASS/UNMEASURED(필수 3건), measure 표본
> 0건 → PASS/UNMEASURED(필수 10건), 로컬 환경 + Prometheus 없음 → PASS/PARTIAL(필수 0건).
> 판정과 측정 상태가 의도대로 분리됐다.
>
> ⑷ *종료 코드 end-to-end*. 현행 스키마의 합성 런 2개를 만들어 `collect.js`를 끝까지
> 돌렸다 — 정상 런 exit 1(게이트 회귀), 표본 0건 런 exit 3(측정 불가, 콘솔에 두 사실 모두
> 출력), `--no-gate` exit 0. 확인 후 합성 런을 지우고 `reports/`를 원상복구했다.
>
> ⑸ *자동 테스트*: `node tools/test/all.js` 149개 통과(수정 전 130개 → 19개 추가).
> `phases.test.js`에 표본 0건 판정 4건, `regression.test.js`에 측정 상태·필수 판정 13건,
> `repository.test.js`에 기준선 제외 2건.
>
> **남은 부작용 / 후속 작업**
>
> - *저장된 과거 런은 재계산되지 않는다.* 1층 수정은 `k6.json`을 파싱하는 시점에 적용되므로,
>   이미 0으로 기록된 phase 통계는 그대로다. 게다가 저장된 런 전부가 구 스키마(`k6.overall`)라
>   현재 `collect.js`로는 재수집 자체가 안 된다(`Cannot read properties of undefined (reading
>   'vusMax')`). 이건 T-08과 무관한 별건이며 아직 발견 항목으로 등록돼 있지 않다.
> - *`perf*` 환경에서 Prometheus 없이 돌리면 이제 exit 3이다.* 탐색적 실행에는 `--no-gate`를
>   붙인다.
> - *S-10과 이어진다.* → **2026-08-13 처리됨.** `findBaseline()`의 `thresholdsPassed !== false`
>   조건을 걷어내고, 이번에 추가한 측정 상태가 그 자리를 대신한다. 다만 사전 필터 형태가
>   아니라 `eligibilityOf()`로 옮겨 탈락 사유가 리포트에 남도록 했다 — 사전 필터로 지운
>   후보는 `rejected`에 남지 않아 리포트가 "첫 실행"이라고 거짓 보고했기 때문이다.
>   `PARTIAL` 중 measure 구간 미완만 제외한다는 세부 정책도 그때 정해졌다.
>   ⑴에서 확인했듯 `thresholdsPassed`는 표본 0건 런에서도 true라 기준선 자격 판정에 쓸 수 없다.
> - 커밋: (미커밋)

**문제**

`performance/tools/lib/regression.js:67-71`은 현재 지표값이 `null`이면 해당 규칙을 SKIP한다. 이후 `analyze()`는 FAIL과 WARN 개수만 보고 전체 판정을 결정한다.

따라서 “지표가 정상 범위에 있다”와 “지표를 아예 측정하지 못했다”를 구분하지 못한다.

**실패 시나리오**

`performance/tools/collect.js:212-214`에서 Prometheus에 연결하지 못하면 `infra.flat = {}`가 된다. 모든 인프라 지표가 결측되지만 결과는 다음처럼 처리된다.

- 인프라 규칙: SKIP
- 전체 판정: PASS
- 프로세스 종료 코드: 0

Prometheus 자체가 죽거나 개별 익스포터 하나가 멈춘 경우에도 같은 문제가 생길 수 있다.

**영향**

성능 게이트가 필요한 데이터를 전혀 수집하지 못한 상태에서도 정상 결과처럼 통과한다.

**필요한 조치**

게이트에 필요한 지표가 없으면 단순 SKIP이 아니라 “평가 불가” 상태로 처리해야 한다. 필수 지표와 선택 지표를 구분하고, 필수 지표 결측 시 어떤 종료 코드를 반환할지 정책을 정해야 한다.

### T-14. `perf-run`이 잘못된 실행 결과를 수집할 수 있음 — 상태: 해결

**기존 문제**

`performance/tools/perf-run.js:173-177`은 실행 ID를 전달하지 않고 `collect`를 호출했다. `collect.js:248-250`은 pending 목록의 마지막 항목을 선택했고, `repository.js:59-67`은 목록을 알파벳순으로 정렬했다.

결국 가장 최근 실행이 아니라 이름이 알파벳순으로 마지막인 실행을 선택했다.

예를 들어 수집에 실패한 `timetable-*` pending 실행이 하나 남아 있으면, 이후 auth, boards, comments, posts 실행을 수집할 때도 계속 그 timetable 실행을 선택할 수 있었다. 두 실행을 동시에 수행해도 같은 충돌이 발생할 수 있었다.

**해결 내용**

- `perf-run` 실행 전후의 스테이징 목록 차이로 현재 실행 ID를 식별
- 식별한 실행 ID를 `collect`에 직접 전달
- k6가 급사해 결과 파일이 없으면 수집을 건너뛰고 실패 종료
- 인자 없이 `collect`를 실행할 때는 알파벳순이 아니라 파일 수정 시간 기준으로 최신 항목 선택

### T-15. `index.json` 손상 시 실행 이력이 조용히 사라질 수 있음 — 상태: 해결

**기존 문제**

`performance/tools/lib/repository.js:45-48`은 `index.json`을 바로 덮어썼다. 임시 파일을 완전히 쓴 뒤 교체하는 원자적 저장 방식을 사용하지 않았다.

또한 `saveRun()`은 인덱스 전체를 읽고 수정한 다음 다시 쓰는 방식이었다. 저장 도중 프로세스가 종료되거나 여러 프로세스가 동시에 접근하면 파일이 일부만 기록될 수 있었다.

`loadIndex()`는 JSON 파싱에 실패하면 오류를 알리지 않고 다음 값을 반환했다.

```json
{ "runs": [] }
```

그 뒤 `saveRun()`이 실행되면 손상된 인덱스를 실행 한 개만 들어 있는 새 인덱스로 덮어썼다. 그 결과는 다음과 같다.

1. 이전 실행 이력이 사라짐
2. `findPrevious()`가 기준선을 찾지 못함
3. 현재 실행을 “첫 실행”으로 처리
4. 회귀 게이트가 비교 없이 통과

**해결 내용**

- JSON을 임시 파일에 먼저 기록한 뒤 rename하는 원자적 저장 방식 적용
- 파일이 없는 정상적인 빈 이력과 JSON이 손상된 상태를 구분
- 파일이 손상되면 예외와 rebuild 안내를 표시
- `history.js --rebuild` 복구 경로가 작동하는지 확인

실행 번호의 동시성 및 재번호 문제는 T-28에서 별도로 다룬다.

### T-16. 수집 실패가 성공 종료 코드로 바뀔 수 있음 — 상태: 해결

**기존 문제**

세 가지 경로에서 실패가 성공으로 처리될 수 있었다.

1. `collect.js:276-279`는 `--all`로 여러 실행을 수집할 때 전부 실패해도 종료 코드 0을 반환했다. 대상이 한 개일 때만 종료 코드 2를 사용했다.
2. `perf-run.js:180`에서 collector가 시그널로 종료되면 `col.status`가 `null`이 된다. 이를 `process.exit(null)`로 전달하면서 종료 코드 0이 됐다.
3. `col.error`를 검사하지 않았다.

또한 k6가 `handleSummary` 실행 전에 죽으면 staged 결과 파일이 생성되지 않는다. 기존 코드는 이 상황을 확인하지 않아 현재 실행 대신 다른 pending 실행을 수집할 수 있었다.

**해결 내용**

- `--all` 실행 중 하나라도 수집에 실패하면 종료 코드 2 반환
- `perf-run`에서 `col.error` 검사
- 시그널 종료로 `status = null`인 경우 성공으로 처리하지 않음
- `--no-collect` 경로에도 같은 종료 규칙 적용
- `--wait`와 `--warmup` 값이 숫자가 아니면 즉시 거부

### T-29. MySQL 락·트랜잭션·풀스캔 지표가 수집 카탈로그에서 빠져 있음 — 상태: 미해결

추가 조사일: 2026-08-06

**문제**

`performance/tools/lib/metrics-catalog.js:221`의 MySQL 그룹에는 다음 9개 지표만 등록돼 있다.

- `maxConnections`
- `slowQueries`
- `qps`
- `qpsMax`
- `bufferPoolHitPct`
- `rowsReadPerSec`
- `abortedConnects`
- `threadsRunning`
- `threadsConnected`
- `innodbRowLockWaits`

원문에는 9개라고 기록돼 있지만 위 목록은 실제로 10개다. 구현을 수정할 때 카탈로그의 실제 항목 수도 함께 확인해야 한다.

Prometheus에는 이보다 많은 MySQL 지표가 이미 들어오고 있다. 익스포터 설정을 바꾸거나 새로운 수집 경로를 만들 필요는 없다. 현재는 지표 카탈로그에 등록하지 않아 보고서에서 사용하지 못하는 상태다.

**왜 중요한가**

`localDocs/`의 병목 카탈로그는 BTL-003, 즉 인기글 카운터의 락 경합을 “확정” 상태로 기록하고 있으며 실측 데드락도 재현됐다고 설명한다.

하지만 현재 등록된 `innodbRowLockWaits`는 `Innodb_row_lock_current_waits`를 사용한다. 이 값은 조회하는 순간에 락을 기다리는 트랜잭션 수만 보여주는 스냅샷이다. 테스트 구간 전체에서 락 대기가 얼마나 발생했는지, 총 대기 시간이 얼마였는지는 알 수 없다.

따라서 현재 도구만으로는 이미 확인한 락 병목을 제대로 측정할 수 없다. EXP-003을 수행할 때 필요한 판단 근거가 부족하다.

**실측 확인 결과**

다음 PromQL이 실제 Prometheus에서 값을 반환하는 것을 2026-08-06에 확인했다.

| 추가할 키 | PromQL | 의미 |
|---|---|---|
| `mysql.rowLockTimeMs` | `increase(mysql_global_status_innodb_row_lock_time[$RANGE])` | 테스트 구간의 누적 락 대기 시간. 검증값: 295 |
| `mysql.rowLockTimeMaxMs` | `max_over_time((mysql_global_status_innodb_row_lock_time_max)[$RANGE:])` | 가장 길었던 단일 락 대기 시간. 검증값: 84 |
| `mysql.commits` | `increase(mysql_global_status_commands_total{command="commit"}[$RANGE])` | 실제 커밋된 트랜잭션 수 |
| `mysql.rollbacks` | `increase(mysql_global_status_commands_total{command="rollback"}[$RANGE])` | 데드락이나 충돌을 간접적으로 확인할 수 있는 롤백 수. 검증값: 0 |
| `mysql.fullScanRows` | `increase(mysql_global_status_handlers_total{handler="read_rnd_next"}[$RANGE])` | 풀스캔으로 읽은 행 수. 검증값: 47,215,458 |
| `mysql.tmpDiskTables` | `increase(mysql_global_status_created_tmp_disk_tables[$RANGE])` | 정렬 또는 그룹핑 데이터가 메모리를 넘어 디스크 임시 테이블을 사용한 횟수. 검증값: 0 |

`mysql.fullScanRows`의 검증값 47,215,458은 상당히 큰 값이므로 원인 확인이 필요하다.

**데드락 지표의 제한**

`mysql_global_status_innodb_deadlocks`는 현재 Prometheus에 존재하지 않는다. 조회 결과 시계열이 0개다.

데드락 횟수를 직접 수집하려면 익스포터에 `--collect.engine_innodb_status` 옵션이 필요하다. 이는 E-39에서 다룬다. 해당 설정을 추가하기 전에는 `mysql.rollbacks`를 간접 신호로 사용해야 한다.

**추가 확인 사항**

`mysql.tmpDiskTables`는 `performance/PERFORMANCE-MANAGEMENT.md` §10에서 “지표를 하나 추가하는 방법”의 예시로 이미 사용하고 있다. 문서에는 예시로 존재하지만 실제 카탈로그에는 추가하지 않은 상태다.

**예상 작업량**

- 변경 범위: 지표 카탈로그 파일 한 개에 약 6개 항목 추가
- 수집 오버헤드: 없음. Prometheus가 이미 수집 중인 지표를 사용함
- 예상 시간: 약 30분

**선행 조건**

먼저 T-08의 결측 지표 처리 방침을 정하는 편이 안전하다. 방침 없이 지표만 추가하면 특정 환경에서 새 지표를 수집하지 못했을 때 또다시 SKIP 후 PASS할 수 있다.

`rules.json`에 락 대기 관련 게이트 규칙을 추가할지도 T-08의 정책을 결정한 뒤 판단해야 한다.

## MEDIUM

### T-17. 결과 파일을 너무 일찍 승격함 — 상태: 해결

**기존 문제**

`performance/tools/collect.js:230-235`는 staged `k6.json`을 `saveRun()`과 `renderReport()` 실행 전에 최종 위치로 이동했다.

하지만 `repository.js:85-86`의 주석에는 “수집 성공 후에만 승격”한다고 적혀 있어 코드와 설명이 일치하지 않았다.

`renderReport()`가 예외를 던지면 실행 기록과 리포트 저장은 실패하지만 staged 파일은 이미 사라진다. 복구가 안정적인 절차가 아니라 우연한 상태에 의존하게 된다.

**해결 내용**

`saveRun()`과 리포트 기록이 모두 성공한 뒤 마지막 단계에서 staged 파일을 승격하도록 순서를 변경했다. 이제 코드 동작과 주석이 일치한다.

### T-18. 일부 Prometheus 지표가 실제 상태와 다르게 표시될 수 있음 — 상태: 미해결

현재 PromQL에는 서로 다른 여섯 가지 문제가 있다. 이 때문에 보고서가 이벤트 수를 부정확하게 표시하거나, 짧은 부하 급증을 놓치거나, 정상 상태를 장애로 판단할 수 있다.

#### 문제 1: 누적 이벤트 수를 정확한 정수처럼 표시함

`increase(...[$RANGE])`는 조회 구간의 시작과 끝에 데이터가 부족하면 값을 외삽해 추정한다. 실제 카운터가 정수 단위로 증가하더라도 결과는 소수가 될 수 있다.

실제로 `slowQueries`가 `839.155…`로 계산된 사례가 있다. 이는 느린 쿼리가 정확히 839.155번 발생했다는 뜻이 아니다.

현재 보고서는 이 값을 실제 발생 횟수처럼 취급한다. 정확한 횟수가 아니라 구간 추정치라는 사실을 표시하거나, 표시 및 판정 방식을 조정해야 한다.

#### 문제 2: 테스트 중 짧게 발생한 피크가 전체 평균에 묻힘

`rate(...[$RANGE])`는 테스트 전체 구간의 초당 평균 증가율을 계산한다.

부하 테스트에는 보통 사용자를 서서히 늘리는 램프 구간이 포함된다. 짧은 시간 동안 CPU 사용량이나 요청량이 크게 증가해도, 나머지 시간이 낮은 부하였다면 전체 평균은 낮게 나온다.

피크를 계산하는 `*Max` 지표도 존재하지만 현재 게이트 규칙에서는 사용하지 않는다. 따라서 순간적인 병목을 놓칠 수 있다.

#### 문제 3: Prometheus 계산 간격 때문에 짧은 피크를 놓칠 수 있음

Prometheus는 원본 지표를 5초마다 수집하지만, 일부 서브쿼리는 기본 `evaluation_interval`인 15초 간격으로 계산된다.

5초 동안만 발생한 피크가 15초 계산 지점 사이에 있으면 최대값이나 p95가 실제보다 낮게 계산될 수 있다.

`cpu.cores.*` 지표에는 `rate[1m]`가 하드코딩돼 있다. 이 값은 `saturation.cpuPct`를 계산할 때 사용된다. CPU가 10초 동안 최대치에 도달해도 1분 평균에 희석되므로 짧은 CPU 포화를 놓칠 수 있다.

#### 문제 4: 컨테이너 이름이 환경에 따라 달라지면 지표가 모두 누락될 수 있음

컨테이너 쿼리는 이름이 정확히 `perf-app`인 컨테이너를 찾는다.

Docker Compose v2는 프로젝트 이름을 컨테이너 이름 앞에 붙일 수 있다. 실제 이름이 달라지면 쿼리가 대상을 찾지 못하고 관련 지표가 모두 `null`이 된다.

현재 판정 로직은 결측 지표를 SKIP한 뒤 전체 테스트를 PASS할 수 있다. 따라서 단순한 이름 차이 때문에 인프라 검사가 전부 비활성화될 수 있다.

또한 현재 `max()` 집계 방식은 컨테이너가 테스트 도중 재시작될 경우 재시작 전후의 카운터를 올바르게 합산하지 못할 수 있다.

#### 문제 5: 다른 MySQL 또는 Redis 서버의 지표가 섞일 수 있음

MySQL과 Redis PromQL에는 대상 `job`이나 `instance`를 제한하는 조건이 없다.

같은 Prometheus에 여러 MySQL 또는 Redis 익스포터가 연결돼 있으면 테스트 대상이 아닌 서버의 지표까지 결과에 섞일 수 있다. 보고서가 어느 서버의 상태를 나타내는지 보장할 수 없다.

쿼리에서 테스트 대상 익스포터를 명확하게 선택해야 한다.

#### 문제 6: Redis 요청이 없을 때 적중률을 0%로 표시함

`redis.hitRatioPct`는 분모가 0이 되는 것을 막기 위해 `clamp_min(x, 1)`을 사용한다.

캐시 요청이 한 번도 없으면 적중률을 계산할 수 없다. 하지만 현재 수식은 이 경우를 0%로 계산한다. 보고서만 보면 캐시 요청이 없었던 정상 상태를 “캐시 적중률 0%” 또는 “캐시 붕괴”로 오해할 수 있다.

트래픽이 없을 때는 0%가 아니라 “평가할 데이터 없음”으로 처리해야 한다.

### T-19. 분석 도구의 자동 테스트가 아직 충분하지 않음 — 상태: 부분 해결

**기존 문제**

다음 핵심 함수들은 외부 상태에 크게 의존하지 않는 순수 함수인데도 자동 테스트가 없었다.

- `evaluateRule`
- `findPrevious`
- `trendStat`
- `computeDerived`
- `pick`

인프라 비교 결과가 SKIP이 아니라고 확인하는 테스트 하나만 있었어도 T-01을 발견할 수 있었다. CI 통과 여부를 결정하는 분석 도구 자체는 CI에서 충분히 검증되지 않았다.

**해결된 부분**

- `performance/package.json` 추가
- `performance/tools/test/` 테스트 도입
- `npm test`로 실행
- Node.js `node:test` 사용
- 총 28개 테스트 추가

현재 테스트는 다음 기능을 다룬다.

- `pick`
- `evaluateRule`
- `analyze`
- `validateRules`
- `writeJson`
- `loadIndex`
- breakdown 처리
- 데이터 변환

**남은 작업**

- lint 도입
- `report` 모듈 테스트
- `history` 모듈 테스트
- PromQL 생성 로직 테스트
- 그 밖의 미검증 모듈 테스트

### T-20. 서로 다른 두 개의 회귀 판정 시스템이 함께 존재함 — 상태: 해결

**기존 문제**

다음 두 판정 시스템이 서로 다른 기준으로 함께 존재했다.

1. `compare.js` + `thresholds.json`
   - p95가 10% 증가하면 실패
2. `regression.js` + `rules.json`
   - 경고 기준 10%, 실패 기준 20%

`compare.js`는 존재하지 않는 `regression/baseline.json`을 요구해 실제로는 사용할 수 없는 코드였다. 그런데도 `summary.js:210`은 이전 시스템용 raw summary를 계속 기록했다.

그 결과 어떤 판정 기준이 공식 기준인지 불분명했고, 사용되지 않는 결과 파일도 계속 생성됐다.

**해결 내용**

- `compare.js` 삭제
- `thresholds.json` 삭제
- `summary.js`의 `reports/raw` 이중 기록 제거
- `tools/README`와 `regression/README` 갱신

`reports/raw`에 이미 저장된 파일은 과거 이력을 보존하기 위해 유지했다.

### T-21. 같은 로직이 여러 파일에 중복 구현돼 있음 — 상태: 미해결

**문제**

같은 목적의 로직이 여러 위치에 각각 구현돼 있다.

- `migrate-raw.js`는 `summary.js`의 파싱 로직을 복사한 형태이며 동일한 정규식도 포함한다.
- 증감률 계산은 `regression.js`, `report.js` 두 곳, `history.js`까지 총 네 곳에 구현돼 있다.
- 각 증감률 계산이 서로 다른 예외 처리 기준과 컷오프를 사용한다.
- `fmtNum`과 `format.num`의 표시 결과가 일치하지 않는다.
- `TREND_METRICS` 목록을 두 곳에서 따로 관리한다.

**영향**

한 곳의 계산 방식을 수정해도 다른 곳에는 반영되지 않을 수 있다. 같은 실행 결과가 회귀 판정, 리포트, 이력 화면에서 다르게 표시될 위험이 있다.

**필요한 조치**

공통 계산과 포맷팅 로직을 하나의 모듈로 모으고, 지표 목록도 한 곳에서 관리해야 한다.

### T-22. 모든 시나리오에 같은 게이트 규칙을 적용함 — 상태: 미해결

**문제**

`performance/tools/lib/regression.js:165-168`은 모든 실행에 동일한 32개 규칙을 적용한다.

하지만 시나리오마다 목적이 다르다. stress, spike, breakpoint, chaos 테스트는 시스템이 한계에 도달하거나 실패하는 지점을 찾는 것이 목적이다. 이 과정에서는 p95 500ms 초과나 오류율 1% 초과가 예상될 수 있다.

현재는 이런 결과도 일반적인 회귀 실패와 똑같이 FAIL 처리한다.

**영향**

한계 테스트는 구조적으로 실패하기 쉬우므로 사용자가 습관적으로 `--no-gate`를 사용할 수 있다. 이 습관이 일반 회귀 테스트까지 이어지면 실제 성능 회귀도 검사하지 않게 된다.

**필요한 조치**

시나리오 목적에 맞는 규칙 집합을 사용해야 한다. 일반 회귀 테스트와 한계 탐색 테스트의 성공 조건도 분리해야 한다.

### T-23. 게이트로 선택한 지표가 실제 병목 원인을 충분히 보여주지 못함 — 상태: 미해결

**문제**

현재 게이트로 사용하는 주요 인프라 지표는 다음 세 가지다.

- CPU throttling
- slowQueries
- Hikari timeouts

이 세 지표는 T-01 때문에 오랫동안 실제로 평가되지 않았다.

반면 자원 병목을 더 직접적으로 보여주는 다음 지표들은 수집만 하고 게이트 판정에는 사용하지 않는다.

- `saturation.hikariPct`
- `pool.hikariPending.max`
- `saturation.tomcatPct`
- `saturation.heapPct`

**근거**

실제 실행에서 다음 값이 발생했다.

- Hikari pending 요청: 205
- Hikari timeout: 5316

하지만 시스템은 Hikari 풀 고갈 자체보다 k6 지연 시간을 통해서만 실패를 감지했다.

또한 `k6.breakdown.*` 지표를 사용하는 규칙은 하나도 없다.

**영향**

게이트가 실패 사실은 알려줄 수 있어도 원인이 CPU, 커넥션 풀, Tomcat 스레드, 힙 중 무엇인지 빠르게 구분하기 어렵다.

**필요한 조치**

게이트의 목적을 “배포 차단”과 “병목 진단”으로 나누고, 직접적인 포화 지표와 k6 요청 단계별 지표를 어떤 방식으로 판정에 사용할지 다시 정해야 한다.

### T-24. 서로 강하게 연관된 지표를 각각 독립적인 게이트로 사용함 — 상태: 미해결

**문제**

다음 다섯 지표는 대부분 같은 성능 현상을 서로 다른 방식으로 측정한다.

- 평균 응답 시간
- p95
- p99
- TPS
- RPS

이 지표들을 각각 독립적인 게이트로 사용해도 새로운 정보를 많이 얻지는 못한다. 반면 노이즈 때문에 하나라도 잘못 실패할 가능성은 늘어난다.

각 규칙의 오탐 확률을 5%라고 가정하면, 다섯 규칙 중 하나 이상이 오탐할 확률은 대략 25%에 가까워진다.

**임계값 불균형**

오류율의 절대 경고 기준은 `0.001`이다. 요청 1000건 중 오류 1건만 발생해도 경고가 될 수 있어 매우 민감하다.

반면 `slowQueries`는 두 배가 돼야 FAIL한다. 기준선이 4이고 현재 값이 400인 경우처럼 매우 크게 증가해도 `minBaseline = 5` 조건 때문에 비교 자체가 생략된다.

**영향**

일부 지표에는 지나치게 민감하고, 다른 중요한 변화에는 지나치게 둔감한 판정이 된다.

**필요한 조치**

강하게 연관된 지표 중 대표 게이트를 정하고 나머지는 진단 정보로 사용하는 방안을 검토해야 한다. 지표마다 절대 기준, 상대 기준, 최소 기준선이 실제 위험도에 맞는지도 다시 확인해야 한다.

### T-25. `counts.skipped`가 서로 다른 상태를 하나로 표시함 — 상태: 해결

**기존 문제**

기존 `counts.skipped`는 다음 두 상태를 구분하지 못했다.

1. 값을 수집하지 못해 평가할 수 없음
2. 변화가 너무 작아 의도적으로 판정을 생략함

`regression.js:206`은 `verdict === "SKIP"`만 skipped로 계산했다. 반면 노이즈 억제는 PASS이면서 문자열에 skipped가 포함되는 방식이었다.

`report.js:509`는 skipped를 전부 “노이즈 하한 미만”이라고 설명했다. 하지만 T-01에서 발생한 skipped 25개는 노이즈 때문이 아니라 모두 현재 값이 없어서 발생했다.

**해결 내용**

카운트를 다음 두 종류로 분리했다.

- `skipped`: 값을 수집하지 못해 평가 불가
- `suppressed`: 노이즈 억제를 위해 판정 생략

리포트 문구도 두 상태를 구분하도록 변경했다. 평가 불가 지표가 하나라도 있으면 익스포터 상태를 확인하라는 안내를 표시한다.

## LOW

### T-26. `rules.json`의 잘못된 설정을 검사하지 않음 — 상태: 해결

**기존 문제**

다음과 같은 잘못된 설정도 경고 없이 통과했다.

- 존재하지 않는 지표 키
- 지원하지 않는 `direction` 값
- 경고와 실패 임계값의 순서가 뒤바뀐 설정
- 숫자가 아닌 임계값

T-01처럼 규칙 키가 실제 데이터와 맞지 않아도 도구가 알려주지 않는 실패 모드였다.

**해결 내용**

`validateRules()`를 추가해 다음 오류를 즉시 예외로 처리한다.

- 키 누락
- 알 수 없는 direction
- fail과 warn 임계값의 잘못된 순서
- 숫자가 아닌 임계값

현재 `rules.json`이 검증을 통과하는 것도 확인했다.

### T-27. 이력 추세 계산이 중요한 변화를 숨길 수 있음 — 상태: 미해결

**문제 1: 이전 중앙값이 0이면 추세를 표시하지 않음**

이전 실행들의 중앙값이 0일 때 추세 계산을 중단한다. 따라서 slow query가 0건에서 80건으로 증가하는 것처럼 중요한 변화가 추세에서 사라질 수 있다.

0을 분모로 비율을 계산할 수 없다는 이유는 있지만, 변화 자체를 숨기는 것은 적절하지 않다. 비율 대신 절대 변화 또는 별도 상태로 표시해야 한다.

**문제 2: 실행 조건이 다른 결과를 같은 추세로 묶음**

현재는 시나리오 이름만으로 실행을 그룹화한다. 데이터셋, VU, 환경이 다른 실행도 하나의 추세로 합쳐진다.

문서의 각주에서는 실행 조건 차이에 주의하라고 설명하지만 실제 계산은 이 조건을 구분하지 않아 설명과 동작이 일치하지 않는다.

### T-28. 실행 번호가 동시에 수집하거나 이력을 복구할 때 달라질 수 있음 — 상태: 미해결

**문제**

실행 번호는 전역 번호지만 안전하게 할당되지 않는다.

- 두 실행을 동시에 수집하면 같은 번호를 받을 수 있다.
- 인덱스를 rebuild하면 실행을 다시 정렬해 번호를 새로 부여한다.
- rebuild 후 인덱스 번호와 각 `run.json`에 저장된 번호가 달라질 수 있다.

**영향**

실행 번호만으로 특정 결과를 안정적으로 식별하기 어렵다. 동시 실행과 이력 복구 후에는 리포트, 인덱스, 원본 실행 파일이 서로 다른 번호를 가리킬 수 있다.

**필요한 조치**

실행 식별자와 화면용 순번을 분리해야 한다. 고유 실행 ID는 변경하지 않고, 화면에 표시할 순서는 인덱스에서 별도로 계산하는 방식이 안전하다.
