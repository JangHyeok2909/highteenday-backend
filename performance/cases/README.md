# Cases

Case는 하나의 문제를 발견한 시점부터 수정 검증까지 추적하는 문서다. 증상, 병목,
최적화를 각각 다른 파일로 만들지 않는다.

## 상태

| 상태 | 의미 |
|---|---|
| `candidate` | 코드나 단일 신호에서 의심했지만 재현하지 못함 |
| `observed` | 반복 가능한 증상과 영향이 있음 |
| `diagnosed` | 원인 사슬의 핵심 고리를 증거로 설명할 수 있음 |
| `fixing` | 변경 중이며 검증 전임 |
| `verified` | 같은 조건의 재실행에서 기대 효과를 확인함 |
| `closed` | 회귀 방지 수단과 운영 후속 조치까지 반영함 |

## 현재 Case

| Case | 상태 | 결론 |
|---|---|---|
| [CASE-005](CASE-005-comment-list-query-amplification/) | `closed` | 댓글 목록 쿼리 수를 데이터 크기와 무관한 상수로 줄임 |
| [CASE-006](CASE-006-connection-pool-saturation/) | `observed` | 풀 확대는 대기를 줄였지만 종단 지연의 일반 해법은 아니었음 |
| [CASE-007](CASE-007-redis-failure-cascade/) | `diagnosed` | Redis 지연이 DB 풀과 인증 경로를 통해 전체 API로 전파됨 |

## 아직 Case가 아닌 후보

아래 항목은 이전 문서에서 가져온 조사 후보다. 현재 코드나 새 실행으로 확인하기 전까지
Case 번호를 부여하지 않는다.

| 후보 | 현재 근거 | 다음 확인 |
|---|---|---|
| 게시글 검색의 부분 문자열 전체 스캔 | 현재 QueryDSL이 `containsIgnoreCase` 사용 | 실행 계획과 `EXPLAIN ANALYZE` |
| Redis 캐시 스탬피드 | 보호 장치가 보이지 않음 | 동시 cold-miss 대조 |
| 인기 데이터 카운터 경합 | 데이터 생성 중 재시도 기록 | 고정 도착률 경합 실험 |
| SimpleBroker 수평 확장 한계 | 구조적 제약 | 다중 인스턴스 요구가 생길 때 검증 |
| 스케줄러 버스트 | 배치형 코드 | 온라인 요청과 겹친 구간 비교 |
| 쓰기 후처리의 동기 실행 | 코드 경로 확인 | 커밋 비용과 리스너 비용 분리 측정 |

이전 후보의 원문은 [legacy bottlenecks](../archive/legacy-docs/2026-09-11/bottlenecks/)에서
확인할 수 있지만 정본으로 인용하지 않는다.

새 Case는 [TEMPLATE.md](TEMPLATE.md)로 시작한다.

