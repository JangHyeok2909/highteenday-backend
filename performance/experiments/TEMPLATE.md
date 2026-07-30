# EXP-XXX: (실험 제목)

> 상태: 계획 | 실행중 | 완료 | 재실험 필요
> 날짜: YYYY-MM-DD | 담당: | 관련: BTL-XXX, OPT-XXX

## 1. 목적

이 실험으로 답하려는 질문 한 문장.

## 2. 가설

> **H1**: (조건)에서 (지표)가 (예상 값/방향)일 것이다. 왜냐하면 (코드/구조 근거).

- 반증 조건 명시: 어떤 결과가 나오면 가설이 기각되는가.
- 가설 없는 실험은 실행하지 않는다.

## 3. 배경

- 이 가설을 세운 근거 (코드 위치, 이전 실험, 운영 관찰)
- 관련 병목 문서: `bottlenecks/BTL-XXX.md`

## 4. 테스트 환경

| 항목 | 값 |
|------|-----|
| 앱 커밋 | `git rev-parse HEAD` |
| environment/ 커밋 | |
| 데이터셋 | 프로파일명 + 생성일 |
| 캐시 상태 | cold / warm (리셋 절차 기록) |
| 특이사항 | (예: 로컬 단일 호스트 — k6 간섭 있음) |

## 5. 시나리오 / 실행 방법

```bash
# 실행한 명령을 그대로 기록 (재현의 최소 단위)
docker restart perf-app && docker exec perf-redis redis-cli FLUSHALL   # 리셋
K6_PROMETHEUS_RW_SERVER_URL=http://localhost:9090/api/v1/write \
K6_PROMETHEUS_RW_TREND_STATS="p(50),p(95),p(99),avg,max" \
k6 run -o experimental-prometheus-rw scenarios/XXXX.js -e DATASET=medium
```

## 6. 측정 지표

이 실험의 판정 지표(1~3개)와 보조 지표. metrics/README.md 정의를 따른다.

| 역할 | 지표 | 판정 기준 |
|------|------|-----------|
| 1차 | | |
| 보조 | | |

## 7. 결과

> 원자료: `reports/raw/<파일명>` (반드시 링크)

| 지표 | 측정값 |
|------|--------|
| RPS | |
| P50 / P95 / P99 | |
| Error Rate | |
| (실험별 지표) | |

## 8. 그래프

Grafana 스크린샷 또는 패널 링크 (시간 범위 고정해서 캡처).

## 9. 병목 분석

- 관찰 → 원인 후보 → 검증 방법 → 확정 원인 순으로 서술
- 확정된 병목은 `bottlenecks/BTL-XXX.md`로 승격

## 10. 개선

적용한 변경 (커밋 링크). 없으면 "없음 — 관찰 실험".

## 11. 재실험 (Before / After)

**동일 환경·동일 데이터셋·동일 명령**으로 재실행한 결과만 인정한다.

| 지표 | Before | After | 변화 |
|------|--------|-------|------|
| RPS | | | |
| P95 | | | |
| P99 | | | |
| Error Rate | | | |
| (병목 지표) | | | |

## 12. 결론

- 가설 채택/기각과 근거 한 단락
- 수치로 요약: "X를 Y에서 Z로 개선 (N%)"

## 13. 향후 개선

이 실험이 남긴 다음 질문 / 후속 실험 제안.
