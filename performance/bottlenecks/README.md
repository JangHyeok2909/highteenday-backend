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
| [BTL-008](BTL-008-token-table-case-mismatch.md) | `Token` 엔티티/테이블 대소문자 불일치 (Linux MySQL에서 로그인 전면 장애) | Correctness | **확정** | — | — |
| [BTL-009](BTL-009-daily-hot-post-table-missing.md) | `DailyHotPost` 엔티티가 쿼리하는 `daily_hot_post` 테이블이 어디서도 생성되지 않음 | Correctness | **확정** | — | — |
| [BTL-010](BTL-010-comment-update-npe.md) | 이미지 없는 댓글 수정 시 NPE (댓글 수정 전면 장애) | Correctness | **확정** | — | — |
| [BTL-011](BTL-011-notification-entityid-column-mismatch.md) | `Notification.entityId` 컬럼명 불일치 (알림 목록 전면 장애) | Correctness | **확정** | — | — |
| [BTL-012](BTL-012-scrap-toggle-race-duplicate.md) | 스크랩 토글 체크-후-실행 경쟁 상태 → 중복 행 → 게시글 상세 전면 장애 | Race Condition | **확정** | — | — |

병목 문서는 `TEMPLATE.md` 양식을 따른다. 각 문서의 "재현 방법"은
이 저장소의 시나리오/스크립트 명령으로 완결되어야 한다.
