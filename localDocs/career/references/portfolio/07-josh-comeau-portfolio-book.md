# Josh Comeau — *Building an Effective Dev Portfolio* 의 프로젝트 상세 페이지 템플릿

> **확보일** 2026-09-07 · **원문 언어** 영어 · **저장 범위** 목차, 독자 모델, "tour guide" 질문 목록, 프로젝트 상세 페이지 템플릿, 피할 것, 톤 규칙. 책 전체는 저장하지 않았다(무료 배포지만 "All rights reserved"라 구조와 짧은 인용만 옮겼다).
>
> | 출처 | 주소 | 확보 방법 |
> |---|---|---|
> | 무료 전자책 PDF (70쪽, 2020) | https://storage.googleapis.com/joshwcomeau/building-an-effective-dev-portfolio.pdf | curl(19.7MB) 후 pdftotext. WebFetch는 크기 제한으로 실패 |
> | 소개 페이지 | https://www.joshwcomeau.com/effective-portfolio/ | WebSearch 결과로 확인 |

## 누가 썼고 왜, 그리고 어디까지 쓸 것인가

- **저자** Josh Comeau. Gatsby·Khan Academy·DigitalOcean·Unsplash에서 시니어 엔지니어로 일하며 **채용에 참여**했고, Concordia 대학 부트캠프 졸업생의 취업 코칭을 했다. 2020년 초 무료 포트폴리오 리뷰를 제안했다가 200건이 넘게 몰려 이 책을 썼다(*"I was giving the same feedback in 75%+ of cases"*).
- **한계를 먼저 적는다.** 이 책은 **프론트엔드·풀스택 주니어, 미국·캐나다** 대상이다. 저자도 *"I'm also focusing this book on front-end / full-stack software developers, but I expect that most of this content will also be relevant for back-end developers"* 라고 썼다. 디자인·애니메이션("sprinkles")·호스팅 장은 백엔드 PDF 포트폴리오와 무관하다. **가져오는 것은 독자 모델, "tour guide" 질문, 프로젝트 상세 페이지 템플릿, 톤 규칙 넷뿐이다.**
- 왜 그래도 넣는가: 해외에서 "개발자 포트폴리오"를 채용자 관점으로 체계화한 유일한 단행본이고, 여기 모은 다른 레퍼런스(Gregg·Luu·Rose)는 "무엇이 좋은 포트폴리오인가"를 **보여주지만 설명하지는 않는다.** 이 책이 그 설명을 맡는다.

---

## 1. 목차

