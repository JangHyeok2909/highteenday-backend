# performance/docs — 측정 시스템 문서

이 디렉터리는 `performance/` 아래 성능 측정 시스템이 **무엇을 재고, 그 결과를 어디까지
믿을 수 있으며, 무엇이 아직 틀렸는지**를 기록한 문서 모음이다.

`performance/` 최상위의 [README.md](../README.md) · [MANUAL.md](../MANUAL.md) ·
[PERFORMANCE-MANAGEMENT.md](../PERFORMANCE-MANAGEMENT.md) 가 **"어떻게 쓰는가"** 를
다룬다면, 이곳은 **"왜 그 숫자를 믿어도 되는가"** 를 다룬다.

`performance/bottlenecks/` 의 병목(BTL), `performance/experiments/` 의 실험(EXP),
`performance/optimizations/` 의 최적화(OPT) 기록이 **결론**이라면, 이 디렉터리는 그
결론에 이르기까지의 **근거와 실패**다.

> **이 저장소의 성능 수치를 인용하기 전에 두 문서를 먼저 읽기를 권한다.**
> - [investigations/perf-session-drift.md](investigations/perf-session-drift.md) —
>   포화 상태에서 잰 p95 는 애플리케이션 지연이 아니라 큐 대기다. 그것을 모르고 닷새를 썼다.
> - [planning/perf-trust-levels.md](planning/perf-trust-levels.md) —
>   지금 이 시스템의 결과를 어디까지 믿을 수 있는가.

---

## 결과를 해석하는 최소 원칙

아래는 전부 **실제로 저지른 실수에서 나온 규칙**이다. 괄호 안은 그 실수의 발견 항목이다.

- 조건이 다른 두 실행의 상대 증감률은 비교하지 않는다.
- 기준선이 `null` 이면 상대 회귀 판정이 실행된 것이 아니다.
- 필수 인프라 지표가 비어 있으면 "문제가 없음"이 아니라 **"측정하지 못함"** 으로 읽는다.
- 짧은 테스트의 전체 p95 는 로그인처럼 적은 수의 느린 요청에 지배될 수 있다. 기능별 분해를 함께 본다.
- **손으로 비교하기 전에 `seriesHash` 를 먼저 본다.** 다르면 비교 대상이 아니다.
  자동 판정(`comparability.js`)은 이걸 막지만 **사람이 표를 나란히 놓는 것은 못 막는다** —
  실제로 그 실수를 했다(E-46). 도구가 이미 "비교 불가"라고 말하고 있었는데 무시했다.
- **반복 세트의 변동계수(CV)를 무작위 잡음으로 단정하지 않는다.** 회차를 시간 순으로 놓고
  한쪽으로 기울었는지 먼저 확인한다. 지금까지 잰 두 세트 모두 기울어 있었다(E-46, T-30).
- **한 실험에서 조건은 하나만 바꾼다.** 넷을 한꺼번에 바꾸면 어떤 결과가 나와도 원인을
  짚을 수 없다 — 96분을 그렇게 썼다(E-46 의 재현 시도).
- **포화 판정을 확인하기 전에는 p95 를 애플리케이션 지연으로 인용하지 않는다.** 포화
  상태의 p95 는 커넥션 풀 대기 시간이다(E-46).

## 문서 지도

### 발견 장부 — 무엇이 잘못됐는가

| 문서 | 답하는 질문 | 언제 읽나 |
|---|---|---|
| [findings/perf-findings-tools.md](findings/perf-findings-tools.md) | 측정 도구가 수집·기준선·판정·리포트에서 무엇을 잘못하는가 (`T-##`) | 리포트 값이 이상할 때, 판정 규칙을 고치기 전 |
| [findings/perf-findings-scripts.md](findings/perf-findings-scripts.md) | k6 가 실제 사용자를 제대로 흉내 내고 있는가 (`S-##`) | 부하 모델과 판정 규칙을 점검할 때 |
| [findings/perf-findings-environment.md](findings/perf-findings-environment.md) | 환경·데이터셋·Prometheus·CI 가 결과를 왜곡하지 않는가 (`E-##`) | 재현성과 운영 절차를 점검할 때 |
| [findings/perf-dataset-generation-problems.md](findings/perf-dataset-generation-problems.md) | 데이터셋 생성과 실제 DB 상태가 왜 성능 결과를 왜곡하는가 | 데이터셋 문제를 처음부터 이해할 때 |

