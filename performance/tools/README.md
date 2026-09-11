# Performance tools

## 실행 도구

| 명령 | 역할 |
|---|---|
| `node tools/preflight.js` | 환경과 데이터셋 사전 점검 |
| `node tools/perf-run.js <script>` | k6 실행, 지표 수집, 회귀 판정, 리포트 생성 |
| `node tools/repeatability.js <script>` | 같은 조건 반복 실행 |
| `node tools/history.js` | 실행 이력 HTML 생성 |
| `node tools/snapshot.js` | 데이터셋 스냅샷 생성·복원 |
| `node tools/collect.js` | 실행 구간의 운영 지표 수집 |
| `node resilience/fault-run.js <plan>` | 장애 주입 실행 |
| `node resilience/render-report.js [runId]` | 저장된 장애 원자료 재렌더링 |

## 원칙

- 일반 실행은 `perf-run.js`를 통과시킨다. k6를 직접 실행한 결과에는 비교에 필요한 실행
  신원과 운영 지표가 빠질 수 있다.
- 저장된 `run.json`은 수정하지 않는다.
- 도구를 바꾸면 `npm test`로 측정 로직 자체를 검증한다.
- 큰 로그와 `hostprobe.jsonl`은 필요한 구간만 읽는다.
- Node.js 18 이상을 사용한다.

```bash
npm test
node tools/perf-run.js scenarios/normal-day.js \
  --dataset medium --loadgen docker --note "변경 설명"
```

옵션과 기본값은 각 도구의 인자 파서가 정본이다. 문서에 모든 플래그를 복제하지 않는다.
