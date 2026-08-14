# localDocs — 개인 브랜치 전용 성능 작업 문서

이 디렉터리는 HighTeenDay 성능 테스트 시스템을 이해하고 개선하기 위한 **로컬 전용 장부**다.
공식 제품 문서라기보다 다음 질문에 답하기 위한 작업 공간에 가깝다.

- 지금 성능 테스트 결과를 어디까지 믿을 수 있는가?
- 측정 과정에서 발견한 문제는 무엇인가?
- 무엇을 먼저 고쳐야 하는가?
- 시스템을 다른 사람에게 설명할 만큼 이해했는가?

> **브랜치 정책**
>
> `localDocs/` 변경은 개인 문서 브랜치에만 보관한다. 커밋 제목은
> `docs(local): ...` 형식을 사용하고, `develop`에는 체리픽하지 않는다.
> `performance/experiments/`처럼 저장소의 공식 실험 기록은 이 규칙의 대상이 아니다.

Toss 지원 관련 문서는 별도 학습 자료다. 이 성능 문서 묶음의 범위와 수정 정책에서는 제외한다.

## 처음 읽는다면

목적에 따라 읽는 순서가 다르다.

### 현재 상황만 빠르게 알고 싶을 때

1. [perf-review-summary.md](perf-review-summary.md)
2. 관심 영역의 `perf-findings-*.md`
3. 원자료가 필요하면 `performance/reports/`와 `performance/experiments/` 확인

### 성능 개선(최적화) 작업을 시작하려 할 때

1. [perf-trust-levels.md](perf-trust-levels.md) — 지금 결과로 무엇을 주장할 수 있는지,
   개선 작업 전에 어디까지 고쳐야 하는지
2. [NEXT-DAY-PERF-TASKS.md](NEXT-DAY-PERF-TASKS.md)에서 해당 항목의 실제 작업 내용
3. 개선 후에는 `performance/experiments/`에 개선 폭과 MDE를 함께 기록

### 성능 테스트 환경을 직접 다루고 싶을 때

1. [perf-environment-essentials.md](perf-environment-essentials.md)
2. [perf-findings-environment.md](perf-findings-environment.md)
3. `performance/environment/README.md`

### 시스템 전체를 처음부터 공부하고 싶을 때

1. [perf-mastery-checklist.md](perf-mastery-checklist.md)
2. 각 단계가 안내하는 실제 코드와 실행 결과 확인
3. 단계 끝의 자가진단과 결정 안건 작성

## 문서 지도

| 문서 | 답하는 질문 | 언제 읽나 |
|---|---|---|
| [perf-review-summary.md](perf-review-summary.md) | 현재 무엇을 믿을 수 있고 무엇부터 고쳐야 하는가? | 항상 가장 먼저 |
| [NEXT-DAY-PERF-TASKS.md](NEXT-DAY-PERF-TASKS.md) | 아직 남은 문제를 어떤 우선순위와 순서로 고칠 것인가? | 다음 작업을 시작할 때 |
| [perf-trust-levels.md](perf-trust-levels.md) | 성능 개선을 이어가려면 **어디까지** 고쳐야 하고, 어디서 멈춰도 되는가? | 어디까지 할지 정할 때, 개선 작업을 시작하기 전 |
| [perf-findings-tools.md](perf-findings-tools.md) | 수집·기준선·회귀 판정·리포트 도구에 어떤 문제가 있는가? | PASS/FAIL이나 비교 결과를 점검할 때 |
| [perf-findings-scripts.md](perf-findings-scripts.md) | k6가 실제 사용자를 제대로 흉내 내고 있는가? | 부하 모델과 SLO를 점검할 때 |
| [perf-findings-environment.md](perf-findings-environment.md) | 환경·데이터셋·Prometheus·CI가 결과를 왜곡하지 않는가? | 재현성과 운영 절차를 점검할 때 |
| [perf-environment-essentials.md](perf-environment-essentials.md) | 스택을 어떻게 띄우고 왜 그렇게 구성했는가? | 환경을 직접 실행하거나 설명할 때 |
| [perf-dataset-generation-problems.md](perf-dataset-generation-problems.md) | 현재 데이터셋 생성과 실제 DB 상태가 왜 성능 결과를 왜곡하는가? | 데이터셋 문제를 처음부터 쉽게 이해할 때 |
| [perf-mastery-checklist.md](perf-mastery-checklist.md) | 내가 시스템 전체를 실제로 이해했는가? | 단계별 학습과 인수인계 때 |

## 문서들의 관계

문서는 세 종류로 나뉜다.

```text
실제 코드와 실행 결과
        │
        ├─ 발견 장부: 무엇이 잘못됐는가
        │    ├─ tools        측정 도구가 잘못 판정한다
        │    ├─ scripts      부하가 실제 사용자와 다르다
        │    └─ environment  환경·데이터셋이 결과를 왜곡한다
        │
        ├─ 총평: 무엇을 먼저 고칠 것인가
        │
        └─ 학습 장부: 내가 이것을 설명하고 판단할 수 있는가
```

**이 장부는 측정 시스템의 결함만 다룬다.** 성능 작업 중 발견하는 문제는 세 종류이고
기록 위치가 다르다.

| 문제 | 한마디로 | 어디에 |
|---|---|---|
| 측정 시스템의 결함 | **잘못 잰다** | 이 장부 (`perf-findings-*.md`) |
| 성능 병목 | **느리다** | `performance/bottlenecks/` (BTL-nnn) |
| 애플리케이션 결함 | **틀렸다** | `docs/KNOWN-ISSUES.md` (KI-nn), 상세는 `docs/defects/` |

