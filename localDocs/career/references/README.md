# 이력서·포트폴리오 레퍼런스 — 해외 뼈대와 국내 문체, 무엇을 왜 모았고 어떻게 쓰는가

> 만든 날: 2026-09-07 · 대상 직군: **백엔드·인프라** · 근거의 출처: **뼈대는 해외(미국·캐나다·영국), 문체는 국내 실물·지침**
> 이 디렉터리가 답하는 질문: **"이력서와 포트폴리오의 뼈대를 무엇에 맞춰야 하고, 그 근거는 어디에 있는가?"**
> 원고 자체는 [../resume/](../resume/)에 있다. 국내 통념과의 대조는 [../resume/GAPS.md](../resume/GAPS.md) K장이다.

---

## 먼저 읽을 것

| 문서 | 답하는 질문 |
|---|---|
| **[rules-resume.md](rules-resume.md)** | 이력서 뼈대를 어떻게 따르는가. 한 장짜리 뼈대, 규칙별 출처, 현재 원고 대조표, 출처가 갈리는 곳의 판정 |
| **[rules-portfolio.md](rules-portfolio.md)** | 포트폴리오 뼈대를 어떻게 따르는가. 3층 구조, 사건 문서(장)의 12단계, 현재 원고 대조표 |
| **[rules-korean-prose.md](rules-korean-prose.md)** | **문장을 어떻게 쓰는가.** 원고가 AI스럽게 읽히는 이유의 계측 근거, 쓰지 않는 것 12가지와 교정 예, 문체 체계, 한국식 뼈대, 출처 충돌 판정. **원고에 손대기 전에 먼저 읽는다** |

레퍼런스 원문은 규칙의 근거가 필요할 때만 연다.

## 선정 기준

1. **심사하는 쪽이 쓴 것**을 규칙의 근거로 삼았다. Uber·Skyscanner 하이어링 매니저(Orosz), Meta 면접관(Tay), Google 인사 총괄(Bock), 채용에 참여한 시니어(Comeau). 이력서 작성 서비스의 "예시 모음"은 쓰지 않았다.
2. **실물**을 형식의 근거로 삼았다. 현역 인프라 엔지니어의 공개 이력서(Xe Iaso), 가장 많이 쓰이는 템플릿 넷의 샘플 본문(Jake·sb2nov·Deedy·Awesome-CV), 성능·인프라 엔지니어의 개인 사이트와 조사 글(Gregg·Luu·Rose·Evans·Hashimoto).
3. **표준 문서 형식**을 포트폴리오 장의 근거로 삼았다. Google SRE 포스트모템, Nygard ADR, *Kubernetes The Hard Way* README.
4. **유명인의 이력서를 이력서 규칙의 근거로 쓰지 않았다.** 유명 엔지니어는 이력서가 필요 없어서 공개하지 않거나(Gregg·Luu·Hashimoto), 공개해도 통념을 어긴다(Xe Iaso의 키워드 31개). 유명인 자료는 **포트폴리오 구조**의 근거로만 썼다.
5. 예외 하나: [resume/07-awesome-cv-daangn-sre.md](resume/07-awesome-cv-daangn-sre.md)의 저자는 한국인이다. 템플릿이 국제 표준(스타 2만 8천)이고 샘플이 **당근 인프라 조직의 실제 경력**이라 도메인 어휘의 근거로 넣었다. 문서 머리에 예외임을 적었다.
6. **한국어 표현·문체의 근거는 국내 자료에서 가져왔다 (2026-09-07 추가).** 해외 자료 14건은 구조를 말해 주지만 한국어 문장이 자연스러운지는 말해 주지 못한다. 그래서 국내 백엔드 개발자의 공개 이력서 실물 4편([resume/08](resume/08-korean-backend-resumes.md))과 국내 채용 담당자·현직자 지침([resume/09](resume/09-korean-hiring-guides.md))을 따로 두었다. 실물은 `9j/awesome-korean-resume` 등재본 3편과 검색으로 찾은 경력 백엔드 1편이다.

## 레퍼런스 목록

### 이력서 (해외 7 + 국내 2)

