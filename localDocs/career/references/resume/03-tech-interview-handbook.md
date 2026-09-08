# Tech Interview Handbook — FAANG 면접관이 쓴 이력서 가이드

> **확보일** 2026-09-07 · **원문 언어** 영어 · **저장 범위** 이력서 페이지 본문 전체(커버레터 절은 요지만)
>
> | 출처 | 주소 | 확보 방법 |
> |---|---|---|
> | 이력서 가이드 | https://www.techinterviewhandbook.org/resume/ | WebFetch는 HTTP 403. curl(브라우저 UA)로 HTML 확보 후 텍스트 추출. 페이지 마지막 갱신 2026-08-07 |
> | 저장소 | https://github.com/yangshun/tech-interview-handbook | gh api. 스타 142,471 (2026-09-07) |

## 누가 썼고 왜 모범 사례인가

- **저자** Yangshun Tay. 전 Meta Staff Engineer, Blind 75 문제집과 Docusaurus 관리자. 페이지 첫 문장: *"Having read tons of software engineering resumes as a FAANG interviewer, even some of the most qualified candidates I know fail to get shortlisted due to bad resumes."*
- **채택 규모** GitHub 스타 14만이 넘는 가장 널리 읽히는 면접 안내서의 이력서 장이다.
- **주의** 페이지에 유료 서비스(FAANG Tech Leads) 홍보 블록이 섞여 있다. 그 부분은 저장하지 않았다. 또 ATS(Applicant Tracking System, 지원자 추적 시스템)가 키워드 빈도로 숙련도를 추정한다는 서술은 검증되지 않은 통념에 가깝다. Pragmatic Engineer의 *ATS Myths Busted* 장과 r/EngineeringResumes 위키가 "ATS 신화" 항목을 따로 두고 이런 주장을 다루는데, 그 장의 본문은 확보하지 못했다. **키워드 규칙은 "사람이 훑을 때 보이게"로만 읽는다.**

---

## 1. 네 단계

1. Set up an ATS-friendly resume template
2. Fill up your template with well-framed content in a meaningful order
3. Optimize your resume with prioritization and keywords
4. Test out resume using free tools

## 2. 형식

- PDF로 제출하되 **Word 또는 Google Docs로 만든다.** 텍스트가 드래그되어야 파싱된다. Photoshop·온라인 빌더 금지.
- 머리글·바닥글 영역을 쓰지 말고 여백을 줄인다(narrow margins 0.5인치).
- 글꼴은 Arial, Calibri, Garamond. **최소 10pt.**
- 머리글에 기호를 넣지 않는다.

### 섹션 이름과 순서 (원문 표)

| Section | Heading Name |
|---|---|
| Professional summary | 섹션 제목 자리에 **이력서 헤드라인**을 쓴다. 예: "Senior Software Engineer at Google with over 5 years of experience leading teams" |
| Contact information | "Contact Information" |
| Skills - programming languages, frameworks, etc. | "Skills" |
| Experience | "Work Experience" |
| Education | "Education" — *"if you are still in school or have less than 3 years of experience, you may put Education first"* |
| Projects | "Projects" |
| Other optional sections | "Awards and Accolades" / "Certifications" |

## 3. 섹션별 내용 규칙

### 요약 (Professional summary)

- 먼저 **공고의 요구에 맞는 자기 셀링 포인트를 나열**한 뒤, 그것을 **50단어 이내**로 압축한다.
- ✅ Answer why you are a good fit for the job · ✅ Use an active voice · ✅ Use action words · ✅ **Start with the noun describing your job role** e.g. "Software Engineer"
- 섹션 제목 대신 **10단어 이내 헤드라인**을 쓴다.

예문(원문):

- **Software Engineer (Full Stack)** — *Software Engineer with X years of full stack web development experience specializing in Ruby on Rails and PostgreSQL. Domain expert in e-commerce and payments field as a result of working at multiple e-commerce companies.*
- **Senior Front End Engineer** — *Front End Engineer with X years of experience and strong fundamentals in Front End technologies. Likes building scalable web infrastructure and making websites fast. Passionate about programming languages, compilers, and developer tooling.*
- **Software Engineering Lead** — *Software Engineer with X years of experience in back end, scaling complex distributed systems, and various cloud platforms. Led over 5 engineering teams with an average size of 6 members across two companies and mentored over 20 junior members.*
- **Senior at University X** — *Senior Year student at University X with a focus on Artificial Intelligence and Machine Learning (ML). Interned at X companies and worked on full stack development and ML engineering roles.*

