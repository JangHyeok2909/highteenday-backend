# 도쿄 미국계 빅테크까지 — 경로 판정과 감독 계획

> 기준 시점: **2026-09-25**
> 답하는 질문: **최종 목표(도쿄의 미국계 빅테크 SWE)에서 거꾸로 보면 지금의 경로가 성립하는가?
> 각 단계에서 무엇을 만들어야 하고, 언제 무엇으로 점검하는가?**
> 성격: **조사 기록 + 감독 계획.** 공식 채용 페이지·공고 원문, 집계 데이터, 1차 후기를 일곱 갈래로
> 조사해 묶었다. 공고 수와 보상은 전부 2026-09-25 조회값이다.
> 자매 문서: [plan-2027-04.md](../plan-2027-04.md)(30주 실행 계획) ·
> [final-goal-review.md](final-goal-review.md)(목표 재검토, 세후·월세 비교) ·
> [toss-gap-analysis.md](toss-gap-analysis.md) · [cs/README.md](../cs/README.md)

> **신뢰도 라벨**
> **[공식]** 회사 공식 채용 페이지·공고·문서 · **[보도]** 언론 · **[데이터]** levels.fyi·interviewing.io·TokyoDev
> 설문 같은 집계 · **[후기]** 본인이 쓴 합격·탈락기, 전·현직자 글, 상업 준비 가이드 · **[판단]** 이 문서의 해석.
> 사실이 아니다.
> 출처 번호(G·A·I·J·K·P)는 10장 목록을 가리킨다.

> **2026-09-25 갱신.** 동기 답변은 이렇다. 1순위는 돈(저축 가능액)과 커리어, 2순위는 기억에 남는 경험이고, 일본을
> 선호한다. 저축 기준으로 재면 국내 시니어 초입 대비 도쿄 Google L4 1.57배, 싱가포르 Google L4 2.14배, 일본 영어 회사
> 0.66배다. 그래서 2030 창에서 **도쿄 미국계와 싱가포르 미국계에 동시에 지원**하고(둘 다 열리면 도쿄), 일본 영어 회사
> 경유는 마지막 대안으로 내렸다. 근거는 [final-goal-review.md](final-goal-review.md) 3.2절과 7.4절이다. 이 문서의
> 합격 기준(2장), 격차(6장), 게이트(7.2절)는 거점과 무관하게 그대로 쓴다.
>
> **2026-09-27 추가.** Google이 아닌 현실 목표 회사로 다시 보았다. 도쿄에서 지금 열린 문(JPMorgan·Morgan Stanley·Goldman)은
> 국내보다 적게 남는다(0.71~0.88배). 싱가포르에서 현실적인 고저축 문은 Apple이다(1.65~2.86배). 근거는
> [final-goal-review.md](final-goal-review.md) 3.3절과 7.5절이다.

---

## 0. 결론 — 여섯 문장

**첫째, 목표의 문이 좁고, 열렸다 닫힌다.** 2026-09-25에 각사 채용 시스템을 직접 조회했다. Google 도쿄
공고 83건 중 SWE는 매니저 1건뿐이고 개인 기여자 SWE는 0건이다(같은 시각 싱가포르 SWE 카테고리 71건)
[공식 G5·L1]. Amazon 일본 공고 866건 중 SDE는 신입·주니어·인턴 3건이고 경력 SDE는 0건이다 [데이터 A1].
Microsoft 도쿄 SWE는 FDE 2건(일본어 필수)뿐이다. Meta·Stripe·Datadog·Snowflake 등 10곳은 도쿄가 영업
거점이라 SWE가 0건이다 [공식·데이터 L]. Indeed는 2023~2025년에 네 차례 감원했고 2025-07 감원에 일본
엔지니어가 포함됐다 [보도 J15]. **"2030년에 지원한다"는 계획은 그해에 문이 열려 있다는 데 거는 단일 창
베팅이다.**

**둘째, 한국 회사에서 도쿄 미국계 빅테크 SWE로 바로 간 공개 선례가 없다.** 한국인 사례 19건을 모았다.
미국계 일본 법인 합격 6건 중 4건이 일본 회사(라쿠텐·LINE·소프트뱅크·야후재팬)를 먼저 거쳤고,
토스·당근·쿠팡 출신이 도쿄로 간 사례는 0건이다 [후기 K]. 한국 재직자에게도 리크루터 연락은 오지만
합격으로 이어진 기록은 일본 거주자뿐이다. **계획에서 대안으로 둔 "일본 영어 회사 경유"가 선례가 있는
본선이다.**

**셋째, 합격 기준의 무거운 칸이 지금 가장 비어 있는 칸과 겹친다.** 채점에서 가장 무거운 것은
알고리즘 코딩의 최적해 도달이고 [후기 G8], 레벨은 설계·행동 면접이 정한다 [후기 I8]. 기록된 탈락
원인도 영어가 아니라 코딩과 기술 질문 대응이다 [후기 K5·K6]. 그런데 저장소에 알고리즘 풀이 기록이
0건이고, 영어 수준을 보여 주는 기록도 없다 [P].

**넷째, 레벨은 본업이 정한다.** Amazon SDE II는 인턴을 뺀 직장 경력 3년과 설계·아키텍처 경력 2년을
요구하고 [공식 A10], 사이드 프로젝트는 연차에 들어가지 않는다. Google L4 공고는 대규모 설계 경력
1년을 요구한다 [공식 G6]. **1단계 회사는 이름이 아니라 설계를 맡는 자리로 고른다.** 이미 만든 측정·장애
주입 경험은 설계 면접의 딥다이브, Amazon의 "operations and resilience" 질문, AI 보조 라운드의 검증
항목에서 점수가 된다. 다만 관문을 통과한 뒤에 붙는 가산점이다.

**다섯째, 일본어가 계획에서 빠져 있는데, 지원할 수 있는 문의 개수는 일본어가 정한다.** 최종 목표의 제품
SWE(Google, Amazon Store Tech, Indeed)는 영어로 충분하다 [공식 A2·A4]. 하지만 도쿄 미국계 테크의
엔지니어 공고 대부분은 FDE·SA·SDET이고 거의 다 일본어 유창을 요구한다. Microsoft FDE, Apple SDET,
Databricks FDE, AWS SA(84%)가 그렇다 [공식·데이터 L, A1]. 선례가 있는 디딤돌에서도 일본어가 팀 선택 폭을
가른다. PayPay는 2023년 한국인 지원자의 HR 면접과 2차 기술면접을 일본어로 봤다 [후기 K7]. 라쿠텐
커머스·은행은 비즈니스 일본어를 요구하고 [공식 J13], LY의 영어 공고는 LINE Platform에만 있다 [공식 J8].

**여섯째, 실패 비용이 큰 회사가 있다.** Google은 같은 직군 재지원까지 최소 1년을 요구하고 [공식 G1],
비공식적으로 5년에 3회 한도가 있다고 한다 [후기 G7]. Amazon은 OA 탈락 시 6개월이다 [공식 A8].
반대로 실전 면접을 5회 이상 본 사람은 통과율이 높다(Amazon 81% 대 65%, 2020 데이터) [데이터 I3].
**덜 원하는 회사부터 면접을 보고, Google은 순서의 맨 끝에 둔다.**

---

## 1. 목표 — 도쿄에서 미국계 빅테크가 SWE를 뽑는 문

### 1.1 2026-09-25 스냅숏

