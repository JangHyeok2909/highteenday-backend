# 이력서·포트폴리오 작업 디렉터리

<<<<<<< Updated upstream
> 만든 날: 2026-09-04 · 현재 제출본 기준: **당근 Feed Infra 백엔드 산업기능요원**
> 기존 범용 원고 [resume.md](resume.md)·[portfolio.md](portfolio.md)는 보존하고, 제출본은
> [resume-feed-infra.md](resume-feed-infra.md)·[portfolio-feed-infra.md](portfolio-feed-infra.md)에서 관리한다.
> HTML 과 PDF 는 매번 다시 만든다.
=======
만든 날은 2026-09-04이고, 원고의 기준 공고는 당근 Feed Infra 백엔드다.
원고는 셋이다. 이력서 [resume.md](resume.md), 제출용 포트폴리오 축약본 [portfolio-short.md](portfolio-short.md), 면접용 포트폴리오 마스터본 [portfolio.md](portfolio.md). HTML과 PDF는 매번 다시 만든다.
>>>>>>> Stashed changes

---

## 두 문서의 분담

| | 이력서 | 포트폴리오 |
|---|---|---|
| 역할 | 면접관이 무엇을 물어볼지 고르게 한다 | 고른 것에 답한다 |
| 넣는 것 | 결론과 수치 | 왜 그렇게 했나, 무엇을 버렸나, 어떻게 검증했나 |
| 분량 | A4 2쪽 | 제출용 축약본 A4 10쪽, 면접용 마스터본 19쪽 |

한 소재를 양쪽에 쓸 때의 기준은 셋이다. ① 수치가 결론인가 ② 한 줄로 말해도 무너지지 않는가 ③ 면접에서 반드시 물어볼 소재인가. 셋 중 하나라도 아니면 포트폴리오로 보낸다. 무엇을 어디로 옮겼는지는 `resume.md`의 CUT 아래 분담표에 있다.

---

## 파일 구성

| 파일 | 역할 | 손대는 사람 |
|---|---|---|
<<<<<<< Updated upstream
| **[resume.md](resume.md)** | **이력서 원고** | 사람 |
| **[portfolio.md](portfolio.md)** | **포트폴리오 원고** (9개 장) | 사람 |
| **[resume-feed-infra.md](resume-feed-infra.md)** | **당근 Feed Infra 제출용 이력서** (2쪽) | 사람 |
| **[portfolio-feed-infra.md](portfolio-feed-infra.md)** | **당근 Feed Infra 제출용 포트폴리오** (7쪽) | 사람 |
| [GAPS.md](GAPS.md) | **보충이 필요한 것 전부.** 공란·미검증 수치·미구현 소재·형식 문제 | 사람 + AI |
| [template.html](template.html) | 인쇄용 스타일(A4, 여백, 글꼴, 페이지 나눔, 그림) | 형식을 바꿀 때만 |
| [build.js](build.js) | 마크다운 → HTML → PDF 변환기 | 거의 안 건드림 |
| [lint.js](lint.js) | **문체 계측기.** AI 티·개조식 위반을 줄 번호와 함께 센다. `node lint.js resume.md`, `--strict`, `--extract out/x.md`(맹검 심사용 본문 추출). 기준은 `../references/rules-korean-prose.md` | 규칙이 바뀔 때만 |
| `out/` | 생성물. **직접 고치지 않는다** (다음 빌드에 덮어써진다) | — |
=======
| [resume.md](resume.md) | 이력서 원고 | 사람 |
| [portfolio-short.md](portfolio-short.md) | 포트폴리오 제출용 축약본(11장, 10쪽) | 사람 |
| [portfolio.md](portfolio.md) | 포트폴리오 면접용 마스터본(11장, 19쪽). 수치의 원본이다. 여기를 고치면 축약본도 같이 고친다 | 사람 |
| [GAPS.md](GAPS.md) | 보충이 필요한 것 전부. 공란, 미검증 수치, 미구현 소재, 형식 문제, 리뷰 반영 기록 | 사람 + AI |
| [FILL-IN.md](FILL-IN.md) | 2026-09-04에 사람이 답한 질문지. 답은 원문 그대로 둔다 | 기록 |
| [template.html](template.html) | 인쇄용 스타일(A4, 여백, 글꼴, 페이지 나눔, 그림) | 형식을 바꿀 때만 |
| [build.js](build.js) | 마크다운을 HTML과 PDF로 바꾸는 변환기 | 거의 안 건드림 |
| `out/` | 생성물. 직접 고치지 않는다. 다음 빌드에 덮어써진다 | 없음 |
>>>>>>> Stashed changes

---

## 빌드

