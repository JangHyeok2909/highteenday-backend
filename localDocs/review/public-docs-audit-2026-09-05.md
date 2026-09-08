# 공개 문서 감사 — 2026-09-05

> 답하는 질문: **저장소를 공개(2026-09-04)한 뒤, 문서를 채용 담당자·면접관의 눈으로 다시 읽으면
> 무엇이 감점 요인이고 무엇을 어떻게 고쳤는가?**
> 범위: 저장소의 모든 `.md`(`localDocs/` 제외). 성능 보고서 산출물(`performance/reports/**`)은
> 문서가 아니라 데이터라 제외했고, 그쪽은 [KI-58](../../docs/KNOWN-ISSUES.md) 에서 따로 결정했다.
> 결과: 파일 5개 이동, 파일 54개 수정, `localDocs/` 에 문서 4개 추가. 커밋은 하지 않았다.

---

## 1. 감점 요인의 종류

읽으면서 나온 문제는 네 종류였다. 종류마다 처방이 다르다.

| 종류 | 무엇이 문제인가 | 처방 |
|---|---|---|
| **A. AI 도구와의 협업 흔적** | "사용자 결정에 따라", "질문 없이 진행하라는 지시에 따라", "실제 사용자 피드백이 그랬다", `Claude Code` 가 같은 호스트에서 돈다는 환경 기록, 개인 브랜치명 `personal/localdocs`. 솔로 저장소에서 "사용자"는 곧 AI 의 운영자라는 뜻이고, 읽는 사람은 문서를 AI 가 썼다고 판단한다 | 문장을 걷어내거나 중립 표현으로 바꿈. 문서 하나(`GROUP_CHAT.md`)는 통째로 archive |
| **B. 코드보다 낡은 서술** | 온보딩 문서 대부분이 "마지막 검증일 2026-07-30" 이었고, 8/28 에 해소된 결함(IDOR, CSRF, CI 테스트 없음, 블랙리스트 인가, 물리 삭제, 커밋 전 캐시/발행 …)을 **현재 진행형으로** 서술했다. 결함을 솔직하게 적은 것은 장점이지만, 고친 뒤에도 그대로면 "보안 결함이 있는 저장소"로 읽힌다 | 코드와 대조해 현재 상태로 고치고 "→ 해소" 를 명시. 검증일을 2026-09-05 로 |
| **C. 개인 환경·개인 계획** | `C:\Users\user\...` 절대 경로, nvm 실행 파일 경로, "다음 작업일의 진행 순서", "밤새 무인으로 돌려 둘 실행 목록", 커리어 관점의 결정 기록 | 경로는 일반화, 개인 계획 절은 `localDocs/worklog/` 로 분리, 결정 기록은 archive |
| **D. 노출 그 자체** | KI-03 항목에 **유출된 NEIS 키의 접두어와 키가 들어 있는 커밋 해시**가 적혀 있었다. 공격자에게 "어디를 보면 되는지" 알려 주는 셈이다 | 공개 문서에서는 개수만 남기고 위치·문자열은 뺌. 상세는 아래 4절에 보존 |

## 2. 옮긴 문서 (5개)

`localDocs/archive/` 로 `git mv`. 사유는 [../archive/README.md](../archive/README.md).

- `docs/GROUP_CHAT.md` — A (AI 인계문)
- `docs/HOT_POST_SYSTEM.md` — B (삭제된 엔티티를 현존으로 서술)
- `docs/POST_REACTION_MIGRATION.md` — B (없는 테이블의 일회성 마이그레이션)
- `docs/SYSTEM_ARCHITECTURE.md` — B (존재하지 않는 클래스 5개, 02·03 과 중복)
- `performance/docs/decisions/go-migration-rationale.md` — C (커리어 관점, 예상 질문 답변)