| 회사 | 도쿄 공고 → 그중 SWE | SWE 언어 요건 | 도쿄 총보상 (levels.fyi) | 비고 |
|---|---|---|---|---|
| **Google** | 83 → SWE 1건(매니저). 개인 기여자 SWE **0**, SRE **0** [공식 G5·L1] | "English proficiency is a requirement for all roles unless stated otherwise in the job posting." 일본어가 필요한 직무는 제목에 "(Japanese, English)"를 붙이고, SWE 공고에는 이 표기가 없다 [공식 L1] | L3 ¥16.3M · **L4 ¥23.5M** · L5 ¥32.4M [데이터 G10] | 최근 12개월 도쿄 입사 표본 5건. L4 경력 중앙값 6년(미국·싱가포르 4년) [데이터 G10] |
| **Amazon Japan** | 일본 전체 866 → SDE 3건(신입·주니어 2, 인턴 1) + SDM 1. 경력 SDE **0** [데이터 A1] | Store Tech SDE 공고에 일본어 요건 없음 [공식 A2]. 같은 조직 AS 공고: "Proficiency in Japanese is a plus but not required; English fluency is required." [공식 A4] | SDE I ¥12.3M · **SDE II ¥19.1M** · SDE III ¥24.9M [데이터 A11] | Japan Store Tech 등 도쿄 기술팀 10개 [공식 A16]. SDE II 표본 경력 중앙값 6년 [데이터 L31]. 원칙 주 5일 출근 [공식 A17] |
| **AWS Japan** | 135 → SDE **0**. 기술직은 SA 56건 [데이터 A1] | SA 56건 중 47건(84%)이 일본어 필수 [데이터 A1] | — | 신졸 직군에도 SDE 없음 [공식 A18] |
| **Indeed** (미국 본사, Recruit 소유) | 공고 수 확인 불가(사이트 403) | 영어가 기본, 일본 시장 팀은 일본어 필요 [후기 L40, 미검증 표기] | SWE I ¥14.4M · **SWE II ¥22.4M** [데이터 L31] | 엔지니어링 법인 Indeed Technologies Japan(다마치). 면접은 전부 화상 [공식 L33]. 온사이트: 코딩 2, 설계 1, 코드 리뷰 1, 이력 심층 1 [후기 J16]. 감원: 2023-03, 2024-05, 2025-07(일본 엔지니어 포함), 2025-11 [보도 J15]. 공개 저장소의 새 활동은 Java보다 Go 쪽 [공식 L42] |
| **Microsoft** | 91 → 2건, 둘 다 FDE [공식 L10] | "Fluency in Japanese and English language skills." [공식 L11] | 62 ¥18.9M · 63 ¥20.1M [데이터 L31] | 라쿠텐 출신 한국인의 도쿄 SWE 합격 사례 1건(2025) [후기 K2] |
| **Apple** | 일본 62 → 3건(SDET 2, QA 매니저 1) [공식 L14] | 3건 중 2건 일본어 필수 [공식 L15·L17] | ICT3 ¥19.3M · ICT4 ¥32.0M [데이터 L31] | 테스트·로컬라이제이션 조직 |
| **Meta 외 10곳** | Meta 3 → 0. Salesforce/Slack, Stripe, Datadog, Snowflake, Databricks, Cloudflare, Uber, Netflix, LinkedIn, Airbnb 모두 SWE 0 [공식·데이터 L18·L19·L20] | — | 도쿄 SWE 표본 0 [데이터 L31] | 도쿄는 영업·SE·서포트 거점 |

레벨 대응: 도쿄 표본의 경력 중앙값은 Google L4, Amazon SDE II, Indeed SWE II 모두 6년이다 [데이터 L31].
2030년 경력 4년은 L4 하단이나 L3 상단에 걸릴 수 있다. 2장 참고.

### 1.2 이 스냅숏이 뜻하는 것 [판단]

- **문은 회사 단위가 아니라 시점 단위로 열린다.** 오늘 Google 도쿄 개인 기여자 공고가 0건이라고 2030년에도
  0건이라는 뜻은 아니다. 반대로 2030년에 열려 있다는 보장도 없다. 그래서 목표를 특정 회사가 아니라
  **"도쿄 미국계 SWE 문 전체"**로 잡고, 분기마다 문의 수를 센다(8.2절).
- **도쿄는 같은 레벨에 경력이 더 많이 몰린다.** 도쿄 L4 경력 중앙값 6년은 4년 차가 L4 하단에서 경쟁한다는
  뜻이다. L3 제안을 받을 가능성까지 계산에 넣는다.
- **영어만으로 되는 문은 세 회사의 제품 조직뿐이다.** Google, Amazon, Indeed다. 나머지 미국계 엔지니어 공고(FDE·SA·SDET)는
  일본어 유창을 요구한다. 일본어가 있으면 Google FDE(Mid, Python 2년) [공식 L3]와 Microsoft Senior SWE–FDE(4년)
  [공식 L11] 같은 문이 추가로 열린다.
- **보상 격차는 여전히 크지만 줄고 있다.** Google L4(¥23.5M)는 디딤돌 상위 회사(PayPay P3 ¥12.3M,
  Mercari MG3 ¥12.1M)의 약 두 배다 [데이터 J17]. 외자계 일본 법인이 일본 본사 회사보다 더 받는 격차는
  2022년 93%에서 2025년 35%로 줄었고, 주된 원인은 외자계 보상 하락이다 [데이터 J14].

### 1.3 지금 열려 있는 다른 미국계 영어 백엔드 문

| 회사 | 도쿄 공고 | 요건 원문 | 도쿄 총보상 |
|---|---|---|---|
| JPMorgan | 검색 첫 페이지 10건 중 SWE·SRE 8건(하한값) [데이터 L27] | SWE II "Java, Spring Boot". SWE III SRE "3+ years of applied experience", "Strong communication skills in English", SLI/SLO·error budget 명시 | — |
| Goldman Sachs | Settlements Java SWE, FICC e-trading Engineer [데이터 L28] | Java 필수. "Native level Japanese would be an added advantage" | Associate ¥14.7M [데이터 L31] |
| Morgan Stanley | SRE 계열 3건, C++ SWE 1건 [공식 L29] | SRE "at least 6 years of experience" | Associate ¥12.6M [데이터 L31] |
| xAI | Backend Engineer 1건 [공식 L23] | "Expert knowledge of either Rust or C++" | — |

**[판단]** 미국계 투자은행 도쿄 조직은 Java·Spring·SRE를 영어로 뽑는 문이 지금 열려 있는 드문 곳이다.
보상은 빅테크보다 낮지만 일본 거주와 영어 업무 이력을 쌓는 경유지 후보가 된다. 5.3절에 넣는다.

---

## 2. 합격 기준 — 2030년 4년 차가 넘어야 하는 것

### 2.1 현실적 레벨

| 회사 | 목표 레벨 | 최소 자격 원문 | 하향 위험 |
|---|---|---|---|
| Google | **L4 (SWE III)** | "2 years of experience with software development…" + "2 years of experience testing, maintaining, or launching software products, and **1 year of experience with large-scale application design and architecture**." [공식 G6] | L5 공고는 5년을 요구한다 [공식 G6]. L5 신호가 모자라면 L4를, L4 신호가 모자라면 L3를 제안한다 [후기 G7]. 도쿄 L3 신규 입사자 중 경력 3~4년 표본이 있다 [데이터 G10] |
| Amazon | **SDE II (L5)** | "3+ years of **non-internship professional** software development experience" + "**2+ years of non-internship design or architecture** (design patterns, reliability and scaling)" [공식 A10] | 도쿄 SDE I 표본에 경력 6년·8년 입력이 있다(2026) [데이터 A11]. SDE I과 SDE II의 총보상 중위값 차이는 약 ¥6.8M이다 |

**[판단]** 두 회사 모두 설계 경력을 직장 안에서 증명하라고 요구한다. 사이드 프로젝트의 설계는 이 칸을
채우지 못한다. 1단계 직장에서 설계 문서를 쓰고 방어한 기록이 2030년 레벨을 정한다.

