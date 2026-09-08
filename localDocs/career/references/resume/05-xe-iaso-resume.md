# Xe Iaso — 현역 인프라 엔지니어의 공개 이력서 (이력서를 데이터로 관리하는 사례)

> **확보일** 2026-09-07 · **원문 언어** 영어 · **저장 범위** 이력서 페이지의 구조와 항목 전부, 원본 데이터 파일의 경력 하이라이트와 출판물 설명
>
> | 출처 | 주소 | 확보 방법 |
> |---|---|---|
> | 이력서 페이지 | https://xeiaso.net/resume/ | WebFetch (성공). curl은 봇 차단 페이지(Anubis)만 받음 |
> | PDF | https://xeiaso.net/static/resume/resume.pdf | 미확보 (curl이 봇 차단에 걸림) |
> | 이력서 데이터(사이트 소스) | https://github.com/Xe/site — `dhall/resume.dhall`, `dhall/jobHistory.dhall` | curl (raw). 저장소 스타 732, 마지막 푸시 2026-09-06 |
>
> **의도적으로 뺀 것**: 데이터 파일에는 각 직장의 연봉·주식·퇴사 사유 필드가 있다. 공개 자료이지만 이 문서의 목적(뼈대 참고)과 무관한 개인정보라 옮기지 않았다.

## 누구이고 왜 모범 사례인가

- **누구** Xe Iaso (they/them). 오타와 거주. IMVU에서 800대 규모 클러스터의 SRE(2015), Heroku 시니어 소프트웨어 엔지니어(주간 테라바이트 규모 메트릭 처리 서브시스템, JVM·Go 런타임 메트릭, 2017~2019), Lightspeed POS의 수석 SRE(사내 Kubernetes PaaS, 2019~2020), Tailscale 인프라·DevRel(2020~2023), Fly.io, Tigris Data. 블로그가 Hacker News 첫 화면에 자주 오른다(GitHub 프로필 자기소개: *"You've probably seen my blog on the front page of the Orange Site"*).
- **왜 모범 사례인가** ① **백엔드·인프라 실무자의 실제 이력서**가 현재 시점으로 유지되고 있다. ② 이력서를 마크다운이 아니라 **구조화 데이터(Dhall)** 로 두고 웹 페이지와 PDF를 생성한다. 원고 하나에서 산출물 둘을 만드는 이 저장소의 `build.js` 방식과 같은 발상이다. ③ 각 항목이 짧은 명사구 불릿이라 뼈대가 그대로 드러난다.
- **한계** 2022년 이후 직함이 DevRel(개발자 관계) 쪽이라 최신 3개 항목은 백엔드 이력서의 예로는 부적합하다. 인프라 예시는 IMVU·Heroku·Lightspeed·Tailscale(Software Designer) 항목을 본다. 또 Core Competencies 31개는 r/EngineeringResumes의 "3줄 이하" 규칙과 어긋난다. 유명인의 이력서라서 통하는 부분이 있다는 뜻이다.

---

## 1. 페이지 뼈대

| 순서 | 블록 | 내용 |
|---|---|---|
| 1 | 머리글 | 이름, 현재 직함과 도시(*"CEO @ Techaro - Ottawa, CAN"*), 사이트 내비게이션(Blog · Contact · Donate · Talks · Signalboost) |
| 2 | Profile | 한 문단. 무엇을 하는 사람인지, 어떤 환경을 원하는지(원격, 투명성·형평성을 중시하는 회사) |
| 3 | Core Competencies | 키워드 31개를 쉼표로 나열 |
| 4 | Experience | 최근 5개 직장. 각 항목 = **회사 - 직함** / **기간(YYYY-MM) · 도시** / 불릿 3~4개. 끝에 *"Earlier work history available upon request"* |
| 5 | Notable Publications | 글·발표 6개. 각각 **제목 + 한 문장 설명**. 끝에 *"Full publication and speaking history available upon request"* |
| 6 | 꼬리 | PDF 다운로드 링크, 저작권·면책 한 줄 |