옮기면서 고친 참조: `docs/INDEX.md`(흡수 표 삭제), `docs/KNOWN-ISSUES.md`(KI-10·KI-24),
`docs/domains/chat.md`·`reaction-hotpost.md`, `docs/crosscutting/schedulers.md`·`transactions-events.md`,
`performance/docs/README.md`(문서 지도 행 삭제). 링크 검사 결과 깨진 상대 링크 0건.

## 3. 고친 문서 — 무엇을 어떻게

### 3-1. 종류 A — AI 협업 흔적 (걷어낸 문장)

| 파일 | 원문 | 처리 |
|---|---|---|
| `docs/KNOWN-ISSUES.md` KI-06·16·34 | "사용자 결정에 따라 …" | 구절 삭제 (결정 내용은 그대로) |
| `docs/KNOWN-ISSUES.md` KI-01·02 | "10일 가까이 누락돼 있었다 … 가장 먼저 읽는 두 줄" | 자책 어조를 줄이고 규칙("코드를 고치면 같은 작업 안에서 장부를 갱신한다")만 남김 |
| `docs/KNOWN-ISSUES.md` 머리·절 제목 | "Phase 1/2/3/4에서 확인분" | 어느 문서를 쓰다 나왔는지로 바꿈 (Phase 는 문서화 캠페인 내부 용어) |
| `docs/*` 여러 곳 | "(Phase 2 예정)", "Phase 3에서 명시" | 실제 문서 링크로 |
| `performance/experiments/EXP-000` | "IDE, Claude Code 등", "IDE와 Claude Code가 같은 호스트에서", 커밋 옆 `(personal/localdocs)`, chocolatey k6 절대 경로, "아직 Git에 추적되지 않는다" | "IDE 등 개발 도구", 짧은 커밋 해시만, 경로 일반화, 추적 상태 서술 갱신 |
| `performance/docs/findings/perf-findings-tools.md` | "실제 사용자 피드백이 그랬다", "(사용자 결정)" | "실제로 리포트를 읽으면서 그렇게 됐다", "(소급 복구하지 않기로 결정)" |
| `performance/docs/findings/perf-dataset-generation-problems.md` | "이 문제를 처음 보는 내가" | "처음 보는 사람이" |
| `performance/bottlenecks/BTL-008`·`BTL-009` | "백엔드팀 확인 필요", "근본 수정은 담당자 몫이다" | 솔로 저장소에 맞는 문장으로 (외부 컨설턴트 어조 제거) |
| `docs/defects/KI-54`, `docs/05-data-model.md`, KI-33·50 | "CLAUDE.md 의 규칙과 충돌 / 절반만 맞다" | "규약 문서" 로 중립화하고, 이미 정정된 CLAUDE.md 서술은 갱신 줄로 |
| `.gitignore` | "이 개인 브랜치(personal/localdocs)에서는 …" 주석 | 삭제. 이 주석은 develop 에도 그대로 있었다 |
| `AGENTS.md` | CLAUDE.md 의 274줄 복사본 ("Guidance for Codex") | 4줄짜리 포인터로 교체 — 둘이 어긋나는 것을 막는다 |

### 3-2. 종류 B — 낡은 서술 (코드 대조 결과)

전부 `src/main`·`src/test`·워크플로를 직접 열어 확인했다. 확인 근거는 각 문서의 갱신 문장에 적혀 있다.

