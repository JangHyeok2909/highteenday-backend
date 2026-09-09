# 클로드 코드로 이력서·포트폴리오를 사람 글로 만드는 법

> 조사 시점: **2026-09-06**. 출처 22곳(맨 아래).
> 답하는 질문: **"AI를 써서 만든 서류가 왜 사람에게 안 읽히고, 어떻게 써야 읽히는가."**
> 신뢰도: **[출처]** = 링크한 글에서 읽은 것. **[통계]** = 조사 기관이 발표한 수치. **[판단]** = 이 저장소 상황에 맞춘 내 해석.
> 자매 문서: [resume/GAPS.md](resume/GAPS.md) P장·Q장(지금 원고의 문제), 루트 `CLAUDE.md` Documentation Rules, `docs/WRITING.md`(문장 규칙과 검사 스크립트).

---

## 0. 결론 다섯 줄

1. **걸리는 것은 범용 문장이다.** 기업은 AI 작성 여부를 잘 가리지 못한다. 실제로 거르는 것은 "구체성 없는 문장"이다. [출처: 오픈위키, SBS Biz, Anthropic]
2. **초안은 본인이 쓴다.** Anthropic 자체 채용 안내가 이렇게 말한다. *"Please create your first draft yourself, then use Claude to refine it."* 클로드의 자리는 인터뷰어, 검산기, 심사위원, 조판기다. [출처: Anthropic]
3. **읽는 사람은 7초, 30초, 1분 단위로 훑는다.** 첫 화면과 제목이 서류의 전부다. 본문은 그 뒤에 "다시 보기로 한" 사람만 읽는다. [출처: Ladders, 링커리어, 브런치]
4. **문장 뼈대는 하나다.** 문제 → 근거 → 판단(버린 대안) → 결과(수치). 원티드 공식, Google XYZ, PAAR, STAR가 전부 같은 뼈대다. 이 뼈대에 본인 목소리가 얹혀야 사람 글이 된다. [출처]
5. **완성은 심사로 정한다.** 맥락 없는 심사자 여럿이 점수와 이유를 내고, 점수가 멈출 때까지 고친다. 이 저장소가 O장에서 한 맹검 평가가 이미 이 방식이다. [출처: claude-resume-kit, Interview Guys, Anthropic 검증 원칙]

---

## 1. 읽는 사람은 어떻게 읽나

