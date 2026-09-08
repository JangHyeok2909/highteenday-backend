# archive — 공개 저장소에서 뺀 문서

**공개 저장소에 두면 손해인데 개인적으로는 남겨 둘 가치가 있는 문서**를 여기로 옮겼다.
`git mv` 로 옮겨 히스토리는 이어진다. 내용은 옮긴 시점 그대로이고 이후 갱신하지 않는다.

정리는 두 차례 있었다.

| 차수 | 날짜 | 건수 | 뺀 이유 |
|---|---|---:|---|
| 1차 | 2026-09-05 | 5 | **문서가 틀렸거나 개인적**이었다 — 구버전 분석, 작업 인계문, 커리어 관점의 결정 기록 |
| 2차 | 2026-09-07 | 31 | **문서가 맞는데도** 코드·README 를 다시 서술한 것이라 어긋날 자리만 늘렸다 |

## 1차 (2026-09-05) — 틀렸거나 개인적인 문서 5건

근거: [../review/public-docs-audit-2026-09-05.md](../review/public-docs-audit-2026-09-05.md)

| 문서 | 원래 위치 | 왜 뺐나 | 공개 저장소의 대체 문서 |
|---|---|---|---|
| [docs/GROUP_CHAT.md](docs/GROUP_CHAT.md) | `docs/GROUP_CHAT.md` | 단체 채팅 구현 당시의 작업 인계 기록이다. "질문 없이 진행하라는 지시에 따라 기본값으로 정했다", "런타임 테스트는 하지 않았다" 같은 문장이 그대로 있어 **AI 도구가 쓴 인계문으로 읽힌다.** 스키마 변경 표·정책 결정·기본값으로 둔 항목 4개는 다시 볼 일이 있어 보존 | [docs/domains/chat.md](docs/domains/chat.md) *(2차에서 함께 이관)* |
| [docs/HOT_POST_SYSTEM.md](docs/HOT_POST_SYSTEM.md) | `docs/HOT_POST_SYSTEM.md` | 삭제된 `RecentHotPost` 엔티티를 현존하는 것으로 서술하는 등 코드와 어긋난 구버전 분석. 시퀀스 다이어그램은 참고용으로 보존 | [docs/domains/reaction-hotpost.md](docs/domains/reaction-hotpost.md) *(2차에서 함께 이관)* |
| [docs/POST_REACTION_MIGRATION.md](docs/POST_REACTION_MIGRATION.md) | `docs/POST_REACTION_MIGRATION.md` | Flyway 도입 전, `posts_likes`/`posts_dislikes` 두 테이블을 `posts_reactions` 로 합칠 때 쓴 일회성 SQL 안내. 지금은 그 테이블이 없어 실행할 일이 없다 | [docs/domains/reaction-hotpost.md](docs/domains/reaction-hotpost.md) *(2차에서 함께 이관)* |
| [docs/SYSTEM_ARCHITECTURE.md](docs/SYSTEM_ARCHITECTURE.md) | `docs/SYSTEM_ARCHITECTURE.md` | 2026-08-28 에 한 번 정정했는데도 패키지 트리에 존재하지 않는 클래스 5개(`FriendsController`, `CommentEventHandler`, `RedisService`, `S3Service`, `PostMediaService`)가 남아 다시 어긋났다. 02·03 문서와 내용이 겹쳐 "같은 사실은 한 곳에만" 규칙에 따라 뺐다 ([KI-10](../../docs/KNOWN-ISSUES.md) 갱신 줄) | [docs/02-architecture.md](docs/02-architecture.md) *(2차에서 함께 이관)*, [docs/03-package-guide.md](docs/03-package-guide.md) *(2차에서 함께 이관)* |
| [performance/go-migration-rationale.md](performance/go-migration-rationale.md) | `performance/docs/decisions/go-migration-rationale.md` | 명분 D 절이 "저자 본인도 코드 레벨 이해가 얕다", "배우는 언어가 커리어에 쓰이는 쪽이면", "약점에 대한 답으로 쓸 수 있다"처럼 **이직 준비 관점**으로 쓰여 있고 1-6 절은 사실상 예상 질문 답변이다. 계획 자체(차등 테스트, 의존 그래프, 이식 순서)는 유효하므로 보존 | 없음 — 공개 저장소에서는 이 계획을 언급하지 않는다 |

---

## 2차 (2026-09-07) — 코드를 다시 서술한 문서 31건

