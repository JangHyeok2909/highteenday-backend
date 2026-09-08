# Brendan Gregg — 성능 엔지니어의 포트폴리오 사이트와 조사 서사

> **확보일** 2026-09-07 · **원문 언어** 영어 · **저장 범위** 사이트 구조 전체, Overview 페이지의 목록 원문, 대표 조사 글의 절 구조와 수치
>
> | 출처 | 주소 | 확보 방법 |
> |---|---|---|
> | 홈(전체 목록) | https://www.brendangregg.com/ | WebFetch (60KB) |
> | Overview(엄선 목록, "Start Here") | https://www.brendangregg.com/overview.html | WebFetch |
> | 조사 글 *Linux Load Averages: Solving the Mystery* (2017-08-08) | https://www.brendangregg.com/blog/2017-08-08/linux-load-averages.html | WebFetch (절 구조·수치 추출) |
> | FlameGraph 저장소 | https://github.com/brendangregg/FlameGraph | gh api. 스타 19,734 |

## 누구이고 왜 모범 사례인가

- **누구** 시스템 성능 엔지니어. Sun(DTrace)·Joyent·Netflix(수석)·Intel을 거쳐 2026년 현재 OpenAI에서 ChatGPT 데이터센터 성능을 맡고 있다. 플레임 그래프(flame graph, 스택 샘플 시각화)·USE Method(자원별 사용률·포화·오류 점검법)·지연 히트맵의 창안자. 저서 *Systems Performance*(928쪽), *BPF Performance Tools*(880쪽).
- **왜 모범 사례인가** 백엔드·인프라 분야에서 "포트폴리오"라는 단어에 가장 가까운 개인 사이트다. 20년치 작업을 **문서·영상·소프트웨어·책**으로 분류하고, 각 항목에 **한 줄 설명**을 붙여 놓았다. 사용자의 프로젝트가 성능 측정·판정 시스템이라 주제도 겹친다.
- **한계** 이 사이트는 신입의 포트폴리오가 아니라 20년차의 저작물 색인이다. 가져올 것은 **분류법과 항목 서술 형식, 조사 글의 서사 구조**이지 분량이 아니다.

---

## 1. 사이트 뼈대

### 두 개의 입구

홈 첫 문단(원문 요지): *"This site shares work with computers, primarily focusing on systems performance. ... This page lists everything: Documentation, Videos, Software, Misc. For popular content summary, see Overview."*

| 입구 | 역할 | 구성 |
|---|---|---|
| 홈 (`index.html`) | **전부** | Documentation(시대별 15개 소절, 항목 약 230개) · Videos(연도별) · Software(플랫폼별) · Misc · Author Information |
| Overview (`overview.html`, 내비게이션에서는 "Start Here") | **엄선** | Documentation 14 · Articles 18 · Software 6 · Presentations 8+16 · Books 5 |

읽는 사람이 시간이 없으면 Overview, 특정 도구를 찾으면 홈. **한 사이트에 "요약본"과 "전체본"이 따로 있다.** 이 저장소의 `--short` 빌드(축약본)와 같은 발상이다.

### 항목 서술 형식 — Overview의 Documentation 원문

각 항목이 **이름 + 콜론 + 그것이 무엇인지 한 줄**이다.

- perf Examples: Linux perf_events one-liners, examples, and visualizations.
- eBPF Tracing Tools: Linux enhanced BPF tools for performance analysis.
- The USE Method: a performance methodology for identifying resource bottlenecks.
- USE Method: Rosetta Stone: performance checklists for different OSes.
- Off-CPU Analysis: a methodology for analyzing blocked time, complimentary to CPU analysis.
- TSA Method: the methodology of thread state analysis.
- Active Benchmarking: a methodology for performing accurate benchmarks.
- Working Set Size Estimation: showing techniques for understanding main memory usage.
- CPU Flame Graphs: a visualization for sampled stack traces.
- Off-CPU Flame Graphs: different techniques for analyzing blocking events.
- Memory Flame Graphs: techniques for efficiently analyzing leaks and growth.
- Latency Heat Maps: a visualization for latency distributions over time.
- Utilization Heat Maps: different visualizations for resource utilization.
- Frequency Trails: a visualization for multiple distributions.

Articles는 **제목 (연도): 한 줄**. 예: *Linux Load Averages: Solving the Mystery (2017): Explained the inclusion of the uninterruptible sleep state.* / *CPU Utilization is Wrong (2017): Explains the growing problem of memory stall cycles dominating the %CPU metric.* / *The Benchmark Paradox (2014): Explains a paradox in benchmark evaluations.*

Software는 **이름 (github): 무엇인지 + 내 역할**. 예: *bcc: BPF compiler collection; Brendan is a major contributor, especially for performance tools.*

Presentations는 **제목, 행사, 장소, 연도** 와 영상·슬라이드 링크, 길이(분). Books는 **제목 (연도), ISBN, 한 문단 요지, 쪽수**.

### 홈의 분류 — 시대별 소절 제목 (항목 수)