### 2.2 서류

| 사실 | 근거 |
|---|---|
| Google은 최소 자격 충족이 이력서에서 보여야 하고, 30일에 최대 3건 지원할 수 있다. 성과는 "Accomplished [X], as measured by [Y], by doing [Z]" 형식을 권한다 | [공식 G1·G2] |
| Amazon SDE II는 최소 자격을 충족하면 OA를 보낸다. 우대 자격은 필수가 아니다. 대학 채용 FAQ는 "We can't add a referral later if you apply first."라고 쓴다 | [공식 A8·A14] |
| 리크루터 76명이 이력서 1,000여 장을 평가한 실험에서 한 장에 쓴 시간의 중앙값은 31초, 나중에 면접을 통과한 사람을 골라낸 정확도는 55%였다. 탑티어 회사 경력이 있으면 선택 확률이 35% 올랐다 | [데이터 I10] 2024-05 |
| 지원 경로별 효과: 함께 일해 본 현직자의 추천(warm referral)이 가장 크고, 리크루터가 먼저 연락한 후보가 그다음이다. 모르는 직원의 추천(cold referral)은 FAANG에서 순효과가 마이너스였다. 리크루터가 먼저 연락한 후보의 채용률은 직접 지원자의 6배 이상이다 | [데이터 I11] |

**[판단]** 서류는 31초짜리 추첨에 가깝고, 추첨을 피하는 길은 warm referral과 리크루터 연락이다.
한국 재직자가 받는 리크루터 연락은 합격으로 이어진 기록이 없다(3장). 결국 **일본에서 함께 일한 사람**이
가장 강한 입구다.

### 2.3 면접 루프

| 회사 | 구성 | 결정 방식 |
|---|---|---|
| **Google** | 워크스타일 평가(GHA) → 리크루터 → 기술 스크린(L4 1회) → 루프 4~6회(코딩 중심 + Googleyness & Leadership 1회. L4는 설계가 코딩 라운드 안에서 나오기도 함) [공식 G1, 후기 G7] | 면접에 들어가지 않은 4~5명의 위원회(HC)가 면접관이 쓴 피드백 묶음만 보고 채용 여부와 레벨을 정한다 [후기 G7]. 면접관은 질문마다 poor·borderline·solid·outstanding 답의 예시가 붙은 루브릭으로 채점한다 [공식 G4] |
| **Amazon SDE II** | OA(코딩 2문항 90분 + 설계 시뮬레이션 + 워크스타일. "Your code must compile for all questions") → 55분 면접 4회(코딩 3 + 설계 1 이상). 면접관마다 LP 질문 2~3개 [공식 A7·A8] | 채용팀 밖에서 온 Bar Raiser가 debrief를 진행한다. 판정 기준은 "better than 50% of their would-be peers"다 [공식 A13]. 결과는 루프 뒤 5영업일 안 [공식 A6] |
| **Indeed** | 온사이트 5회: 코딩 2, 설계 1, 코드 리뷰 1, 이력 심층 1 [후기 J16] | — |
| Meta E4 (참고) | 코딩 2(그중 1회는 AI 보조, 2026 확대) + 설계 1 + 행동 1 [공식 I13, 후기 I8] | "behavioral and design rounds carry the most weight for level determination at E4" [후기 I8] |

### 2.4 면접관이 실제로 가르는 것 (회사 공통)

**코딩**

| 사실 | 근거 |
|---|---|
| 기술 4·문제 해결 4·소통 2(4점 만점)를 받아도 96%가 다음 단계로 간다. 3·3·4는 4·4·2보다 떨어질 확률이 3배다. "For L3 and L4, you are better off ignoring the communication score entirely, as long as you are consistently scoring 2+ on it" | [데이터 I1] 약 10만 건 |
| 전 Google 면접관: 루브릭에 communication·coding style·verification이 있지만 "finding the optimal solution still carries most of the weight" | [후기 G8] 2025-10-27 |
| 여러 번 면접을 본 사람 중 성적이 일관된 사람은 약 20%다 | [데이터 I2] 2022 |
| LeetCode 콘테스트 레이팅은 면접 성과와 상관이 없다. 푼 문제 수와 FAANG 재직의 상관은 0.17이다. hard 50문제는 통과 확률을 7%p, medium 50문제는 3%p 올리고, 약 500문제부터 효과가 줄어든다 | [데이터 I4] |

**설계**

| 사실 | 근거 |
|---|---|
| L4는 폭이 필수이고 깊이는 제한적이어도 된다. 요구사항·API·스키마·상위 설계까지 직접 이끌어야 한다. L5는 두 영역 안팎에서 "hands-on experience"에 근거한 세부를 요구한다 | [후기 I5] |
| 필요 없는 기술을 끌어오면 주니어 신호로 읽혀 레벨이 내려간다. 용량 추정은 그 결과로 설계가 바뀔 때만 한다 | [후기 I6] |
| 요즘 하드웨어 수치를 알아야 한다. Redis 인스턴스당 초당 100k+ 요청, MySQL·Postgres 단일 primary 초당 10~20k 트랜잭션. 2015년 수치를 쓰면 "learned from textbooks"로 읽힌다 | [후기 I7] 2025-01 |
| Amazon SDE II 설계 기준: "broad comprehension of system design and expertise in one area". "operations and resilience… failure points, redundancy"와 "ten times the growth"를 묻는다 | [공식 A7] |

**행동**

| 사실 | 근거 |
|---|---|
| Google: "Our behavioral questions are meant to elicit specific examples over 'I always do X'" | [공식 G2] |
| Amazon 탈락 패턴: "we"로 서술, 수치 없음, "Crumbling when probed", 이야기 간 불일치(debrief에서 대조), 레벨 미달 범위 | [공식 A7·A9, 후기 A12] |
| Amazon SDE II 루프의 LP 질문은 8~12개다. 전 Bar Raiser가 참여한 가이드는 LP마다 이야기 1개 이상과 여분을 권한다 | [후기 A12] |
| E4 신호는 문제를 발견하고, 해결책을 제안하고, 끝까지 이끈 경험이다. 남이 설계한 기능을 구현한 사례만 있으면 E3 신호로 읽힌다 | [후기 I8] |

**영어로 보는 소통**

| 사실 | 근거 |
|---|---|
| 소통 점수는 유창함이 아니라 생각을 말로 풀기, 지금 하는 일 설명하기, 트레이드오프와 복잡도 논의하기를 본다 | [데이터 I1] |
| 억양 편향은 있다(d=0.47). 그런데 "candidates' relative comprehensibility was not a significant moderator"다. 알아듣기 쉬운 정도와 무관하게 생긴다 | [데이터 I9] 일반 채용 실험 |

**[판단]** L4에서 영어는 합격선만 넘으면 되는 칸이고, 합격선의 내용은 억양이 아니라 **끊기지 않는
사고 중계**다. 억양 교정에 시간을 쓰지 않는다. 결론부터 말하기, 숫자와 정확한 용어, 복잡도 설명을
영어로 반복 훈련한다.

### 2.5 2025~2026년 변화와 2030년 형식

