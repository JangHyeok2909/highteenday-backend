# localDocs — 개인 브랜치 전용 성능 작업 문서

이 디렉터리는 HighTeenDay 성능 테스트 시스템을 이해하고 개선하기 위한 **로컬 전용 장부**다.
공식 제품 문서라기보다 다음 질문에 답하기 위한 작업 공간에 가깝다.

- 지금 성능 테스트 결과를 어디까지 믿을 수 있는가?
- 측정 과정에서 발견한 문제는 무엇인가?
- 무엇을 먼저 고쳐야 하는가?
- 시스템을 다른 사람에게 설명할 만큼 이해했는가?

> **브랜치 정책**
>
> 이 개인 브랜치는 `localDocs/`와 `performance/` 작업을 **함께** 담는다. 둘은 같은
> 작업의 양면이라 브랜치를 나누면 오히려 앞뒤가 끊긴다. 이 정책이 지키려는 것은
> 하나뿐이다 — **`localDocs/`가 `develop`으로 넘어가지 않는 것.**
>
> - `localDocs/` 변경은 **항상 단독 커밋**으로 만든다. 코드나 저장소 문서와 한 커밋에
>   섞으면 그 커밋 전체가 `develop`에 갈 수 없게 되어, 같이 묶인 `performance/` 작업까지
>   발이 묶인다. 단독 커밋이어야 나머지를 골라 올릴 수 있다.
> - `localDocs/` 커밋 제목은 `docs(localdocs): ...` 형식을 쓰고 `develop`에 병합하거나
>   체리픽하지 않는다.
> - `performance/`(도구 코드, 스냅샷 기록, `experiments/` 등)는 저장소의 공식 산출물이다.
>   여기서 작업하되 `develop`으로 올려보낸다.

Toss 지원 관련 문서는 별도 학습 자료다. 이 성능 문서 묶음의 범위와 수정 정책에서는 제외한다.

## 처음 읽는다면

목적에 따라 읽는 순서가 다르다.

### 현재 상황만 빠르게 알고 싶을 때

1. [perf-review-summary.md](planning/perf-review-summary.md)
2. 관심 영역의 `perf-findings-*.md`
3. 원자료가 필요하면 `performance/reports/`와 `performance/experiments/` 확인

### 성능 개선(최적화) 작업을 시작하려 할 때

1. [perf-trust-levels.md](planning/perf-trust-levels.md) — 지금 결과로 무엇을 주장할 수 있는지,
   개선 작업 전에 어디까지 고쳐야 하는지
2. [NEXT-DAY-PERF-TASKS.md](planning/NEXT-DAY-PERF-TASKS.md)에서 해당 항목의 실제 작업 내용
3. 개선 후에는 `performance/experiments/`에 개선 폭과 MDE를 함께 기록

### 성능 테스트 환경을 직접 다루고 싶을 때

1. [perf-environment-essentials.md](guides/perf-environment-essentials.md)
2. [perf-findings-environment.md](findings/perf-findings-environment.md)
3. `performance/environment/README.md`

### 시스템 전체를 처음부터 공부하고 싶을 때

1. [perf-beginner-guide.md](guides/perf-beginner-guide.md) — 학습 순서부터 첫 실행, 개선 전후 측정,
   리포트 판독, 용어까지 한 번에 익힌다
2. [perf-mastery-checklist.md](guides/perf-mastery-checklist.md)
3. 각 단계가 안내하는 실제 코드와 실행 결과 확인
4. 단계 끝의 자가진단과 결정 안건 작성

## 문서 지도

