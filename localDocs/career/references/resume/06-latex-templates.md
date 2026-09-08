# 가장 많이 쓰이는 이력서 템플릿 셋의 샘플 본문 — Jake's Resume · sb2nov · Deedy

> **확보일** 2026-09-07 · **원문 언어** 영어 · **저장 범위** 각 템플릿의 샘플 이력서 본문(섹션 순서, 항목 형식, 불릿 원문). 연락처는 옮기지 않았다.
>
> | 템플릿 | 저장소 | 스타(2026-09-07) | 확보 방법 |
> |---|---|---|---|
> | Jake's Resume | https://github.com/jakegut/resume (Overleaf: "Jake's Resume") | 2,807 | curl `resume.tex` |
> | sb2nov/resume | https://github.com/sb2nov/resume | 6,967 | curl `sourabh_bajaj_resume.tex` |
> | Deedy-Resume | https://github.com/deedy/Deedy-Resume | 5,056 | curl `OpenFonts/deedy_resume-openfont.xtx` |

## 왜 이 셋인가

- 셋 다 **저자의 실제 이력서(또는 학생 샘플)가 템플릿의 기본 내용**이라 뼈대와 문장을 함께 볼 수 있다. Jake's Resume는 sb2nov 템플릿을 기반으로 만들어졌고(파일 머리에 *"Based off of: https://github.com/sb2nov/resume"*), 미국 학부생·신입 소프트웨어 지원자 사이에서 사실상 표준으로 쓰인다. sb2nov는 Google·Coursera 엔지니어 Sourabh Bajaj의 이력서다. Deedy는 Google·Facebook을 거친 Debarghya Das의 학부 시절 이력서로, r/EngineeringResumes 위키가 그의 글 *Common Mistakes From Reviewing 1000+ Tech Resumes*를 추천 자료로 올린다.
- 셋 다 한 쪽(letter 크기)이다. 미국식 1쪽 규칙의 실물이다.
- **한계** 셋 다 백엔드·인프라 전문 이력서는 아니다(일반 소프트웨어 엔지니어·학생). 인프라 실물은 [05-xe-iaso-resume.md](05-xe-iaso-resume.md)와 [07-awesome-cv-daangn-sre.md](07-awesome-cv-daangn-sre.md)를 본다.

---

## 1. Jake's Resume — 학생·신입용 표준 뼈대

**순서**: 머리글 → Education → Experience → Projects → Technical Skills

**머리글**: 이름(크게, small caps) 한 줄 아래 `전화 | 이메일 | linkedin.com/in/... | github.com/...` 한 줄. 링크는 밑줄.

**항목 형식**
- Education: `학교 | 도시, 주` / `학위 | 기간`
- Experience: `직함 | 기간` / `기관 | 도시, 주` / 불릿
- Projects: `**프로젝트명** | 기술 목록(기울임) | 기간` / 불릿
- Technical Skills: `Languages: ...` / `Frameworks: ...` / `Developer Tools: ...` / `Libraries: ...` 네 줄

**샘플 본문 원문**

Experience
- Undergraduate Research Assistant · Texas A&M University · June 2020 – Present
  - Developed a REST API using FastAPI and PostgreSQL to store data from learning management systems
  - Developed a full-stack web application using Flask, React, PostgreSQL and Docker to analyze GitHub data
  - Explored ways to visualize GitHub collaboration in a classroom setting
- Information Technology Support Specialist · Southwestern University · Sep. 2018 – Present
  - Communicate with managers to set up campus computers used on campus
  - Assess and troubleshoot computer problems brought by students, faculty and staff
  - Maintain upkeep of computers, classroom equipment, and 200 printers across campus
- Artificial Intelligence Research Assistant · Southwestern University · May 2019 – July 2019
  - Explored methods to generate video game dungeons based off of *The Legend of Zelda*
  - Developed a game in Java to test the generated dungeons
  - Contributed 50K+ lines of code to an established codebase via Git
  - Conducted a human subject study to determine which video game dungeon generation technique is enjoyable
  - Wrote an 8-page paper and gave multiple presentations on-campus
  - Presented virtually to the World Conference on Computational Intelligence