### 조사 기록 — 한 문제를 끝까지 판 기록

발견 장부의 한 항목이 감당하기에 커진 조사를 따로 뗀 것이다. **기각된 가설과 틀린 1차
판단을 지우지 않고 남긴다.** 틀린 판단을 지우면 다음 사람이 같은 함정에 다시 빠진다.

| 문서 | 답하는 질문 | 언제 읽나 |
|---|---|---|
| [investigations/perf-session-drift.md](investigations/perf-session-drift.md) | **E-46 해결 기록.** 세션 간 45% 편차의 정체(= 포화 상태 측정), 무엇을 잘못 읽었고 어떻게 무해화했는가 | 성능 수치를 인용하기 전, 저장된 과거 실행을 쓰려 할 때 |
| [investigations/perf-comment-nplus1-diagnosis.md](investigations/perf-comment-nplus1-diagnosis.md) | **BTL-005 조사 기록.** 병목을 커넥션 풀 고갈로 읽었다가 무엇에 반박당했고 무엇으로 바로잡았는가 | 리포트를 읽고 병목을 판단하기 전 |
| [investigations/perf-host-clock-cycle.md](investigations/perf-host-clock-cycle.md) | **E-50 조사 기록.** 호스트 CPU 의 일중 주기는 실재하지만 앱 측정에는 전달되지 않는다(r=−0.006) | "밤에 재도 되나"를 물을 때 |
| [investigations/perf-request-cost-skew.md](investigations/perf-request-cost-skew.md) | **E-51 조사 기록.** 반복 세트의 한 회차만 2배 느린 이유(= 커넥션 풀 고갈), 요청 비용 편중이 변동계수에 얼마나 섞이는가 | 반복 세트에 이상 회차가 나올 때, CV·MDE 를 해석할 때 |

### 안내서 — 시스템을 이해하고 실행하기

| 문서 | 답하는 질문 | 언제 읽나 |
|---|---|---|
| [guides/perf-measurement-explained.md](guides/perf-measurement-explained.md) | 이 시스템은 **무엇을 어떻게** 측정하고, 무엇을 못 재는가 | 시스템 전체를 처음 이해할 때, 계측을 확장하기 전 |
| [guides/perf-beginner-guide.md](guides/perf-beginner-guide.md) | 처음 보는 사람이 환경 구축부터 개선 전후 비교까지 어떻게 하는가 | `performance/` 를 처음 열었을 때 |
| [guides/perf-environment-essentials.md](guides/perf-environment-essentials.md) | 스택을 어떻게 띄우고 왜 그렇게 구성했는가 | 환경을 직접 실행하거나 설명할 때 |
| [guides/perf-debug-trace-guide.md](guides/perf-debug-trace-guide.md) | 디버거로 측정 시스템 내부의 값 흐름을 직접 확인하는 방법 | "코드를 읽었다"를 "실제로 이랬다"로 바꿔야 할 때 |

### 계획과 결정

| 문서 | 답하는 질문 | 언제 읽나 |
|---|---|---|
| [planning/ROADMAP.md](planning/ROADMAP.md) | 남은 개선 우선순위. **이 작업 전에는 무엇을 믿을 수 없는가** | 다음에 무엇을 할지 고를 때 |
| [planning/perf-trust-levels.md](planning/perf-trust-levels.md) | 결과를 근거로 개선을 이어가려면 어디까지 고쳐야 하는가 | 측정 신뢰 수준을 판정할 때 |
| [planning/perf-review-summary.md](planning/perf-review-summary.md) | 현재 결론과 실행 순서 요약 | 전체 상황을 빠르게 파악할 때 |
| [decisions/go-migration-rationale.md](decisions/go-migration-rationale.md) | **결정 기록.** 측정 도구를 Go 로 옮길 정당한 이유가 있는가(무엇은 이유가 **아닌가**) | Go 이식을 시작·재개하기 전 |
| [design/perf-metrics-catalog-plan.md](design/perf-metrics-catalog-plan.md) | 어떤 Prometheus 지표를 기본·귀속·조건부로 수집할 것인가 | 지표 카탈로그를 확장하기 전 |
| [design/perf-report-redesign.md](design/perf-report-redesign.md) | 실행 리포트에 아직 남은 과제는 무엇인가 | 리포트를 고치기 전 |

---

## 발견 ID 규칙