```bash
cd localDocs/career/resume
<<<<<<< Updated upstream
node build.js                                  # resume.md → out/resume.pdf
node build.js resume.md    resume-daangn       # 원본과 출력 이름을 따로 지정
node build.js portfolio.md portfolio-daangn

# 당근 Feed Infra 산업기능요원 제출본
$env:CAREER_OUTPUT_DIR="$PWD/output/pdf"
$env:CAREER_DOC_TITLE='장혁 - 당근 Feed Infra 이력서'
node build.js resume-feed-infra.md resume-feed-infra
$env:CAREER_DOC_TITLE='장혁 - 당근 Feed Infra 포트폴리오'
node build.js portfolio-feed-infra.md portfolio-feed-infra
=======
node build.js                                        # resume.md → out/resume.pdf
node build.js resume.md    resume-daangn             # 원본과 출력 이름을 따로 지정
node build.js portfolio-short.md portfolio-short     # 제출용 축약본
node build.js portfolio.md portfolio-daangn          # 면접용 마스터본
node build.js portfolio.md portfolio-daangn --short  # 마스터본에서 FULL 구간을 뺀 빌드
>>>>>>> Stashed changes
```

의존성이 없다. `npm install`이 필요 없고 pandoc과 wkhtmltopdf도 필요 없다. 마크다운 변환기는 `build.js`가 직접 갖고 있고, PDF는 Chrome 헤드리스가 만든다.

Chrome 경로는 `C:\Program Files\Google\Chrome\Application\chrome.exe`를 기본으로 찾는다. 다른 곳에 있으면 `CHROME_PATH` 환경변수로 지정한다.

```bash
# macOS
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node build.js resume.md resume-daangn
```

빌드가 끝나면 덜 채운 자리가 몇 개 남았는지 콘솔에 나온다. 제출 전에는 0이어야 한다.

### 문체 계측 (2026-09-07 추가)

```bash
node lint.js resume.md portfolio.md          # 강한 위반 항목과 줄 번호
node lint.js resume.md --strict              # 위반이 있으면 exit 1
node lint.js resume.md --extract out/resume-screen.md   # 맹검 심사 에이전트에 넘길 본문만 추출
```

원고 작업 절차 전체(읽을 규칙, 계측, 빌드, 검토 에이전트 호출 순서)는 `/career-docs` 스킬
(`.claude/skills/career-docs/SKILL.md`)에 있다. 검토 에이전트 셋은 `.claude/agents/` 의
`resume-prose-reviewer`(문체) · `resume-structure-auditor`(구조) · `resume-screener`(맹검 심사)다.

---

## 원고를 쓰는 세 가지 약속

### 1. `[[...]]`는 아직 안 채운 자리

```markdown
[[이메일]] · [[전화번호]]
```

PDF에서 빨간 점선 상자로 찍힌다. 덜 채운 채로 제출하는 사고를 막으려고 일부러 눈에 거슬리게 만들었다. 빌드 로그에도 목록이 나온다.

### 2. `<!-- CUT -->` 아래는 PDF에 안 들어간다

원고 아래쪽에 이 마커가 있고, 그 밑은 초안 메모 구역이다. 아직 확정되지 않은 문장, 구현이 끝나면 올릴 줄, 버린 문장을 여기에 둔다. 지우지 않고 남겨 두어도 PDF는 깨끗하게 나온다.

### 3. `<!-- FULL -->`와 `<!-- /FULL -->` 사이는 면접용 깊이

`--short`로 빌드하면 이 구간이 빠진다. 마스터본에 8개 구간이 있다. 제출용 축약본은 문장이 달라 지금은 별도 파일이고, 이 마커는 마스터본 안에서 깊이를 표시하는 용도로만 쓴다.

---

## 쓸 수 있는 마크다운 문법

이력서에 필요한 것만 지원한다.

| 문법 | 결과 |
|---|---|
| `# ## ### ####` | 제목 4단계 (`#` 이름 / `##` 대분류 / `###` 회사·프로젝트 / `####` 항목 제목) |
| `- 항목` | 목록. 두 칸 들여쓰면 한 단계 안으로. 들여쓴 다음 줄은 같은 항목으로 이어진다 |
| `**굵게**` `*기울임*` `` `코드` `` | 글자 서식 |
| `[글자](주소)` | 링크 |
| `> 인용` | 인용 블록 |
| `---` | 구분선 |
| `\| 표 \|` | 표 (머리줄 + `\|---\|` 구분줄 필요) |
| ` ```코드 ` | 코드 블록 |
| ` ```html-raw ` | HTML을 그대로 통과시킨다. 그림과 장 나눔에 쓴다 |

지원하지 않는 것: 이미지, 각주, 체크박스, 중첩 인용. 필요하면 `build.js`에 추가한다. 변환기가 이 파일 안에 있어 고치기 쉽다.

