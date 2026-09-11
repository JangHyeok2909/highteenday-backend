# Performance and resilience

이 디렉터리는 부하를 만드는 코드, 실행 원자료, 그리고 원자료에서 확인한 결론을 함께
관리한다. 세 종류를 섞지 않는 것이 가장 중요한 규칙이다.

| 종류 | 위치 | 역할 |
|---|---|---|
| 실행 코드 | `tools/`, `scripts/`, `scenarios/`, `resilience/` | 부하 실행과 지표 수집 |
| 실행 원자료 | `reports/`, `resilience/reports/` | 실행 당시의 수치와 조건 |
| 해석 | `studies/`, `cases/`, `decisions/` | 질문, 원인, 결정, 검증 |

## 어디서 시작하는가

- 성능 측정 결과를 찾는다면 [studies/](studies/)를 본다.
- 확인된 성능·장애 문제를 찾는다면 [cases/](cases/)를 본다.
- 지연 목표처럼 이미 채택한 기준은 [decisions/](decisions/)에 있다.
- 실행 방법과 결과 형식은 [reference/](reference/)에서 찾는다.
- 애플리케이션 결함 목록은 [docs/issues](../docs/issues/)가 정본이다.
- 이전 `EXP/BTL/OPT/findings` 문서는 [archive/](archive/)에 보존되어 있다.

## 기본 실행

명령은 이 디렉터리에서 실행한다.

```bash
# 환경 기동
docker compose -f environment/docker-compose.perf.yml \
  --env-file environment/.env.perf up -d --build

# 데이터 생성과 사전 점검
node datasets/seed.js --profile medium
bash datasets/verify.sh medium
node tools/preflight.js --dataset medium --rate 4

# 일반 성능 실행
node tools/perf-run.js scenarios/normal-day.js \
  --dataset medium --loadgen docker --warmup 300

# 장애 계획 검증과 실행
node resilience/fault-run.js resilience/faults/redis-crash.json --dry-run
node resilience/fault-run.js resilience/faults/redis-crash.json

# 측정 도구 테스트
npm test
```
세부 옵션은 각 명령의 `--help`와 가까운 디렉터리의 README를 따른다.

## 기록 규칙

1. `report.html`과 `run.json`은 실행 원자료다. 손으로 고치지 않는다.
2. 수치는 한 곳에서만 소유한다. Case와 Study는 원자료를 링크하고 결론에 필요한 값만 인용한다.
3. 관측과 원인을 구분한다. 함께 움직였다는 사실만으로 원인이라고 쓰지 않는다.
4. 실행 이미지, 커밋, 데이터셋 또는 부하 조건이 다르면 Before/After라고 부르지 않는다.
5. 실패한 실험도 남긴다. 다만 확인하지 못한 결론을 성공이나 실패로 꾸미지 않는다.
6. 개선은 같은 질문과 같은 조건으로 다시 실행한 뒤에만 검증 완료로 바꾼다.
7. 현재 코드로 재확인하지 않은 이전 문서는 근거가 아니라 조사 단서로만 사용한다.

## 문서 생명주기

```text
질문 등록 → 실행 → 원자료 생성 → Study 작성
                          ├─ 문제가 없으면 결론 보존
                          └─ 문제가 있으면 Case 등록

Case: 관측 → 진단 → 수정 → 같은 조건으로 재실행 → 검증 → 종료
```

Case 상태는 `candidate`, `observed`, `diagnosed`, `fixing`, `verified`, `closed`를 사용한다.
`closed`는 수정했다는 뜻이 아니라 재실행으로 기대 효과와 부작용을 확인했다는 뜻이다.

## 디렉터리 지도

```text
performance/
├── cases/          확인된 문제의 전체 생명주기
├── studies/        기준선, 용량, 대조 실험처럼 질문 중심의 기록
├── decisions/      채택한 성능 기준과 트레이드오프
├── reference/      실행·비교·원자료 계약
├── archive/        정본에서 제외한 이전 문서
├── environment/    Docker 기반 측정 환경
├── datasets/       시드, 검증, 스냅샷
├── scripts/        기능별 k6 요청
├── scenarios/      여러 요청을 조합한 워크로드
├── resilience/     의존성 장애 주입기
├── metrics/        수집 지표와 대시보드
├── regression/     비교 가능한 실행의 회귀 판정
├── tools/          실행·수집·리포트 도구
└── reports/        일반 성능 실행 원자료
```
