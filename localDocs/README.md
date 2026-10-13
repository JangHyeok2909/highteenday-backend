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
| 안내서 (측정 원리·입문·환경·디버깅) | [`localDocs/archive/performance/guides/`](archive/performance/guides/) — 2026-09-07 저장소에서 뺐다 |
| 신뢰 수준(MDE)·계측 공백 | [`performance/docs/planning/`](../performance/docs/planning/) |
| 로드맵·현황 요약 | [`localDocs/archive/performance/planning/`](archive/performance/planning/) — 2026-09-07 저장소에서 뺐다 |
| 결정 기록 (Go 이식) | [`performance/docs/decisions/`](../performance/docs/decisions/) |
| 설계 문서 (지표 카탈로그·리포트) | [`localDocs/archive/performance/design/`](archive/performance/design/) — 2026-09-07 저장소에서 뺐다 |
| 색인과 문서 규칙 | [`performance/docs/README.md`](../performance/docs/README.md) |

---

## 여기 남은 것

### 작업 백로그

| 문서 | 답하는 질문 |
|---|---|
| [plan-2027-04.md](plan-2027-04.md) | **이직이 가능해지는 2027년 4월까지 약 30주 동안 무엇을 어떤 순서로 하는가?** 항목 15개(T-01~T-15)와 완료 기준, 구간별 배분, 하지 않기로 한 것과 그 이유 (2026-09-14). **아래 두 문서보다 먼저 읽는다** |
| [plan-2027-04-transfer-prep.md](plan-2027-04-transfer-prep.md) | **프로젝트를 4주 안에 닫고 2027년 4월 병역특례 전직을 준비하려면 30주를 어떻게 쓰는가?** 코테·무AI 구현·실행형 CS Lab·지원 일정을 주 단위로 정한 실행 계획 (2026-09-25) |
| [cs-lab-live-coding-project-prompts.md](cs-lab-live-coding-project-prompts.md) | `~/Desktop/project` 아래에 공개용 CS Lab과 비공개 라이브 코딩 연습 저장소를 어떤 구조와 학습 보호 규칙으로 만드는가? 복사용 생성 프롬프트 2개 (2026-09-25) |
| [TODO.md](TODO.md) | 애플리케이션 코드를 고쳐야 끝나는 일이 무엇이고 어느 파일을 봐야 하는가? (1번: API 멱등성) |
| [ops-simulation-plan.md](ops-simulation-plan.md) | 실사용자 없이 운영 트래픽과 장애 대응을 다뤄 보려면 무엇을 어떤 순서로 갖춰야 하는가? 검토했다 버린 대안과 이유, `performance/` 와의 격리 규칙 (2026-09-14) |

### 이직 준비 문서

측정 시스템의 결함을 다루지 않는다. 이 프로젝트의 결과물을 **바깥(채용 전형)에서 어떻게
쓸 것인가**를 다루므로 공개 대상이 아니다.