| 문서 | 답하는 질문 | 언제 읽나 |
|---|---|---|
| [perf-beginner-guide.md](guides/perf-beginner-guide.md) | 처음 무엇부터 이해하고, 어떻게 실행하고, 리포트를 어떤 순서로 읽어야 하는가? | 성능 시스템을 처음 사용할 때 |
| [perf-review-summary.md](planning/perf-review-summary.md) | 현재 무엇을 믿을 수 있고 무엇부터 고쳐야 하는가? | 항상 가장 먼저 |
| [NEXT-DAY-PERF-TASKS.md](planning/NEXT-DAY-PERF-TASKS.md) | 아직 남은 문제를 어떤 우선순위와 순서로 고칠 것인가? | 다음 작업을 시작할 때 |
| [perf-trust-levels.md](planning/perf-trust-levels.md) | 성능 개선을 이어가려면 **어디까지** 고쳐야 하고, 어디서 멈춰도 되는가? **지금 어느 조합이 레벨 몇인가?** (레벨은 시스템 전체가 아니라 시나리오×운용점 조합마다 붙는다) | 어디까지 할지 정할 때, 개선 작업을 시작하기 전, 수치를 인용하기 전 |
| [perf-findings-tools.md](findings/perf-findings-tools.md) | 수집·기준선·회귀 판정·리포트 도구에 어떤 문제가 있는가? | PASS/FAIL이나 비교 결과를 점검할 때 |
| [perf-findings-scripts.md](findings/perf-findings-scripts.md) | k6가 실제 사용자를 제대로 흉내 내고 있는가? | 부하 모델과 SLO를 점검할 때 |
| [perf-findings-environment.md](findings/perf-findings-environment.md) | 환경·데이터셋·Prometheus·CI가 결과를 왜곡하지 않는가? | 재현성과 운영 절차를 점검할 때 |
| [perf-session-drift.md](investigations/perf-session-drift.md) | **E-46 해결 기록.** 세션 간 45% 편차의 정체(= 포화 상태 측정), 무엇을 잘못 읽었는가, 어떻게 무해화했는가 | 성능 수치를 인용하기 전, 포화 판정을 이해할 때, 저장된 과거 실행을 쓰려 할 때 |
| [perf-host-clock-cycle.md](investigations/perf-host-clock-cycle.md) | **E-50 조사 기록.** 호스트 CPU 의 16% 일중 주기는 실재하지만 앱 측정에는 전달되지 않는다(r=−0.006). 측정 시각 고정도 클럭 고정도 불필요한 이유 | "밤에 재도 되나"를 물을 때, 환경 변동을 원인으로 의심할 때 |
| [perf-request-cost-skew.md](investigations/perf-request-cost-skew.md) | **E-51 조사 기록.** 왜 반복 세트의 한 회차만 2배 느린가(= 커넥션 풀 15초 고갈), 요청 비용 542배 편중과 시드 없는 표본 추출이 CV 에 얼마나 섞이는가, 고정 시드를 쓸 것인가 | 반복 세트에 이상 회차가 나올 때, CV·MDE 를 해석할 때, 표본 추출 방식을 바꾸기 전 |
| [perf-comment-nplus1-diagnosis.md](investigations/perf-comment-nplus1-diagnosis.md) | **BTL-005 조사 기록.** run `normal-day-2026-08-26T00-06-28` 의 병목을 커넥션 풀 고갈로 읽었다가 무엇에 반박당했고 무엇으로 바로잡았는가, 게이지 지표를 어떻게 읽어야 하는가 | 리포트를 읽고 병목을 판단하기 전, 풀 지표가 상한에 닿은 실행을 해석할 때 |
| [perf-measurement-explained.md](guides/perf-measurement-explained.md) | 이 시스템은 지금 **무엇을 어떻게** 측정하고 있고, 무엇을 못 재는가? (개념 설명 포함 자립 문서) | 시스템 전체를 처음 이해할 때, 계측을 확장하기 전 |
| [perf-metrics-catalog-plan.md](design/perf-metrics-catalog-plan.md) | 어떤 Prometheus 지표를 기본·귀속·조건부 아티팩트로 수집할 것인가? | 지표 카탈로그와 수집기를 확장하기 전 |
| [perf-environment-essentials.md](guides/perf-environment-essentials.md) | 스택을 어떻게 띄우고 왜 그렇게 구성했는가? | 환경을 직접 실행하거나 설명할 때 |
| [perf-dataset-generation-problems.md](findings/perf-dataset-generation-problems.md) | 현재 데이터셋 생성과 실제 DB 상태가 왜 성능 결과를 왜곡하는가? | 데이터셋 문제를 처음부터 쉽게 이해할 때 |
| [perf-mastery-checklist.md](guides/perf-mastery-checklist.md) | 내가 시스템 전체를 실제로 이해했는가? | 단계별 학습과 인수인계 때 |
| [perf-report-redesign.md](design/perf-report-redesign.md) | **설계 문서.** 실행 리포트에 아직 남은 과제는 무엇인가 (첫 그리드가 포화된 자원을 지목하지 않음 · 신뢰도 색이 2단계뿐) | 리포트를 고치기 전 |
| [go-migration-rationale.md](decisions/go-migration-rationale.md) | **결정 기록.** 측정 도구를 Go로 옮길 정당한 이유는 무엇이고(무엇은 이유가 아닌가), 무엇을 어떤 순서로 옮기며, 이식 중 측정 무결성을 어떻게 지키는가? | Go 이식을 시작·재개하기 전, 이식 결정을 남에게 설명하기 전 |

### 이직 준비 문서 (성능 시스템 장부와 별개 계열)

아래 문서들은 **측정 시스템의 결함을 다루지 않는다.** 이 프로젝트의 결과물을
바깥(채용 전형)에서 어떻게 쓸 것인가를 다루므로 계열을 분리한다.