| 변화 | 근거 |
|---|---|
| 면접 중 AI 사용 금지: Google("AI tools are not permitted"), Amazon(어기면 실격) | [공식 G1, 보도 I12] |
| 대면 면접 복귀: Pichai "we'll introduce at least one round of in-person interviews". 2025-10 파일럿 거점(베이 에어리어·시애틀·뉴욕·폴란드·방갈로르)에 도쿄는 없다 | [보도 I14, 데이터 I12] |
| AI 보조 라운드: Meta는 온사이트 코딩 1회를 AI와 함께 다중 파일 코드베이스를 고치는 과제로 바꿨다(2026 확대, E4 포함). Google은 2026 하반기 미국 일부 팀에서 Gemini를 쓰는 코드 이해 라운드와 G&L 안의 과거 작업 설계 대화를 시험 중이다 | [공식 I13, 보도 G9] |
| FAANG 면접관 중 알고리즘 문제를 버린 사람은 0%였다. Google 면접관은 "problem-solving heavy"한 여러 단계짜리 문제로 바꿨다 | [데이터 I12] 2025-10 |
| 빅테크 신규 채용 중 신입 비중 7%. AI 노출 직종의 22~25세 고용은 반사실 추세보다 19% 낮고 경력자에게는 격차가 없다 | [데이터 I15·I16] |

**[판단] 2030년 루프는 네 조각이다.** ① AI 없는 알고리즘(대면일 수 있음) ② AI와 함께 처음 보는 코드를
읽고 고치고 검증하는 과제 ③ 설계 ④ 과거 작업을 두고 하는 설계 대화가 섞인 행동 면접. 미국 파일럿이
도쿄에 언제 오는지는 모른다. 그래서 ①과 ②를 따로 훈련한다.

---

## 3. 선례 — 한국인은 어떤 경로로 갔나

19건 중 결정에 쓰이는 사례만 옮긴다. 전체 표와 원문 링크는 10장 K 출처에 있다.

| # | 이전 경력 | 결과 | 경로와 본인이 꼽은 요인 |
|---|---|---|---|
| K1 | 미국에서 중·고·대학 → 일본 ML 스타트업 → 라쿠텐 약 1년 → LINE | **Amazon Japan SWE** (일본 경력 4년) | 라쿠텐 재직 중 퇴근 후 1년 3개월 동안 공부. "진짜 공부밖에 안 했던 것 같아요" [후기 K1] |
| K2 | 서강대 → 일본 교환학생 → 라쿠텐 신졸(한일 채용박람회) → 백엔드·클라우드 3년 | **Microsoft 도쿄 SWE** (총 5년 차, 2025) | 면접은 실제 프로젝트의 기술 결정 위주. 재직 중에도 다른 회사 면접으로 실력을 점검 [후기 K2] |
| K3 | 홍콩 HKUST NLP 연구 → 스타트업 | **Google 도쿄**(2020~) → 2024-12 마운틴뷰 이동 | 채용 절차 기록 없음 [후기 K3] |
| K5 | 파이썬 백엔드 2년 → ML 1년 | Google Japan 리크루터 연락 → 온사이트 후 탈락 (2019) | 전부 영어. 채용위원회 판단: "coding/algo 능력에 대한 추가 검증이 필요". 소통은 좋은 평가 [후기 K5] |
| K6 | 미기재 | Amazon(일본) 2회 탈락 (2026-07) | 1회차 원인: "면접준비부족, 테크니컬질문 유연하게 대처못해서". 2회차는 루프 마지막 면접에서 탈락 [후기 K6] |
| K7 | IGAWorks → LINE Plus → NFTBank, Java·Kotlin·Spring 백엔드 | PayPay 최종 탈락 (2023) | LeetCode Medium 1·Hard 1 → HR(일본어) → 1차 기술(영어) → 2차 기술(일본어, API 설계와 HashMap 직접 구현) → 컬처핏 → 탈락 [후기 K7] |

**패턴**

- **직행 0건.** 한국 회사에서 도쿄 미국계 SWE로 바로 합격한 공개 기록은 없다. 합격 6건 중 4건은 일본 회사를
  거쳤고, 라쿠텐이 가장 자주 등장한다 [후기 K].
- **SWE 합격자 3명(K1·K2·K3)은 모두 영어권에서 교육을 받았거나 살았다.** 영어 때문에 떨어졌다고 확인된 SWE
  사례는 없다. 기록된 탈락 원인은 코딩과 기술 질문이다(K5·K6).
- **리크루터 연락은 한국에도 오지만 합격은 일본 거주자에게서만 나왔다.** 한 Google 직원은 "all positions in
  Japan for SWE are only looking for people already in Japan"이라고 댓글을 남겼다 [후기 G11, 전언].

**[판단]** 선례가 가리키는 경로는 "일본 회사에서 3~4년 → 도쿄 미국계"다. 한국에서 영어권 배경 없이
직행한 사람이 공개 기록에 없다는 것이 이 계획의 가장 큰 위험이다. 불가능하다는 뜻은 아니다. 하지만
그 길을 계획의 유일한 축으로 두면 안 된다.

---

## 4. 디딤돌 — 일본의 영어 개발 조직

| 회사 (지원 단위) | 영어 | 규모·스택 | 면접 | 도쿄 총보상 | 위험 |
|---|---|---|---|---|---|
| **PayPay** | 개발 조직의 약 80%가 외국 국적(52개국, 2024-01) [보도 J1] | 등록 사용자 7,200만, 연 78억 건, "capable of processing 1,250 transactions per second", 마이크로서비스. Java·Kotlin [공식 J2] | CodeSignal 70분 4문제 → 기술·행동 3~4회(분산 시스템, 시스템 디자인) [후기 J3]. 2023년에는 일부 라운드가 일본어였다 [후기 K7] | P2 ¥9.2M · P3 ¥12.3M | 2025-08 채용 동결 보고 [후기 J3], 2026-03 상장가가 희망 범위 아래, 2026-09 일본 공고 83건 [공식 J4] |
| **Mercari** (플랫폼·검색) | 직무별 CEFR A2~C1. 엔지니어 외국 국적 50% 이상 [공식 J5] | Go 마이크로서비스, Spanner, 월 이용자 2,270만 이상 | HackerRank 또는 과제 → 면접 3회 | MG3 ¥12.1M · MG4 ¥16.4M | 본사 정규직 −12.8%(FY2026.6). Merpay는 대부분 일본어 팀 [후기 J7]. Go로 옮겨야 함 |
| **LY** (LINE Platform) | 영어 공고는 LINE Platform에만. Messaging Backend: "Fluent in either Japanese or English", 3년 이상, ¥8M~15M [공식 J8] | 하루 메시지 수백억 건, Kafka 초당 100만 건. **Java·Kotlin·Spring·Redis·Kafka** | 코딩 또는 과제 → 면접(시니어는 설계·코드 리뷰) | L4 ¥11.35M | 한국인 특별전형과 한국어 통역 면접 유지 [공식 J9·J11]. LINE Plus는 2025-11 외부 채용 중단 [보도 J10] |
| **Rakuten** (TPD·AI&Data) | 2012 영어 공용어화. **TOEIC 800이 입사 조건** [보도 J12]. 커머스·은행은 비즈니스 일본어 [공식 J13] | Java·Kotlin·Go | Codility 2~3문제 → 기술 1~2회 → 행동, 영어 진행 | A ¥9.6M | 주 4일 출근, 보상 하위 |

추가 사실:

- 일본어 퇴사 글 약 45건(Mercari 30, LINE 15)에서 도쿄 미국계 빅테크 SWE로 간 사례는 없었다. 반대로
  Mercari·SmartNews의 CTO는 빅테크 출신이다 [후기·공식, J 조사]. 한국인 선례 K1·K2는 라쿠텐에서 Amazon·Microsoft로
  갔다.
- 업무에서 영어를 항상 쓰는 사람의 연봉 중앙값은 ¥10.5M, 전혀 안 쓰는 사람은 ¥5.5M이다 [데이터 J14].
- Kraken Technologies Japan 같은 영어 조직은 "Apply from Japan Only", "No visa sponsorship from overseas"라고
  적는다 [공식 J18]. 일본에 들어간 뒤에야 열리는 문이 있다.

