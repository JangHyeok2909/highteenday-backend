# Workload scenarios

`scripts/`는 기능 하나를 호출하는 k6 모듈이고 `scenarios/`는 여러 기능을 사용자 여정으로
조합한다.

## 주요 시나리오

| 목적 | 파일 |
|---|---|
| 일상 트래픽 | `normal-day.js` |
| 읽기·쓰기 편중 | `read-heavy.js`, `write-heavy.js` |
| 기능 편중 | `chat-heavy.js`, `notification-heavy.js` |
| 이벤트성 트래픽 | `exam-week.js`, `registration-day.js`, `peak-hour.js` |
| 캐시 대조 | `cold-start.js`, `cache-warm.js` |
| 순간·장기 부하 | `spike.js`, `soak.js` |
| 용량 탐색 | `stress.js`, `breakpoint.js` |
| 장애 | `failover.js`, `chaos.js`, `resilience/scenarios/fault-window.js` |

## 선택 원칙

- 개선 효과를 비교할 때는 포화 아래의 open model을 우선한다.
- 용량의 절벽을 찾을 때만 단계적으로 도착률을 올린다.
- 대상 코드 경로가 실제로 실행되는지 요청과 응답 내용을 확인한다.
- `200 []`처럼 빠르지만 의미 없는 응답을 성공 표본으로 섞지 않는다.
- Before/After에서는 가중치, 도착률, 구간, 데이터셋을 바꾸지 않는다.

각 실행의 실제 조건은 `run.json`에 남는다. 시나리오 파일의 기본값만 보고 실행 조건을
추정하지 않는다.