| 누가 | 얼마나 | 무엇을 먼저 | 출처 |
|---|---|---|---|
| 리크루터 첫 스캔 | 7.4초 | 현재 직함·회사 → 이전 직함 → 재직 기간 → 학력. F자·E자 패턴으로 훑는다 | [Ladders 아이트래킹 2018](https://www.theladders.com/career-advice/you-only-get-6-seconds-of-fame-make-it-count) |
| 채용 매니저 | 약 7초 판정 후 계속 볼지 결정 | 결과 중심 불릿. 서브불릿은 읽지 않는다 | [Orosz 서평](https://www.sandordargo.com/blog/2022/05/21/the-tech-resume-by-gergely-orosz) |
| 국내 실무자 | 30초 이내 | 핵심 정보 압축 여부 | [링커리어 현직자 Q&A](https://community.linkareer.com/employment_data/5131846) |
| 포트폴리오 심사자 | 1분 내외 | 첫 장 아키텍처 다이어그램과 핵심 수치 | [브런치 주간취업](https://brunch.co.kr/@1stprize/3) |
| 개발자 면접관 | 5~10분 | 기술 목록보다 "어떤 문제를 어떤 기준으로 해결했나" | [점핏](https://jumpit.saramin.co.kr/contents/450), [잡코리아](https://www.jobkorea.co.kr/recruit/careers/articles/developer-resume-guide) |

**잘 읽힌 서류의 공통점** [Ladders]: 단순 레이아웃, 명확한 섹션 제목, 굵은 직함, 불릿 성과. **못 읽힌 서류**: 다단 배치, 여백 없음, 긴 문장, 제목 없음, 시선이 아래로 흐르지 않는 글.

**ATS 신화** [[Orosz 샘플 장](https://thetechresume.com/samples/ats-myths-busted)]: 2020년 기준 주요 ATS 중 이력서를 자동 탈락시키는 것은 없다. 파싱은 검색과 자동 입력용이다. PDF가 가장 안전하다. "ATS를 뚫는 최적화"는 기술직에서 대부분 허구다.

**국내 회사가 명시한 것.** 토스는 *"경험 속에서의 임팩트 및 러닝 포인트"* 와 *"자세한 내용을 담아달라"* 고 요청한다 [[토스 안내 정리](https://inthiswork.com/archives/277843)]. 당근 지원자 회고는 *"채용 공고의 핵심 키워드에 맞춰 내 경험을 1:1로 매칭"* 과 *"맥락과 문제 해결 과정을 자세히"* 를 통한 요인으로 꼽는다 [[당근 면접 회고](https://gist.github.com/taekwon-dev/0572459638d2cc7c9b1e499401f8eba4)].

**시사점** [판단]: 시간 예산이 세 겹이다. 7초에 걸릴 것(이름·직함·핵심 수치 3개)은 첫 화면에, 30초에 걸릴 것(프로젝트 제목과 결과 한 줄)은 소제목에, 1분 뒤에 읽힐 것(과정과 대안)은 본문에 둔다. 지금 축약본은 세 겹이 전부 본문에 있다.

---

## 2. AI 티는 어디서 나나

### 2.1 통계 [통계]

| 수치 | 뜻 | 출처 |
|---|---|---|
| 2025년 제출 자소서의 64.4%가 AI 작성, 전 문항 AI 작성은 8.9% → 20.6% | AI 초안은 이미 기본값이다 | [SBS Biz](https://biz.sbs.co.kr/article/20000162957) 인용 조사 |
| 2026년 Z세대 구직자 91%가 자소서에 AI 활용, 53%가 "자소서 변별력이 사라졌다" | 같은 문장이 수천 장 들어온다 | [진학사 캐치 2026-04](https://v.daum.net/v/20260412080025762) |
| 기업 65.4%가 AI 작성 확인 시 감점(42.2%) 또는 불합격(23.2%) 의향 | 걸리면 손해 | 같은 SBS Biz 기사 |
| 기업 대부분이 AI 작성 여부를 판별하지 못한다 | 걸리는 것은 다른 지원자와 같아진 문장이다 | 같은 기사, [오픈위키](https://wikidocs.net/blog/@openwiki/24155/) |

### 2.2 신호 목록

영어권 편집자 목록과 국내 채용 담당자 목록, 이 저장소에서 실제로 나온 것을 합쳤다. 하나면 취향이고 겹치면 문체다.

| 신호 | 예 | 출처 |
|---|---|---|
| 대비 구문 "X가 아니라 Y" | "코드가 아니라 포화" | [Wikipedia Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing), GAPS Q-2 |
| 3항 나열 강박 | "세 겹", "네 층", "세 관문" | Wikipedia |
| 줄표·굵게 남용 | 문서당 줄표 69개, 굵게 297곳 | Wikipedia, GAPS Q-1 |
| 의의 부풀리기·일반론 결론 | "처음부터 끝까지 만들어 봤다는 것입니다" | Wikipedia |
| 번역투 | "~에 대한", "~를 통해", "~에 있어서" | 오픈위키 |
| 추상 미사여구 | "열정", "도전정신", "글로벌 역량" | 오픈위키 |
| 과도한 긍정, 문장 구조 반복 | 매 문장이 업적 | 오픈위키 |
| 영어 슬롭 어휘 | leverage, spearhead, robust, seamless, delve, landscape | [Interview Guys](https://blog.theinterviewguys.com/claude-resume-prompts/), [draft-reviewer](https://github.com/aplaceforallmystuff/claude-draft-reviewer) |
| 절 끝 경구, 자기 언급, 이중 제목 | "이 기록이 본문입니다", "원인. 지표는 다 있었고" | GAPS P-2, Q-2 |
| 날것 없음 | 캡처 0, 로그 0, 날짜 0 | GAPS Q-2 |
| 어조 급변 | 한 문단만 "…라고 생각합니다" | Wikipedia, GAPS Q-9 |

### 2.3 자기 검사 세 가지

- **소리 내어 읽는다.** 말로 하지 않을 표현은 글에서도 뺀다. [[Microsoft 스타일](https://learn.microsoft.com/en-us/style-guide/top-10-tips-style-voice)]
- **면접에서 3분간 설명할 수 있는 문장만 남긴다.** 설명 못 하면 감점 요인이다. [오픈위키]
- **본인 수치와 실패 경험을 20% 이상 직접 넣는다.** AI 구조에 본인 데이터를 얹는 것이 유일한 차별점이다. [오픈위키]

---

## 3. 무엇을 쓰나

### 3.1 이력서 구조 [출처]

국내 공개 이력서와 가이드가 수렴하는 순서다.

| 순서 | 내용 | 분량 | 근거 |
|---|---|---|---|
| 인적사항 | 이름, 연락처, GitHub, 블로그. 사진·주소·생년월일 없음 | 2줄 | [워니](https://wonny.space/writing/work/engineer-resume), [Awesome_Resume_Portfolio](https://github.com/codingmonster-tv/Awesome_Resume_Portfolio) |
| 소개 | 무엇을 해 왔는가 + 가장 강한 사실 하나 | 2~5줄 | 워니, [이동욱](https://jojoldu.github.io/) |
| 경력 | 최신순. 회사·직함·기간·규모 → 성과 불릿 | 불릿 3~5개 | 이동욱, Orosz |
| 프로젝트 | 중요도순. 신입은 1~3개, 최대 5개 | 항목당 불릿 3~5개 | [우아한형제들 신입](https://techblog.woowahan.com/11998/), 링커리어 |
| 기술 | 지원 직무 관련만. 숙련도 표시 없음 | 2~3줄 | 워니, Orosz |
| 학력·자격 | 학교·전공·기간 | 1~2줄 | 워니 |

분량은 신입 1쪽, 경력 2쪽이 통념이고 Orosz는 경력자의 2쪽 이상을 허용한다. 우아한형제들 이직자는 5쪽을 썼다. 첫 장에 경력 타임라인 그래프, 4쪽에 문제 해결 사례 두 개를 두었고, 그것을 *"집중해서 볼 수 있는 최대 분량"* 이라고 적었다 [[우아한형제들 이직자](https://techblog.woowahan.com/2531/)].

### 3.2 실제로 고쳐 본 사람들이 배운 것 [출처]

| 누가 | 시작 | 끝 | 받은 피드백 |
|---|---|---|---|
| [imksh v0→v4](https://imksh.com/120) | 7쪽 | 객관 데이터만 남긴 1~2쪽 | "뭐에 집중해야 할지 모르겠다", "너무 상세해서 포트폴리오 같다", 하이퍼링크 과다 |
| [우아한형제들 신입](https://techblog.woowahan.com/11998/) | PPT 이력서, 서류 합격 1회 | 노션, 프로젝트 1개, STAR | "읽어도 궁금증이 안 남는다", 모르는 기술을 써서 면접에서 답 못 함, "링크가 너무 많으면 읽기 힘들다" |
| [velog 피드백 반영](https://velog.io/@prettylee620/%EC%9D%B4%EB%A0%A5%EC%84%9C-%ED%94%BC%EB%93%9C%EB%B0%B1-%EB%B0%9B%EC%9D%80-%EA%B2%83%EC%9D%84-%EA%B8%B0%EB%B0%98%EC%9C%BC%EB%A1%9C-%EA%B3%A0%EC%B3%90%EB%B3%B4%EA%B8%B0-1%EC%B0%A8feat.-%EC%9D%B4%EB%A0%A5%EC%84%9C-%EC%93%B0%EB%8A%94-%EB%B2%95) | "유지보수 및 이벤트 페이지 개발을 담당" | "배포 체크리스트 구축으로 배포 오류 50% 감소" | 기여와 개선을 명확히, 협업은 방식(코드 리뷰·Jira)으로, 진행 중 활동은 빼라 |

우아한형제들 신입의 결론 세 줄은 그대로 규칙이 된다. *"절대 한 번에 완성시키지 말자"*, *"이력서를 꼭 남에게 보여줘야 한다"*, *"좋은 이력서 기준은 회사마다, 팀마다, 사람마다 다르다."*

### 3.3 포트폴리오 구조 [출처]

| 순서 | 내용 | 근거 |
|---|---|---|
| 첫 장 | 시스템 아키텍처 다이어그램 한 장 + 프로젝트 카드(기간·팀·역할·스택·링크) | 브런치, [김재녕 가이드](https://jaenyeong.github.io/resume/guide/) |
| 프로젝트 상세 | 기술 선택 근거, 담당 범위, 테스트·CI | 브런치 |
| 트러블슈팅 | 문제 → 원인(근거) → 해결(대안 비교) → 결과(수치). 오타·설정 오류급은 싣지 않는다 | 브런치, [ibatstudio](https://www.ibatstudio.com/%EB%B0%B1%EC%97%94%EB%93%9C-%EA%B0%9C%EB%B0%9C%EC%9E%90-%EC%9D%B4%EB%A0%A5%EC%84%9C-%EA%B8%B0%EC%88%A0-%EB%82%98%EC%97%B4%EB%B3%B4%EB%8B%A4-%EC%A4%91%EC%9A%94%ED%95%9C-%EB%AC%B8%EC%A0%9C-%ED%95%B4/) |
| 회고·한계 | 무엇이 남았나 | 김재녕 |
| 분량 | 프로젝트 하나에 6~10쪽. PDF | 김재녕, 링커리어 |

이력서와 포트폴리오의 분담은 이 저장소 `resume/README.md`가 이미 정한 대로다. 이력서는 메뉴판, 포트폴리오는 근거.

---

## 4. 문장 공식

### 4.1 뼈대는 하나다 [출처]

| 이름 | 공식 | 출처 |
|---|---|---|
| 원티드 합격 이력서 | 어떤 문제를 / 어떤 기술로 / 어떻게 해결했는지(수치 필수) | [원티드](https://www.wanted.co.kr/events/article_23_06_28) |
| Google XYZ | Accomplished X as measured by Y by doing Z | [Teal](https://www.tealhq.com/post/xyz-resume) 등 |
| PAAR | Problem → Analyze(대안) → Action → Result. *"Action보다 Analyze 중시"* | [서치라이트 2026](https://blog.searchright.net/developer-career-description-examples/) |
| 문제·원인·접근·결과 | 원인의 근거는 로그, 지표, 실행 계획, 부하 테스트 | ibatstudio |
| STAR | 상황 → 과제 → 행동 → 결과 | 우아한형제들 신입 |

네 공식의 공통 뼈대: **무엇이 문제였나 → 무엇을 근거로 판단했나 → 무엇을 골랐고 무엇을 버렸나 → 숫자로 무엇이 달라졌나.** 이 저장소의 최적화 기록(OPT)과 ADR이 이미 이 순서다. 원고에 옮길 때 순서만 지키면 된다.

### 4.2 예문 [출처, 원문 그대로]

| 나쁜 예 | 좋은 예 | 출처 |
|---|---|---|
| 게시글 조회 API 개발 | 게시글 목록 조회 시 불필요한 연관 데이터 로딩으로 응답 지연이 발생해 쿼리 로그와 실행 계획을 분석했고, 조회 전용 DTO와 인덱스 조정을 통해 평균 응답 시간을 개선 | ibatstudio |
| 주문 API 응답 속도 개선을 위한 Redis 캐시 적용 | 피크 타임 주문 요청 증가로 API 응답 지연 발생 → Memcached 대비 데이터 구조 유연성 고려해 Redis 선택 → 응답 속도 1.8초 → 420ms 단축 | 서치라이트 |
| 코드리뷰를 담당했습니다 | 배포 전 리뷰에서 N+1 쿼리를 발견하고, 트래픽 특성에 맞게 DB 호출 구조를 개선했습니다 | 잡코리아 |
| (책임 나열) | 이력서 페이지 리렌더링 최적화 (as-is: 30번, to-be: 10번) | 원티드 |
| 테스트가 느렸다 | 모킹 제거, 로깅 옵션 생성 → 테스트 속도 8초 → 4초 단축 | 우아한형제들 신입 |

### 4.3 쓰지 않을 말

- 영어권 슬롭 어휘: leverage, utilize, spearhead, navigate, harness, elevate, robust, seamless, dynamic, innovative, strategic, holistic, synergy. [Interview Guys]
- 국내 번역투와 미사여구: "~에 대한", "~를 통해", "~에 있어서", 열정, 도전정신, 글로벌 역량. [오픈위키]
- 이 저장소에서 확인된 것: 절 끝 경구, 문서 자기 언급, "라벨 — 경구" 이중 제목, 프로젝트 안에서 만든 말(장부·사슬·관문·미끼·운용점), 내부 식별자. [GAPS P-4, Q-7]
- 근거 없는 숫자. Interview Guys 프롬프트 7은 *"suggest reasonable estimates based on typical industry benchmarks"* 라고 하는데, 이 저장소에서는 금지다. 수치는 run-id나 문서 경로가 있는 것만 쓴다.

---

## 5. 클로드 코드는 무엇을 맡나

### 5.1 원칙 [출처]

Anthropic이 지원자에게 주는 안내가 기준이다 [[Anthropic candidate AI guidance](https://www.anthropic.com/candidate-ai-guidance)].

- 허용: *"Please create your first draft yourself, then use Claude to refine it."* 예시 프롬프트는 *"Please review my resume and the job description. Identify the experiences I should highlight."*
- 금지: 없는 경험을 만드는 것. *"Use AI to refine your ideas, not replace them."*

Anthropic의 Claude Code 안내 두 가지도 그대로 쓴다 [[Best practices](https://code.claude.com/docs/en/best-practices)]. 하나는 **인터뷰 패턴**이다. *"Interview me in detail using the AskUserQuestion tool. Ask about technical implementation, edge cases, concerns, and tradeoffs. Don't ask obvious questions, dig into the hard parts."* 다른 하나는 **검증을 줄 것**이다. *"Give Claude a check it can run."* 문서에서는 문장 검사 스크립트와 맹검 심사가 그 검증이다.

### 5.2 네 가지 역할 [판단]

| 역할 | 클로드가 하는 일 | 근거가 되는 사례 |
|---|---|---|
| **인터뷰어** | 본인이 쓰기 전에 사실을 캐낸다. 그때 화면에 무엇이 떠 있었나, 처음 의심한 것은, 버린 대안은, 숫자 출처는, 지금 다시 하면 | Anthropic 인터뷰 패턴, [resume-tailoring-skill](https://github.com/varunr89/resume-tailoring-skill)의 experience discovery interview |
| **검산기** | 숫자마다 출처, 백분율 검산, 같은 비교 두 숫자, 용어 첫 등장 정의, 링크 생존 | [claude-resume-kit](https://github.com/ARPeeketi/claude-resume-kit)의 provenance flags·verb discipline·corrections log |
| **심사위원** | 맥락 0인 새 컨텍스트에서 페르소나 여럿이 점수와 이유를 낸다 | claude-resume-kit의 5 personas × 8 dimensions, Interview Guys의 roast 프롬프트, [writing-reviewer](https://mcpmarket.com/tools/skills/writing-reviewer)의 fresh subagent |
| **조판·검사기** | 원고 하나에서 변형 빌드, 쪽수·목록·링크 검사, 문장 지표 측정 | [Resume as Code](https://www.nathanfox.net/p/resume-as-code-how-i-manage-my-resume), `docs/WRITING.md` 6장 |

### 5.3 클로드에게 시키지 않을 것 [판단]

- **초안 산문.** 이 저장소의 첫 원고가 그렇게 만들어졌고, 표면을 세 번 고쳐도 AI 생성물로 읽혔다(GAPS Q-1). 문장은 본인 손에서 나와야 한다.
- **"더 좋게 써 줘."** 범용 문장으로 수렴한다. 요청은 항상 검사 가능한 것으로 한다. "70자 넘는 문장을 표시해", "출처 없는 숫자를 표시해".
- **수치 추정.** 없는 숫자는 없다고 쓴다.
- **어조 변경.** 본인이 쓴 문장은 오타와 길이만 고친다(루트 CLAUDE.md 규칙).

### 5.4 Resume as Code에서 빌릴 관행 [출처]

[Nathan Fox](https://www.nathanfox.net/p/resume-as-code-how-i-manage-my-resume)의 구성을 이 저장소 `resume/`에 맞게 옮기면 이렇다.

| 관행 | 내용 | 이 저장소 |
|---|---|---|
| 조각 파일 | 경력·프로젝트·기술을 파일 하나씩. 변형은 조각 목록만 | 지금은 원고 두 개(이력서·축약본)가 통짜다 |
| CLAUDE.md 정정 기록 | *"every time you correct the agent, write the correction into CLAUDE.md so it sticks"* | 루트 CLAUDE.md Documentation Rules, GAPS P-4·Q-7 |
| 빌드 검사 | 쪽수 초과 경고, 안 쓰는 조각 경고 | `build.js`에 쪽수 경고 없음 |
| 지원 기록 | 날짜·회사·직무·변형·커밋 SHA | `applications.md` 없음 |
| 공고 보관 | `postings/<변형>.md` | `daangn/daangn-feed-infra.md`가 그 역할 |

---

## 6. 작업 절차

각 단계에 클로드에게 줄 요청을 붙였다. 요청은 전부 검사 가능한 형태다. [판단]

**0. 재료를 모은다.** 공고 원문, 성능 기록(run-id·문서 경로), 본인이 직접 쓴 글 두세 편(어조 표본). draft-reviewer는 이것을 `VOICE.md`로 두고 "Voice Match" 점수를 낸다.

**1. 인터뷰.** 사례 하나당 30분. 클로드가 묻고 본인이 답한다. 결과는 **사실 목록**이다. 문장은 아직 쓰지 않는다.
> "이 사례에 대해 AskUserQuestion으로 인터뷰해. 언제, 무엇을 보고, 처음 무엇을 의심했고, 무엇을 버렸고, 숫자는 어디서 왔는지. 뻔한 질문은 빼고 어려운 부분만 파. 끝나면 사실 목록을 출처와 함께 표로 정리해."

**2. 초안은 본인이 쓴다.** 사실 목록을 보고, 타이머 30분, 말하듯이. 클로드는 열지 않는다. Anthropic 안내와 우아한형제들 신입의 결론이 같은 말을 한다.

**3. 구조 편집만 맡긴다.** 순서, 중복, 분량. 문장은 손대지 않게 한다.
> "문장은 한 글자도 바꾸지 마. 순서와 중복만 봐. 7초에 읽혀야 할 것이 첫 화면에 있는지, 같은 말이 두 번 나오는지, 소제목만 읽어도 결과가 보이는지 표로 보고해."

**4. 검산.**
> "숫자마다 출처(run-id 또는 문서 경로)를 찾아 표로. 출처 없는 것, 문서 안에서 검산이 안 맞는 백분율, 같은 비교에 두 숫자, 처음 나오는데 정의 없는 용어를 표시해."

**5. 문장 검사.** `docs/WRITING.md` 6장 스크립트를 돌린다. 70자 초과, 대비 구문, 교훈, 상호참조, 줄표. 그다음 본인이 소리 내어 읽는다.

**6. 맹검 심사.** 새 컨텍스트, 원고와 공고만.
> "이 프로젝트를 전혀 모르는 심사자다. 다섯 사람이 각각 1~10점과 이유 세 문장: ① 30초만 훑는 리크루터 ② 채용 매니저 ③ 기술 리더 ④ 회의론자(무너뜨릴 질문 5개) ⑤ AI 문체 감식가. 서류 합격 확률을 %로."
점수가 두 번 연속 멈추면 끝낸다. 지적은 "고칠 것"과 "면접 답변으로 넘길 것"으로 가른다. 이 저장소 O장이 이미 한 번 이 방식을 썼고 30%가 나왔다.

**7. 빌드하고 눈으로 본다.** PDF를 실제로 연다. 목록 기호, 굵게, 제목 오타, 쪽수. 그다음 **사람에게 보여준다.** 현직자 한 명이면 된다.

**8. 회사별 변형.** 공고 줄마다 어느 사실로 답하는지 1:1로 매핑한다(당근 회고). 조각 파일 구성이면 순서만 바꾼다. 지원 기록에 날짜·변형·커밋을 남긴다.

---

## 7. 지금 원고에 적용하면 [판단]

| 진단 (GAPS Q장) | 해당 단계 | 할 일 |
|---|---|---|
| 문장이 AI 생성물로 읽힌다. 표면을 고쳐도 골격이 남는다 | 2 | 사례 셋을 사실 목록에서 본인이 다시 쓴다. 문장 단위 재작성으로는 안 풀렸다 |
| 주어가 프로젝트다. 사람은 10장에서 나온다 | 3 | 첫 화면에 사람·역할·수치 3개. 1.1 개요 표가 그 방향으로 가고 있다 |
| 숫자 걸림(57%, 38배·43배, 3.9·4) | 4 | 축약본은 고쳤다. 마스터본은 남아 있다 |
| 캡처 0, 링크 2 | 0·7 | Grafana 패널, k6 요약, 실패 테스트 출력 각 1장 |
| 계측 시스템 설명 부재 | 3 | 3장 그림과 표를 넣었다(2026-09-06) |
| 맹검 30% | 6 | 위 다섯 페르소나로 다시 돌린다. 이번에는 축약본 전문으로 |

이력서 2쪽은 통념 안이다. 포트폴리오 11쪽은 김재녕 기준(6~10쪽) 위이고 판정표 권장(8~9쪽) 위다. 배포 구성 그림(62행)을 빼면 맞는다.

---

## 8. 도구와 스킬 [출처]

전부 영어권·ATS 지향이라 **규칙만 빌리고 산문은 쓰지 않는다.** 국문 이력서에 그대로 쓰면 번역투가 생긴다.

| 도구 | 무엇 | 빌릴 것 | 주의 |
|---|---|---|---|
| [claude-resume-kit](https://github.com/ARPeeketi/claude-resume-kit) | 논문 기반 이력서 생성 | provenance flags(published/under review/internal), verb discipline, corrections log, 5 personas × 8 dimensions 새 컨텍스트 심사, 금지어·구조 안티패턴·12항목 사후 검사 | LaTeX, 영어 |
| [resume-tailoring-skill](https://github.com/varunr89/resume-tailoring-skill) | 공고 맞춤 | 분기형 discovery interview, 공고 커버리지 % 산출, 빈틈을 숨기지 않고 표시, 체크포인트에서 사람이 고름 | 영어 |
| [claude-draft-reviewer](https://github.com/aplaceforallmystuff/claude-draft-reviewer) | 초안 검토·수정 에이전트 | `VOICE.md` 어조 표본, Slop Score·Craft Score·Voice Match 수치 보고 | 영어 슬롭 사전 |
| [writing-prose-like-a-human](https://github.com/kylehughes/writing-prose-like-a-human-for-agents) | 사람 글 규칙 스킬 | 다섯 규칙: cut significance inflation, use plain verbs, end sentences at the fact, vary rhythm, earn every adjective | 영어 |
| [writing-reviewer](https://mcpmarket.com/tools/skills/writing-reviewer) | 장문 진단 | 모든 지적에 원문 인용을 붙이는 Iron Law, 절·전환·전체 3단 진단, 새 서브에이전트로 저자 편향 제거 | 영어 |
| [resume-builder-skill](https://github.com/dabydat/resume-builder-skill) | Harvard·r/EngineeringResumes 규칙 | XYZ 불릿, 단일 컬럼, 5초 스캔 검사, *"A resume is not an autobiography. It's a marketing document."* | 영어 서식 |
| [Resume as Code](https://www.nathanfox.net/p/resume-as-code-how-i-manage-my-resume) | 마크다운→PDF 관리 | 조각 파일, 변형 레시피, CLAUDE.md 정정 기록, 지원 로그 | 이 저장소 `build.js`와 같은 방식 |
| [Interview Guys 25 프롬프트](https://blog.theinterviewguys.com/claude-resume-prompts/) | 프롬프트 모음 | roast 프롬프트, 내부 일관성 검사(시제·날짜·병렬 구조), 반복 동사 검사 | "수치 추정" 프롬프트는 쓰지 않는다 |

---

## 출처

- Anthropic, [How to collaborate with Claude during our hiring process](https://www.anthropic.com/candidate-ai-guidance)
- Anthropic, [Best practices for Claude Code](https://code.claude.com/docs/en/best-practices)
- Ladders, [You have 7.4 seconds to make an impression](https://www.theladders.com/career-advice/you-only-get-6-seconds-of-fame-make-it-count)
- Sandor Dargo, [The Tech Resume Inside Out 서평](https://www.sandordargo.com/blog/2022/05/21/the-tech-resume-by-gergely-orosz) · Orosz, [ATS myths busted](https://thetechresume.com/samples/ats-myths-busted)
- Wikipedia, [Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing)
- 오픈위키, [AI 자기소개서 제대로 쓰는 법 (2026)](https://wikidocs.net/blog/@openwiki/24155/)
- SBS Biz, [AI 자소서 걸리면 불합격?…기업들 대부분 판별 못한다?](https://biz.sbs.co.kr/article/20000162957) · 다음, [10명중 9명 "자소서 AI로 썼다"](https://v.daum.net/v/20260412080025762)
- 원티드, [원티드에서 합격한 개발자 이력서 합격 키워드](https://www.wanted.co.kr/events/article_23_06_28)
- 서치라이트, [개발자 경력기술서 예시(2026)](https://blog.searchright.net/developer-career-description-examples/)
- ibatstudio, [백엔드 개발자 이력서, 기술 나열보다 중요한 문제 해결 경험 정리법](https://www.ibatstudio.com/%EB%B0%B1%EC%97%94%EB%93%9C-%EA%B0%9C%EB%B0%9C%EC%9E%90-%EC%9D%B4%EB%A0%A5%EC%84%9C-%EA%B8%B0%EC%88%A0-%EB%82%98%EC%97%B4%EB%B3%B4%EB%8B%A4-%EC%A4%91%EC%9A%94%ED%95%9C-%EB%AC%B8%EC%A0%9C-%ED%95%B4/)
- 잡코리아, [면접관이 꽂히는 경력직 개발자 이력서의 비밀](https://www.jobkorea.co.kr/recruit/careers/articles/developer-resume-guide)
- 브런치, [[주간취업] 개발자 포트폴리오 합격 전략](https://brunch.co.kr/@1stprize/3)
- 링커리어, [개발자 이력서 작성법 현직자 Q&A](https://community.linkareer.com/employment_data/5131846)
- 우아한형제들, [이직초보 어느 개발자의 이력서 만들기](https://techblog.woowahan.com/2531/) · [왕초보 신입 개발자의 우당탕탕 이력서 작성기](https://techblog.woowahan.com/11998/)
- imksh, [개발자 이력서 작성 및 변화 과정 (이력서 공개)](https://imksh.com/120) · velog, [이력서 피드백 받은 것을 기반으로 고쳐보기](https://velog.io/@prettylee620/%EC%9D%B4%EB%A0%A5%EC%84%9C-%ED%94%BC%EB%93%9C%EB%B0%B1-%EB%B0%9B%EC%9D%80-%EA%B2%83%EC%9D%84-%EA%B8%B0%EB%B0%98%EC%9C%BC%EB%A1%9C-%EA%B3%A0%EC%B3%90%EB%B3%B4%EA%B8%B0-1%EC%B0%A8feat.-%EC%9D%B4%EB%A0%A5%EC%84%9C-%EC%93%B0%EB%8A%94-%EB%B2%95)
- 워니, [개발자 이력서 작성하기](https://wonny.space/writing/work/engineer-resume) · [이동욱 이력서](https://jojoldu.github.io/) · [Awesome_Resume_Portfolio](https://github.com/codingmonster-tv/Awesome_Resume_Portfolio) · [김재녕 가이드](https://jaenyeong.github.io/resume/guide/)
- 토스 안내 정리, [토스에서 알려주는 개발자 이력서 작성법](https://inthiswork.com/archives/277843) · [당근 직무 면접 회고](https://gist.github.com/taekwon-dev/0572459638d2cc7c9b1e499401f8eba4)
- Microsoft, [Top 10 tips for style and voice](https://learn.microsoft.com/en-us/style-guide/top-10-tips-style-voice)
- 도구: 위 8절 표의 링크
