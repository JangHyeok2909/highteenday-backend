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
| [BTL-003](BTL-003-hot-row-counter.md) | 인기글 비정규화 카운터 락 경합 (실측 데드락 재현됨) | Lock | **확정** | EXP-003 | — |
| [BTL-004](BTL-004-cache-stampede.md) | 캐시 스탬피드/애벌랜치 무방비 | Cache | 의심 | EXP-004 | — |
| [BTL-005](BTL-005-comment-nplus1.md) | 댓글 목록 N+1 | JPA/Query | 의심 | EXP-005 | — |
| [BTL-006](BTL-006-simplebroker-scale.md) | SimpleBroker 인메모리 브로커 한계 | WebSocket | 의심 | — | — |
| [BTL-007](BTL-007-scheduler-burst.md) | 스케줄러 flush 버스트 간섭 | Scheduler | 의심 | — | — |

병목 문서는 `TEMPLATE.md` 양식을 따른다. 각 문서의 "재현 방법"은
이 저장소의 시나리오/스크립트 명령으로 완결되어야 한다.

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