Linux Performance & Cloud (2020s) 10 · AI & GPU Performance (2024-2025) 7 · eBPF & Performance Analysis (2021-2023) 20 · BPF & Observability (2019-2020) 8 · Netflix Cloud Performance (2018-2019) 2 · Performance Tools & Visualization (2018) 8 · System Security & Performance (2017-2018) 6 · Container & Cloud Performance (2017) 21 · eBPF & BPF Tools (2016-2017) 20 · Netflix & Linux Performance (2015-2016) 13 · Performance Tools & Methodologies (2014-2015) 22 · DTrace & Solaris Performance (2012-2013) 37 · Storage & Cloud Performance (2009-2010) 12 · DTrace & Unix Performance (2005-2008) 23

각 항목에도 짧은 설명이 붙는다. 예: *The Return of the Frame Pointers – Stack walking fixes in Linux distros after 20 years* / *Linux Crisis Tools – Default performance analysis tools recommendation*.

Software 첫 줄의 면책: *"Open source spare-time projects with no warranty – use at own risk. Some are security tools potentially subject to legal restrictions."*

## 2. 조사 글의 서사 뼈대 — *Linux Load Averages: Solving the Mystery*

사용자 포트폴리오 3~5장(오진과 반박)과 가장 가까운 형식이다. 절 순서와 각 절의 역할, 수치를 그대로 옮긴다.

| # | 절 | 역할 | 수치·근거 |
|---|---|---|---|
| 0 | 도입 | **왜 중요한가를 돈으로** | *"Load averages are an industry-critical metric – my company spends millions auto-scaling cloud instances based on them and other metrics – but on Linux there's some mystery around them."* |
| 1 | History | 배경 | RFC 546 (1973), TENEX. 커널 상수 EXP_1=1884, EXP_5=2014, EXP_15=2037 |
| 2 | The Three Numbers | 통념 반박 1 | *"Except they aren't really averages, and they aren't 1, 5, and 15 minutes."* 1분 평균이 1분 시점에 0.62에만 도달 |
| 3 | Linux Uninterruptible Tasks | 미스터리 제시 | 0.99.14(1993)에는 13개 코드 경로, 4.12에는 약 400개 |
| 4 | Searching for an Ancient Linux Patch | **어디까지 찾았고 무엇이 막혔나** | git 로그 4GB, 다이제스트 6,000개·이메일 98,000통, 1993년분 30,000통 뒤짐. *"surprisingly difficult to find"* |
| 5 | The Origin of Uninterruptible | 원인 발견, **원 저자 인용** | 1993-10-29 Matthias Urlichs의 패치와 설명 원문 |
| 6 | Uninterruptible Today | 오늘날 검증 필요성 | 1993년에 없던 코드 경로가 원인이라는 가설 |
| 7 | Measuring Uninterruptible Tasks | **직접 측정** | off-CPU 플레임 그래프. 60초 중 926ms → 부하 평균 +0.015. 두 번째 예: systemd-journal +0.07, 페이지 폴트 +0.23, 락 대기 +0.30 |
| 8 | Decomposing Linux Load Averages | **분해 실험과 검산** | 유휴 8 CPU에서 tar 실행. 1분 부하 1.25 → tar CPU 0.33 + uninterruptible 읽기 0.67 + 기타 CPU 0.04 + 커널 워커 0.11 = 1.15. 남은 차이는 1분 창의 지수 감쇠(0.62)로 설명 |
| 9 | Making Sense of Linux Load Averages | 해석 | *"the words 'load averages' are about as ambiguous as 'I/O'"* |
| 10 | What is a "good" or "bad" load average? | **규칙이 없다고 말함** | *"there aren't really rules for this."* 2 CPU 메일 서버가 낮에 11~16 |
| 11 | Better Metrics | 대안 지표 | 부하 평균 대신 무엇을 볼지 |
| 12 | Conclusion | **한 문단 요약: 무엇을 팠고, 무엇을 쟀고, 무엇을 제안했나** | *"In this post, I dug up the Linux load average patch from 1993 ... I also measured stack traces and time in the uninterruptible state ... I also proposed other metrics"* + 커널 소스의 주석 인용으로 마무리 |

## 3. 뼈대에서 읽히는 것

- **항목 = 이름 + 한 줄 정의.** 링크 목록이 아니라 "이것이 무엇이고 왜 있는가"가 붙는다. 방법론(USE·TSA·Off-CPU·Active Benchmarking)이 도구와 같은 급의 산출물로 올라 있다. 사용자의 "포화 4단계 판정", "대조군 게이팅", "CV/MDE 판정 기준"도 같은 급으로 이름을 붙여 내놓을 수 있다.
- **조사 서사는 "막힌 곳"을 숨기지 않는다.** 4절은 실패한 탐색 과정 자체가 본문이다. 이 저장소의 "버린 대안을 본문으로" 원칙과 같다.
- **측정 → 분해 → 검산.** 8절은 부하 평균 1.25를 성분으로 쪼개 합이 1.15임을 보이고, 남는 0.1을 설명한다. 수치를 하나 내놓을 때 그 수치가 어디서 왔는지 합산으로 보여 주는 형식이다.
- **"좋은 값은 없다"를 명시한다.** 10절. 사용자 포트폴리오 7장("충분히 빠른가를 정의하기")과 같은 위치의 절이다.
- **결론은 행위 동사 세 개로 끝난다**: dug up, measured, proposed. 포트폴리오 장 끝의 요약도 이 형식이 좋다.