발견 항목은 **어느 계층의 문제인가**로 접두사를 나눈다. 다른 문서에서 `(E-46)` 처럼
인용되면 해당 장부의 그 항목을 가리킨다.

| 접두사 | 계층 | 장부 |
|---|---|---|
| `T-##` | 분석 도구 — 수집, 저장, 기준선, 판정, 리포트 | [findings/perf-findings-tools.md](findings/perf-findings-tools.md) |
| `S-##` | 부하 생성 — k6 스크립트, 저니, 사용자·트래픽 모델 | [findings/perf-findings-scripts.md](findings/perf-findings-scripts.md) |
| `E-##` | 실행 환경 — Docker, 데이터셋, Prometheus, CI | [findings/perf-findings-environment.md](findings/perf-findings-environment.md) |

병목(`BTL-###`)·실험(`EXP-###`)·최적화(`OPT-###`)는 이 디렉터리가 아니라
`performance/bottlenecks/` · `experiments/` · `optimizations/` 에 있다.

## 상태 규칙

| 상태 | 의미 |
|---|---|
| **미해결** | 문제와 근거만 확인됐고 코드 수정은 시작하지 않음 |
| **수정 중** | 코드나 문서를 변경하고 있으나 검증이 끝나지 않음 |
| **부분 해결** | 일부 원인은 제거했지만 남은 위험이나 후속 작업이 있음 |
| **해결** | 수정과 필요한 검증이 완료됨. 날짜와 검증 결과를 기록 |
| **보류** | 고치지 않기로 결정했으며 이유와 재검토 조건을 기록 |
| **참고** | 결함이 아니라 개념 구분이나 조사 결과를 보존하는 항목 |

상태는 **검증 여부**로 판단한다. 검증이 끝나지 않았다면 `해결` 이 아니라 `수정 중` 이거나
`부분 해결` 이다.

## 발견 항목을 읽는 방법

각 발견은 가능한 한 다음 순서로 쓴다.

1. **쉽게 말하면** — 기술 용어 없이 핵심을 한두 문장으로
2. **현재 동작** — 코드가 실제로 무엇을 하는지
3. **왜 문제인가** — 숫자와 판정이 어떻게 왜곡되는지
4. **근거** — 코드 위치(`파일:라인`), 실행 ID, 실측값
5. **필요한 조치** — 해결 방향과 아직 남은 결정

공통 규칙은 셋이다.

- 사실 / 추론 / 권고를 섞지 않는다.
- 지표를 인용할 때는 값만 쓰지 말고 **무엇을 재는 값인지**를 한 번은 풀어 쓴다.
- 관측값을 요약하지 않는다. 분량보다 **나중에 재구성할 수 있는가**가 기준이다.

문장만 읽고 이해되지 않으면 문서의 실패다. 약어와 지표는 처음 나올 때 뜻을 풀어 쓴다.

## smoke 규칙 — 측정 도구를 고쳤으면 smoke 로 먼저 확인한다

`performance/tools/` · `scripts/lib/` · `scenarios/` 를 고친 뒤에는 **긴 실행을 걸기 전에
3~5분짜리 smoke 실행으로 배관을 확인한다.**

```bash
node tools/perf-run.js scripts/posts.js --dataset smoke --vus 5 --duration 1m --loadgen docker
```

확인 대상은 성능이 아니라 **도구가 망가지지 않았는지**다 — 지표가 채워지는가, 값의 범위가
맞는가, 측정 구간이 비어 있지 않은가.

smoke 로 충분한 이유는 **도구 결함이 데이터 규모와 무관**하기 때문이다. 반대로 성능
**판정**은 smoke 로 할 수 없다. 게시글 50건은 전부 버퍼 풀에 들어가 medium(10,000건)과
다른 병목이 나온다. **smoke 는 도구 확인용, 판정은 medium 이상.**

---

## 디렉터리 구조

```text
performance/docs/
  README.md            이 문서 — 색인과 규칙
  findings/            발견 장부: 무엇이 잘못됐는가 (T-## / S-## / E-##)
  investigations/      조사 기록: 한 문제를 끝까지 판 과정, 기각된 가설 포함
  guides/              안내서: 시스템을 이해하고 실행하는 방법
  planning/            로드맵, 신뢰 수준 판정, 현황 요약
  decisions/           결정 기록(ADR): 무엇을 하기로 했고 왜인가
  design/              설계 문서: 아직 구현되지 않은 확장 계획
```