**이유는 1차(2026-09-05)와 다르다.** 1차는 문서가 틀렸거나 개인적인 내용이라 뺐다.
2차는 **문서가 맞는데도** 뺐다 — 코드와 README 를 다시 서술한 문서라 **코드가 바뀔 때마다
어긋날 자리만 늘렸기 때문**이다. 실제로 KI-39 는 처음부터 사실이 아닌 항목으로 장부에
올라 있었고(2026-09-07 정정), KI-40 은 2026-08-28 에 해소됐는데 갱신 줄이 빠져 있었다.

판단 기준은 하나였다. **그 문서에만 있는 실측·사건·기각한 대안이 있는가.** 있으면 남기고,
없으면 뺐다. 남긴 것은 결함 장부(KNOWN-ISSUES·defects)·ADR·마이그레이션·테스트·Redis
장애 격리·런북, 그리고 `performance/` 의 발견 장부·조사 기록·실험·최적화·병목이다.

### `docs/` 에서 뺀 22건

| 문서 | 원래 위치 | 왜 뺐나 |
|---|---|---|
| [docs/00-quickstart.md](docs/00-quickstart.md) | `docs/00-quickstart.md` | 실행 절차는 저장소 README "실행 방법" 절이 이미 전부 담고 있었다. 두 곳에 두면 한쪽이 낡는다 |
| [docs/01-overview.md](docs/01-overview.md) | `docs/01-overview.md` | 서비스 소개·도메인 지도·용어집. README 와 겹치고 마지막 검증일이 2026-07-30 에 멈춰 있었다 |
| [docs/02-architecture.md](docs/02-architecture.md) | `docs/02-architecture.md` | 계층·Port/Adapter·배포 토폴로지. 전부 패키지 트리와 compose 파일을 읽으면 나온다 |
| [docs/03-package-guide.md](docs/03-package-guide.md) | `docs/03-package-guide.md` | 패키지별 역할과 함정 8건. 함정은 코드를 읽어 찾은 것이지 실행으로 확인한 것이 아니다 |
| [docs/04-request-flow.md](docs/04-request-flow.md) | `docs/04-request-flow.md` | 필터 체인·인증/인가·예외 경로. `SecurityConfig` 가 단일 출처다 |
| [docs/05-data-model.md](docs/05-data-model.md) | `docs/05-data-model.md` | ERD·명명 규칙·비정규화. 엔티티에서 유도되고, 규약은 `CLAUDE.md` 에 있다 |
| [docs/07-performance.md](docs/07-performance.md) | `docs/07-performance.md` | **가장 위험했던 문서.** 마지막 검증이 2026-08-11 이라 2026-09-04 의 댓글 N+1 해소(요청당 쿼리 1,507 → 3.9)·OPT-001·OPT-002·엔드포인트별 지연 목표를 전혀 모른다. 이름이 "performance" 라 먼저 열리는데 가장 낡은 이야기를 준다 |
| [docs/08-troubleshooting.md](docs/08-troubleshooting.md) | `docs/08-troubleshooting.md` | 로컬 개발 실패의 증상별 대응. quickstart 와 겹친다 |
| [docs/crosscutting/error-handling.md](docs/crosscutting/error-handling.md) | 같음 | ErrorCode 체계와 예외 → 응답 경로. `GlobalExceptionHandler` 를 읽으면 나온다 |
| [docs/crosscutting/security.md](docs/crosscutting/security.md) | 같음 | 엔드포인트 × 인가 전수 표. 표를 손으로 유지하는 한 코드와 어긋난다 |
| [docs/crosscutting/schedulers.md](docs/crosscutting/schedulers.md) | 같음 | 배치 4종의 주기·트랜잭션 경계. 스케줄러 클래스가 단일 출처다 |
| [docs/crosscutting/transactions-events.md](docs/crosscutting/transactions-events.md) | 같음 | 트랜잭션 경계와 이벤트 7종. 정확하지만 코드에서 유도된다 |
| [docs/domains/](docs/domains/) 8건 | `docs/domains/*.md` | auth · post-board · comment · reaction-hotpost · chat · notification · friend · school-timetable. **도메인 상세는 코드를 다시 쓴 것의 전형**이다. comment.md 는 같은 파일 안에서 한 쿼리를 두 번 다르게 서술하고 있었다 — 40행은 패치 조인이라 하고, 113행은 삭제된 댓글이 노출된다고 한다 |
| [docs/operations/deploy.md](docs/operations/deploy.md) | 같음 | CI/CD 파이프라인과 환경변수 표. 워크플로 파일이 단일 출처다 |
| [docs/operations/environments.md](docs/operations/environments.md) | 같음 | 프로파일 비교표. `application-*.properties` 가 단일 출처다 |

