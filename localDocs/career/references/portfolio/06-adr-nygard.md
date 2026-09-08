# Michael Nygard — Architecture Decision Record(ADR)의 원형

> **확보일** 2026-09-07 · **원문 언어** 영어 · **저장 범위** 템플릿 다섯 항목의 정의와 운용 원칙 전부
>
> | 출처 | 주소 | 확보 방법 |
> |---|---|---|
> | *Documenting Architecture Decisions* (2011-11-15) | https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions | WebFetch |

## 왜 모범 사례인가

- ADR(Architecture Decision Record, 설계 결정 기록)이라는 문서 형식의 **원문**이다. 이후 ThoughtWorks Technology Radar "adopt", AWS 권장 사례, GitHub의 `adr-tools` 등으로 퍼졌다.
- 사용자 포트폴리오의 "버린 대안" 절(2.3 만료를 누가 정하는가 · 3.5 왜 실패로 만들지 않았나 · 4.4 스크립트 지문을 해시에서 뺀 판단 · 6.4 버린 대안 · 7.3 · 8.3 왜 유니크 제약인가)이 전부 설계 결정 기록이다. 이 형식이 그 절들의 **표준 순서**를 준다.

---

## 1. 템플릿 (원문 정의)

| 항목 | 원문 규칙 |
|---|---|
| **Title** | *"short noun phrases"*. 예: "ADR 1: Deployment on Ruby on Rails 3.0.10" |
| **Context** | *"describes the forces at play, including technological, political, social, and project local. These forces are probably in tension, and should be called out as such. The language in this section is value-neutral. It is simply describing facts."* |
| **Decision** | *"our response to these forces."* *"full sentences, with active voice"*. **"We will …"** 형태 |
| **Status** | *"proposed" / "accepted" / "deprecated" / "superseded"* (무엇으로 대체됐는지 참조) |
| **Consequences** | *"the resulting context, after applying the decision. All consequences should be listed here, **not just the 'positive' ones.**"* |

## 2. 운용 원칙 (원문 요지)

- 파일은 `doc/arch/adr-NNN.md`처럼 **코드와 같은 저장소**에 둔다.
- 번호는 **단조 증가하고 재사용하지 않는다.**
- 결정이 뒤집혀도 **옛 기록을 지우지 않는다.** 상태를 superseded로 바꾸고 새 기록을 가리킨다.
- 분량은 **한두 쪽**. *"written as if it is a conversation with a future developer."*
- *"Bullets are acceptable only for visual style, **not as an excuse for writing sentence fragments.**"*
- 효과: 새 팀원이 "왜 이렇게 했지"를 물을 필요가 없어지고, 맥락 모르는 사람이 결정을 맹목적으로 따르거나 되돌리는 일을 막는다.

## 3. 뼈대에서 읽히는 것

- **Context는 가치 중립.** 대안 비교를 쓸 때 "A가 좋다"부터 쓰지 않고, 서로 당기는 힘(성능 vs 단순성, 지금 비용 vs 나중 비용)을 먼저 적는다.
- **Consequences에 부정적 결과를 반드시 쓴다.** 사용자 6.6절("부작용을 숨기지 않기": 중복 행 +22.9%, 쿼리당 단가 6.4배)이 정확히 이 항목이다. 다른 결정 절에도 같은 항목이 있어야 일관된다.
- **Decision은 "We will"로 시작하는 능동 문장.** 결정 문장이 어디 있는지 한눈에 찾히게 한다.
- **superseded를 남긴다.** 사용자 5.3절("스스로 무효 처리한 확정치")은 옛 결정을 superseded로 표시한 ADR과 같다. 지우지 않고 무효 사유를 남긴 것이 맞다.
- 포트폴리오의 결정 절 하나를 이 다섯 항목으로 재배열하면 면접 꼬리질문("왜 분산 락이 아니라 유니크 제약인가")의 답이 문서 순서와 같아진다.
