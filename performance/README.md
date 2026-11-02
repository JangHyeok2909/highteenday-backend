# 성능·장애 실험

이 폴더는 HighTeenDay 백엔드에 같은 조건으로 부하를 넣고, MySQL·Redis 장애와 응답 유실을 주입하는
실험 도구와 원자료를 둔다. 실험에서 확인한 문제는 관측, 원인, 수정, 재검증 순서로 사례 문서에 남긴다.

| 보고 싶은 것 | 위치 |
|---|---|
| 확인한 문제와 결과 | [사례 색인](cases/README.md) |
| 일반 부하 실행 기록 | [실행 기록 대시보드](https://janghyeok2909.github.io/highteenday-backend/) |
| 두 실행을 비교해도 되는 조건 | [측정 방법](METHOD.md) |
| 장애 주입 절차 | [장애 주입 실험](resilience/README.md) |

## 실험 환경

앱, MySQL, Redis와 관측 도구는 Docker Compose로 띄운다. 컨테이너 자원 한계와 포트는
[docker-compose.perf.yml](environment/docker-compose.perf.yml)에서 관리하고, 이 문서에 값을 옮겨 적지 않는다.

| 구성 요소 | 역할 |
|---|---|
| 앱 | 저장소 루트의 Dockerfile로 만든 Spring Boot 이미지. `prod,perf` 프로필로 실행 |
| MySQL 8 | 버퍼 풀 크기 등 설정을 Compose의 `command` 플래그로 고정 |
| Redis 7 | `environment/redis/`의 설정 파일로 고정 |
| Prometheus, Grafana | 앱(Micrometer), MySQL·Redis exporter, cAdvisor, node-exporter 지표 수집과 화면 |
| k6 | 기본(`--loadgen local`)은 Compose 밖 호스트에서 실행하고, `--loadgen docker`를 주면 같은 네트워크의 k6 컨테이너로 실행한다. 두 방식 모두 기본으로 k6 지표를 Prometheus로 보낸다(`--no-remote-write`로 끔) |
| Toxiproxy | 장애 실험에서만 앱과 MySQL·Redis 사이, k6와 앱 사이에 두어 지연과 응답 차단을 주입 ([docker-compose.fault.yml](environment/docker-compose.fault.yml)) |

`environment/mysql/perf.cnf`는 지금 마운트하지 않는 옛 설정 파일이다. 실제 MySQL 설정은 Compose의
`command` 플래그다.

## 장애 주입

Redis와 MySQL의 정지·일시 정지·응답 지연·응답 차단, 앱 응답 유실 뒤 재시도를 주입한다. 계획 파일마다
실험이 답하려는 질문을 먼저 적는다. 종류와 실행 절차는 [장애 주입 실험](resilience/README.md)에서 다룬다.

## 준비와 실행

Node.js 18 이상, Docker Compose와 k6가 필요하다. 명령은 `performance/`에서 실행한다.

1. 환경 파일을 만든다. `JWT_KEY`가 비어 있으면 Compose가 변수 해석 단계에서 멈춰 어떤 컨테이너도 뜨지
   않는다. `openssl`의 Base64 출력은 64자마다 줄이 바뀌므로 줄바꿈을 지워 한 줄로 넣는다.

   ```bash
   cp environment/.env.perf.example environment/.env.perf
   openssl rand -base64 64 | tr -d '\n'   # 출력값을 .env.perf의 JWT_KEY에 넣는다
   ```

2. 스택을 띄우고 데이터셋을 적재한다. `bootstrap.js`는 게시판 기본 행 삽입, Redis 초기화, 중복 적재
   차단을 함께 처리하므로 `seed.js`를 직접 부르지 않는다.

   ```bash
   docker compose -f environment/docker-compose.perf.yml \
     --env-file environment/.env.perf up -d --build
   node environment/bootstrap.js --profile medium
   bash datasets/verify.sh medium
   ```

3. 상태 스냅샷을 만든다. 이 저장소는 [perf.config.json](perf.config.json)의 `datasetGuard`가 `strict`라서,
   현재 데이터셋 생성 지문과 맞는 스냅샷이 없으면 `preflight.js`(G2)와 `perf-run.js`가 실행을 거부한다.
   저장소의 `datasets/snapshots/*/snapshot.json`은 메타데이터뿐이고, 복원에 쓰는 볼륨 아카이브는
   Git에서 제외돼 있으므로 처음 적재한 환경에서 직접 만든다. 실행으로 데이터가 바뀌면 같은 스냅샷으로
   되돌린다(`node tools/snapshot.js restore medium`).

   ```bash
   node tools/snapshot.js create medium
   node tools/preflight.js --dataset medium --rate 4
   ```

4. 저장된 비교 계열과 같은 조건으로 실행한다. 아래는 도착률 4/s, 준비 구간 180초, 측정 구간 5분인
   `normal-day` 실행([예: normal-day-2026-09-04T05-33-04](https://janghyeok2909.github.io/highteenday-backend/runs/normal-day-2026-09-04T05-33-04/report.html))의 조건이다.
   `--rate`를 빼면 시나리오가 가상 사용자 200명의 closed model로 돌아 이 계열과 비교할 수 없다.

   ```bash
   node tools/perf-run.js scenarios/normal-day.js \
     --dataset medium --loadgen docker --rate 4 --warmup 180 --hold 5m
   ```

5. 도구 테스트를 돌린다.

   ```bash
   npm test
   ```

데이터 수량은 [datasets/profiles.json](datasets/profiles.json)에 있다. 도구 옵션은 각 파일 머리 주석의
사용법 절에 있다(`--help`는 `preflight.js`만 지원한다). 다만 `perf-run.js`의 `--loadgen local|docker`(기본
`local`)는 머리 주석 옵션 목록에 빠져 있다. 장애 주입 실행은 [장애 주입 실험](resilience/README.md)을 따른다.

## 폴더 지도

| 폴더 | 내용 |
|---|---|
| `environment/` | 앱, MySQL, Redis, 관측 도구, Toxiproxy Compose 설정 |
| `datasets/` | 데이터 생성, 검증, 상태 지문과 스냅샷 |
| `scripts/` | 기능 단위 k6 요청(인증, 게시판, 댓글, 채팅 등) |
| `scenarios/` | 사용자 여정을 조합한 부하(평상시, 시험 기간, 급증, 장시간 등) |
| `tools/` | 사전 점검, 실행, 수집, 비교 조건 검사, 포화 판정, 리포트 생성 |
| `metrics/` | Grafana 대시보드 |
| `regression/` | 회귀 판정 규칙(`rules.json`)과 CI 워크플로 예시(`.github/workflows`에 설치되지 않음) |
| `resilience/` | 장애 주입기, 계획 파일, 장애 실험 원자료 |
| `reports/` | 일반 부하 실행 원자료와 대시보드 |
| `cases/` | 확인한 문제의 사례 문서 |

## 원자료 규칙

- `run.json`이 실행 결과의 기준 파일이다. `report.html`과 대시보드는 `run.json`에서 만든 화면이다.
- 둘 다 손으로 고치지 않는다. 다시 만들 때는 생성 도구를 실행한다.
- 사례 문서는 필요한 수치만 인용하고 원자료를 링크한다. 비교 가능 여부와 표현 강도는
  [측정 방법](METHOD.md)을 따른다.
- 일반 부하 실행의 `report.html`은 대시보드에서 바로 열린다. 장애 실험 리포트는 GitHub에서
  렌더링되지 않으므로 `run.json`을 보거나 파일을 내려받아 브라우저로 연다.