| 파일 | 무엇 | 왜 모범 사례인가 | 여기서 가져온 규칙 |
|---|---|---|---|
| [resume/01-pragmatic-engineer.md](resume/01-pragmatic-engineer.md) | Gergely Orosz의 템플릿(.docx 본문), 원본 14쪽 가이드, 무료 장 2개 | 하이어링 매니저가 쓴 유일한 체계적 가이드. 기여자 17명. r/EngineeringResumes가 기준으로 인용 | 섹션 뼈대, 첫 눈 5가지, 불릿 공식과 편집 지침, 마스터본·맞춤본, 점검표 12 |
| [resume/02-engineering-resumes-wiki.md](resume/02-engineering-resumes-wiki.md) | r/EngineeringResumes 위키 전문(GitHub 미러) | 가장 큰 이력서 첨삭 커뮤니티의 운영 규칙. 여러 1차 출처의 압축본 | 상황별 섹션 순서, 불릿 형식·동사 목록, Skills 3줄, Projects 링크, README 요건 |
| [resume/03-tech-interview-handbook.md](resume/03-tech-interview-handbook.md) | Yangshun Tay의 이력서 가이드 | 스타 14만 면접 안내서의 이력서 장. FAANG 면접관 관점 | 헤드라인·요약 50단어, 경력 항목 한 줄 형식, 프로젝트 ≥2, 평문 테스트 |
| [resume/04-xyz-formula-laszlo-bock.md](resume/04-xyz-formula-laszlo-bock.md) | Google 인사 총괄의 XYZ 공식 원문 | 다른 모든 출처가 인용하는 불릿 공식의 원출처 | X·Y·기준선·Z 네 요소, 숫자 둘 짝짓기 |
| [resume/05-xe-iaso-resume.md](resume/05-xe-iaso-resume.md) | 현역 인프라 엔지니어의 공개 이력서와 데이터 소스 | 실물. 이력서를 데이터로 관리하는 사례 | 직장 항목 = 머리 + 불릿 3~4, "요청 시 제공", 출판물 섹션, 회사 설명 한 줄 |
| [resume/06-latex-templates.md](resume/06-latex-templates.md) | Jake · sb2nov · Deedy 템플릿의 샘플 본문 | 가장 많이 쓰이는 1쪽 템플릿 셋 | 신입 표준 순서, 프로젝트 머리 한 줄, 시스템 단위 불릿, 수상 표 형식 |
| [resume/07-awesome-cv-daangn-sre.md](resume/07-awesome-cv-daangn-sre.md) | Awesome-CV 샘플: 당근페이 창립 SRE의 영문 이력서 (예외: 국내 인물) | 국제 표준 템플릿 + 지원 타겟 조직의 실제 경력 | 인프라 도메인 어휘, 불릿마다 규모 수치, 병역을 경력으로 |
| [resume/08-korean-backend-resumes.md](resume/08-korean-backend-resumes.md) | **국내 실물 4편** (이동욱·김재녕·이재연·이현섭) 원문과 계측표 | 자연스러운 한국 개발자 이력서의 실물 기준. 원고와 같은 계측기로 잰 비교값 | 명사형 1줄 불릿 + 이유 1줄, 대상+행위 제목, 회사 한 줄 설명, 학력 맨 뒤, 대시·대조·문장 안 굵게 0건 |
| [resume/09-korean-hiring-guides.md](resume/09-korean-hiring-guides.md) | **국내 지침**: 워니, 우아한형제들 기술블로그 2편, 원티드 인사담당자, 링커리어, technical-writing.dev, 나무위키 번역체(발췌) | 국내 채용 쪽이 말하는 문체·분량·구성 | 소개 3~5줄, 줄글 금지·꼭지, STAR 명사형 예시, 프로젝트 1개 합격 선례, 구인본 7단계, 산문 규칙(한 문장 하나·메타 담화 삭제·능동) |

### 포트폴리오 (7)

| 파일 | 무엇 | 왜 모범 사례인가 | 여기서 가져온 규칙 |
|---|---|---|---|
| [portfolio/01-brendan-gregg.md](portfolio/01-brendan-gregg.md) | 성능 엔지니어의 사이트 구조 + 조사 글 *Linux Load Averages* | 성능 분야의 대표 포트폴리오. 요약본·전체본 이중 구조 | 항목 = 이름 + 한 줄 정의, 방법론에 이름 붙이기, 막힌 곳도 본문, 분해·검산, 행위 동사 결론 |
| [portfolio/02-dan-luu.md](portfolio/02-dan-luu.md) | 측정 기반 사례 연구 2편 (*cgroup throttling*, *latency pitfalls*) | 사내 성능 문서의 공개판. "측정이 숨기는 것"의 직접 선례 | 이론→실증→일반화→대안(예상 효과)→결과(사후), 비용 환산, 정정 페이지 |
| [portfolio/03-sam-rose.md](portfolio/03-sam-rose.md) | 백엔드 개념 시각 에세이 사이트 + *Load Balancing* | 백엔드 면접 주제를 설명한 글로 가장 널리 읽힘 | 가장 단순한 경우부터, "무엇을 최적화하는가" 명시, 같은 그림으로 비교, 동사형 자기소개 |
| [portfolio/04-personal-site-skeletons.md](portfolio/04-personal-site-skeletons.md) | Evans Projects · Hashimoto 홈 · Xe GitHub 프로필 · Hightower README | 인프라 엔지니어의 최소 포트폴리오와 README 표준 | 무엇+왜+링크, 지금/과거 분리, 자동 갱신 블록, README = 무엇·누구용·버전·순서·smoke test |
| [portfolio/05-google-sre-postmortem.md](portfolio/05-google-sre-postmortem.md) | SRE 책 부록 D 예시 포스트모템 | 장애 회고 문서의 사실상 표준 | 원인/방아쇠/감지 분리, 조치 항목 표, 잘된 것/잘못된 것/운, 타임라인 |
| [portfolio/06-adr-nygard.md](portfolio/06-adr-nygard.md) | ADR 원문 | 설계 결정 기록의 원형 | Context 가치 중립, Decision 능동 한 문장, Consequences에 부정 포함, superseded 보존 |
| [portfolio/07-josh-comeau-portfolio-book.md](portfolio/07-josh-comeau-portfolio-book.md) | *Building an Effective Dev Portfolio* (무료 전자책) | 채용자 관점의 포트폴리오 단행본 (프론트엔드 기원, 범위 명시) | 독자 두 부류와 30~60초, tour guide 질문, 프로젝트 상세 페이지 5절, 톤, 피할 것 |

