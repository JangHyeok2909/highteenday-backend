# Performance testing

이 디렉터리는 부하 실행 코드, 자동 생성 원자료, 사람이 검증한 문제 기록을 함께 둔다.
실행 결과와 해석을 분리한다.

| 대상 | 위치 |
|---|---|
| 측정 원칙과 비교 조건 | [METHOD.md](METHOD.md) |
| 일반 실행 원자료 | [reports/](reports/) |
| 장애 주입기와 원자료 | [resilience/](resilience/) |
| 확인된 문제 기록 | [cases/](cases/) |

## 준비와 실행

Node.js 18 이상, Docker Compose와 k6가 필요하다. 명령은 `performance/`에서 실행한다.

```bash
docker compose -f environment/docker-compose.perf.yml \
  --env-file environment/.env.perf up -d --build

node datasets/seed.js --profile medium
bash datasets/verify.sh medium
node tools/preflight.js --dataset medium --rate 4

node tools/perf-run.js scenarios/normal-day.js \
  --dataset medium --loadgen docker --warmup 300

npm test
```

데이터 수량은 `datasets/profiles.json`, 컨테이너 자원과 포트는 Compose 파일, 명령 옵션은
각 도구의 `--help`가 정본이다. README에 값을 복제하지 않는다.

## 실행 구성

- `environment/`: 앱, MySQL, Redis와 관측 도구
- `datasets/`: 데이터 생성, 검증, 상태 지문과 스냅샷
- `scripts/`: 기능 단위 k6 요청
- `scenarios/`: 사용자 여정을 조합한 부하
- `tools/`: 사전 점검, 실행, 수집, 비교와 렌더링
- `metrics/`: Prometheus와 Grafana 설정
- `regression/`: 비교 규칙과 자동 실행
- `resilience/`: 의존성 장애 주입
- `reports/`: 일반 실행 원자료

## 현재 Case

| 문제 | 상태 | 결론 |
|---|---|---|
| [댓글 목록 쿼리 증폭](cases/comment-query-amplification.md) | closed | 반응 일괄 조회와 작성자 fetch join으로 쿼리 수를 상수화함 |
| [Redis 장애 전파](cases/redis-failure-cascade.md) | diagnosed | 긴 Redis 대기가 DB 풀과 인증 경로로 전파됨 |

새 문제는 별도 “병목”, “실험”, “최적화” 문서로 나누지 않는다. 한 Case 안에서 관측,
원인, 변경, 재검증과 남은 위험을 이어서 기록한다.

## 원자료 규칙

`run.json`은 기계 판독 정본이고 `report.html`은 파생 화면이다. 둘 다 손으로 수정하지 않는다.
결론은 Case에 필요한 수치만 인용하고 원자료를 링크한다. 비교 가능성과 표현 강도는
[METHOD.md](METHOD.md)를 따른다.