### 연락처

필수: 이름(맨 위) · 개인 전화 · 위치(도시·주) · 개인 이메일(Gmail 권장) · LinkedIn.
있으면 좋음: GitHub · 개인 사이트 · Stack Overflow · Medium · 코딩 플랫폼 프로필(등급·순위·별 수 표시).
구분자는 세로줄 기호 또는 탭.

(r/EngineeringResumes 위키는 전화·LinkedIn·위치를 불필요로 본다. 두 출처가 갈리는 지점이다. [../rules-resume.md](../rules-resume.md)에서 판정.)

### Skills

`[Skill summary] : [List skills]` 형식. 항목: Programming languages(인상적이면 작성 줄 수 병기, 예: "Over 10,000 lines") · Frameworks · Databases.

### Work Experience

역순. 항목 머리 형식(원문):

`[Company or Organization], [Location] | [Job Title] | [Start and end dates formatted as MM/YYYY]`
예: *Facebook, Singapore | Front End Engineering Lead | 08/2018 - Present*

불릿에 담을 것: 직무 범위와 필요 기술, 그리고 성과를 다음 구조로:

`[Accomplishment summary] : [Action] that resulted in [quantifiable outcome]`

### Education

`[Degree Name], [Year of Graduation - write expected graduation date if not graduated]` / `[University Name], [Location]` / GPA는 3.50/4.00 초과일 때만. 리더십·수상·프로젝트 한 줄.

예: *BSc in Computing, Computer Science, Graduation Year 2015 / National University of Singapore, Singapore / GPA: 3.82 / 4.00 (Magna cum laude) / Dean's List, Valedictorian / President of hacker society*

### Projects

*"Include **at least 2 projects** you have contributed to, outlining your key contributions. **Always try to link your project name to GitHub** or somewhere the hiring manager can view your project."*

예(원문): **facebook/docusaurus** — *Maintainer and lead engineer for Docusaurus v2, a static site generator which powers the documentation of many of Meta's Open Source Projects - React Native, Jest, Relay, Reason, etc. Used by 7.6k > projects on GitHub.*

### Awards, accolades and certifications

공고와 관련된 것만, 수치와 함께. `[Year][Quantification] [Competition]` 예: *2016 | Best All-Round Product out of 50 teams | Facebook Hackathon*

## 4. 최적화

### Less is more

- *"Highlighting a few of your best achievements is better than including many 'average' achievements"*
- *"Use only 1 page for your resume"*

### 키워드

- 공고에서 must-have·good-to-have를 뽑아 Skills에 넣고 Work Experience·Education 불릿에도 **같은 표현으로** 흩뿌린다. *"Be sure to closely imitate the language within the job description."*
- 약어는 풀어 쓴 형태도 함께: "Amazon Web Services instead of AWS".
- *"do not do keyword stuffing for the sake of it - always remember that the resume will be read by a recruiter or hiring manager eventually."*
- 직군 단위로 일반화하려면: 같은 직군 공고 **3~5개**를 모아 단어 빈도 도구에 넣고 자주 나오는 키워드를 찾는다.

## 5. 검토 도구

- ATS 가독성 검사 도구(Resume Worded 등)로 파싱 확인.
- **The plain text file test**: 이력서 내용을 복사해 메모장에 붙인다. 빠진 항목·깨진 문자·섞인 섹션이 있으면 고친다.

## 6. 마지막 팁

- **지원서 양식을 가볍게 보지 말 것.** *"it is possible that your resume is never seen by the recruiter or hiring manager - only the information that you fill up in their forms!"*
- 같은 회사에 여러 직무를 동시에 지원하지 말 것(자기 인식 부족으로 읽힌다).

---

## 7. 이 레퍼런스에서 가져가는 뼈대 요소

- 요약이 있다면 **직무 명사로 시작하는 50단어 이내**, 그리고 섹션 제목 자리에 10단어 헤드라인.
- 경력 항목 머리 한 줄 형식과 불릿 구조 `[요약]: [행동] that resulted in [수치 결과]`.
- 프로젝트는 **최소 2개, 저장소 링크 필수**. 한 프로젝트면 그 사실을 다른 방식으로 방어해야 한다.
- 제출 전 **평문 붙여넣기 테스트**.
- 회사 지원 양식이 이력서를 대체할 수 있다. 양식에 옮길 때 불릿을 그대로 붙인다.