| 문서 | 낡았던 서술 | 현재 상태로 고친 내용 |
|---|---|---|
| `README.md` | "docker compose up 전체 기동 불가 (KI-01)", 필수 환경변수 목록, S3 "tmp 폴더 일괄 삭제" | compose 3서비스 기동, dev 기본값 전부 있음, 승격한 객체만 삭제(KI-36) |
| `docs/00-quickstart.md` | MySQL 개별 기동 절차 중복, `@SpringBootTest` 실패, KI-01·02 미해결 | `docker compose up -d mysql redis`, test 프로파일로 전부 통과, 해소 표기 |
| `docs/02-architecture.md` | dev `ddl-auto=update`, CI 에 테스트 없음, 파이프라인 2잡 | Flyway·`none`, test→build→deploy 3잡 + 헬스체크·롤백, perf 프로파일 행 추가 |
| `docs/04-request-flow.md` | 블랙리스트 인가 | 화이트리스트 (공개 GET 9패턴 + POST 3개), `AuthorizationMatrixTest` |
| `docs/05-data-model.md` | "Flyway 는 미병합 브랜치", dev update/prod 수동 SQL | Flyway V1~V9, 수동 SQL 은 기록용 |
| `docs/06-testing.md` | 파일 30개·`@Test` 약 180개, `@WebMvcTest` 0건, `spring-security-test` 없음, CI 없음 | 파일 58개·약 600건, 웹 슬라이스·보안·구조 테스트 기반, CI 게이트 — 인벤토리 전면 재작성 |
| `docs/08-troubleshooting.md` | compose 실패·JWT_KEY 필수·SchoolInfoInitializer 크롤·토큰 refresh 500·검증 500·`@SpringBootTest` 실패 | 해소된 증상 삭제, `@DataJpaTest` Auditing·KI-38·쿼리 계측 추가 |
| `docs/crosscutting/security.md` | 인가 전수표 전체가 "GET /** permitAll" 기준, KI-05·14 미해결 | 전수표를 화이트리스트 기준으로 재작성, Origin 검증 필터 설명 |
| `docs/crosscutting/redis.md` | 핫랭킹 TTL 없음, count TTL 5분/60분 불일치, 인자 로깅, catch(Exception), GETDEL 유실 | TTL 2일/30분, COUNT_TTL 통일 + 재집계, DataAccessException, peek/settle |
| `docs/crosscutting/schedulers.md` | 배치 전체 한 트랜잭션, 자기호출, 선삭제 유실, 급식 deleteAll 유실 | 게시글 단위 트랜잭션, 읽기→반영→차감, 0건이면 기존 유지 |
| `docs/crosscutting/error-handling.md` | `e.getMessage()` 노출, 죽은 BindException, `@Valid` 3곳, 토큰 500 | 고정 문구 + 상세 반영, 31개 `@Valid` + 구조 테스트, ErrorCode 매핑 |
| `docs/crosscutting/transactions-events.md` | KI-22·23·24 미해결, TokenService 만 jakarta | `AfterCommitExecutor` 로 해소, jakarta 는 다른 3개 서비스에 잔존 |
| `docs/domains/auth.md` | 서비스가 응답 객체 수령, 콜백 경로 문서 불일치, 탈퇴 물리 삭제, refresh 500 | 컨트롤러가 쿠키 발급(KI-32 해소 확인), soft delete + 이메일 무효화 |
| `docs/domains/chat.md` | `V_group_chat.sql` 수동 실행, 테스트 없음, 커밋 전 발행 | Flyway V1/V4, `ChatServiceTest` 114건, 커밋 후 발행 |
| `docs/domains/comment.md` | 반복 쿼리 결함, 소유권 검증 없음, `commentCount++` | 요청당 쿼리 4개, 소유권 검증, 원자 UPDATE |
| `docs/domains/friend.md` | 요청·관계 행 물리 삭제, 오입력 소실 | soft delete + 조회 6개에 `is_valid`, 응답 enum 검증 |
| `docs/domains/notification.md` | 커밋 전 push | 커밋 후 push |
| `docs/domains/post-board.md` | `page < 5` 진입, count 1 부활, `deleteUserTmp`, 커밋 전 캐시, GETDEL | 끝 인덱스 진입, 재집계, `deletePromotedTmpFiles`, 커밋 후, peek/settle |
| `docs/domains/reaction-hotpost.md` | 조회 후 insert, TTL 없음, 취소 시 이벤트 없음 | upsert, TTL, 취소도 이벤트 발행 (KI-37 은 스크랩만 잔존) |
| `docs/domains/school-timetable.md` | 소스 주석의 키, `SchoolInfoInitializer` 매 부팅 크롤, deleteAll 후 재적재 | 키는 환경변수만, 초기화기 삭제, 삭제→저장 순서 |
| `docs/operations/deploy.md` | 2잡, 테스트·헬스체크·롤백 없음 | 3잡, test 잡·ci.yml, 헬스체크 120초 + 직전 이미지 롤백 |
| `docs/operations/environments.md` | local 파일 부재, dev 필수 변수 | 예시 파일, dev 기본값 전부, 쿼리 계측 행 |
| `docs/operations/runbook.md` | 자동 롤백 없음, dev update/prod 수동 SQL | 자동 롤백 + 수동 절차, Flyway 절차 |
| `docs/MIGRATION.md` | V1~V7, compose 에 MySQL 없음, daily_hot_post 미해결 | V8·V9 추가, compose mysql, V6 해소 |
| `docs/adr/adr-001·002·004` | 후보 미구현, GETDEL, tmp 전체 삭제 | upsert·KI-53·55 반영, peek/settle, 승격분만 삭제 |
| `docs/defects/README.md` | KI-53 미해결 | 해결 (2026-08-14) |
| `docs/KNOWN-ISSUES.md` | KI-10·32·33·50·51 에 갱신 줄 없음 | 코드 확인 후 갱신 줄 추가 (KI-33 본문은 미해결 유지) |
| `performance/experiments/README.md` | EXP-005 "다음 실행 대상", EXP-006 없음, `reports/raw/` | 완료, EXP-006 행, `reports/runs/` |
| `performance/experiments/EXP-005` §2 | 메모 어조의 가설 판단("매우느림", "탓일거다", 오타 "걔축") | 다른 절과 같은 문체로 재서술, 판단 과정 문서 링크 |
| `performance/optimizations/OPT-001·002` | "적용 커밋: (미커밋 — 작업 트리)", 후속 조치 미체크 | `d346714`·`d3b4eb5`, 완료 항목 체크 |
| `performance/bottlenecks/README.md` | BTL-008~012 표가 두 번(상태 불일치) | 한 표로 합치고 KI 대응만 남김 |
| `performance/bottlenecks/BTL-001·004` | count 캐시 5분 TTL | 60분 (KI-56 이후) |
| `performance/README.md`, `MANUAL.md` | BTL-001~012, 목적 "역량 증명" | 014, "재현 가능한 기록" |