HTML은 반드시 ` ```html-raw ` 울타리 안에 쓴다. 울타리 밖의 `<svg>`는 글자로 찍힌다. 2026-09-05까지 마스터본의 그림 9가 그렇게 찍히고 있었다.

### `html-raw`로 쓸 수 있는 것

`template.html`에 미리 넣어 둔 클래스들이다. 포트폴리오에서만 쓴다.

| 쓰임 | 클래스 |
|---|---|
| 장 나눔(다음 쪽에서 시작) | `<div class="pagebreak"></div>` |
| 핵심 수치 3칸(이력서 첫 화면) | `.kpi` > `div` > `b` · `span` |
| 막대 그래프 | `.bar-row` > `.bar-label` · `.bar-track` > `.bar-fill` · `.bar-val` |
| 흐름도 | `.flow` > `.flow-step` · `.flow-arrow` |
| 좌우 대비 상자 | `.compare` > `div` > `h5` |
| 그림 설명 | `.fig`로 감싸고 `.fig-cap` |
| 목차 | `.toc` > `div` > `.num` |

---

<<<<<<< Updated upstream
## 지금 상태 (2026-09-07)

| 산출물 | 분량 | 덜 채운 자리 |
|---|---|---|
| `out/resume-daangn.pdf` | **A4 2쪽** | 12곳 (고유 8종) |
| `out/portfolio-daangn.pdf` | **A4 12쪽** | 2곳 (이름 · GitHub 주소) |
| `output/pdf/resume-feed-infra.pdf` | **A4 2쪽** | 0곳 |
| `output/pdf/portfolio-feed-infra.pdf` | **A4 7쪽** | 0곳 |
=======
## 지금 상태 (2026-09-05 밤)

| 산출물 | 분량 | 덜 채운 자리 |
|---|---|---|
| `out/resume-daangn.pdf` | A4 2쪽 (기본 10pt, 전용 스타일 없음) | 0 |
| `out/portfolio-short.pdf` | A4 10쪽 (제출용) | 0 |
| `out/portfolio-daangn.pdf` | A4 19쪽 (면접용 마스터본) | 0 |
>>>>>>> Stashed changes

셋 다 한글 글꼴이 정상 임베드됐다. 어투·표현 리뷰와 반영 내역은 GAPS.md의 P·Q·R·S장에 있다.

급한 것 넷.

- 캡처. Grafana 커넥션 대기 패널, k6 요약 출력, fetch join을 뺐을 때 실패한 테스트 출력. 본인이 뽑아야 한다(GAPS.md Q-7).
- 인용 수치의 run-id 고정(GAPS.md J-6). 마스터본에는 2차 측정 실행 하나만 적었다.
- NEIS API 키 폐기·재발급(GAPS.md N-4).
- 원고가 둘이다. 마스터본 수치를 고치면 축약본도 같이 고친다(GAPS.md K-6·P-4).

---

## 관련 문서

| 문서 | 무엇이 있나 |
|---|---|
<<<<<<< Updated upstream
| [../daangn-feed-infra.md](../daangn/daangn-feed-infra.md) | 당근 공고 분석과 합격 전략. **이 원고의 구성 근거** |
| [../daangn/video-interview-guide.md](../daangn/video-interview-guide.md) | **화상 인터뷰 대비서** (A4 45쪽). 이력서 한 줄마다 문답 카드, 예상 질문 통합표, 정직 답변집, 라이브 코딩, CS 기초, 숫자 카드. 빌드: `CAREER_OUTPUT_DIR=../daangn/out node build.js ../daangn/video-interview-guide.md video-interview-guide` |
| [../references/README.md](../references/README.md) | 해외 모범 사례 레퍼런스 14건과 규칙 문서 2건. **뼈대의 근거.** 원고 대조표는 `rules-resume.md` 12절 · `rules-portfolio.md` 10절 |
| [../resume-assets.md](../resume-assets.md) | 소재 장부. 각 줄의 원재료와 예상 꼬리질문 |
=======
| [../daangn/daangn-feed-infra.md](../daangn/daangn-feed-infra.md) | 당근 공고 분석과 합격 전략. 원고 구성의 근거 |
| [../daangn/portfolio-scoring.md](../daangn/portfolio-scoring.md) | 포트폴리오 축약 판정표. 8~9쪽 권장안 |
| [../resume-assets.md](../resume-assets.md) | 소재 목록. 각 줄의 원재료와 예상 꼬리질문 |
>>>>>>> Stashed changes
| [../toss-sprint-1month.md](../toss-sprint-1month.md) | 구현·제출 일정 |
| [../reference/](../reference/README.md) | 모범 원고. 김재녕 이력서 원문과 거기서 잰 뼈대. 2026-09-06 선정 |
| `performance/optimizations/OPT-001`, `OPT-002` | 이력서에 쓴 개선 수치의 1차 출처 |

---

## 문장 규칙

루트 `CLAUDE.md`의 Documentation Rules와 `docs/WRITING.md`를 따른다. 고친 뒤에는 `docs/WRITING.md` 6장의 스크립트로 문장 길이, 대비 구문, 상호참조 수를 다시 재고, 결과를 GAPS.md에 남긴다.