## 뒤진 곳 · 막힌 곳 · 미확보

| 구분 | 내용 |
|---|---|
| **뒤진 곳** | thetechresume.com(무료 장·원본 PDF·.docx), blog.pragmaticengineer.com, techinterviewhandbook.org, LinkedIn Pulse(Bock 원문), GitHub(jakegut/resume · sb2nov/resume · deedy/Deedy-Resume · posquit0/Awesome-CV · Xe/site · kelseyhightower/kubernetes-the-hard-way · r-engineeringresumes/subreddit-wiki · yangshun/tech-interview-handbook), xeiaso.net, brendangregg.com, danluu.com, samwho.dev, jvns.ca, mitchellh.com, sre.google, cognitect.com, joshwcomeau.com(PDF), careercup.com, gayle.com, google.com/about/careers |
| **막힌 곳** | reddit(old·www 모두 403, 프록시 403, Chrome 확장 미연결) → GitHub 공식 미러로 대체 · xeiaso.net의 curl(봇 차단) → WebFetch로 대체 · techinterviewhandbook.org의 WebFetch(403) → curl로 대체 · Josh Comeau PDF의 WebFetch(크기 제한) → curl + pdftotext · **국내 자료**: 워니 체크리스트 미러(DNS 실패) · honeymon 99CON 정리(404) · 국립국어원 번역투 PDF(텍스트 추출 실패) · ChatGPT 상용 표현 목록(도구가 저작권 이유로 거부) · reddit 계열 국내 후기(미시도) |
| **미확보** | *The Tech Resume Inside Out* 유료 장(5·6장, 13장 사례 5건 중 백엔드 6년차·SRE 20년차) · r/EngineeringResumes의 합격 이력서 이미지·success story 본문(로그인 필요) · Gayle McDowell의 careercup 이력서 템플릿(페이지 폐쇄, gayle.com/resume는 본인 이력서) · Google 공식 이력서 안내 페이지(careers 페이지에 없음. XYZ는 Bock 원문으로 대체) · Xe Iaso 이력서 PDF(봇 차단) |
| **사용자가 직접 확인할 것** | 위키가 링크하는 합격 이력서 이미지(`reddit.com/r/EngineeringResumes/wiki/success-story`)는 로그인 후 열 수 있다. 백엔드·DevOps 사례가 있는지 보면 [resume/06](resume/06-latex-templates.md)의 실물 보강이 된다 |

빈도·규모 수치(스타 수, 다운로드 수)는 **2026-09-07 확인값**이다.

## 사용 순서

0. 원고 작업은 `/career-docs` 스킬(`.claude/skills/career-docs/SKILL.md`)의 순서를 따른다. 문체 규칙 [rules-korean-prose.md](rules-korean-prose.md) 2절이 가장 먼저이고, 계측기는 `localDocs/career/resume/lint.js`, 검토는 `.claude/agents/` 의 `resume-prose-reviewer` · `resume-structure-auditor` · `resume-screener` 다.
1. 원고를 고치기 전에 [rules-resume.md](rules-resume.md) 12절 · [rules-portfolio.md](rules-portfolio.md) 10절의 **대조표**에서 "위반"과 "보강"을 고른다.
2. 규칙의 이유가 궁금하면 규칙 옆의 출처 번호로 레퍼런스 원문을 연다.
3. 제출 전에는 [rules-resume.md](rules-resume.md) 11절 점검표 15개를 돈다.
4. 고친 뒤 대조표의 상태를 갱신한다. `localDocs/CLAUDE.md`의 장부 규칙과 같다: 지우지 말고 상태와 근거를 적는다.

## 갱신 규칙

- 레퍼런스 문서의 **원문 인용은 고치지 않는다.** 확보일과 확보 방법이 적혀 있으므로, 원문이 바뀌면 새 확보일로 절을 추가한다.
- 규칙 문서(rules-*)만 판단이 바뀔 때 갱신한다. 바뀐 판정은 지우지 말고 날짜와 함께 남긴다.
- 새 레퍼런스를 넣을 때는 이 README의 선정 기준 여섯 가지 중 어디에 해당하는지 적는다. 해당하지 않으면 넣지 않는다.
