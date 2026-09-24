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
| [Redis 장애 전파](cases/redis-failure-cascade.md) | fixed | 명령 타임아웃 200ms, 이후 100ms로 줄여 60초 지연과 풀 획득 대기 해소 |
| [Redis 중단 중 고부하 지연](cases/redis-crash-capacity-cliff.md) | needs-evidence | 계단형 실행에서 p95 4초와 dropped iteration 2,429건. 임계 도착률 미확정 |
| [느린 Redis의 요청 지연](cases/redis-slow-latency-without-fallback.md) | open | 50±10ms 주입 중 HTTP p95 상승, 폴백 0회·헬스 UP. 개선 재검증 전 |
| [Redis 장애 중 조회수 유실](cases/redis-viewcount-loss-on-fallback.md) | open | hang/crash에서 HTTP 성공 뒤에도 증가분 유실. 보존 경로 미구현 |
| [Redis 장애 중 헬스 오판정](cases/redis-health-readiness.md) | 운영 적용 미확인 | readiness 분리 후 Redis crash에서 UP; ALB 경로·포트 미확인 |
| [헬스 폴러의 거짓 TIMEOUT](cases/health-poller-false-timeout.md) | fixed | 폴러의 소켓 타이머 결함 수정 뒤 거짓 TIMEOUT 22건 → 0건 |
| [서킷 개방이 조회수 정산을 건너뜀](cases/circuit-open-skips-viewcount-settlement.md) | open | MySQL 반영 뒤 Redis 차감 거절 1건 확인. 이중 반영은 미관측 |
| [Redis 장애 중 DB 커넥션 점유](cases/db-connection-held-during-redis-wait.md) | needs-evidence | 서킷 적용 시 지연·풀 점유 완화 관측. OSIV는 원인 후보이며 미검증 |
| [MySQL 중단·무응답의 긴 대기](cases/mysql-unavailable-wait-bound.md) | mitigated | 설정 후 실패 지연 단축. DB 장애 중 요청은 대부분 503이며 일부 5초 지연 잔존 |
| [느린 MySQL의 전 기능 지연](cases/mysql-slow-latency-amplification.md) | open | 300±50ms 주입에서 p95 약 20초. 타임아웃 설정 후에도 재현 |
| [MySQL 실행 중 정지의 5초 꼬리](cases/mysql-freeze-timeout-gap.md) | open | 요청 3초 상한 가정이 재현 실행에서 깨짐. 대기 단계 추적 필요 |
| [응답 유실 뒤 재시도의 상태 훼손](cases/retry-after-lost-response.md) | open | 응답 30% 유실 주입에서 토글·생성 재시도 67건이 전부 뒤집힘·중복으로 남음. 재발급 재시도 20건 중 15건 이상 로그아웃 |

새 문제는 별도 “병목”, “실험”, “최적화” 문서로 나누지 않는다. 한 Case 안에서 관측,
원인, 변경, 재검증과 남은 위험을 이어서 기록한다.
맨 앞에 상태와 짧은 요약을 두고, 본문은 문제·영향 → 탐지·진행 순서 → 원인과 확신도
→ 조치·검증 → 남은 위험 → 후속 조치 → 근거 순으로 쓴다. 미해결 Case는 조치 결과
대신 제안과 검증 계획을 적는다.

`redis-crash`의 여러 실행은 하나의 사고가 아니라 타임아웃, 고부하 완화, 조회수,
헬스 판정의 서로 다른 문제를 검증한다. `redis-slow`와 `redis-hang`도 주입 방식이
다르므로 각각의 관측을 해당 Case에 연결했다. 조건이 다른 실행의 수치를 한 줄의
개선율로 합치지 않는다.
MySQL의 `slow`·`hang`·`crash`·`freeze`도 주입 방식과 완료 요청 수를 함께 읽는다.
빠른 503은 오래 기다리던 요청의 결과가 바뀐 것이므로, 오류율만으로 변경 효과를
판정하지 않는다.

## 원자료 규칙

`run.json`은 기계 판독 정본이고 `report.html`은 파생 화면이다. 둘 다 손으로 수정하지 않는다.
결론은 Case에 필요한 수치만 인용하고 원자료를 링크한다. 비교 가능성과 표현 강도는
[METHOD.md](METHOD.md)를 따른다.
