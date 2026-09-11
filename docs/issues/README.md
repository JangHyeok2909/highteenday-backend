# Issue register

이 장부에는 현재 코드, 테스트, 마이그레이션 또는 실행 원자료로 다시 확인한 항목만 둔다.
이전 `KI-01~59`는 자동 승계하지 않았다. 원문은
[legacy KNOWN-ISSUES](../archive/legacy-docs/2026-09-11/KNOWN-ISSUES.md)에 보존되어 있다.

## 상태

| 상태 | 의미 |
|---|---|
| `open` | 현재 코드에서 확인되며 조치되지 않음 |
| `accepted-risk` | 영향과 비용을 알고 현재 설계를 유지함 |
| `fixed` | 코드 또는 설정을 수정했지만 운영·부하 검증은 별도일 수 있음 |
| `verified` | 수정 후 증상 재현이나 회귀 테스트로 확인함 |

## 열린 항목

| ID | 상태 | 문제 | 근거 또는 Case |
|---|---|---|---|
| AUTH-001 | `open` | 인증 필터가 모든 `RuntimeException`을 삼키고 익명 요청으로 진행해 인프라 실패도 401로 보일 수 있음 | [CASE-007](../../performance/cases/CASE-007-redis-failure-cascade/) |
| AUTH-002 | `open` | JWT 인증 성공 경로가 매 요청마다 User를 DB에서 조회함 | `TokenProvider.getAuthentication()` |
| RES-001 | `open` | Redis 연결·명령 timeout이 명시되지 않아 장애 시 실패가 늦고 공유 자원으로 전파됨 | [CASE-007](../../performance/cases/CASE-007-redis-failure-cascade/) |
| API-001 | `open` | 반응과 스크랩이 toggle POST라 동일 요청 재시도가 원래 상태를 복구하지 않음 | 현재 Controller와 Service 계약 |
| PERF-001 | `open` | 게시글 부분 문자열 검색이 일반 인덱스를 활용하기 어려운 조건을 사용함 | QueryDSL `containsIgnoreCase`; 실행 검증 필요 |
| STORAGE-001 | `open` | 게시글 미디어의 S3 복사가 DB 트랜잭션 흐름에 포함돼 외부 지연과 고아 객체 위험이 있음 | `PostService`, `MediaProcessingService` 호출 경계 |

## 수용한 위험

| ID | 상태 | 결정 | 근거 |
|---|---|---|---|
| DATA-001 | `accepted-risk` | 조회수는 Redis 장애 중 증가분과 Redis 데이터 유실 시 미반영 버퍼를 잃을 수 있음 | [ADR-002](../adr/adr-002-viewcount-redis-buffer.md), [CASE-007](../../performance/cases/CASE-007-redis-failure-cascade/) |

## 다시 확인된 해결 항목

| ID | 상태 | 해결 |
|---|---|---|
| PERF-005 | `verified` | 댓글 목록 반응 조회와 작성자 조회의 N+1을 제거함 — [CASE-005](../../performance/cases/CASE-005-comment-list-query-amplification/) |
| CACHE-001 | `verified` | 조회수 드레인의 키 탐색을 `KEYS`에서 SCAN 커서 순회로 바꿈 — 회귀 테스트 `RedisViewCountStoreTest.PeekPendingCounts` |
| DB-001 | `fixed` | Token 테이블명을 `tokens`로 통일하고 V5로 이관함 |
| DB-002 | `fixed` | `daily_hot_post`를 V6으로 생성함 |
| DB-003 | `fixed` | Notification 컬럼명을 V3으로 정리함 |
| DATA-002 | `fixed` | 반응·스크랩 중복 행을 유니크 제약과 upsert로 차단함 |

새 항목은 [TEMPLATE.md](TEMPLATE.md)의 필드를 채울 수 있을 때만 등록한다.