## 2. 항목 원문

### Profile (WebFetch가 정리한 문장이라 표현이 원문과 조금 다를 수 있다)

Xe Iaso is a skilled force multiplier, speaker, artist, and prolific blogger whose writing reaches across 15 time zones. They specialize in helping others realize their abilities and unblock obstacles, creating value through senior engineer development. Xe prioritizes remote roles at companies emphasizing transparency, honesty, equity, and equality.

### Core Competencies (`resume.dhall`의 `buzzwords`, 원문 순서)

Docker, Git, Go, Rust, C, DevOps, Heroku, WebAssembly, Lua, Mindfulness, HTTP/2, Ubuntu, Alpine Linux, Gentoo, Bot filtering, AI, Large Language Models, ChatGPT, GPT4, Stable Diffusion, SDXL, GraphViz, JavaScript, TypeScript, SQLite, PostgreSQL, Dudeism, Technical writing, Emacs, Continuous Integration, Continuous Delivery

### Experience — 페이지에 보이는 5개 (불릿은 WebFetch 정리본)

**Tigris Data — Senior Cloud Whisperer** · 2024-09 – present · Ottawa, CAN
- Founded Developer Relations / Go To Market team
- Creates educational content, speaks at events, manages product evangelism
- Produces blog content, maintains documentation, tests product against AWS SDKs
- Ghost writing for colleagues

**Fly.io — Senior Technophilosopher** · 2023-11 – 2024-09 · Ottawa, CAN
- Built developer relations team from inception
- Developed strategy focused on value communication and product usage
- Leads social media on X; maintains YouTube and TikTok channels
- Early expert in AI tooling and locally-hosted models

**Tailscale — Archmage of Infrastructure** · 2020-12 – 2023-10 · Ottawa, CAN
- Founded developer relations team inspiring innovative Tailscale usage
- Wrote articles for tailscale.dev on computer science and networking fundamentals
- Actions directly attributable to MAU growth
- Established sustainable content strategy and internal knowledge sharing

**Lightspeed POS — Expert principal en fiabilité du site** (수석 SRE) · 2019-05 – 2020-11 · Montréal, CAN
- Maintained internal Kubernetes deployment as in-house PaaS
- Created custom Kubernetes deployment system prioritizing developer experience
- Built CI/CD developer tooling
- Managed deployment system complexity; designed custom icons and brand consistency

**Heroku — Senior Software Engineer** · 2017-02 – 2019-03 · Bellevue, USA
- Maintained metric processing subsystem handling terabytes of customer data weekly
- Wrote JVM and Go runtime metric integrations
- Developed FaaS platform prototype
- Navigated corporate politics and market challenges

*Earlier work history available upon request*

### Experience — 데이터 파일(`jobHistory.dhall`)의 `highlights` 원문 (인프라 직무만)

데이터 파일의 불릿은 페이지보다 더 짧은 **명사구**다. 페이지 생성기가 이것을 문장으로 다듬는 구조로 보인다.

| 회사 · 직함 · 기간 | highlights 원문 |
|---|---|
| Tailscale · Software Designer · 2020-12 – 2022-03 | Go programming · SQL integrations · Public-facing content writing · Customer support |
| Lightspeed POS · Expert principal en fiabilité du site · 2019-05 – 2020-11 | Migration from cloud to cloud · Work on the cloud platform initiative · Crafting reliable infrastructure for clients of customers · Creation of an internally consistent and extensible command line interface for internal tooling |
| Heroku · Senior Software Engineer · 2017-11 – 2019-03 | JVM Application Metrics · Go Runtime Metrics Agent · Other backend fixes and improvements on Threshold Autoscaling and Threshold Alerting · Public-facing blogpost writing |
| Backplane.io · Software Engineer · 2016-08 – 2016-11 | Performance monitoring of production servers · Continuous deployment and development in Go · Learning a lot about HTTP/2 and load balancing |
| IMVU · Site Reliability Engineer · 2015-03 – 2016-03 | Wrote up technical designs · Implemented technical designs on an over 800 machine cluster · Continuous learning of a lot of very powerful systems and improving upon them when it is needed |
| VTCSecure · Consultant · 2014-10 – 2015-02 | Started groundwork for a dynamically scalable infrastructure on a project for helping the blind see things · Developed a prototype of a new website for VTCSecure · Education on best practices using Docker and CoreOS · Learning Freeswitch |
| Appen · Consultant · 2014-09 – 2014-10 | Research and development on scalable Linux deployments on AWS via CoreOS and Docker · Development of in-house tools to speed instance creation · Laid groundwork on the creation and use of better tools for managing large clusters of CoreOS and Fleet machines |