**[판단]**
- 지원 단위는 회사가 아니라 팀이다. 같은 회사 안에서도 영어 팀과 일본어 팀이 갈린다.
- Java·Spring 경력이 그대로 이어지는 곳은 PayPay와 LY(LINE Platform)다.
- 디딤돌 단계는 돈으로는 손해다. 세금과 월세를 빼면 국내 시니어 초입(세전 1.2억 원)의 0.72배가 남는다
  ([final-goal-review.md](final-goal-review.md) 3장).
- 디딤돌의 가치는 검증된 이동 경로에 있지 않다. 영어로 일한 이력, 일본 거주, 도쿄 현직자와 함께 일한
  관계에 있다. 2.2절의 서류 사실과 3장의 선례가 가리키는 입구가 정확히 이 세 가지다.

---

## 5. 경로 판정

### 5.1 단계별 판정

| 단계 | 계획 | 판정 | 이 단계가 채우는 최종 기준의 칸 | 수정 |
|---|---|---|---|---|
| 1단계 | 2028년까지 토스·당근 | **유지하되 목적을 바꾼다** | 실트래픽 운영, 직장 안의 설계 경력(Amazon 최소 자격 2년), 직접 이끈 사례, 실전 면접 경험 | 도쿄 채용 시장에서 토스·당근 브랜드가 통한다는 근거가 없다(선례 0건). 브랜드가 아니라 **설계 소유·온콜·규모**로 팀을 고른다(7.4절) |
| 1단계 대안 | 트래픽이 많은 MSA 스타트업 | 같은 칸을 채운다 | 위와 같음 | 설계를 맡기가 대형사보다 쉬울 수 있다 [판단] |
| 2단계 | 2030년 도쿄 미국계 빅테크 직행 | **단독 계획으로는 불성립** | — | 선례 0건, 문이 좁다. 디딤돌 지원과 **동시에** 진행하는 병행 창으로만 둔다 |
| 2단계 대안 | 일본 영어 회사 → 도쿄 미국계 | **선례상 본선이지만 저축 비용이 커서 마지막 대안** (2026-09-25 갱신) | 영어 업무 이력, 일본 거주, 도쿄 warm referral | 그 구간의 저축이 국내 시니어 초입의 0.66배다([final-goal-review.md](final-goal-review.md) 3.2절). 2030 창에서는 도쿄 직행과 싱가포르 미국계를 먼저 보고, 둘 다 막힐 때 택한다 |

### 5.2 수정된 경로

```
2026-09 ~ 2028          2028 ~ 2030                 2030 창 (동시 진행, 2026-09-25 갱신)
[현재 회사]          →  [1단계 팀]               →  ├ 도쿄 미국계 직행 (선호)      Google L4 저축 1.57배
 알고리즘 0→medium        설계 소유·온콜·규모          ├ 싱가포르 미국계 (문 최다)     Google L4 저축 2.14배
 영어 기준선·TOEIC        영어 면접 수준                └ 일본 영어 회사 (마지막 대안)  저축 0.66배 → 도쿄 미국계
 이야기 은행 시작         (도쿄 선호가 유지되면) 일본어       바닥: 국내 상위 회사 저축 1.29배
```

### 5.3 경로에 넣을지 정할 선택지

| 선택지 | 사실 | 비용 |
|---|---|---|
| **Amazon Japan 조기경력 SDE** | 공고 조건 "Graduated within the last 24 months", 일부 공고는 "Has 1 - 2 years Full Time working experience" [공식 A2·A3]. 2027-02 졸업이면 **2029-02까지** 조건에 든다. SDE I 총보상 중위값 ¥12.3M [데이터 A11] | OA와 루프를 그 전에 통과할 수준이어야 한다. 탈락하면 OA 6개월 대기 [공식 A8] |
| **미국계 투자은행 도쿄** (JPMorgan 등) | Java·Spring Boot SWE와 SRE를 영어로 뽑는 공고가 지금 열려 있다 [데이터 L27] | 빅테크보다 보상이 낮다. 여기서 도쿄 미국계 빅테크로 옮긴 선례는 확인하지 못했다 |
| **FDE 트랙** (일본어 + 영어) | 도쿄 미국계 빅테크에서 가장 자주 열리는 엔지니어 공고다. Google FDE(Mid, Python 2년), Microsoft Senior SWE–FDE(4년) [공식 L3·L11] | 고객 대면 엔지니어링이라 백엔드 제품 개발과 다르다. 일본어 유창이 필수다 |
| 다른 APAC 거점 입사 뒤 도쿄 이동 | 같은 시각 Google 싱가포르 SWE 공고 71건 [공식 G5]. 도쿄에서 미국 본사로 옮긴 사례는 있다(K3) | 도쿄로 들어오는 내부 이동의 난이도는 확인하지 못했다. 근거가 약해 검토만 한다 |

---

## 6. 격차표 — 지금과 2030년 L4·SDE II 기준

| 칸 | 2030년 기준 | 지금 | 격차 |
|---|---|---|---|
| **알고리즘 코딩** | AI 없이 45~55분에 최적해 + 말로 풀기. OA는 전 문항 컴파일 필수 [공식 A8, 후기 G8] | 풀이 기록 0건. `live-coding-practice`는 9/6에 문제 11개 뼈대만 만들고 커밋 0건 [P]. 스스로 "가장 약한 관문"이라고 적음 [P] | **최대** |
| **영어** | 통역 없이 55분 루프 4~5회. 사고 중계, 결론 우선, 추궁 대응 [데이터 I1] | 기록 없음 [P] | **최대 (미측정)** |
| **본업 설계 경력** | Amazon 설계 2년, Google 대규모 설계 1년 [공식 A10·G6] | 회사 사례(서킷 브레이커, 파드 간 중복 실행 분산 락, 고객사 간 이벤트 누출 차단 키 재설계)는 있으나 영향·규모 수치 없음 [P] | 대 |
| **행동 면접 이야기** | LP 16개 안팎, "I", 수치, 3~4단 추궁, 이야기 간 일관성 [후기 A12] | 한국어 카드 22장. 회사 카드 15·16·17 세부가 빈칸 [P] | 중 |
| **설계 면접** | L4 폭 + 상위 설계 주도, operations·resilience, 요즘 수치 [후기 I5·I7, 공식 A7] | 측정·장애 주입이 강점. 다중 인스턴스 방어 약함, 실사용자 없음 [P] | 중 |
| **AI 보조 라운드** | 처음 보는 코드 읽기·디버깅, AI 결과 검증 [공식 I13, 보도 G9] | AI에 구현·테스트를 위임하고 실패 테스트·DB 대조·실측으로 검증해 옴 [P]. 사례 카드 19는 빈칸 [P] | **소 — 이미 가진 강점** |
| **입구** | warm referral, 리크루터 연락, 일본 거주 [데이터 I11, 후기 K] | 도쿄 관계 없음. 영어 공개 산출물 없음 | 대 |
| **일본어** | 디딤돌 팀 선택 폭 [공식 J8·J13, 후기 K7] | 기록 없음 | 대 |
| **CS 기초 (1단계 면접용)** | 토스·당근 기초 질문 [P] | 193문항 미판정. 자료구조 83%·OS 75%·네트워크 68%·자바 64%가 사례·정리 모두 없음 [P] | 대 |

**[판단] 이전 판정 하나를 뒤집는다.** 당근 문서는 "장기 알고리즘 준비는 과투자"라고 적었다 [P].
그 판정은 5주 마감 기준이었다. 최종 목표 기준으로 알고리즘은 채점 비중이 가장 크고, 선례의 탈락 원인
1순위이며, Amazon에서는 OA로 서류 다음 첫 관문이다. **4년짜리 상시 트랙이다.**