| 문서 | 답하는 질문 | 언제 읽나 |
|---|---|---|
| [tokyo-bigtech-route.md](career/tokyo-bigtech-route.md) | **최종 목표(도쿄 미국계 빅테크 SWE)에서 거꾸로 보면 경로가 성립하는가?** 도쿄 공고 실측, 레벨별 합격 기준, 한국인 선례 19건, 디딤돌 비교, 격차표, 분기 게이트와 점검 기록 (2026-09-25) | **진로 순서를 정할 때, 분기 점검 때 — 이 표의 다른 문서보다 먼저** |
| [final-goal-review.md](career/final-goal-review.md) | **도쿄 미국계 빅테크를 최종 목표로 유지할 것인가, 국내 대형 IT로 바꿀 것인가?** 일본 개발자 부족의 실체, 거점별(도쿄·싱가포르·시드니·서울) 공고 실측, 한국·일본 세후와 월세를 뺀 소득 비교, 동기별 판단 틀 (2026-09-25) | **최종 목표나 거점을 다시 따질 때** |
| [military-service-company-ranking.md](career/military-service-company-ranking.md) | **어느 회사에 지원할 것인가?** 보충역 4급 신규편입으로 지원 가능한 병역특례 백엔드 공고 전체를 성장 가능성 순으로 줄 세운 것. 지원 불가 회사와 그 이유 포함 | **지원 대상 회사를 정할 때 — `toss-target-role.md` 보다 먼저** |
| [resume-with-claude-code.md](career/resume-with-claude-code.md) | **AI를 써서 만든 서류가 왜 사람에게 안 읽히고 어떻게 써야 읽히는가?** 읽는 방식·AI 티 신호·구조·문장 공식·클로드의 역할 분담·작업 절차·도구를 출처 22곳으로 정리 | 원고를 다시 쓰기 전, 클로드에게 무엇을 시킬지 정할 때 |
| [resume-assets.md](career/resume-assets.md) | 공고의 각 줄에 이 프로젝트의 무엇으로 답하는가? 답할 것이 없는 줄은 어디이고 무엇을 만들어야 채워지는가? | 이력서를 쓰기 전, **프로젝트 고도화 항목을 고를 때** |
| [career/references/README.md](career/references/README.md) | **이력서·포트폴리오의 뼈대를 무엇에 맞추는가?** 해외(미국·캐나다) 백엔드·인프라 모범 사례 14건의 원문 보존과 선정 근거, 뒤진 곳·막힌 곳 | 원고의 구조를 바꾸기 전 |
| [career/references/rules-resume.md](career/references/rules-resume.md) · [rules-portfolio.md](career/references/rules-portfolio.md) | 그 뼈대를 어떻게 따르는가? 규칙별 출처, 현재 원고 대조표, 출처가 갈리는 곳의 판정 | 원고를 고칠 때, 제출 전 점검표 |
| [paytalab-application.md](career/paytalab-application.md) | 페이타랩(패스오더) 백엔드 공고의 각 줄에 무엇으로 답하는가? | 지원 전, 다른 병역지정업체 지원 시 재사용 |
| [toss-product-playbook.md](career/toss-product-playbook.md) | **컨설턴트 관점.** 전형의 각 단계가 무엇을 거르고 무엇이 사람을 떨어뜨리는가 | 이력서를 쓰기 전, 모의면접 전 |
| [toss-sprint-1month.md](career/toss-sprint-1month.md) | 한 달 안에 무엇을 어떤 순서로 할 것인가? | 매주 계획을 세울 때 |
| [toss-target-role.md](career/toss-target-role.md) | 어느 직무·경로로 갈 것이고 왜인가? (병역 규정 포함) | 지원 대상을 정할 때 |
| [toss-gap-analysis.md](career/toss-gap-analysis.md) | 부족한 것의 전체 목록은 무엇인가? | 중장기 학습 계획을 세울 때 |
| [toss-interview-questions.md](career/toss-interview-questions.md) · [toss-interview-concepts.md](career/toss-interview-concepts.md) | 무엇을 물어보고 어떻게 답하는가? | 면접 직전 |
| [cs/README.md](cs/README.md) | **CS 면접 질문 중 무엇을 이미 답할 수 있고 무엇이 비었는가?** 분야 9개·193문항마다 이 프로젝트와 회사 일의 사례를 짝지은 판정표. 위 개념 문서가 다루지 않는 운영체제·네트워크를 포함한다 | CS 공부 순서를 정할 때, 면접 준비 중 |
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
| [worklog/recall-log.md](worklog/recall-log.md) | 내가 만든 변경을 기록 없이 설명할 수 있는가, 언제 다시 확인하나 |
| [worklog/overnight-execution-fixes-2026-08-18.md](worklog/overnight-execution-fixes-2026-08-18.md) | 무인 야간 실행 중 발견해 고친 것 |
| [worklog/roadmap-personal-ops.md](worklog/roadmap-personal-ops.md) | 성능 로드맵에서 떼어 낸 개인 실행 계획 — 다음 작업일 순서, 밤새 무인 실행 목록 (2026-09-05 분리) |
| `guides/HighTeenDay_하드웨어_자원_병목_학습서.pdf` | 하드웨어 자원 병목 학습 자료 |

---

### 공개 문서 감사와 보관 (2026-09-05)

저장소를 공개한 뒤 문서를 면접관 시점으로 다시 읽은 기록이다. 무엇을 왜 뺐고 어떻게 고쳤는지,
공개 문서에서 걷어낸 정보(NEIS 키 노출 위치 등)를 어디에 보존했는지가 여기 있다.

| 문서 | 답하는 질문 |
|---|---|
| [review/public-docs-audit-2026-09-05.md](review/public-docs-audit-2026-09-05.md) | 공개 문서에서 무엇이 감점 요인이었고 무엇을 어떻게 고쳤는가? 남긴 결정과 잔여 위험은? 커밋은 어떻게 나누는가? |
| [archive/README.md](archive/README.md) | 공개 저장소에서 뺀 문서 5개(`GROUP_CHAT`, `HOT_POST_SYSTEM`, `POST_REACTION_MIGRATION`, `SYSTEM_ARCHITECTURE`, Go 이식 계획)는 왜 여기 있고 무엇으로 대체됐는가? |

> Go 이식 계획(`go-migration-rationale.md`)은 위 "성능 시스템 문서는 여기 없다" 표의 예외다 —
> 커리어 관점으로 쓰인 절 때문에 `archive/performance/` 로 되돌아왔다.

## 문서 갱신 규칙

1. 성능 시스템에 관한 발견·조사·계획은 **`performance/docs/` 에 쓴다.** 이 디렉터리에
   새로 만들지 않는다.
2. 이직 준비 문서와 학습·위임 기록만 여기 남긴다.
3. `localDocs/` 변경은 **항상 별도 커밋**으로 하고 코드·테스트·공개 문서와 섞지 않는다.
   커밋 scope 는 `docs(localdocs):` 를 쓴다.
4. 공개 문서에서 이 디렉터리의 파일을 **참조하지 않는다.** 참조가 필요해지면 그 내용을
   `performance/docs/` 로 옮겨야 한다는 신호다.