Projects
- **Gitlytics** | *Python, Flask, React, PostgreSQL, Docker* | June 2020 – Present
  - Developed a full-stack web application using with Flask serving a REST API with React as the frontend
  - Implemented GitHub OAuth to get data from user's repositories
  - Visualized GitHub data to show collaboration
  - Used Celery and Redis for asynchronous tasks
- **Simple Paintball** | *Spigot API, Java, Maven, TravisCI, Git* | May 2018 – May 2020
  - Developed a Minecraft server plugin to entertain kids during free time for a previous job
  - Published plugin to websites gaining 2K+ downloads and an average 4.5/5-star review
  - Implemented continuous delivery using TravisCI to build the plugin upon new a release
  - Collaborated with Minecraft server administrators to suggest features and get feedback about the plugin

Technical Skills
- Languages: Java, Python, C/C++, SQL (Postgres), JavaScript, HTML/CSS, R
- Frameworks: React, Node.js, Flask, JUnit, WordPress, Material-UI, FastAPI
- Developer Tools: Git, Docker, TravisCI, Google Cloud Platform, VS Code, Visual Studio, PyCharm, IntelliJ, Eclipse
- Libraries: pandas, NumPy, Matplotlib

**읽히는 것**: 프로젝트 머리에 기술 목록을 붙여 "무엇으로 만들었나"를 한 줄로 끝낸다. 불릿은 "Developed / Implemented / Published / Collaborated"로 시작한다. 다만 샘플 불릿 다수가 XYZ 공식의 Y(측정치)가 없다("2K+ downloads", "4.5/5-star", "50K+ lines", "200 printers"만 수치). 뼈대는 따르되 불릿 밀도는 [04-xyz-formula-laszlo-bock.md](04-xyz-formula-laszlo-bock.md) 기준으로 올린다. 또 Developer Tools에 IDE(VS Code, PyCharm 등)가 있는데 r/EngineeringResumes 위키는 IDE를 빼라고 한다.

## 2. sb2nov — 경력자의 "프로젝트명: 설명" 불릿

**순서**: 머리글 → Education → Experience → Projects (Skills는 주석 처리되어 기본 비활성)

**머리글**: 왼쪽 이름·개인 사이트, 오른쪽 이메일·전화. 두 줄.

**항목 형식**: Experience는 `회사 | 도시` / `직함 | 기간` 아래에 **`프로젝트명: 설명`** 형태의 불릿. 동사로 시작하지 않고 **명사(프로젝트·시스템 이름)로 시작**한다. 이것이 이 템플릿의 특징이다.

**샘플 본문 원문 (일부)**

- Google · Software Engineer · Oct 2016 – Present
  - **TensorFlow**: TensorFlow is an open source software library for numerical computation using data flow graphs; primarily used for training deep learning models. Worked on APIs and performance for training models on Tensor Processing Units (TPU).
  - **Apache Beam**: Apache Beam is a unified model for defining both batch and streaming data-parallel processing pipelines, as well as a set of language-specific SDKs for constructing pipelines and runners.
- Coursera · Senior Software Engineer · Jan 2014 – Oct 2016 (불릿 9개 중 발췌)
  - **Notifications**: Service for sending email, push and in-app notifications. Involved in features such as delivery time optimization, tracking, queuing and A/B testing. Built an internal app to run batch campaigns for marketing, etc.
  - **Nostos**: Bulk data processing and injection service from Hadoop to Cassandra and provides a thin REST layer on top for serving offline computed data online.
  - **Data Warehousing**: Setup, schema design and management of Amazon Redshift. Built an internal app for access to the data using a web interface. Dataduct integration for daily ETL injection into Redshift.
  - **Recommendations**: Core service for all recommendation systems at Coursera, currently used on the homepage and throughout the content discovery process. Worked on both offline training and online serving.
- Projects (한 줄씩): **QuantSoftware Toolkit** — Open source Python library for financial data analysis and machine learning for finance. / **GitHub Visualization** — Data visualization of Git log data using D3 to analyze project trends over time. / **Mac Setup** — Book that gives step-by-step instructions on setting up developer environment on macOS.