데이터 파일에는 각 회사마다 `tagline`(회사가 무엇을 하는 곳인지 한 문장)도 있다. 예: Heroku — *"a cloud Platform-as-a-Service (PaaS) that created the term 'platform as a service'..."*. 읽는 사람이 회사를 모를 때를 대비한 장치다. 짧은 경력 두 건(OpDemand 인턴, Symplicity 주니어 시스템 관리자)은 `hideFromResume = True`로 **데이터에는 두되 이력서에서는 숨긴다.**

### Notable Publications (`resume.dhall` 원문)

- **Affording your AI chatbot friends** — A presentation focused at technical experts about the moving parts involved with AI model hosting and how it's not actually expensive to run if you manage the scope and scale correctly.
- **How to Make a Progressive Web App From Your Existing Website** — An article summarizing how easy it is to make a webpage into an installable Progressive Web App using APIs available in the most commonly used browsers.
- **Training with Big Data on Any Cloud** — A detailed breakdown of how to use Object Storage to help train Large Language Models / AI models on any cloud provider that has an internet connection.
- **An epic treatise on DNS, magical and otherwise** — A deep dive into all of the problems that DNS has at scale and how Tailscale makes most of those problems go away, with the rest of them being easier in comparison.
- **Weaponizing hyperfocus: Becoming the first DevRel at Tailscale** — A brief history of the developer relations team at Tailscale and how I found myself creating it. I cover one of my largest internal demons and how I managed to wield it as a force of empowerment rather than a limiting force of pain.
- **Using Tailscale without Using Tailscale** — An award-winning April Fools Day post describing how you can use Tailscale via Headscale via Tailscale Funnel. This post is notable for demonstrating all five of the Tailscale company values at the same time.

---

## 3. 뼈대에서 읽히는 것

- **직장 항목 하나 = 머리 한 줄 + 불릿 3~4개.** 최신일수록 자세하고, 오래된 것은 "요청 시 제공"으로 잘라낸다. Pragmatic Engineer 템플릿의 *"the more recent the position, the more details"* 를 실물로 보여준다.
- **글이 곧 증거.** 출판물 섹션이 경력 섹션과 같은 무게로 있다. 각 항목이 "제목 + 무엇을 다뤘는지 한 문장"이다. 링크만 던지지 않는다.
- **회사 설명(tagline)을 데이터로 갖고 있다.** 심사자가 회사를 모를 수 있다는 전제다. 국내 중소기업 경력을 해외 형식으로 옮길 때 그대로 쓸 수 있는 장치다.
- **숨김 플래그.** 이력서에 안 올릴 경력도 데이터에는 남긴다. 이 저장소의 `<!-- CUT -->`·`<!-- FULL -->` 마커와 같은 역할이다.
- **한계도 그대로 보인다.** 불릿에 수치가 거의 없다(*"over 800 machine cluster"*, *"terabytes of customer data weekly"* 정도). 이 점은 따라 하지 않는다. 수치 규칙은 [04-xyz-formula-laszlo-bock.md](04-xyz-formula-laszlo-bock.md)를 따른다.
