# Bottlenecks — 병목 카탈로그

발견했거나 코드 구조상 강하게 의심되는 병목의 대장. 상태 규칙:

- **의심** — 코드 근거는 있으나 미측정. 대응 실험(EXP)으로 검증 예정
- **확정** — 실험으로 재현·계측 완료 (실험 문서 링크 필수)
- **해소** — 최적화 적용 + After 측정 완료 (optimizations/ 링크 필수)
- **기각** — 실험 결과 병목이 아님으로 판명 (이것도 기록으로 남긴다)

| ID | 병목 | 유형 | 상태 | 실험 | 최적화 |
|----|------|------|------|------|--------|
| [BTL-001](BTL-001-random-pagination.md) | 게시글 목록 랜덤/OFFSET 페이징 | DB/Query | 의심 | — | — |
| [BTL-002](BTL-002-pool-mismatch.md) | Tomcat 400 vs HikariCP 10 불균형 | Connection Pool | 의심 | EXP-002 | — |
| [BTL-003](BTL-003-hot-row-counter.md) | 인기글 비정규화 카운터 락 경합 (2026-08-16 large 생성에서 재시도 9,437회·실패 1건으로 규모 계측) | Lock | **확정** | EXP-003 | — |
| [BTL-004](BTL-004-cache-stampede.md) | 캐시 스탬피드/애벌랜치 무방비 | Cache | 의심 | EXP-004 | — |
| [BTL-005](BTL-005-comment-nplus1.md) | 댓글 목록 N+1 | JPA/Query | 의심 | EXP-005 | — |
| [BTL-006](BTL-006-simplebroker-scale.md) | SimpleBroker 인메모리 브로커 한계 | WebSocket | 의심 | — | — |
| [BTL-007](BTL-007-scheduler-burst.md) | 스케줄러 flush 버스트 간섭 | Scheduler | 의심 | — | — |

병목 문서는 `TEMPLATE.md` 양식을 따른다. 각 문서의 "재현 방법"은
이 저장소의 시나리오/스크립트 명령으로 완결되어야 한다.

### BTL-008~012 — 번호만 여기 있는 애플리케이션 결함

아래 다섯은 **병목이 아니라 결함**이다. 부하 테스트를 돌리다 발견해 이 폴더에 번호를 받았지만,
"느려서 문제"가 아니라 "틀려서 문제"라 위 카탈로그의 상태 어휘(의심 → 확정 → 해소, EXP로 검증)가
맞지 않는다. 그 구분은 아래 "여기 없는 것 — 애플리케이션 결함" 절에서 정했고, 이 다섯은 그
구분이 서기 전에 등록된 것들이다. **전부 해소됐고, 적용된 Flyway 마이그레이션 주석과 커밋이
이 번호를 참조하고 있어 삭제하지 않는다.**

| ID | 결함 | 해소 방법 |
|----|------|-----------|
| [BTL-008](BTL-008-token-table-case-mismatch.md) | `Token` 테이블명 대소문자 불일치 (Linux에서 인증 전 기능 장애) | `@Table(name="tokens")` + V5 마이그레이션 |
| [BTL-009](BTL-009-daily-hot-post-table-missing.md) | `DailyHotPost`가 쿼리하는 테이블이 생성되지 않음 | V6 마이그레이션으로 정식 생성 |
| [BTL-010](BTL-010-comment-update-npe.md) | 이미지 없던 댓글 수정 시 NPE | `processUpdateCommentMedia()` null 가드 |
| [BTL-011](BTL-011-notification-entityid-column-mismatch.md) | `Notification.entityId` 컬럼명 불일치 (알림 목록 전면 장애) | V3 마이그레이션으로 컬럼명 통일 |
| [BTL-012](BTL-012-scrap-toggle-race-duplicate.md) | 스크랩 토글 경쟁 상태로 중복 행 → 게시글 상세 장애 | `UNIQUE(USR_id, PST_id)`(V7) + upsert 단일 문장 |

앞으로 발견되는 애플리케이션 결함은 여기가 아니라
[`docs/KNOWN-ISSUES.md`](../../docs/KNOWN-ISSUES.md)에 등록한다.

## 개선 전 공통 선행 조건

**어느 병목을 고치든 아래 넷이 먼저다.** 병목마다 다른 조건은 각 문서의 "개선 전 선행 조건"
절에 있고, 여기 있는 것은 전부에 공통으로 걸린다. 한 곳에만 적는 이유는 조건이 바뀔 때
일곱 문서가 서로 어긋나는 것을 막기 위해서다.

### ① 리포트에서 읽기·쓰기 P95를 읽을 수 있어야 한다 (S-25)

지금 리포트의 op 축에서 `read`·`write` 행은 **요청 개수만 있고 지연 통계가 없다.**
`measureOnly()`가 태그를 2개로 만들어 `breakdown()`이 건너뛰기 때문이다. 이 프로젝트의
SLO가 그 두 값으로 정의돼 있는데도 그렇다.

그래서 지금은 개선 전후 대조를 `run.json`의 `rawMetrics`에서
`http_req_duration{op:read,phase:measure}`를 직접 읽어야 한다. **어느 병목이든 "좋아졌다"의
1차 근거가 이 값이므로 이것이 가장 먼저다.**

### ② Before와 After를 연달아 재야 한다 (E-46)

같은 조건 반복 세트에서 시간 방향 드리프트가 관측됐다. 두 세트 모두 |Spearman| ≈ 0.9였고
한 번은 회차당 +218ms씩 느려졌다(110개 지표는 전부 평평했다 — 원인 미확인).