### 3-3. 종류 C — 개인 환경·계획

- 절대 경로 `C:\Users\user\Desktop\...\performance` (MANUAL, 초심자 가이드) → `<저장소 루트>\performance`
- `C:\Users\user\AppData\Local\nvm\v22.23.1\node.exe` (ROADMAP) → "nvm 이 설치한 Node 22 실행 파일"
- ROADMAP 의 "다음 작업일의 실제 진행 순서"·"밤새 무인으로 돌려 둘 실행 목록"(300줄) → [../worklog/roadmap-personal-ops.md](../worklog/roadmap-personal-ops.md) 로 분리
- `CLAUDE.md` 커밋 규칙 "English" → 2026-09-04 부터 한글 (실제 커밋과 문서가 어긋나 있었다)

## 4. 공개 문서에서 뺀 정보의 보존 (개인용)

### 4-1. KI-03 NEIS 키 노출 상세 — 재발급 전까지 여기서만 본다

- 노출 범위: 공개 히스토리의 커밋 6개, 파일 6개 — `api/` 와 이전 위치 `services/school/` 의
  `SchoolInfoService`·`SchoolMealService`·`SchoolScheduleService`.
- 최초 유입 커밋: `37f1bcd` (`apiKey` 필드 위 주석). 키는 32자 hex, 접두어 `cee4ba90`.
- 현재 HEAD 트리에는 없다. 히스토리 재작성으로는 무효화되지 않으므로 **NEIS 포털에서 폐기·재발급**이
  유일한 조치이고, 재발급 후 운영 환경변수 `NEIS_API_KEY` 만 바꾸면 된다.
