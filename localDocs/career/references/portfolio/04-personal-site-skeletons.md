# 인프라 엔지니어의 개인 사이트·프로필·README 뼈대 넷 — Julia Evans · Mitchell Hashimoto · Xe Iaso · Kelsey Hightower

> **확보일** 2026-09-07 · **원문 언어** 영어 · **저장 범위** 각 페이지 본문 전체(짧다)
>
> | 대상 | 주소 | 확보 방법 |
> |---|---|---|
> | Julia Evans — Projects 페이지 | https://jvns.ca/projects/ | WebFetch |
> | Mitchell Hashimoto — 홈 | https://mitchellh.com/ | WebFetch |
> | Xe Iaso — GitHub 프로필 README | https://github.com/Xe/Xe (`README.md`) | curl (raw) |
> | Kelsey Hightower — *Kubernetes The Hard Way* README | https://github.com/kelseyhightower/kubernetes-the-hard-way | curl (raw). 스타 49,667 |

## 누구이고 왜 모범 사례인가

- **Julia Evans** — 인프라·네트워킹·디버깅 주제의 블로그와 zine(소책자)으로 유명. rbspy(Ruby 프로파일러) 제작. Projects 페이지가 **"만든 도구를 어떻게 소개하는가"** 의 가장 간결한 예다.
- **Mitchell Hashimoto** — HashiCorp 공동창업자(Vagrant·Terraform·Consul·Vault·Nomad). 지금은 Ghostty 터미널. 홈이 **세 문단짜리 최소 포트폴리오**다.
- **Xe Iaso** — [../resume/05-xe-iaso-resume.md](../resume/05-xe-iaso-resume.md)와 같은 사람. GitHub 프로필 README가 **자동 갱신되는 최근 글 목록**을 갖는다.
- **Kelsey Hightower** — Kubernetes 전도사(전 Google). *Kubernetes The Hard Way*는 "학습용 저장소 README"의 표준으로 통한다.

---

## 1. Julia Evans — Projects 페이지 원문(요약본)

첫 문단: *"Here are some tools and games I've made that you might find useful or fun. I sometimes forget to update this page for years so it might be out of date."*

목차: Mess with DNS (2021) · dns-lookup (2021) · nginx playground (2021) · debugging mysteries (2021) · rbspy: a Ruby profiler (2018) · Computers are fast (2016) · Pandas Cookbook (2014)

항목 형식(각 항목이 이 셋을 갖는다):

| 요소 | 예 |
|---|---|
| **무엇인지 한 문장(자기 인용)** | messwithdns.net *"is place for you to experiment with DNS!"* / rbspy *"a sampling profiler for Ruby!"* |
| **왜 만들었나** | dns-lookup: *"dig's output to be unnecessarily unfriendly"* / nginx playground: nginx 설정 테스트가 지루해서 / Pandas Cookbook: 12시간 기차 여행 중에 |
| **맥락과 링크** | 함께 만든 사람(Marie Claire LeBlanc Flanagan, Kamal Marhubi), 유지관리 이관(rbspy → Adam Jensen, 2021), 설명 블로그 글, 문서, 저장소 |

## 2. Mitchell Hashimoto — 홈 원문

> I'm a developer living in Los Angeles, CA. I'm currently the co-founder of Superlogical. I previously co-founded HashiCorp.
>
> I started Ghostty and libghostty, a standalone and embeddable terminal emulator.
>
> I was part of the initial engineering team behind most of the HashiCorp products, such as Vagrant, Packer, Consul, Terraform, Vault, Nomad, Waypoint, and more. I don't work on any of those projects anymore. I was CEO for ~4 years, CTO for ~5 years, an individual contributor for ~2 years, and then left the company in 2023.
>
> I'm an FAA licensed private pilot ✈️ with an instrument rating (PPL ASEL IR). ... I stopped flying in 2026 to have more time to focus on family and work.

꼬리: mail · twitter · mastodon · github · linkedin

구조: **지금(현재 소속) → 시작한 것(현재 프로젝트) → 과거(무엇의 일부였고, 지금은 아니라는 말과 역할별 기간) → 사람으로서의 한 줄.** 세 문단이 전부다. "더 이상 하지 않는다"를 명시한다.

## 3. Xe Iaso — GitHub 프로필 README 구조

```
# Xe (/zi/)
한 줄 정체성 (Nephelemancer, ..., Hacker, Ordained Minister)
"You've probably seen my blog on the front page of the Orange Site."
호칭 안내 (They/them 또는 She/her)
## Star History          ← 저장소 4개의 스타 추이 차트(외부 서비스 이미지)
## Other Places on the Internet
## Recent blogposts      ← <!-- BLOG-POST-LIST:START --> ... <!-- END --> 마커. GitHub Action이 RSS로 자동 갱신
## Sponsors ❤️           ← 자동 삽입 마커
## Contact Methods       ← 사이트의 contact 페이지 링크 하나
"Be well, Creator."
```

읽히는 것: 프로필 README의 정적 부분은 5줄이고, 나머지는 **자동 갱신 블록**이다. Pragmatic Engineer가 경고한 "방치된 GitHub"을 구조적으로 막는다.

## 4. Kelsey Hightower — *Kubernetes The Hard Way* README 원문(구조)

```
# Kubernetes The Hard Way
무엇인지 + 누구를 위한 것이 아닌지:
  "This guide is not for someone looking for a fully automated tool to bring up a Kubernetes cluster.
   Kubernetes The Hard Way is optimized for learning, which means taking the long route..."
> 면책: "The results of this tutorial should not be viewed as production ready..."
## Copyright        ← CC BY-NC-SA 4.0
## Target Audience  ← "someone who wants to understand the fundamentals of Kubernetes and how the core components fit together"
## Cluster Details  ← 구성(컨트롤 플레인 1노드 + 워커 2노드) + 컴포넌트 버전 4개(kubernetes v1.32.x, containerd v2.1.x, cni v1.6.x, etcd v3.6.x)
## Labs             ← 전제 조건("four (4) ARM64 or AMD64 based virtual or physical machines") + 순서 있는 문서 13개
                       (Prerequisites → Jumpbox → Compute → CA/TLS → kubeconfig → 암호화 키 → etcd → Control Plane → Workers → kubectl → Pod 네트워크 → Smoke Test → Cleanup)
```

읽히는 것: README의 첫 화면이 **"무엇이다 / 무엇이 아니다 / 누구용이다 / 정확한 버전 / 순서"** 다. 기능 자랑이 없다. 마지막에서 두 번째 단계가 **Smoke Test**다.

---

## 5. 네 뼈대에서 공통으로 읽히는 것

- **항목 하나에 "무엇 + 왜 + 맥락 링크".** 링크만 던진 항목이 없다.
- **현재와 과거를 분리하고, 과거는 "지금은 안 한다"까지 쓴다.** 심사자가 "이걸 지금도 유지하나?"를 묻지 않게 한다.
- **자기 축소 문장이 자연스럽다.** *"I sometimes forget to update this page"*, *"should not be viewed as production ready"*. 과장 대신 범위를 긋는다.
- **README = 저장소를 읽는 법.** 포트폴리오(서사)와 역할이 다르다. `GAPS.md` K-5(README와 포트폴리오의 역할 겹침)의 답이 여기 있다: README는 무엇·누구용·버전·실행 순서·검증(smoke test), 포트폴리오는 무엇을 틀렸고 어떻게 알아챘나.