측정을 아무리 정확하게 만들어도 뒤의 둘은 사라지지 않는다. 반대로 서버를 아무리 빠르게
만들어도 "틀린 것"은 사라지지 않는다.

- **발견 장부**는 증거와 결함 상태를 보관한다.
- **총평**은 여러 결함을 우선순위와 실행 계획으로 묶는다.
- **학습 장부**는 코드를 읽고 실행한 사람이 직접 답을 써서 이해도를 확인한다.

상세 발견을 수정하면 총평의 상태도 함께 갱신한다. 중요한 설계 결정을 내렸다면 학습 장부의
결정 안건과 관련 발견 항목에 같은 결론을 남긴다.

## 발견 항목을 읽는 방법

각 발견은 가능한 한 다음 순서로 작성한다.

1. **쉽게 말하면** — 기술 용어 없이 핵심을 한두 문장으로 설명
2. **현재 동작** — 코드가 실제로 무엇을 하는지 설명
3. **왜 문제인가** — 숫자와 판정이 어떻게 왜곡되는지 설명
4. **근거** — 코드 위치, 실행 ID, 실측값 제시
5. **필요한 조치** — 해결 방향과 아직 필요한 결정 제시

문장만 읽고 이해되지 않으면 문서의 실패다. 약어와 지표는 처음 나올 때 뜻을 풀어 쓴다.

## 상태 규칙

| 상태 | 의미 |
|---|---|
| **미해결** | 문제와 근거만 확인됐고 코드 수정은 시작하지 않음 |
| **수정 중** | 코드나 문서를 변경하고 있으나 검증이 끝나지 않음 |
| **부분 해결** | 일부 원인은 제거했지만 남은 위험이나 후속 작업이 있음 |
| **해결** | 수정과 필요한 검증이 완료됨. 가능하면 커밋 SHA와 검증 결과를 기록 |
| **보류** | 고치지 않기로 결정했으며 이유와 재검토 조건을 기록 |
| **참고** | 결함이 아니라 개념 구분이나 조사 결과를 보존하는 항목 |

작업 트리에만 존재하는 수정은 `해결`이라고 단정하지 않고 날짜와 `미커밋` 표시를 붙인다.

## 발견 ID 규칙

- `T-##`: 분석 도구 계층 — 수집, 저장, 기준선, 판정, 리포트
- `S-##`: 부하 생성 계층 — k6 스크립트, 저니, 사용자·트래픽 모델
- `E-##`: 실행 환경 계층 — Docker, 데이터셋, Prometheus, CI

## 조사 타임라인

### 2026-08-05 — 최초 전면 리뷰

- 브랜치: `perf/performance-management-system`
- 저장된 실행: 23개
- 실행 환경: 모두 같은 Windows 데스크톱
- 주요 관측: large에서 comments p95 60초, reactions p95 30초,
  normal-day 오류율 55.8%
- 동시에 Hikari 대기 205개, Hikari timeout 5,316회, CPU throttling 99.98%가 기록됨

원자료는 병목을 보여주고 있었지만, 당시 판정 도구는 일부 인프라 키를 읽지 못해 해당 규칙을
SKIP으로 처리했다. 그래서 **원자료와 자동 PASS/FAIL을 구분해서 봐야 한다**는 결론이 나왔다.

### 2026-08-11 — EXP-000 반복 측정

- `posts.js` smoke 2회와 Before 10회 수행
- 같은 조건의 p95 변동계수(CV)가 108.77%로 확인됨
- 전체 p95가 BCrypt 로그인 지연 분포의 급경사 구간을 자르면서 값이 크게 흔들린다는 원인을 확인
- 12회 모두 threshold 실패로 기준선 후보에서 제외돼 상대 비교가 한 번도 실행되지 않은 문제 확인

상세한 실험 설계와 해석은
`performance/experiments/EXP-000-measurement-integrity/README.md`에 기록한다.

## 현재 결과를 해석하는 최소 원칙

- `run.json`의 원시 k6 지표와 수집된 인프라 값은 원인 분석 자료로 사용할 수 있다.
- 저장된 PASS/FAIL은 당시 코드와 기준선 선택 문제를 확인한 뒤 해석해야 한다.
- 조건이 다른 두 실행의 상대 증감률은 비교하지 않는다.
- 기준선이 `null`이면 상대 회귀 판정이 실행된 것이 아니다.
- 짧은 테스트의 전체 p95는 로그인처럼 적은 수의 느린 요청에 지배될 수 있으므로 기능별 분해를 함께 본다.
- 필수 인프라 지표가 비어 있으면 “문제가 없음”이 아니라 “측정하지 못함”으로 해석한다.

## 문서 갱신 규칙

문제를 고치거나 새 실험을 수행하면 다음 순서로 갱신한다.

1. 관련 `perf-findings-*.md`에 근거와 상태를 기록한다.
2. 우선순위가 바뀌면 `perf-review-summary.md`를 갱신한다.
3. 학습 흐름이나 결정 안건이 달라지면 `perf-mastery-checklist.md`를 갱신한다.
4. 로컬 문서 커밋에는 `docs(local):` scope를 사용한다.
5. Toss 관련 문서는 이 흐름에 포함하지 않는다.