- 확인 명령: `git log --all -S'cee4ba90' --oneline -- src` (재발급 뒤 이 줄도 지워도 된다)

### 4-2. GROUP_CHAT.md 가 기록한 "기본값으로 둔 결정" 4개

초대 권한 관리자 이상 / 과거 대화 비공개(`joinedMsgId` 하한) / 초대에도 친구 관계 요구 /
`SCHOOL`·`GRADE` 범위 제외. 바꾸려면 각각 한 줄 수정이라는 메모까지 archive 원문에 있다.

### 4-3. Go 이식 계획

archive 원문 그대로. 공개용으로 다시 쓸 때는 명분 D 와 1-6 절(예상 질문 답변)을 뺀다.

## 5. 남긴 결정과 잔여 위험

| 항목 | 결정 | 이유 |
|---|---|---|
| `CLAUDE.md` 를 공개 저장소에 그대로 둔다 | 유지 | 프로젝트 규약(빌드·아키텍처·컨벤션)의 단일 출처이고 도구 설정 파일로 흔한 형태다. 낡은 규칙(커밋 언어)만 고쳤다. 뺄지는 사용자 판단 |
| `performance/docs/` 의 발견 장부·조사 기록·안내서 | 유지 | 결함을 스스로 찾아 고친 과정이 근거와 함께 있어 강점이다. 문장 단위 흔적만 걷어냈다 |
| `docs/KNOWN-ISSUES.md` 의 해소되지 않은 결함 서술 | 유지 | "안 고치기로 정한 것을 이유와 함께" 가 README 가 내세우는 가치다. 해소된 것과 미해결을 구분만 했다 |
| `performance/reports/**` 의 호스트명·브랜치명 (KI-58) | 그대로 | 사용자가 2026-09-05 에 "지금 고치지 않는다" 로 결정한 항목 |
| 브랜치 동기화 | 병합하지 않음 | `personal/localdocs` 와 `origin/develop` 은 merge-base 가 635/598 커밋 전이라 병합이 성립하지 않는다(체리픽 흐름). develop 이 앞선 파일 4개(`CLAUDE.md`, `README.md`, `docs/KNOWN-ISSUES.md`, `performance/.gitignore`)만 develop 버전으로 덮어쓴 뒤 수정했다 |
| `performance/reports/overnight/*.log` | 손대지 않음 | develop 은 삭제·gitignore 했고 이 브랜치에는 아직 추적 중이다. 동기화할 때 `git rm --cached` 로 맞추면 된다 |
| develop 의 `.gitignore` 에 `localDocs/` 규칙이 없다 | 확인 필요 | develop 에서 실수로 `localDocs/` 를 만들면 추적된다. develop 쪽에만 `localDocs/` 한 줄을 넣어 두는 것이 안전하다 |

## 6. 이번 변경을 커밋으로 나누는 안

`localDocs/` 는 항상 단독 커밋, 나머지는 성격별로 셋.

1. `docs: 해소된 결함을 반영해 온보딩 문서를 현재 코드 기준으로 갱신` — `README.md`, `docs/**`, `AGENTS.md`, `CLAUDE.md`, `.gitignore`
2. `docs(perf): 성능 문서의 낡은 상태·개인 환경 서술을 정리` — `performance/**`
3. `docs: 흡수·구버전 문서 4개와 Go 이식 계획을 공개 저장소에서 제거` — `git mv` 된 5개 파일의 삭제 쪽 (이동의 반대편은 4번에)
4. `docs(localdocs): 공개 문서 감사 기록과 보관 문서 추가` — `localDocs/**` (이동해 온 파일 5개 + 새 문서 4개)

3·4 는 같은 `git mv` 의 양쪽이라 실제로는 한 커밋이 자연스럽지만, "localDocs 는 단독 커밋" 규칙을
지키려면 `git rm --cached` 로 삭제만 먼저 커밋하고 추가를 뒤에 커밋한다.