Introduction · Motivation · **I. Foundations**(What is a developer portfolio? / Why do I need one? / Who is this book for? / Curating projects / Projects not to include / How many projects? / What if my projects aren't good enough?) · **II. Strategy**(Understanding the audience / A generic example / Things to avoid) · **III. Case Study** · **IV. Building**(Design / Frameworks and tooling / Domain names / Hosting / Personalizing / Accessibility / General layout / **The "Project Detail" page** / Tone and copy / Developer blogs) · V. Promoting · VI. Cover Letters · Appendix I 템플릿 · Appendix II 커버레터 3통

## 2. 독자 모델 — 누가 읽는가

| 독자 | 찾는 것 | 시간 |
|---|---|---|
| HR 하이어링 매니저 | **Competence**(전문가답게 만든 적이 있나) · **Enthusiasm** · **Fit**(우리 언어·프레임워크를 써 봤나) | *"They'll likely make a decision about moving forward in the process with you within **30-60 seconds**."* |
| 개발자(면접관) | *"developers generally aren't very interested in what languages or frameworks you know. ... developers care much more about your potential"* · **easy to mentor** · **grit** · **humility to admit when you don't know something** | 면접 전에 훑어봄 |

## 3. "Be a tour guide" — 데모·저장소 링크만으로는 전달되지 않는 것 (원문 질문)

*"You don't want visitors to wander around on a live demo, or go spelunking in the codebase. We want to highlight the most impressive and interesting parts of our products!"*

- Why is this project important to you? What inspired it? Why did you choose to build this?
- What are the major features that make it unique? How does it compare to existing products like it?
- What did you start with? Was this built from scratch? Did you have a team? If so, which parts did you do?
- **What was the hardest part of building this product? Where did you get stuck along the way?**
- **When you did get stuck, how did you resolve it? How did you overcome the obstacles you faced?**
- What did you learn from doing this project? How has it affected the work you've done since then?

*"Every codebase has dusty closets. If a developer does check the link to your Github and start poking around, will they see the best bits?"*

## 4. 피할 것

- **Skill charts** (언어별 %·막대): *"It's a no-win scenario. If the number you pick is too high ... you'll be seen as boastful ... If the number you pick is realistic, it will probably be low enough that it just doesn't look very good"*
- **"What I Do"** 서비스 목록: 프리랜서 포지셔닝으로 읽힌다.
- **Bravado** ("Master of Javascript", "10x junior developer"): *"it gives the impression that you're finished learning."*
- 튜토리얼·부트캠프 과제 프로젝트, 포트폴리오 사이트 자체를 프로젝트로 올리기, NDA 걸린 회사 작업.
- 프로젝트 수: 많이보다 **잘 설명된 소수**. 실제 사용자가 있는 프로젝트(*"even if it's only a handful"*)가 데모용보다 낫다.

## 5. 사례 연구에서 뽑은 신호 (Julia Johnson의 포트폴리오)

- **Show, don't tell.** *"Julia never says things like 'I'm a fantastic coder' or 'I built an amazing project'."* 기술적 난제(feature flag로 점진 릴리스, GraphQL·Shopify SDK, 재사용성)를 구체적으로 적는 것으로 역량을 보인다.
- **기술 선택의 이유**를 적어 두면 키워드 매칭과 판단력 둘 다 잡힌다.
- **겸손과 끈기의 문장**: *"As I've grown as a developer, I've worked alongside senior designers and developers who have raised my standards for what's expected of any web application."* / 어려움을 겪은 뒤 *"I now spend a lot more time refactoring and improving every line I code I write."*

## 6. 프로젝트 상세 페이지 템플릿 (원문 항목)

*"If you only take one thing from this book, make it this: no matter how cool your project is, it cannot be summarized by a screenshot and a short paragraph. Guide the reader through your work!"*

| 절 | 담는 것 |
|---|---|
| **Introduction** | High-level summary · core functionalities / interesting features · **your role** (혼자였나, 팀이면 어느 부분) · technologies used · links to live demo + source code |
| **Purpose and Goal** | Why did you build this? Why is it important to you? · expected outcome · initial designs · preliminary planning that helps build a narrative |
| **Spotlight** | *"What is the 'killer feature' of your project? What feature does it have that took the most work, or was the most technically impressive?"* · **technical hurdles** · **how you solved them** — *"Go deep here, and write with a developer in mind."* |
| **Current status** (선택) | 실제로 쓰이고 있으면 누가·왜·뭐라고 하는지. 포트폴리오용으로만 만든 것이면 생략 |
| **Lessons Learned** | 배운 것(기술·비기술 모두) · 프레임워크·라이브러리 선택이 좋았나, 어디서 부족했나 · 접근성 · *"How has this affected the work you've done since then?"* |

분량·형식: *"It should take up **2-3 pages when printed** (more if you have lots of images)."* *"avoid long paragraphs. Make use of many headings, and use lists within those headings to break up chunks of text. In essence, **make it easy to skim.**"* 스크린샷·초기 스케치는 서사 안에 끼워 넣는다. 영상 데모는 있어도 좋지만 텍스트를 대체하지 못한다(*"videos are harder to skim than text"*).

## 7. 톤

- *"The most important thing is that you want it to sound natural."* *"Formal corporate-speak is incredibly forgettable."*
- 검사법: *"read out loud, ideally to another person. Does it sound like something you'd say in real life? Rewrite it until it's conversational."*
- 영어가 모국어가 아니면 교정자를 구하라는 조언 포함.
- 개발 블로그는 포트폴리오와 **분리**. 다만 글이 5~6편 넘으면 그 자체가 프로젝트가 된다.

---

## 8. 뼈대에서 읽히는 것

- 포트폴리오는 **가이드 투어**다. 저장소를 뒤지게 하지 말고 "가장 어려웠던 곳과 어떻게 풀었나"로 데려간다. 사용자 포트폴리오가 "무엇을 틀렸고 어떻게 알아챘는지"를 쓰겠다고 첫 장에 선언한 것과 같은 방향이다.
- **Spotlight 하나.** 프로젝트마다 "가장 힘들었던 기능" 하나를 고른다. 사용자의 경우 6장(1,507 → 3.9)이 아니라 3~5장(측정이 거짓말한 조건을 코드로 걸러냄)이 Spotlight다. 이력서 첫 소제목 순서와 맞춘다.
- **역할 명시.** 혼자 했는지, 팀이면 어디를 했는지. 사용자 원고의 "3명으로 시작해 4개월 뒤부터 혼자"가 이 항목이다.
- **Lessons Learned의 마지막 질문**: "그 뒤의 작업이 어떻게 달라졌나". 사용자 9장(일하는 방식)이 이 답이다. 단 "배웠다"가 아니라 "그래서 지금은 이렇게 한다"로 쓴다.
- 2~3쪽 규칙은 **프로젝트 하나당**이다. 사용자 문서는 프로젝트 하나를 10장으로 쓴다. 축약본(`--short`)이 이 규칙을 맡고, 원본은 면접용이다.