| 문서 | 답하는 질문 | 언제 읽나 |
|---|---|---|
| [military-service-company-ranking.md](career/military-service-company-ranking.md) | **어느 회사에 지원할 것인가?** 보충역 4급 신규편입으로 지원 가능한 병역특례 백엔드 공고 전체(병무청 540개 업체 · 449건 공고 기준)를 성장 가능성 순으로 줄 세운 것. 지원 불가 회사와 그 이유 포함 | **지원 대상 회사를 정할 때 — `toss-target-role.md` 보다 먼저** |
| [resume-assets.md](career/resume-assets.md) | **토스 Server Developer [산업기능요원/전문연구요원] (Product) 공고의 각 줄에 이 프로젝트의 무엇으로 답하는가?** 답할 것이 없는 줄은 어디이고 무엇을 만들어야 채워지는가? | 이력서를 쓰기 전, **프로젝트 고도화 항목을 고를 때** |
| [paytalab-application.md](career/paytalab-application.md) | **페이타랩(패스오더) 백엔드 공고의 각 줄에 무엇으로 답하는가?** 커피 주문 앱 도메인과 내 병목 사례는 어떻게 연결되는가? | 페이타랩에 지원하기 전, 다른 병역지정업체 지원 시 재사용 |
| [toss-product-playbook.md](career/toss-product-playbook.md) | **컨설턴트 관점.** 토스 Product 병특 전형의 각 단계가 무엇을 거르고, 무엇이 사람을 떨어뜨리며, 스프린트 항목을 "어떻게" 해야 합격으로 이어지는가? 핵심가치 8개 대조, 편입 행정 | 이력서를 쓰기 전, 모의면접 전, 합격 후 편입 절차 때 |
| [toss-sprint-1month.md](career/toss-sprint-1month.md) | 한 달 안에 무엇을 어떤 순서로 할 것인가? | 매주 계획을 세울 때 |
| [toss-target-role.md](career/toss-target-role.md) | 어느 직무·경로로 갈 것이고 왜인가? (병역 규정 포함) | 지원 대상을 정할 때 |
| [toss-gap-analysis.md](career/toss-gap-analysis.md) | 부족한 것의 전체 목록은 무엇인가? | 중장기 학습 계획을 세울 때 |
| [toss-interview-questions.md](career/toss-interview-questions.md) · [toss-interview-concepts.md](career/toss-interview-concepts.md) | 무엇을 물어보고 어떻게 답하는가? | 면접 직전 |
| [toss-infra-essentials.md](career/toss-infra-essentials.md) | 인프라 쪽에서 최소한 알아야 할 것은? | 면접 준비 중 |
| [delegation-scope.md](worklog/delegation-scope.md) · [fix-log.md](worklog/fix-log.md) | 어떤 결함을 위임했고 무엇이 어떻게 고쳐졌는가? | 위임 결과를 확인할 때 |

## 문서들의 관계

문서는 여섯 종류로 나뉘고, **그 계열이 그대로 디렉터리 이름이다.** 어느 디렉터리에
넣을지 모르겠으면 "이 문서가 답하는 질문"으로 고른다 — 아래 트리의 오른쪽 설명이 그
질문이다.

