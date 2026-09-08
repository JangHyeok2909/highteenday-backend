# Sam Rose (samwho.dev) — 백엔드 개념을 시뮬레이션으로 설명하는 에세이의 구조

> **확보일** 2026-09-07 · **원문 언어** 영어 · **저장 범위** 홈 페이지 구조 전체, 에세이 *Load Balancing*의 절 구조와 첫 문장, 시뮬레이션 배치
>
> | 출처 | 주소 | 확보 방법 |
> |---|---|---|
> | 홈 | https://samwho.dev/ | WebFetch |
> | *Load Balancing* (2023) | https://samwho.dev/load-balancing/ | WebFetch (절 구조 추출) |

## 누구이고 왜 모범 사례인가

- **누구** Sam Rose. 백엔드 엔지니어(홈에 링크된 회사 블로그 글 기준: CV Partner의 배포·Rust Lambda, Budibase의 인시던트 리포트, Nebula의 트래픽 글). 현재 ngrok의 개발자 교육 담당. 홈 소개: *"I write visual, interactive essays about software. Each post takes anywhere from one to three months to create, and I cover the material in a bottom-up fashion, starting from the simplest example and working up."*
- **왜 모범 사례인가** 로드 밸런싱·큐잉·재시도·해싱·메모리 할당·블룸 필터처럼 **백엔드 면접 단골 주제**를, 독자가 파라미터를 바꿔 보는 시뮬레이션으로 설명한 글로 Hacker News에서 반복적으로 최상위에 올랐다. 팟캐스트 4곳(Hanselminutes 등)에 초청됐다. "만든 것"이 아니라 **"이해한 것을 남이 이해하게 만든 것"** 이 포트폴리오인 사례다.
- **한계** 인터랙티브 시뮬레이션은 PDF 포트폴리오에 못 넣는다. 가져올 것은 **설명의 순서**(가장 단순한 경우 → 변수 하나씩 추가 → 무엇을 최적화하는지 정의 → 지표로 비교)다.

---

## 1. 홈 뼈대 — 동사로 시작하는 절 제목

| 절 제목(원문) | 내용 |
|---|---|
| 👋 Hi. | 두 문단 자기소개. 직업 외 정체성(husband, dad, whisky-drinker) |
| 🎨 I write. | 위 인용문 + 에세이 9편 목록(Big O · Reservoir Sampling · Turing Machines · Queueing · Bloom Filters · Retries · Hashing · Memory Allocation · Load Balancing) + 직장(ngrok)에서 쓴 글 2편 |
| 💌 I newsletter. | 새 에세이 알림 전용. 연간 몇 통 |
| 🎙️ I talk. | 팟캐스트 출연 4건, 발표 1건. 각각 링크와 회차 |
| 📰 I play the NYT games. | 오늘의 게임 결과(개인적 장치) |
| 😈 I tinker. | 퀴즈 사이트 2개(jsdate.wtf, e-mail.wtf), 실험 2개 |
| ⌨️ I write | 일반 블로그 목록 링크. **회사 블로그에 쓴 글**: Budibase 2024-01-09 인시던트 리포트 · Jet Lag: The Traffic · Using Rust Lambdas in Production · Major Upgrades, Subtle Problems · Deploying CV Partner |
| 👨🏻‍💻 I code. | GitHub 프로젝트 5개, 각각 **이름: 한 줄** (*spacer: a silly little CLI tool to add spacers to command output* / *rust-debugger: a ptrace-based debugger written in Rust* ...) |
| 📖 I read. | 좋아하는 글 모음 링크, 기술서 리뷰어로 이름 오른 책 4권 |

## 2. 에세이 뼈대 — *Load Balancing*

도입(원문): *"Past a certain point, web applications outgrow a single server deployment. Companies either want to increase their availability, scalability, or both!"*

| # | 절 | 첫 문장(원문) | 시뮬레이션이 독자에게 바꾸게 하는 것 |
|---|---|---|---|
| 1 | Visualising the problem | *"Let's start at the beginning: a single load balancer sending requests to a single server. Requests are being sent at a rate of 1 request per second (RPS)..."* | 서버 1대 → 2대(라운드 로빈) → 요청 비용 가변 → 서버 성능 가변. **변수를 하나씩 추가** |
| 2 | When round robin doesn't cut it | *"In the real world, it's rare for servers to be equally powerful and requests to be equally expensive."* | 현실의 분산 |
| 3 | Improving on round robin | *"It's possible to tweak round robin to perform better with variance. There's an algorithm called 'weighted round robin'..."* | 가중치 → 지연 기반 동적 가중치 → 고분산 상황 |
| 4 | Moving away from round robin | *"...what if I told you we could do even better, and with a simpler algorithm?"* | least connections |
| 5 | Optimizing for latency | *"Up until now I've been avoiding a crucial part of the discussion: **what we're optimising for.** Implicitly, I've been considering dropped requests to be really bad and seeking to avoid them."* | 세 알고리즘을 **p50·p95·p99**와 히스토그램으로 비교, 누적 드롭 수 |
| 6 | One last algorithm | *"If we really want to optimise for latency, we need an algorithm that takes latency into account."* | PEWMA(지수 가중 이동 평균 기반) vs least connections |
| 7 | Playground | *"To round this out, I leave you with a version of the simulation that lets you tweak most of the parameters in real time."* | 전체 파라미터 |
| 8 | Conclusion | *"I spent a long time on this post. It was difficult to balance realism against ease of understanding, but I feel good about where I landed."* | |

## 3. 뼈대에서 읽히는 것

- **"무엇을 최적화하는가"를 중간에 명시적으로 묻는다(5절).** 그 전까지의 비교가 암묵적 기준(드롭 수)에 기대고 있었음을 인정하고, 기준을 지연 백분위로 바꾼 뒤 결론이 달라짐을 보인다. 사용자 포트폴리오 7장("충분히 빠른가를 정의하기")이 같은 자리에 있어야 한다.
- **비교는 항상 같은 그림(히스토그램 + p50/p95/p99)으로.** 알고리즘이 바뀌어도 판정 도구는 같다. 측정 시스템의 "게이트"와 같은 역할이다.
- **가장 단순한 경우부터.** 1 LB, 1 서버, 1 RPS. 사용자 2.2절("요청 하나가 지나는 길")이 이 역할이다.
- **결론이 정직하다.** *"difficult to balance realism against ease of understanding"*. 한계를 감추지 않는다.
- **홈은 동사 절이다.** I write / I talk / I code / I read. 포트폴리오 첫 장의 자기소개를 "무엇을 만들었다"가 아니라 "무엇을 하는 사람이다"로 쓰는 형식이다.
- **회사 인시던트 리포트를 자기 작업물로 링크한다.** 장애 대응 문서가 포트폴리오 항목이 된다. 사용자 8장(중복 행 장애)의 위치다.