- 같은 세션에서 **연달아** 비교하면 실효 노이즈는 1.7%대다
- **시간을 두고** 비교하면 드리프트가 노이즈가 아니라 **편향**으로 개선 폭에 섞인다.
  30분마다 1.8%면 하루 뒤 재는 After는 아무것도 안 고쳐도 느리게 나온다

세션 간 재현성은 아직 한 번도 재지 않았다. 개선 작업이 며칠에 걸치면 **저장된 Before를
그대로 쓰지 말고 다시 잰다.**

### ③ MDE를 다시 확정해야 한다 (T-31 후속)

문서에 실린 CV 3.12% / MDE 10%는 **전체 구간(`k6.all`) 기준**으로 계산된 값이다.
2026-08-18에 `repeatability.js`가 판정 구간(`phases.measure`)을 읽도록 고쳐졌으므로
(p95 기준 3.4% 차이) **CV와 MDE를 다시 잡아야 한다.**

MDE보다 작은 개선은 "효과가 없다"가 아니라 **"효과를 확인하지 못했다"**로 기록한다.
인덱스 추가나 N+1 제거는 보통 수십 %라 안전하지만, 미세 튜닝은 이 환경에서 판정 불가일 수 있다.

### ④ 부하가 개선 대상 경로로 실제 가는지 확인해야 한다 (S-15, S-16)

가장 자주 배신당하는 지점이다. 최적화는 특정 쿼리·특정 캐시를 겨냥하는데 부하가 거기 가지
않으면 개선은 "효과 없음"으로 기록되고, 더 나쁜 경우 엉뚱한 경로가 개선되어 "효과 있음"으로
잘못 기록된다.

- **S-15** — 문서가 말하는 요청과 실제 요청이 다른 곳이 있다. 전면 감사는 필요 없고
  **개선하려는 그 경로 하나만** 실제 요청과 대조하면 된다
- **S-16** — `200 []`도 성공으로 집계된다. 빈 응답은 빠르므로, 대상 데이터가 없는 요청이
  섞이면 개선 효과가 희석되거나 반대 결론이 난다

측정 시스템(부하 스크립트·데이터 생성 규칙)을 건드리면 그건 최적화가 아니라 **측정 시스템
변경**이다. 지문이 갈려 옛 기준선과의 자동 비교가 끊기며, 그건 정상 동작이다 — 그때는
새 부하로 Before를 다시 잰다.

## 여기 없는 것 — 애플리케이션 결함

**이 카탈로그는 "느려서 문제인 것"만 담는다.** "틀려서 문제인 것"은 성능을 아무리 개선해도
사라지지 않으므로 [`docs/KNOWN-ISSUES.md`](../../docs/KNOWN-ISSUES.md)가 단일 출처다.
상태 어휘(`의심 → 확정 → 해소`, EXP로 검증)도 병목용이라 기능 결함에는 맞지 않는다 —
NPE를 실험으로 "확정"하지는 않는다.

아래 다섯 건(BTL-008·009·010·011·012)은 **부하 테스트로 발견한 애플리케이션 결함**이다. 번호는 발견 순서를
보존하려고 `BTL-` 접두사를 그대로 두었다(마이그레이션 주석·`bootstrap.js` 등 여러 곳에서
이 번호로 참조된다). 병목이 아니므로 위 표에서는 분리한다.

| ID | 결함 | 유형 | 상태 | KNOWN-ISSUES |
|----|------|------|------|---------------|
| [BTL-008](BTL-008-token-table-case-mismatch.md) | `Token` 엔티티/테이블 대소문자 불일치 (Linux MySQL에서 로그인 전면 장애) | Correctness | **확정** | [KI-29](../../docs/KNOWN-ISSUES.md) |
| [BTL-009](BTL-009-daily-hot-post-table-missing.md) | `DailyHotPost`가 쿼리하는 `daily_hot_post` 테이블이 생성되지 않음 | Correctness | **해소** (V6) | [KI-28](../../docs/KNOWN-ISSUES.md) |
| [BTL-010](BTL-010-comment-update-npe.md) | 이미지 없는 댓글 수정 시 NPE (댓글 수정 전면 장애) | Correctness | **확정** | [KI-41](../../docs/KNOWN-ISSUES.md) |
| [BTL-011](BTL-011-notification-entityid-column-mismatch.md) | `Notification.entityId` 컬럼명 불일치 (알림 목록 전면 장애) | Correctness | **해소** (V3) | 대응 항목 없음 |
| [BTL-012](BTL-012-scrap-toggle-race-duplicate.md) | 스크랩 토글 체크-후-실행 경쟁 상태 → 중복 행 → 게시글 상세 전면 장애 | Race Condition | **해소** | [KI-54](../../docs/KNOWN-ISSUES.md) 참고 |

BTL-009·011은 해소됐지만 **문서를 지우지 않는다.** 적용이 끝난 Flyway 마이그레이션 주석
(`V3__rename_notification_entity_id.sql`, `V6__create_daily_hot_post.sql`)과
`ddl/V_daily_hot_post.sql`이 이 번호를 가리키는데, 적용된 마이그레이션은 체크섬 때문에
수정할 수 없다. 문서를 지우면 그 주석들이 존재하지 않는 곳을 가리키게 된다.

이후 발견되는 애플리케이션 결함은 **여기 추가하지 않고** `docs/KNOWN-ISSUES.md`에 `KI-nn`으로
등록한다. 분량이 필요하면 [`docs/defects/`](../../docs/defects/)에 상세 문서를 둔다
(예: [KI-53 댓글 카운터 유실](../../docs/defects/KI-53-comment-counter-lost-update.md),
[KI-54 토글 비멱등성](../../docs/defects/KI-54-toggle-non-idempotent.md)).