### `performance/` 에서 뺀 9건

| 문서 | 원래 위치 | 왜 뺐나 |
|---|---|---|
| [performance/MANUAL.md](performance/MANUAL.md) | `performance/MANUAL.md` | 명령어 사용설명서(58KB). 실행 순서는 `performance/README.md` 4장에, 옵션은 각 도구의 `--help` 에 있다. 실측이 하나도 없다 |
| [performance/guides/perf-beginner-guide.md](performance/guides/perf-beginner-guide.md) | `performance/docs/guides/` | 입문 튜토리얼(89KB). 사용설명서·발견 장부·신뢰 수준 문서의 재서술 |
| [performance/guides/perf-measurement-explained.md](performance/guides/perf-measurement-explained.md) | 같음 | 측정 원리 해설(71KB). **9장만 원본이라 따로 떼어 저장소에 남겼다** → `performance/docs/planning/perf-instrumentation-gaps.md` |
| [performance/guides/perf-debug-trace-guide.md](performance/guides/perf-debug-trace-guide.md) | 같음 | 디버거 추적 안내(54KB). 세션 기록 표가 "아직 없음" 인 채로 비어 있다 — 만들어 두고 쓰지 않은 양식이다 |
| [performance/guides/perf-environment-essentials.md](performance/guides/perf-environment-essentials.md) | 같음 | `performance/environment/README.md` 의 부분집합 |
| [performance/planning/ROADMAP.md](performance/planning/ROADMAP.md) | `performance/docs/planning/` | 백로그(96KB). 측정치는 전부 발견 장부에서 인용한 것이고, "완료 항목은 남기지 않는다" 는 자기 규칙을 어겨 완료 5건과 중복 절을 안고 있었다 |
| [performance/planning/perf-review-summary.md](performance/planning/perf-review-summary.md) | 같음 | 2026-08-25 기준 현황 요약. EXP-005·OPT-001·OPT-002(2026-09-04 완료)를 모른다 |
| [performance/design/perf-metrics-catalog-plan.md](performance/design/perf-metrics-catalog-plan.md) | `performance/docs/design/` | 미구현 설계. 상태가 2026-08-18 부터 "결정 완료, 구현 전" 이다 |
| [performance/design/perf-report-redesign.md](performance/design/perf-report-redesign.md) | 같음 | 리포트 개선 잔여 과제. 대부분 백로그다 |

### 함께 한 저장소 수정

- **KI-39 정정** — 처음부터 사실이 아니었다. `findByPost()` 의 JPQL 은 장부 작성(2026-07-30) 이전부터 `isValid=true` 를 걸고 있었다 (`66af969`, 2025-07-22)
- **KI-40 갱신** — 2026-08-28 에 `94c4a45` 로 해소됐는데 갱신 줄이 없었다
- **`performance/regression/README.md`** — 오탐 방지 장치를 "네 가지" 로 적어 **대조군 유효성 게이트를 빠뜨리고** 있었다. `PERFORMANCE-MANAGEMENT.md` 의 다섯 가지에 맞췄다
- **ADR 4건의 마지막 검증일** — 본문이 2026-08 변경을 인용하는데 머리말은 2026-07-30 이었다
- **`docs/INDEX.md` 재작성** — 온보딩 목차에서 "결함·결정·장애 대응" 지도로

### 옮긴 문서 안의 링크는 고치지 않았다

보관 문서는 옮긴 시점 그대로 둔다는 이 디렉터리의 규칙을 따랐다. 그래서 옮긴 문서끼리,
또는 저장소를 가리키던 상대 경로 링크는 끊어져 있다. **저장소에 남은 문서의 링크는
전부 고쳤고, 깨진 상대 링크가 없음을 확인했다.**

## 1차 문서를 다시 공개하려면

문서를 되돌리는 것이 아니라 **문제가 된 문장을 걷어낸 새 문서**를 쓴다. 특히 Go 이식 계획은
명분 A·B·C 와 2~4부만 남기고, 명분 D 와 1-6 절을 빼면 공개해도 되는 결정 기록이 된다.