```text
localDocs/
  README.md      이 문서 — 색인과 규칙 요약
  CLAUDE.md      작업 규칙 (상태 값, 기록 형식, 분리 기준)
        │
        ├─ findings/       발견 장부: 무엇이 잘못됐는가
        │    ├─ perf-findings-tools          측정 도구가 잘못 판정한다
        │    ├─ perf-findings-scripts        부하가 실제 사용자와 다르다
        │    ├─ perf-findings-environment    환경·데이터셋이 결과를 왜곡한다
        │    └─ perf-dataset-generation-problems
        │                                    데이터셋 생성이 결과를 왜곡한다
        │
        ├─ investigations/ 조사 기록: 한 항목을 파고든 실험 로그
        │    ├─ perf-session-drift           E-46 해결 기록 — 45% 편차의 정체는 포화였다
        │    ├─ perf-host-clock-cycle        E-50 호스트 CPU 일중 주기와 그 무해성
        │    ├─ perf-request-cost-skew       E-51 요청 비용 편중·풀 스파이크·표본 분산
        │    └─ perf-comment-nplus1-diagnosis
        │                                    BTL-005 댓글 N+1 — 1차 판단의 오독과 수정
        │
        ├─ planning/       총평: 무엇을 먼저 고칠 것인가
        │    ├─ perf-review-summary          현재 무엇을 믿을 수 있나
        │    ├─ perf-trust-levels            어디까지 고쳐야 인용할 수 있나
        │    └─ NEXT-DAY-PERF-TASKS          남은 작업의 우선순위와 순서
        │
        ├─ guides/         학습 장부: 내가 이것을 설명하고 판단할 수 있는가
        │    ├─ perf-beginner-guide          처음 무엇부터, 어떻게 실행하고 읽나
        │    ├─ perf-mastery-checklist       단계별 자가진단과 결정 안건
        │    ├─ perf-measurement-explained   지금 무엇을 어떻게 재고 있나
        │    ├─ perf-environment-essentials  스택을 어떻게 띄우고 왜 그렇게 짰나
        │    ├─ perf-debug-trace-guide       디버거로 측정 시스템을 추적하는 법
        │    └─ HighTeenDay_하드웨어_자원_병목_학습서.pdf
        │
        ├─ decisions/      결정 기록: 무엇을 하기로 했고 왜인가
        │    └─ go-migration-rationale       Go 이식의 명분·기각한 명분·단계별 계획
        │
        ├─ design/         설계 문서: 무엇을 어떻게 다시 지을 것인가
        │    ├─ perf-report-redesign         실행 리포트 진단·리뉴얼안·자기 리뷰
        │    └─ perf-metrics-catalog-plan    어떤 지표를 어떤 등급으로 수집할 것인가
        │
        ├─ worklog/        작업 기록: 무엇을 실제로 손댔는가
        │    ├─ delegation-scope             무엇을 위임하고 무엇을 직접 볼 것인가
        │    ├─ fix-log                      위임한 결함이 어떻게 고쳐졌는가
        │    └─ overnight-execution-fixes-2026-08-18
        │                                    무인 실행 중 발견해 고친 것
        │
        └─ career/         이직 준비: 이 결과물을 바깥에서 어떻게 쓸 것인가
             ├─ resume-assets · paytalab-application
             └─ toss-*(8종)
```

`career/` 는 **측정 시스템의 결함을 다루지 않는다.** 이 성능 문서 묶음의 범위와 수정
정책에서 제외되는 별개 계열이라 디렉터리를 분리했다.

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
- **조사 기록**은 장부 한 항목의 조사가 커졌을 때 분리한 실험 로그다. 장부에는 문제와
  현재 결론만 남기고, 실험 설계·측정값·기각 근거는 이쪽에 모은다.
- **총평**은 여러 결함을 우선순위와 실행 계획으로 묶는다.
- **학습 장부**는 코드를 읽고 실행한 사람이 직접 답을 써서 이해도를 확인한다.
- **결정 기록**은 결함이 아니라 **선택**을 남긴다. 무엇을 하기로 했는지, 어떤 근거를
  채택하고 어떤 근거를 기각했는지, 어떤 조건에서 그 결정이 무효가 되는지를 적는다.
  나중에 "왜 이렇게 했지"에 답하기 위한 문서라는 점에서 발견 장부의 인용블록과 목적이
  같고, 규모가 커서 분리한 것이다.

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
| **해결** | 수정과 필요한 검증이 완료됨. 날짜와 검증 결과를 기록 |
| **보류** | 고치지 않기로 결정했으며 이유와 재검토 조건을 기록 |
| **참고** | 결함이 아니라 개념 구분이나 조사 결과를 보존하는 항목 |

상태는 **검증 여부**로 판단한다. 검증이 끝나지 않았다면 `해결`이 아니라 `수정 중`이나
`부분 해결`이다.

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
- **손으로 비교하기 전에 `seriesHash`를 먼저 본다.** 다르면 비교 대상이 아니다.
  자동 판정(`comparability.js`)은 이걸 막지만 **사람이 표를 나란히 놓는 것은 못 막는다** —
  실제로 그 실수를 했다(E-46). 도구가 이미 "비교 불가"라고 말하고 있었는데 무시했다.
- **반복 세트의 CV를 무작위 노이즈로 단정하지 않는다.** 회차를 시간 순으로 놓고 한쪽으로
  기울었는지 먼저 확인한다. 지금까지 잰 두 세트 모두 기울어 있었다(E-46, T-30).
- **한 실험에서 조건은 하나만 바꾼다.** 넷을 한꺼번에 바꾸면 어떤 결과가 나와도 원인을
  짚을 수 없다 — 96분을 그렇게 썼다(E-46의 재현 시도).

## 문서 갱신 규칙

문제를 고치거나 새 실험을 수행하면 다음 순서로 갱신한다.

1. 관련 `perf-findings-*.md`에 근거와 상태를 기록한다.
2. 우선순위가 바뀌면 `perf-review-summary.md`를 갱신한다.
3. 학습 흐름이나 결정 안건이 달라지면 `perf-mastery-checklist.md`를 갱신한다.
4. 로컬 문서 커밋에는 `docs(localdocs):` scope를 사용하고, 다른 변경과 섞지 않는다.
5. Toss 관련 문서는 이 흐름에 포함하지 않는다.
