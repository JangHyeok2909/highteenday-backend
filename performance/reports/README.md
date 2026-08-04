# Reports — 결과 산출물

## 구조

```
reports/
├── runs/<runId>/          # 실행 단위 저장소 (Performance Repository)
│   ├── k6.json            #   k6 원본 + 실행 메타데이터
│   ├── run.json           #   운영 지표·회귀 판정까지 보강된 최종 레코드
│   ├── report.html        #   운영 보고서
│   └── summary.txt        #   터미널 요약 사본
├── archive/<runId>/       # 기준선으로 쓰면 안 되는 실행 (README.md 참고)
├── index.json             # 이력 인덱스 (파생 — tools/history.js --rebuild 로 재생성)
├── history.html           # 이력 / 추세 대시보드
├── raw/                   # (구버전) k6 handleSummary 산출물 — 하위 호환용
└── summary/               # 실험별 수동 요약 (EXP 문서에서 링크)
```

## archive/ — 격리된 실행

`listRunIds()`가 `runs/`만 훑으므로, 여기로 옮긴 실행은 인덱스·기준선 자동 선택·추세에서
전부 빠진다. 보고서 HTML은 그대로 열리고 Pages에도 함께 게시된다.

지우지 않는 이유는 증거이기 때문이다 — 이관 도구(`migrate-raw.js`)가 실제로 동작했다는 것,
수집기 수정이 과거 실행까지 소급됐다는 것, 그리고 "이런 데이터를 기준선으로 쓰면 안 된다"는
사례(오류율 55.6%인데 check 100%, 표본 10회짜리 p95 비교) 자체가 자산이다.
사유는 [`archive/README.md`](archive/README.md)에 적어 둔다.

격리 기준은 **비교 가능성**이다. 앱·스키마·스크립트가 함께 바뀌어 이후 실행과
분해 비교가 불가능해진 시점 이전은 후보에서 뺀다.

전체 설계는 [`../PERFORMANCE-MANAGEMENT.md`](../PERFORMANCE-MANAGEMENT.md) 참고.

## 생성

```bash
node tools/perf-run.js scenarios/normal-day.js   # 실행 → 수집 → 판정 → 리포트
node tools/history.js                            # 이력 대시보드 갱신
```

`report.html`은 **자기완결형**이다. 외부 CDN/폰트/스크립트를 쓰지 않으므로 슬랙에
올리거나 CI 아티팩트로 받아 열어도 인터넷 없이 동일하게 보인다.

## 온라인 열람 (GitHub Pages)

커밋된 HTML은 GitHub 웹에서 렌더링되지 않는다(raw 다운로드만 된다).
`.github/workflows/perf-reports-pages.yml`이 이 디렉터리 전체를 Pages로 게시해,
`history.html`이 랜딩 페이지가 되고 거기서 개별 실행 보고서로 바로 이동할 수 있다.

`develop`/`main`에 `performance/reports/**`가 푸시되면 자동 배포된다.
저장소 설정에서 1회 활성화가 필요하다: `Settings → Pages → Source: GitHub Actions`.

## 보고서에 담기는 것

| 섹션 | 내용 |
|------|------|
| 판정 배지 | PASS / WARN / FAIL + 실행 메타데이터 (커밋·브랜치·빌드·실행자·스크립트 버전) |
| 병목 가설 | 포화도 기준 자동 지목 — **가설이지 확정 원인이 아님** |
| Performance Summary | 평균·P95·P99·TPS·RPS·오류율 + 직전 대비 증감, 지연 분포, 처리량/검증 |
| Regression | 직전 실행 대비 지표별 증감률과 판정 사유 |
| Infrastructure | 자원 포화도 막대 + CPU/Memory/Heap/GC/MySQL/Redis/Pool/Network/Disk 상세 |
| Breakdown | 기능별·오퍼레이션별 P95 내림차순 |
| Trend | 같은 시나리오 최근 20회 스파크라인 |
| SLO Thresholds | k6 실행 중 판정된 절대 기준 |
| Grafana | 테스트 구간(±2분)이 박힌 딥링크 |

> 이전에는 "CPU/Memory/Redis/DB 수치는 Grafana에서 실행 구간의 avg/max를 읽어 손으로 기입"해야
> 했다. 지금은 수집기가 같은 구간을 PromQL로 조회해 자동으로 채운다.

## raw/ — 구버전 산출물

`reports/raw/<시나리오>-<ts>.summary.{json,csv,html}`. `tools/compare.js`와 과거 실험 문서가
이 경로를 참조한다. **삭제하지 않는다** — 실험 문서가 링크하는 순간 증거물이다.

과거 실행을 새 파이프라인으로 가져오려면:

```bash
node tools/migrate-raw.js && node tools/collect.js --all --no-wait
```

Prometheus 보관 기간(30일) 안의 실행이면 **운영 지표까지 소급해서 채워진다.**

## summary/ — 실험 요약 (수동)

실험 종료 시 `summary/EXP-XXX.md`로 저장하고 실험 문서에서 링크한다.
Before/After 수치는 각 실행의 `run.json`에서 그대로 옮기면 된다.

| 항목 | Before | After | 출처 (`run.json` 경로) |
|------|--------|-------|------------------------|
| TPS | | | `k6.overall.tps` |
| P50 / P95 / P99 (ms) | | | `k6.overall.{med,p95,p99}` |
| Error Rate | | | `k6.overall.errorRate` |
| CPU (포화도 %) | | | `infra.flat.saturation.cpuPct` |
| Memory (heap used peak) | | | `infra.flat.heap.used.max` |
| Redis (hit ratio / ops) | | | `infra.flat.redis.{hitRatioPct,opsPerSec}` |
| DB (slow queries / lock waits) | | | `infra.flat.mysql.{slowQueries,innodbRowLockWaits.max}` |

## Grafana 스크린샷 규칙

- 보고서의 Grafana 링크를 쓰면 시간 범위가 이미 실행 구간으로 고정돼 있다
  (Last 30m 같은 상대 범위 금지)
- 파일명: `EXP-XXX-<패널명>-{before|after}.png`, 실험 디렉터리에 저장