---

## 7. 감독 계획 — 게이트와 점검

### 7.1 원칙

- **같은 과제로 잰다.** 성능 측정의 Before/After 원칙을 그대로 쓴다. 알고리즘은 처음 보는 문제를 같은 시간
  제한으로, 영어는 같은 과제를 같은 형식으로 녹음해 분기마다 비교한다.
- **판정은 결과 지표로 한다.** 푼 문제 수와 공부 시간은 기록만 한다. 문제 수와 합격의 상관은 0.17이다
  [데이터 I4]. 게이트는 시간 제한 통과율, 모의면접 점수, 실전 결과로 넘는다.
- **게이트를 못 넘으면 그 단계의 지원을 미룬다.** 재지원 대기 기간 때문에 준비가 덜 된 지원은 창을 소모한다.

### 7.2 게이트

숫자는 전부 [판단]이다. 근거가 된 사실은 2장에 있다.

| 게이트 | 시점 | 알고리즘 | 영어 | 일본어 | 설계·행동 | 입구 |
|---|---|---|---|---|---|---|
| **M0 기준선** | 2026-12 | 처음 보는 medium 5문제를 문제당 30분 제한으로 풀고 결과 기록 | 프로젝트 10분 영어 설명 녹음, TOEIC 모의 1회 | — | 이야기 은행 틀 만들기 | — |
| **M1** | 2027-06 | medium 5문제 중 3개를 30분 안에 최적해 | 원고 없이 10분 설명 + 꼬리질문 3개 응답 | — | 이야기 8개(한국어, STAR + 수치) | 영어 LinkedIn, 측정 도구 영어 README |
| **M2 1단계 지원 전** | 2027-12 | medium 5문제 중 4개를 25분 안에. 라이브 코딩 모의 3회 | **TOEIC 800 이상**(라쿠텐 입사 조건 [보도 J12]) | — | 이야기 12개. CS 공백 문항 절반 해소. T-10 완료 | 측정 도구 영어로 공개. 사례 2개 영문 글 |
| **M3 1단계 지원** | 2028 | 1단계 후보 회사들의 코딩 테스트·라이브 코딩 실전 | — | 도쿄 선호가 유지되면 시작 | **실전 면접 5회 이상**(1단계 회사들을 동시에 진행) | — |
| **M4** | 2028-12 | LeetCode hard를 45분 제한으로 누적 기록 시작 | 영어로 말하며 푸는 모의면접 월 1회 | JLPT N3(도쿄 선호 시) | 본업에서 설계 문서를 쓰고 방어한 프로젝트 1개 착수 | 도쿄 현직자와 실제 협업(오픈소스 리뷰·공동 발표 등) 시작 |
| **M5** | 2029-06 | hard 50문제 누적(45분 제한), 영어 모의면접 기술·문제 해결 평균 3/4 이상 3회 연속 | 영어 행동 모의: 이야기 16개 중 무작위 5개가 3단 추궁을 버팀 | — | 한 분기를 넘긴 설계 소유 프로젝트 1개 완료. 이야기 16개 영어화 | warm referral 후보 2명 이상 |
| **M6 2030 창 판정** | 2029-12 | 영어 모의 루프(코딩 2 + 설계 1 + 행동 1) 2회 연속 hire 판정 | ↑ | JLPT N2(도쿄 선호 시) | ↑ | 8.2절 문 추적에서 열린 공고 확인 → **지원 개시** |

### 7.3 지원 순서 규칙

1. **추천을 먼저 받고 지원한다.** Amazon은 지원 뒤에 추천을 붙일 수 없다고 쓴다 [공식 A14].
2. **디딤돌과 덜 원하는 회사부터 본다.** 실전 5회 이상이 통과율을 올리고 [데이터 I3], 한 번의 결과는
   일관성이 20%뿐이라 [데이터 I2] 여러 곳을 동시에 진행한다.
3. **Amazon은 OA부터.** OA 결과는 여러 SDE II 공고에 공통으로 쓰이고, 이미 통과했다면 루프로 바로 간다 [공식 A8].
4. **Google은 마지막에 한 번.** 같은 직군 재지원까지 최소 1년, 비공식 5년 3회 한도, Strong No-Hire를 받으면 수년
   동결될 수 있다 [공식 G1, 후기 G7]. 준비 판정(M6) 전에는 넣지 않는다.

### 7.4 1단계 팀을 고르는 기준 (최종 목표 기준)

| 기준 | 왜 | 확인 방법 |
|---|---|---|
| 설계 문서를 쓰고 리뷰받는 권한 | Amazon 설계 2년, Google 대규모 설계 1년 최소 자격 [공식 A10·G6] | 면접에서 팀의 설계 리뷰 절차와 주니어의 역할을 묻는다 |
| 운영·온콜 참여 | Amazon 설계 질문 "operations and resilience", 행동 면접 Ownership [공식 A7, 후기 A12] | 온콜 로테이션 유무 |
| 한 분기를 넘기는 프로젝트 | E5 신호가 한 분기 넘긴 프로젝트 두어 개다. 4년 차가 L4 상단을 받으려면 필요 [후기 I8] | 팀의 로드맵 단위 |
| 트래픽 규모 | 설계 면접의 딥다이브 재료, 실사용자 부재 해소 | 초당 요청 수, 데이터 크기 |
| 영어 사용 (가산) | 영어 업무 이력 | 해외 조직과의 협업 여부 |

---

## 8. 감독 운영

### 8.1 점검 주기

| 주기 | 무엇을 보나 | 산출물 |
|---|---|---|
| 매월 | 알고리즘 풀이 기록(문제, 시간, 최적해 여부), 영어 연습 기록, 이야기 은행 추가분 | 다음 달 목표 3개 |
| 분기 | 7.2절 게이트 판정, 8.2절 문 추적, 경로 재판정 | 아래 점검 기록에 한 줄 |
| 연 1회 | 이 문서의 1~4장 재조사(공고·보상·면접 형식·선례) | 문서 갱신 |

### 8.2 문 추적

분기마다 아래 공고 수를 같은 방법으로 센다. 두 분기 연속으로 도쿄 미국계 SWE 경력 공고가 0건이면 싱가포르
비중을 올린다. 디딤돌(일본 영어 회사)은 두 곳이 모두 막힐 때만 쓴다(2026-09-25 갱신).

| 대상 | 세는 방법 |
|---|---|
| Google 도쿄 | 채용 사이트 도쿄·Software Engineering 카테고리에서 개인 기여자 SWE 공고 수 [G5] |
| 싱가포르 현실 목표 | Apple(Jobs 사이트), JPMorgan(Oracle HCM), Visa·Citi(Workday), Stripe·Meta의 4~6년 차 백엔드 공고 수와 외국인 부정 문구. 2026-09-27 기준 Apple 약 10, JPMorgan 42, Visa 14, Citi 14 ([final-goal-review.md](final-goal-review.md) 3.3절) |
| Amazon 일본 | amazon.jobs 공개 검색 JSON에서 일본·software-development 카테고리 공고 수와 레벨 [A1] |
| Indeed | 채용 사이트의 도쿄 엔지니어링 공고 수(2026-09 조회 시 403) |
| Microsoft·Apple | Eightfold API·Apple Jobs의 일본 공고 중 SWE 수와 언어 요건 [L10·L14] |
| JPMorgan | LinkedIn 게스트 검색의 도쿄 SWE·SRE 공고 수 [L27] |
| PayPay | Greenhouse 공고 수 [J4] |
| LY | 영문 채용 페이지의 엔지니어 공고 수 [J8] |

### 8.3 점검 기록

