# localDocs — 로컬 작업 문서 (커밋 안 함)

성능 테스트 시스템 전면 리뷰(2026-08-05) 결과와 그 후속 작업 상태를 추적하는 디렉토리.
`.gitignore`에 등록되어 있어 커밋되지 않는다. Claude와 사용자가 세션을 넘어
같은 문제 목록을 보고 작업하기 위한 공유 장부다.

## 문서 목록

| 문서 | 내용 |
|---|---|
| [perf-mastery-checklist.md](perf-mastery-checklist.md) | **학습 진도 장부** — 시스템을 단계별로 파악하기 위한 체크리스트. 자가진단 답을 직접 채우면 Claude가 이해도를 판단한다 |
| [perf-review-summary.md](perf-review-summary.md) | 리뷰 총평 + 우선순위(P0/P1/P2) 실행 계획 — **여기부터 읽기** |
| [perf-findings-tools.md](perf-findings-tools.md) | 분석 도구 파이프라인 (perf-run/collect/regression/repository/report) 발견 사항 |
| [perf-findings-scripts.md](perf-findings-scripts.md) | k6 스크립트/시나리오 (scripts/, scenarios/) 발견 사항 |
| [perf-findings-environment.md](perf-findings-environment.md) | 환경/데이터셋/CI (environment/, datasets/, regression/*.yml) 발견 사항 |

## 두 장부의 관계

- **학습 장부**(`perf-mastery-checklist.md`) — "내가 이 시스템을 얼마나 아는가". 진도와 자가진단 답
- **발견 장부**(`perf-findings-*.md` + `perf-review-summary.md`) — "이 시스템에 무엇이 잘못됐는가". 결함과 수정 상태

학습 장부의 각 단계 끝에는 **결정 안건**이 있고, 거기서 내린 결정이 발견 장부의
상태를 바꾼다. 즉 학습 → 결정 → 수정 순으로 두 장부가 연결된다.

## 상태 규칙

각 발견 사항의 `상태` 필드:

- **미해결** — 발견만 된 상태 (초기값)
- **수정중** — 브랜치에서 작업 중
- **해결** — 수정 + (P0는) 테스트 커밋 완료. 해결한 커밋 SHA를 병기한다
- **보류** — 의도적으로 안 고치기로 결정. 사유를 병기한다

수정할 때마다 해당 문서의 상태를 갱신할 것. 이 문서들이 곧 작업 백로그다.

## 발견 ID 규칙

- `T-##` — tools (분석 파이프라인)
- `S-##` — scripts/scenarios (부하 발생 계층)
- `E-##` — environment/datasets/CI

## 리뷰 시점 컨텍스트

- 리뷰 일자: 2026-08-05, 브랜치 `perf/performance-management-system`
- 당시 기록된 런: 23개 (전부 로컬 데스크톱, small 8개 + large 15개)
- 핵심 사실: large 데이터셋에서 comments p95 60s / reactions p95 30s / normal-day 오류율 55.8%로 붕괴.
  원자료의 `hikariPending.max=205`, `hikariTimeouts=5316`, `cpu.throttledPct=99.98`은
  BTL-002(풀 불균형)·BTL-003(핫로우)·BTL-005(N+1) 가설과 정합 — **데이터는 이미 병목을 가리키고
  있는데 판정 계층이 그걸 못 읽는 상태**였다.
