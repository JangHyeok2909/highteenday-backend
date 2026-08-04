# OPT-XXX: (최적화 이름)

> 대상 병목: BTL-XXX | 검증 실험: EXP-XXX | 적용 커밋: (해시)
> 상태: 적용 | 기각 | 롤백

## 변경 내용

무엇을 어떻게 바꿨는가 (코드/설정 diff 요약).
**변수는 하나만** — 함께 바뀐 것이 있으면 명시하고 비교를 무효 처리한다.

## Before / After

> 측정 조건: 동일 환경 + 동일 데이터셋 + 동일 명령 (EXP-XXX §5의 명령)
> 원자료: reports/raw/(before), reports/raw/(after)

| 지표 | Before | After | 변화 |
|------|--------|-------|------|
| RPS | | | |
| P95 | | | |
| P99 | | | |
| Error Rate | | | |
| (병목 지표) | | | |

## 그래프

Before/After를 같은 축에 겹친 그래프 (Grafana 두 시간 범위 비교 캡처).

## 부작용 / 트레이드오프

이 최적화로 나빠진 것 (정합성, 코드 복잡도, 다른 지표). "없음"도 확인 후 기록.

## 후속 조치

- [ ] regression/baseline.json 갱신
- [ ] bottlenecks/BTL-XXX 상태를 "해소"로 변경
- [ ] 관련 문서(environment 등) 동기화
