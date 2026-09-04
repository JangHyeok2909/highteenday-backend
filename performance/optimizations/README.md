# Optimizations — 최적화 기록 대장

**수치 없는 최적화는 기록하지 않는다.** 모든 항목은 대응 실험의 Before/After를
원자료 링크와 함께 포함해야 한다.

## 규칙

1. 항목당 파일 하나: `OPT-###-슬러그.md`, `TEMPLATE.md` 양식.
2. 병목(BTL) → 실험(EXP) → 최적화(OPT) 체인이 끊기면 안 된다.
   실험 없이 "좋아 보여서" 적용한 변경은 여기 올 수 없다.
3. **한 번에 변수 하나** — 두 가지를 같이 바꿨으면 어느 쪽 효과인지 알 수 없다.
4. 개선이 확인되면 **기준선이 자동으로 갱신되는지 확인한다.** 손으로 저장하는
   `regression/baseline.json` 같은 파일은 없다 — 이력에 쌓인 "실행 조건이 같고 정상
   측정된 최근 실행"이 다음 실행의 기준이 된다(`regression/README.md`). 확인할 것은
   개선 후 실행이 기준선 후보 자격을 얻었는지(`measurementStatus`가 MEASURED 인지)다.
5. 효과가 없거나 악화된 시도도 기록한다 (`상태: 기각`) — 같은 삽질 방지.

## 목록

| ID | 최적화 | 대상 병목 | 상태 | 핵심 수치 (Before → After) |
|----|--------|-----------|------|---------------------------|
| [OPT-001](OPT-001-comment-reaction-batch.md) | 댓글 목록의 내 반응 조회를 일괄 조회로 | BTL-005 | **적용** | 요청당 쿼리 1,507 → **112** (−92.6%) · 전체 p95 226.7ms → **57.2ms** (−74.8%) |
| [OPT-002](OPT-002-comment-author-fetch-join.md) | 댓글 목록의 작성자 조회를 패치 조인으로 | BTL-005 (잔여항) | **적용** | 요청당 쿼리 112 → **3.9** (−96.5%) · 전체 p95 57.2ms → **34.3ms** (−40.1%) |

## 자주 쓰는 최적화 카탈로그 (적용 시 개별 OPT 문서로)

Redis Cache · Index 추가 · Batch Insert/Update · Connection Pool 튜닝 ·
Async Event(@Async/@TransactionalEventListener) · 메시지 브로커 전환(Redis Pub/Sub, Kafka) ·
응답 Compression · Cursor Pagination · Query Rewrite · Local Cache(Caffeine) ·
Virtual Thread(Java 21 업그레이드 시) · DTO Projection · @BatchSize · TTL Jitter ·
Cache Warming · Fail-fast Timeout
