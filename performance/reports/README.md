# Reports — 결과 산출물

## 구조

```
reports/
├── raw/       # k6 handleSummary 자동 산출물 (JSON/CSV/HTML) — 실험의 원자료
└── summary/   # 실험별 수동 요약 (EXP 문서에서 링크)
```

## raw/ — 자동 생성

`performance/` 루트에서 k6를 실행하면 시나리오별로 3종이 자동 생성된다:

| 파일 | 용도 |
|------|------|
| `<시나리오>-<ts>.summary.json` | 전체 메트릭. `tools/compare.js`의 입력 |
| `<시나리오>-<ts>.summary.csv` | 핵심 지표 1행 — 스프레드시트로 여러 실행 비교 |
| `<시나리오>-<ts>.summary.html` | 단독 열람용 |

원자료는 **삭제하지 않는다**. 실험 문서가 링크하는 순간 증거물이다.
용량이 문제되면 실험과 무관한 실행만 정리한다.

## summary/ — 실험 요약 (수동)

실험 종료 시 아래 표를 채워 `summary/EXP-XXX.md`로 저장하고 실험 문서에서 링크:

| 항목 | Before | After |
|------|--------|-------|
| TPS | | |
| P50 / P95 / P99 (ms) | | |
| Error Rate | | |
| CPU (app / mysql) | | |
| Memory (heap used peak) | | |
| Redis (hit ratio / ops) | | |
| DB (slow q/min / lock waits) | | |

CPU/Memory/Redis/DB 수치는 Grafana에서 해당 실행 시간 범위의 avg/max를 읽어 기입한다
(k6 summary에는 없다 — 서버측 지표는 Prometheus가 원천).

## Grafana 스크린샷 규칙

- 시간 범위를 실행 구간으로 **고정**하고 캡처 (Last 30m 같은 상대 범위 금지)
- 파일명: `EXP-XXX-<패널명>-{before|after}.png`, 실험 디렉터리에 저장
