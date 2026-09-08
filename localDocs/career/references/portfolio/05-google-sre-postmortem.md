# Google SRE Book — 포스트모템(장애 회고) 문서의 표준 뼈대

> **확보일** 2026-09-07 · **원문 언어** 영어 · **저장 범위** 예시 포스트모템 전체 구조와 본문
>
> | 출처 | 주소 | 확보 방법 |
> |---|---|---|
> | *Site Reliability Engineering* (O'Reilly, 2016) 부록 D "Example Postmortem" | https://sre.google/sre-book/example-postmortem/ | WebFetch |

## 왜 모범 사례인가

- Google이 공개한 SRE 책의 부록으로, **인프라 조직의 장애 회고 문서 형식의 사실상 표준**이다. 많은 회사의 인시던트 리포트 템플릿이 이 절 구성을 따른다(Sam Rose가 쓴 Budibase 인시던트 리포트도 같은 계열, [03-sam-rose.md](03-sam-rose.md)).
- 사용자 포트폴리오의 3장(닷새를 태운 오진), 4장(+59,000% 오보), 8장(중복 행 장애)이 전부 "사건" 서사다. 이 뼈대는 사건을 **무엇이 / 얼마나 / 왜 / 무엇이 방아쇠였고 / 어떻게 알아챘고 / 어떻게 풀었고 / 무엇을 남겼나**로 나누는 표준 순서를 준다.
- 예시는 가상의 사건(셰익스피어 검색 서비스)이다. 구조가 목적이지 내용이 아니다.

---

## 1. 뼈대

| # | 절 | 답하는 질문 | 예시 원문(요지) |
|---|---|---|---|
| 1 | **Summary** | 한 문단으로 무슨 일이 있었나 | 66분 장애. 새로 발견된 소네트 검색 폭주와 잠재 자원 누수가 겹침 |
| 2 | **Impact** | 얼마나 아팠나 (수치) | *"Estimated 1.21B queries lost, no revenue impact."* |
| 3 | **Root Causes** | 근본 원인 (복수 가능) | 트래픽 급증 + 말뭉치에 없는 단어를 검색하면 파일 디스크립터가 새는 잠재 버그. 평소엔 실패율이 낮아 안 보였음 |
| 4 | **Trigger** | 무엇이 방아쇠였나 (원인과 구분) | *"Latent bug triggered by sudden increase in traffic."* |
| 5 | **Resolution** | 어떻게 멈췄나 | 희생 클러스터로 트래픽 우회, 용량 10배 증설, 새 색인 배포, 관심 줄 때까지 여유 용량 유지, 누수 수정 |
| 6 | **Detection** | 어떻게 알아챘나 | *"Borgmon detected high level of HTTP 500s and paged on-call."* |
| 7 | **Action Items** | 표: 항목 · **유형(mitigate / prevent / process / other)** · 담당 · 버그 번호 · 상태(DONE / TODO) | 9건. 예: "Add load shedding mechanisms" prevent, TODO / "Resolve file descriptor leak" prevent, DONE |
| 8 | **Lessons Learned** | 세 소절: **What went well / What went wrong / Where we got lucky** | 잘된 것: 모니터링이 500 비율을 즉시 감지, 새 말뭉치 배포가 빨랐음. 잘못된 것: 연쇄 장애 대응 훈련 부족, 오류 예산 초과. 운: 메일링 리스트에 소네트 사본이 있었고, 로그에 원인 스택이 찍혀 있었음 |
| 9 | **Timeline** | 분 단위 시간표. 장애 시작·인시던트 선언·완화·종료 표시 | 14:51 뉴스 → 14:53 트래픽 88배 → 14:54 **OUTAGE BEGINS** → 15:01 **INCIDENT BEGINS** → 15:18 로그에서 FD 고갈 확인 → 15:34 용량 계산 자릿수 오류 발견 → 15:36 **OUTAGE MITIGATED** → 16:00 **OUTAGE ENDS** → 16:30 **INCIDENT ENDS** |
| 10 | **Supporting information** | 대시보드 링크 등 | 모니터링 URL |

## 2. 예시 본문 원문 (핵심 절)

**Summary** — Shakespeare Search down for 66 minutes during a period of very high interest in Shakespeare due to discovery of a new sonnet.

**Impact** — Estimated 1.21B queries lost, no revenue impact.

**Root Causes** — Cascading failure due to combination of exceptionally high load and a resource leak when searches failed due to terms not being in the Shakespeare corpus. The newly discovered sonnet used a word that had never before appeared in one of Shakespeare's works, which happened to be the term users searched for. Under normal circumstances, the rate of task failures due to resource leaks is low enough to be unnoticed.

**Trigger** — Latent bug triggered by sudden increase in traffic.

**Resolution** — Directed traffic to sacrificial cluster and added 10x capacity to mitigate cascading failure. Updated index deployed, resolving interaction with latent bug. Maintaining extra capacity until surge in public interest in new sonnet passes. Resource leak identified and fix deployed.

**Detection** — Borgmon detected high level of HTTP 500s and paged on-call.

**Lessons Learned / Where we got lucky** — A mailing list of Shakespeare aficionados happened to have a copy of the new sonnet available. Server logs had stack traces that pointed to file descriptor exhaustion as the cause for the crash. Query-of-death was resolved by pushing new index containing popular search term.

## 3. 뼈대에서 읽히는 것

- **원인(Root Cause)과 방아쇠(Trigger)를 나눈다.** 사용자 3장은 "원인 = 도착률이 처리 용량을 넘긴 포화", "방아쇠 = 부하 시나리오 설정"으로 나뉜다. 8장은 "원인 = 체크-후-실행 경쟁 상태", "방아쇠 = 동시 스크랩 토글".
- **Detection이 독립된 절이다.** "어떻게 알아챘나"가 "무엇이 원인인가"만큼 중요하다. 사용자 3장의 핵심이 정확히 이것이다(지표는 처음부터 있었는데 해석 장치가 없었다).
- **Action Items에 유형·담당·상태가 붙는다.** "고쳤다"와 "고칠 예정"이 표에서 구분된다. 사용자 10장(한계와 다음)을 이 표 형식으로 바꾸면 구현 완료·예정(멱등성 KI-54, lost update KI-53)이 한눈에 구분된다.
- **운이 작용한 곳을 따로 쓴다.** 재현 불가능한 성공을 실력으로 포장하지 않는 장치다. 사용자 4장(+59,000% 오보)에서 "이상한 수치라 눈에 띄었다"는 운에 해당한다.
- **타임라인은 분 단위.** 사용자 3장 "닷새"는 일 단위 타임라인이 어울린다: 며칠째 무엇을 의심했고 무엇으로 반박됐나.