**읽히는 것**: 한 회사에서 여러 시스템을 맡은 경력자가 **시스템 단위로 항목을 나누는** 방식이다. 각 불릿의 첫 문장이 "그 시스템이 무엇인지", 둘째 문장이 "내가 무엇을 했는지"다. 수치는 거의 없다(*"more than 100,000 students"* 하나). r/EngineeringResumes 위키 기준으로는 불릿이 문장 2~3개라 길다. **뼈대(시스템 단위 분할)만 가져오고 문장 수는 줄인다.**

## 3. Deedy — 2단 레이아웃과 수상 표

**순서**: 머리글(이름 + 사이트·이메일·전화) → **왼쪽 좁은 단** Education · Links · Coursework · Skills → **오른쪽 넓은 단** Experience · Research · Awards · Publications

**Skills 형식**: 코드 줄 수 등급으로 나눔. `Over 5000 lines:` Java · Shell · Python · Javascript ... / `Over 1000 lines:` C · C++ · CSS · PHP · Assembly / `Familiar:` AS3 · iOS · Android · MySQL

**Experience 원문 (발췌)**
- Facebook | Software Engineer · Jan 2015 – Present · New York, NY (불릿 없음. 시작 직후라 비워 둠)
- Coursera | KPCB Fellow + Software Engineering Intern · June 2014 – Sep 2014
  - 52 out of 2500 applicants chosen to be a KPCB Fellow 2014.
  - Led and shipped Yoda - the admin interface for the new Phoenix platform.
  - Full-stack developer - Wrote and reviewed code for JS using Backbone, Jade, Stylus and Require and Scala using Play
- Google | Software Engineering Intern · May 2013 – Aug 2013
  - Worked on the YouTube Captions team, in Javascript and Python to plan, to design and develop the full stack to add and edit Automatic Speech Recognition captions. In production.
  - Created a backbone.js-like framework for the Captions editor.
- Phabricator | Open Source Contributor & Team Leader · Jan 2013 – May 2013
  - Phabricator is used daily by Facebook, Dropbox, Quora, Asana and more.
  - I created the Meme generator and more in PHP and Shell.
  - Led a team from MIT, Cornell, IC London and UHelsinki for the project.

**Awards 표 원문** (`연도 | 순위/모수 | 대회`)

| 2014 | top 52/2500 | KPCB Engineering Fellow |
|---|---|---|
| 2014 | 1st/50 | Microsoft Coding Competition, Cornell |
| 2013 | National | Jump Trading Challenge Finalist |
| 2013 | 7th/120 | CS 3410 Cache Race Bot Tournament |
| 2012 | 2nd/150 | CS 3110 Biannual Intra-Class Bot Tournament |
| 2011 | National | Indian National Mathematics Olympiad (INMO) Finalist |

**읽히는 것**: 수상은 반드시 **모수와 함께** 쓴다(52/2500, 1st/50). Tech Interview Handbook의 `[Year][Quantification][Competition]` 형식과 같다. 반면 2단 레이아웃과 수강 과목(Coursework) 섹션은 Pragmatic Engineer(다단은 훑기 어렵다)와 r/EngineeringResumes(과목 금지)가 둘 다 반대한다. 저자 본인도 이후 글에서 1쪽 단일 구조를 권한다. **수상 표 형식만 가져오고 레이아웃은 따르지 않는다.**

---

## 4. 이 레퍼런스에서 가져가는 뼈대 요소

- 신입 뼈대의 표준 순서: Education → Experience → Projects → Skills (Jake).
- 프로젝트 머리 한 줄: `이름 | 기술 목록 | 기간` (Jake).
- 한 조직 안에서 여러 시스템을 맡았으면 **시스템 단위 불릿** `이름: 무엇인지. 내가 한 것.` (sb2nov).
- 수상·선발은 `연도 | 순위/모수 | 이름` (Deedy).
- 따르지 않을 것: 2단 레이아웃, 수강 과목, IDE 나열, 수치 없는 불릿.
