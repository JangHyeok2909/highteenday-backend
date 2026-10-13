# perf-engine v0.1 설계 결정

> 기준 시점: 2026-09-25. 이름은 가칭이다.
> 이 문서는 v0.1에서 하기로 한 일과 남은 질문을 담는다. 이미 동작하는 범위는 [README.md](README.md)가
> 소유한다. 원본은 저장소의 `performance/`이며, 원본은 그대로 두고 필요한 부분만 옮겨 고친다.

## 하는 일

k6 스크립트를 실행하고, 같은 조건으로 돈 이전 실행과 비교해 얼마나 달라졌는지 보여 준다.
판정보다 변화량을 보여 주는 데 초점을 둔다. CI 게이트 기능은 v0.1에 없다.

## 결정

| 영역 | 결정 | 바퀴 |
|---|---|---|
| 실행 방식 | `perf-engine run <script>` 래퍼. 사용자 스크립트는 고치지 않는다 | 1 |
| 작업 디렉터리 | 기본 `./perf-engine/`. `init` 또는 첫 `run`에서 만들고, 설치 시점에는 만들지 않는다 | 0 |
| 설정 | `<dir>/config.json`. CLI > 환경변수 > config > 기본값. 모르는 키는 거부 | 0 |
| 수집 | `--summary-export`(legacy 형식)만 읽는다. 자식 환경에서 `K6_NEW_MACHINE_READABLE_SUMMARY`를 지우고 `--summary-trend-stats`를 명시한다. 모르는 형식은 추측하지 않고 UNMEASURED | 1 |
| 지표 | k6 지표 7개(p95·p99·avg·errorRate·tps·rps·checkRate). 실행 전체 구간으로 판정하고 "warmup 미분리"를 표시 | 1, 4 |
| 비교 조건 | 스크립트 경로(blocking), 스크립트 내용 해시(degrading), `k6 inspect`의 선언 부하(blocking). k6 버전과 데이터는 넣지 않는다. 처리량 같은 관측값은 넣지 않는다 | 2 |
| 기준선 | 직전 실행. `--baseline <runId>`로 대조군을 지정할 수 있고, 지정한 실행도 비교 조건을 검사한다 | 3 |
| 저장 | `runs/<runId>/run.json`이 정본이고 `report.html`은 파생물. 실행 목록은 `.cache/`의 캐시. runId에 난수 접미사 | 3 |
| noiseFloor | 작은 기본값. 사용자가 설정하기 전에는 상대 비교의 FAIL을 WARN으로 낮추고 "기본값(미설정)"을 표시 | 4 |
| 절대 상한(SLO) | 설정하지 않으면 적용하지 않는다 | 4 |
| 포화 | 판정하지 않고 "포화 판정: 하지 않음(인프라 지표 필요)"을 표시. open 모델이면 보내지 못한 반복 수를 표시 | 5 |
| 부하 모델 | closed 모델도 받는다. 부하 모델 이름, closed일 때의 고정 문장, 지연 변화 옆 처리량 변화를 표시 | 5 |
| 종료 코드 | 0 결과 있음(판정·k6 threshold와 무관) / 1 실행했지만 결과 없음 / 2 입력·환경 오류, 부하 전에 검사 / 130 중단, 기록 안 함 | 0, 1 |
| k6 호환 | 최저 v0.54.0. 여러 k6 버전으로 파서를 검증한다 | 1, 6 |

## 남은 질문

| 질문 | 정할 때 |
|---|---|
| `k6 inspect` 결과 중 어떤 필드를 선언 부하로 비교할 것인가 | 2번 바퀴 |
| noiseFloor 기본값의 크기, 상대 임계의 기본 % | 4번 바퀴 |
| 이름, 라이선스, 코드·메시지·문서의 언어 | 별도 저장소로 옮기기 전 |

## 바퀴

모듈 하나를 읽기 → 설계 → 뼈대 → 테스트 → 구현 → 마무리 순서로 한 바퀴 돈다.
`TODO(me)`는 사용자가 원본을 읽고 직접 쓰는 핵심 로직이다.

| 바퀴 | 내용 | 직접 쓸 것 (`TODO(me)`) | 원본 읽을 곳 |
|---|---|---|---|
| 0 | 뼈대: CLI, 설정, 작업 디렉터리 | 없음 | `tools/lib/guard.js` |
| 1 | k6 실행 → run.json | 요약 파일에서 지표 7개를 꺼내는 변환 | `scripts/lib/summary.js`, `scripts/lib/phases.js:260` |
| 2 | 비교 조건 | `compare()` | `tools/lib/conditions.js:1-60`, `tools/lib/comparability.js:79` |
| 3 | 저장과 기준선 | `findBaseline()`, `eligibilityOf()` | `tools/lib/repository.js:337`, `tools/lib/repository.js:395-460` |
| 4 | 판정 | `evaluateRule()`, 최종 판정 합산 | `tools/lib/regression.js:180-267`, `tools/lib/regression.js:306` |
| 5 | 보고서 | 없음 (검토) | `tools/lib/report.js` 중 필요한 섹션 |
| 6 | 설치부터 실행까지 | 없음 | 없음 |
