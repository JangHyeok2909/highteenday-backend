# localDocs — 개인 브랜치 전용 문서

이 디렉터리는 `personal/localdocs` 브랜치에서만 추적되는 **비공개 작업 공간**이다.
`develop` 과 `main` 에는 존재하지 않으며, 공개 저장소에 포함되지 않는다.

## ⚠️ 성능 시스템 문서는 여기 없다

측정 시스템의 발견 장부·조사 기록·안내서·로드맵은 **`performance/docs/` 로 옮겼다.**
공개 저장소의 `performance/` 문서들이 이 문서들의 발견 ID(`T-##`·`S-##`·`E-##`)를
인용하고 있어서, 장부가 비공개로 남으면 인용이 확인 불가능한 각주가 되기 때문이다.

| 찾는 것 | 새 위치 |
|---|---|
| 발견 장부 (T/S/E) | [`performance/docs/findings/`](../performance/docs/findings/) |
| 조사 기록 (E-46 세션 편차 등) | [`performance/docs/investigations/`](../performance/docs/investigations/) |
| 안내서 (측정 원리·입문·환경·디버깅) | [`performance/docs/guides/`](../performance/docs/guides/) |
| 로드맵·신뢰 수준·현황 요약 | [`performance/docs/planning/`](../performance/docs/planning/) |
| 결정 기록 (Go 이식) | [`performance/docs/decisions/`](../performance/docs/decisions/) |
| 설계 문서 (지표 카탈로그·리포트) | [`performance/docs/design/`](../performance/docs/design/) |
| 색인과 문서 규칙 | [`performance/docs/README.md`](../performance/docs/README.md) |

---

## 여기 남은 것

### 이직 준비 문서

측정 시스템의 결함을 다루지 않는다. 이 프로젝트의 결과물을 **바깥(채용 전형)에서 어떻게
쓸 것인가**를 다루므로 공개 대상이 아니다.

| 문서 | 답하는 질문 | 언제 읽나 |
|---|---|---|
| [military-service-company-ranking.md](career/military-service-company-ranking.md) | **어느 회사에 지원할 것인가?** 보충역 4급 신규편입으로 지원 가능한 병역특례 백엔드 공고 전체를 성장 가능성 순으로 줄 세운 것. 지원 불가 회사와 그 이유 포함 | **지원 대상 회사를 정할 때 — `toss-target-role.md` 보다 먼저** |
| [resume-assets.md](career/resume-assets.md) | 공고의 각 줄에 이 프로젝트의 무엇으로 답하는가? 답할 것이 없는 줄은 어디이고 무엇을 만들어야 채워지는가? | 이력서를 쓰기 전, **프로젝트 고도화 항목을 고를 때** |
| [paytalab-application.md](career/paytalab-application.md) | 페이타랩(패스오더) 백엔드 공고의 각 줄에 무엇으로 답하는가? | 지원 전, 다른 병역지정업체 지원 시 재사용 |
| [toss-product-playbook.md](career/toss-product-playbook.md) | **컨설턴트 관점.** 전형의 각 단계가 무엇을 거르고 무엇이 사람을 떨어뜨리는가 | 이력서를 쓰기 전, 모의면접 전 |
| [toss-sprint-1month.md](career/toss-sprint-1month.md) | 한 달 안에 무엇을 어떤 순서로 할 것인가? | 매주 계획을 세울 때 |
| [toss-target-role.md](career/toss-target-role.md) | 어느 직무·경로로 갈 것이고 왜인가? (병역 규정 포함) | 지원 대상을 정할 때 |
| [toss-gap-analysis.md](career/toss-gap-analysis.md) | 부족한 것의 전체 목록은 무엇인가? | 중장기 학습 계획을 세울 때 |
| [toss-interview-questions.md](career/toss-interview-questions.md) · [toss-interview-concepts.md](career/toss-interview-concepts.md) | 무엇을 물어보고 어떻게 답하는가? | 면접 직전 |
| [toss-infra-essentials.md](career/toss-infra-essentials.md) | 인프라 쪽에서 최소한 알아야 할 것은? | 면접 준비 중 |
| [toss-pdf-prerequisites.md](career/toss-pdf-prerequisites.md) | PDF 세트를 읽는 선행조건은 무엇인가? | 자료를 읽는 순서를 정할 때 |

### 학습·위임 기록

공개하지 않는다. 문서의 구조 자체가 "무엇을 이력서·면접에 쓸 것인가"를 기준으로 짜여
있어서, 공개하면 엔지니어링 기록이 아니라 취업 준비 기록으로 읽힌다.

| 문서 | 답하는 질문 |
|---|---|
| [guides/perf-mastery-checklist.md](guides/perf-mastery-checklist.md) | 시스템 전체를 실제로 이해했는가? 단계별 학습 진도와 자가진단 |
| [worklog/delegation-scope.md](worklog/delegation-scope.md) | 어떤 결함을 위임할 수 있고 어떤 것은 직접 해야 하는가 |
| [worklog/fix-log.md](worklog/fix-log.md) | 위임한 결함이 무엇이 어떻게 고쳐졌는가 |
| [worklog/overnight-execution-fixes-2026-08-18.md](worklog/overnight-execution-fixes-2026-08-18.md) | 무인 야간 실행 중 발견해 고친 것 |
| `guides/HighTeenDay_하드웨어_자원_병목_학습서.pdf` | 하드웨어 자원 병목 학습 자료 |

---

## 문서 갱신 규칙

1. 성능 시스템에 관한 발견·조사·계획은 **`performance/docs/` 에 쓴다.** 이 디렉터리에
   새로 만들지 않는다.
2. 이직 준비 문서와 학습·위임 기록만 여기 남긴다.
3. `localDocs/` 변경은 **항상 별도 커밋**으로 하고 코드·테스트·공개 문서와 섞지 않는다.
   커밋 scope 는 `docs(localdocs):` 를 쓴다.
4. 공개 문서에서 이 디렉터리의 파일을 **참조하지 않는다.** 참조가 필요해지면 그 내용을
   `performance/docs/` 로 옮겨야 한다는 신호다.