| 날짜 | 게이트 | 알고리즘 | 영어 | 일본어 | 설계·행동 | 입구 | 문 추적 | 판정 |
|---|---|---|---|---|---|---|---|---|
| 2026-09-25 | 조사 | 기록 0 | 기록 없음 | 기록 없음 | 카드 22장 | 없음 | Google 도쿄 83→SWE 1(매니저) · Amazon 일본 SDE 3(신입·주니어·인턴) · AWS SDE 0 · Microsoft FDE 2 · Meta 0 · JPMorgan SWE·SRE 8+ · PayPay 83 | 기준선 측정 전 |

---

## 9. 확인하지 못한 것

- 도쿄 SWE 면접을 영어·일본어 중에서 고를 수 있는지에 대한 Google 공식 근거
- 도쿄가 Google 대면 면접 대상 거점인지, 2026 AI 파일럿이 도쿄에 적용되는 시기
- Amazon 루프 탈락 뒤 재지원 대기 기간(흔히 6~12개월로 거론되지만 출처 없음)
- 2025~2026 감원이 Amazon·Meta 일본 조직에 미친 영향
- 한국인 합격 사례(K1·K2·K3)의 입사 경로와 합격 레벨
- 토스·당근 경력이 도쿄 리크루터에게 탑티어 브랜드로 읽히는지
- 디딤돌 11개사에서 도쿄 미국계로 옮긴 사람의 정량 근거(영어 블로그·발표 약력은 검색하지 못함)
- Indeed 도쿄의 현재 공고 수(사이트 403)와 도쿄 엔지니어 수
- 2024~2025년 도쿄 SWE 공고 수 추이. 아카이브가 없어 오늘 결과가 일시적 저점인지 구조적 축소인지 가를 수 없다
- 조사 도중 세션 공용 웹 검색 한도(200회)를 모두 써서, 후반부는 이미 아는 URL을 직접 열어 채웠다.
  Glassdoor·OpenWork·TokyoDev 일부 원문은 403으로 막혔다.

---

## 10. 출처

**Google**
- G1 [공식] Our hiring process — https://www.google.com/about/careers/applications/how-we-hire/ (2026-09-25 열람)
- G2 [공식] Interview tips — https://www.google.com/about/careers/applications/interview-tips/
- G4 [공식] re:Work 구조화 면접 가이드(2026-03 갱신) — https://rework.withgoogle.com/intl/en/guides/a-guide-to-structured-interviewing-for-better-hiring-practices
- G5 [공식] 도쿄 공고 검색(2026-09-25 15:41 KST 스냅숏) — https://www.google.com/about/careers/applications/jobs/results/?location=Tokyo%2C%20Japan&category=SOFTWARE_ENGINEERING
- G6 [공식] 싱가포르 SWE III 공고 119158784051290822, Senior SWE 공고 139070114996593350 — https://www.google.com/about/careers/applications/jobs/results/ 아래
- G7 [후기] interviewing.io Google 가이드(전 면접관 인용) — https://interviewing.io/guides/hiring-process/google
- G8 [후기] Nil Mamano, In defense of coding interviews(2025-10-27, 전 Google 면접관) — https://nilmamano.com/blog/in-defense-of-coding-interviews
- G9 [보도] Business Insider 인용, Google 면접 파일럿(2026-05-08) — https://www.entrepreneur.com/business-news/google-is-testing-a-new-rule-transform-job-interviews
- G10 [데이터] levels.fyi Google 도쿄 — https://www.levels.fyi/companies/google/salaries/software-engineer/locations/greater-tokyo-area
- G11 [후기, 전언] Blind(2024-04-23) — https://www.teamblind.com/post/moving-to-google-japan-vvrvtb7h

**Amazon**
- A1 [데이터] amazon.jobs 일본 공고 전수 조회(2026-09-25) — https://www.amazon.jobs/en/search.json?normalized_country_code[]=JPN&result_limit=100
- A2 [공식] SDE, Amazon Japan Store Tech #10467010(2026-07) — https://www.amazon.jobs/en/jobs/10467010/software-development-engineers-amazon-japan-store-tech
- A3 [공식] SDE, Pricing & Promotions #10495479(2026-08) — https://www.amazon.jobs/en/jobs/10495479/software-development-engineers-pricing-promotions-amazon-japan
- A4 [공식] Applied Scientist 신졸 #10506482(2026-08) — https://www.amazon.jobs/en/jobs/10506482/class-of-2028-full-time-applied-scientists-amazon-international-stores-amazon-japan-store-tech
- A6 [공식] Interview FAQ — https://amazon.jobs/content/en/faq/interview-process
- A7 [공식] SDE II interview prep — https://www.amazon.jobs/content/en/how-we-hire/sde-ii-interview-prep
- A8 [공식] SDE II OA prep — https://www.amazon.jobs/content/en/how-we-hire/sde-ii-oa-prep
- A9 [공식] Interview loop — https://www.amazon.jobs/content/en/how-we-hire/interview-loop
- A10 [공식] SDE II 공고 예시(2026-09) — https://www.amazon.jobs/en/jobs/10558200/software-development-engineer-ii-amazon-digital-advertising
- A11 [데이터] levels.fyi Amazon 도쿄 SDE I·II·III — https://www.levels.fyi/companies/amazon/salaries/software-engineer/levels/sde-ii/locations/greater-tokyo-area
- A12 [후기] igotanoffer, Amazon behavioral interview(2026-05-18) — https://igotanoffer.com/blogs/tech/amazon-behavioral-interview
- A13 [공식] Bar Raiser(2019-10-30) — https://www.aboutamazon.com/news/workplace/amazon-bar-raiser
- A14 [공식] 대학 채용 FAQ(추천 순서) — https://amazon.jobs/content/en/faq/university-talent
- A16 [공식] 도쿄 거점 페이지 — https://www.amazon.jobs/en/location/tokyo-area-japan
- A17 [공식] Jassy 출근 메모(2024-09-16) — https://www.aboutamazon.com/news/company-news/ceo-andy-jassy-latest-update-on-amazon-return-to-office-manager-team-ratio
- A18 [공식] AWS Japan 신졸 채용 — https://aws.amazon.com/jp/careers/newgraduate/

**도쿄 채용 지도 (전부 2026-09-25 조회)**
- L1 [공식] Google 도쿄 검색(83건) — https://www.google.com/about/careers/applications/jobs/results/?location=Tokyo%2C%20Japan
- L3 [공식] Google FDE, Gen AI (English, Japanese) — https://www.google.com/about/careers/applications/jobs/results/117890978424988358-forward-deployed-engineer-gen-ai-google-cloud-english-japanese
- L10 [공식] Microsoft 일본 공고 — https://apply.careers.microsoft.com/careers?location=Japan
- L11 [공식] Microsoft Senior SWE–FDE(2026-05-08) — https://apply.careers.microsoft.com/careers/job/1970393556863080
- L14 [공식] Apple 일본 공고(62건) — https://jobs.apple.com/en-us/search?location=japan-JPNC
- L15 [공식] Apple SDET, International QA(2026-07-15) — https://jobs.apple.com/en-us/details/200670590
- L17 [공식] Apple SWE Manager, Localization Quality(2026-04-28) — https://jobs.apple.com/en-us/details/200660149
- L18 [데이터] LinkedIn 게스트 검색(Meta 등) — https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?f_C=10667&location=Japan
- L19 [공식] Greenhouse API(Datadog, Stripe, Cloudflare, Airbnb, Databricks 등) — https://boards-api.greenhouse.io/v1/boards/datadog/jobs
- L20 [공식] Salesforce Workday — https://salesforce.wd12.myworkdayjobs.com/External_Career_Site
- L23 [공식] xAI Backend Engineer(2026-09-24) — https://job-boards.greenhouse.io/xai/jobs/5006477007
- L27 [데이터] JPMorgan SWE III SRE / SWE II(2026-09-23) — https://www.linkedin.com/jobs/view/4451886913 , https://www.linkedin.com/jobs/view/4451895809
- L28 [데이터] Goldman Sachs SWE(2026-09-04) — https://www.linkedin.com/jobs/view/4444796583
- L29 [공식] Morgan Stanley SRE(2026-08-06) — https://morganstanley.eightfold.ai/careers/job/549799464829
- L31 [데이터] levels.fyi 도쿄 회사별(회사 slug만 교체) — https://www.levels.fyi/companies/google/salaries/software-engineer/locations/greater-tokyo-area
- L33 [공식] Indeed 면접 안내 — https://www.indeed.com/careers/interview-guides
- L40 [후기] Japan Dev, Indeed(미검증 표기) — https://japan-dev.com/companies/indeed
- L42 [공식] Indeed GitHub — https://github.com/indeedeng

**면접관 관점·시장**
- I1 [데이터] interviewing.io, communication 10만 건 — https://interviewing.io/blog/does-communication-matter-in-technical-interviewing-we-looked-at-100k-interviews-to-find-out
- I2 [데이터] interviewing.io, 면접 성과의 일관성(2022) — https://interviewing.io/blog/after-a-lot-more-data-technical-interview-performance-really-is-kind-of-arbitrary
- I3 [데이터] interviewing.io, FAANG 준비도(2020 데이터) — https://interviewing.io/blog/how-know-ready-interview-faang
- I4 [데이터] interviewing.io, LeetCode 지표 — https://interviewing.io/blog/how-well-do-leetcode-ratings-predict-interview-performance
- I5 [후기] Hello Interview, 레벨별 시스템 디자인 기대치 — https://www.hellointerview.com/blog/the-system-design-interview-what-is-expected-at-each-level
- I6 [후기] Hello Interview, 과잉 설계와 레벨 하향 — https://www.hellointerview.com/blog/over-engineering-is-getting-you-down-levelled
- I7 [후기] Hello Interview, Modern Hardware Numbers(2025-01-16) — https://hellointerview.substack.com/p/modern-hardware-numbers-for-system
- I8 [후기] Hello Interview, Meta E4(2026) — https://www.hellointerview.com/guides/meta/e4
- I9 [데이터] Spence et al., 억양 편향 메타분석, PSPB 50(3) — https://doi.org/10.1177/01461672221130595
- I10 [데이터] interviewing.io, 리크루터 이력서 판단(2024-05) — https://interviewing.io/blog/are-recruiters-better-than-a-coin-flip-at-judging-resumes
- I11 [데이터] interviewing.io, 지원 경로별 효과 — https://interviewing.io/blog/how-to-get-in-the-door-at-top-companies-part-1
- I12 [데이터] interviewing.io, AI와 면접 변화(2025-10-08) — https://interviewing.io/blog/how-is-ai-changing-interview-processes-not-much-and-a-whole-lot
- I13 [공식] Meta hiring process — https://www.metacareers.com/hiring-process/
- I14 [보도] Pichai 대면 면접(2025-08-26) — https://www.globalleadersinsights.com/news/sundar-pichai-resumes-in-person-interviews-to-curb-ai-cheating-nwid-949.html
- I15 [데이터] SignalFire State of Talent 2025 — https://www.signalfire.com/blog/signalfire-state-of-talent-report-2025
- I16 [데이터] Stanford Digital Economy Lab, Canaries in the Coal Mine(2026-08 개정) — https://digitaleconomy.stanford.edu/publications/canaries-in-the-coal-mine/

**일본 회사**
- J1 [보도] PayPay 외국 국적 비율(2024-11-08) — https://www.hrpro.co.jp/series_detail.php?t_no=4126
- J2 [공식] PayPay SEC F-1/A(2026) — https://www.sec.gov/Archives/edgar/data/2080845/000119312526085389/d941409df1a.htm
- J3 [후기] PayPay 면접(2025-08-30) — https://interviewcat.dev/blog/paypay-software-engineer-interview
- J4 [공식] PayPay Greenhouse(2026-09-25 관측) — https://job-boards.greenhouse.io/paypay
- J5 [공식] Mercari 언어 정책 — https://careers.mercari.com/en/language/
- J7 [후기] Merpay 5년 후기(2024-03-19) — https://adlerhsieh.com/p/my-honest-review-of-working-at-merpay-inc-after-five-years
- J8 [공식] LY 채용 직군(2026-09-25 관측) — https://www.lycorp.co.jp/en/recruit/career/job-categories/
- J9 [공식] LY 채용 FAQ — https://www.lycorp.co.jp/ja/recruit/faq/
- J10 [보도] LINE Plus 외부 채용 중단(2025-11-14) — https://news.mtn.co.kr/news-detail/2025111401255169165
- J11 [공식] LY 한국인 특별전형(2025-01-10, 대학 게시판 재게시) — https://www.dongseo.ac.kr/kr/index.php?pCode=MN2000360&viewMode=dsu&mode=view&idx=98177
- J12 [보도] Rakuten TOEIC 800(2024-11-11) — https://biz-journal.jp/company/post_384687.html
- J13 [공식] Rakuten 2027 신졸 엔지니어 언어 요건 — https://global.rakuten.com/corp/careers/graduates/recruit_engineer/
- J14 [데이터] TokyoDev 설문 2025 — https://2025.surveys.tokyodev.com/en-US
- J15 [보도] Indeed 감원 — https://en.wikipedia.org/wiki/Indeed , https://www.itmedia.co.jp/news/articles/2507/14/news073.html
- J16 [후기] Indeed SWE 면접 — https://www.interviewquery.com/interview-guides/indeed-software-engineer
- J17 [데이터] levels.fyi 도쿄 회사별 — https://www.levels.fyi/t/software-engineer/locations/greater-tokyo-area
- J18 [공식] Kraken Technologies Japan 공고(2026-07) — https://japan-dev.com/jobs/kraken-technologies/kraken-technologies-software-engineer-backend---pythondjango-iesupq

**한국인 사례**
- K1 [후기, 인터뷰] 멘트리(2022-07) — https://mentree.club/mentor/interviews/2085
- K2 [후기, 인터뷰] 멘트리(2025-09) — https://mentree.club/mentor/interviews/2173
- K3 [후기] 본인 사이트 — https://me.jiho-ml.com/
- K5 [후기] Google Japan 면접 탈락기(2019-10-23) — https://17th-floor.tistory.com/17
- K6 [후기] Amazon 일본 탈락기(2026-07-18) — https://gall.dcinside.com/mgallery/board/view/?id=jobjapan&no=50683
- K7 [후기] PayPay 면접기(2023-07) — https://actumn.tistory.com/127
- K [후기 모음] 나머지 13건: AWS Japan 서포트 엔지니어 https://kin-archive.tistory.com/602 , 외자계 SA https://gall.dcinside.com/mgallery/board/view/?id=jobjapan&no=11383 , LY 백엔드 https://mentree.club/mentor/seungkishin , 영어·일본어 혼용 회사 https://arca.live/b/japanrecruit/174769947 등

**프로필 (저장소)**
- P 이력서·포트폴리오 [resume-feed-infra.md](resume/resume-feed-infra.md) · [portfolio-feed-infra.md](resume/portfolio-feed-infra.md),
  [GAPS.md](resume/GAPS.md) 142·794·795행, [cs/README.md](../cs/README.md) 85~124행,
  [daangn-feed-infra.md](daangn/daangn-feed-infra.md) 412~417행, `~/Desktop/project/live-coding-practice`
