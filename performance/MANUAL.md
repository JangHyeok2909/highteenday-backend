# 운영 매뉴얼 — 성능 측정 시스템 사용법

이 문서는 `performance/` 아래의 성능 측정 시스템을 **실제로 돌리기 위한 사용설명서**다.
"왜 이렇게 설계했나"는 [`PERFORMANCE-MANAGEMENT.md`](PERFORMANCE-MANAGEMENT.md)와
[`DATASET-STATE.md`](DATASET-STATE.md)에 있고, 이 문서는 **무엇을 어떤 순서로 어떤 명령으로
실행하는가**만 다룬다. 처음 보는 사람이 이 문서 하나로 환경 기동부터 보고서 열람까지
끝낼 수 있게 하는 것이 목표다.

---

## 0. 이 시스템이 하는 일 (30초 요약)

한 줄로: **부하를 걸고(k6), 그 시간 구간의 서버 지표를 자동으로 붙이고(Prometheus),
과거 실행과 비교해 회귀를 판정하고(rules.json), HTML 보고서로 남기는** 파이프라인이다.

```
node tools/perf-run.js <스크립트>
   │
   ├─ ① 데이터셋 상태 확인 (필요하면 스냅샷으로 복원)
   ├─ ② k6 실행               → reports/runs/<runId>.k6.json
   ├─ ③ 실행 후 상태 기록      → reports/runs/<runId>.dbstate.json
   └─ ④ collect.js 자동 호출
          ├─ Prometheus에서 같은 구간의 서버 지표 조회
          ├─ 비교 가능한 과거 실행을 기준선으로 골라 회귀 판정
          └─ reports/runs/<runId>/{run.json, report.html, summary.txt}
```

**핵심 용어 4개**

| 용어 | 뜻 |
|------|-----|
| **runId** | 실행 하나의 식별자. `<시나리오>-<UTC 타임스탬프>` 형식 (예: `normal-day-2026-08-17T15-46-15`) |
| **데이터셋 프로파일** | 시드 데이터의 규모 이름 (`smoke`/`small`/`medium`/`large`/`xlarge`) |
| **phase** | 한 실행 안의 구간. `warmup`(램프업) → `measure`(판정 대상) → `rampdown`. **회귀 판정은 `measure`만 본다** |
| **기준선(baseline)** | 비교 대상이 되는 과거 실행. 손으로 지정하지 않고, 실행 조건이 같은 최근 실행이 자동 선택된다 |

**모든 명령은 `performance/` 디렉터리에서 실행한다.** 스크립트가 상대 경로로 서로를
참조하므로 다른 위치에서 실행하면 파일을 찾지 못한다.

```powershell
cd C:\Users\user\Desktop\projects\highteen\highteenday-backend\performance
```

---

## 1. 사전 준비 (최초 1회)

### 1.1 필요한 도구

| 도구 | 버전 | 확인 명령 | 없으면 |
|------|------|-----------|--------|
| Node.js | **18 이상** (전역 `fetch` 사용) | `node -v` | 시더와 도구가 전부 실행 불가 |
| k6 | **2.1.0** (컨테이너 이미지와 동일해야 함) | `k6 version` | 부하 발생 불가 |
| Docker Desktop | WSL2 백엔드 | `docker version` | 환경 기동 불가 |
| Git Bash | — | — | `verify.sh` 등 `.sh` 실행 불가 |

k6 버전이 컨테이너 이미지(`grafana/k6:2.1.0`)와 다르면 **비교 조건이 달라져 이력이 끊긴다.**
낮은 버전은 스크립트 문법 자체를 못 읽는다(0.49.0에서 객체 스프레드 `...extra`가 SyntaxError로 죽었다).

### 1.2 셸 차이 주의 (Windows)

이 문서의 명령은 두 셸 중 하나를 전제한다.

- **PowerShell** — `node`·`docker` 계열 명령은 그대로 동작한다.
  단, `VAR=value command` 형태의 **인라인 환경변수 접두사는 PowerShell에서 문법 오류**다.

  ```powershell
  # ❌ PowerShell에서 실패
  PERF_DATASET_GUARD=warn node tools/perf-run.js scenarios/normal-day.js

  # ✅ PowerShell
  $env:PERF_DATASET_GUARD = 'warn'; node tools/perf-run.js scenarios/normal-day.js
  ```

- **Git Bash** — `bash datasets/verify.sh medium`, `tools/chaos-*.sh` 같은 셸 스크립트와
  위의 인라인 환경변수 형태는 여기서 실행한다.

### 1.3 k6 실행 파일이 차단될 때 (`K6_BIN`)

Chocolatey로 설치하면 PATH에 잡히는 것은 실제 바이너리가 아니라 **shim(.NET 어셈블리)**이다.
Windows Application Control 정책이 이 shim을 차단하면 k6 자체는 멀쩡한데 도구의 프로세스
실행만 `UNKNOWN`으로 실패한다. 그때는 실제 exe를 직접 가리킨다.

```powershell
$env:K6_BIN = "C:/ProgramData/chocolatey/lib/k6/tools/k6-v2.1.0-windows-amd64/k6.exe"
node tools/perf-run.js scenarios/normal-day.js
```

### 1.4 환경 설정 파일 생성

```bash
cp environment/.env.perf.example environment/.env.perf
```

그다음 `environment/.env.perf`에서 **반드시 챙겨야 하는 값**이 둘 있다.

| 키 | 채우는 방법 | 안 채우면 |
|----|-------------|-----------|
| `JWT_KEY` | `openssl rand -base64 64` 로 생성한 64바이트 이상 키 | HS512가 키 길이를 거부해 로그인·회원가입이 500으로 실패 |
| `DATASET_PROFILE` | 사용할 프로파일 이름 (예제 기본값 `medium`) | MySQL 볼륨이 프로파일별로 분리되므로 이 값이 어느 볼륨에 붙을지 결정한다 |

`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEIS_API_KEY`, `S3_BUCKET`은 더미 값이면 된다.
부하 경로에서 실제로 쓰이지 않지만, 프로퍼티에 기본값이 없어 값이 비면 Spring이
`PlaceholderResolutionException`으로 컨텍스트 로딩 자체를 실패시킨다.

`SPRING_PROFILE=prod,perf`는 **바꾸지 않는다.** 이유는 §11 트러블슈팅 참고
(`dev`/`local`은 빈 DB에서 무한 크래시 루프, `prod` 단독은 쿠키 속성 때문에 로그인 이후 전부 401).

---

## 2. 가장 짧은 성공 경로 (Quick Start)

아무것도 없는 상태에서 기준선 측정까지 도달하는 최소 순서다. 각 단계의 자세한 설명은 이어지는 절에 있다.

```bash
# ① 스택 기동 (MySQL·Redis·앱·Prometheus·Grafana·익스포터)
docker compose -f environment/docker-compose.perf.yml --env-file environment/.env.perf up -d --build

# ② 기동 확인 — UP 이 나와야 다음으로 간다
curl -s localhost:18080/actuator/health

# ③ 데이터셋 준비 (게시판 삽입 + 테이블 보정 + Redis 비우기 + 시드까지 한 번에)
node environment/bootstrap.js --profile small

# ④ 데이터 검증 — 통과하지 못한 데이터셋으로 잰 수치는 근거가 없다
bash datasets/verify.sh small

# ⑤ 검증을 통과한 상태를 스냅샷으로 고정 (guard=strict 운영의 전제)
node tools/snapshot.js create small --note "초기 구축"

# ⑥ 스모크 — 스크립트가 도는지 1분만 확인
node tools/perf-run.js scripts/posts.js --vus 5 --duration 1m --dataset small

# ⑦ 기준선 측정
node tools/perf-run.js scenarios/normal-day.js --dataset small --note "첫 기준선"

# ⑧ 결과 보기
node tools/history.js          # reports/history.html 생성
# 개별 보고서: reports/runs/<runId>/report.html
```

---

## 3. 환경 운영 (`environment/`)

### 3.1 컨테이너와 포트

| 컨테이너 | 역할 | 호스트 포트 |
|----------|------|-------------|
| `perf-app` | Spring Boot (프로파일 `prod,perf`) | **18080** → 8080 |
| `perf-mysql` | MySQL 8.0.36 | **13316** → 3306 |
| `perf-redis` | Redis 7.2 | **16389** → 6379 |
| `perf-prometheus` | 시계열 수집 (보관 30일) | **9090** |
| `perf-grafana` | 대시보드 (`admin` / `perf`) | **3001** |
| `perf-mysqld-exporter` · `perf-redis-exporter` · `perf-cadvisor` · `perf-node-exporter` | 지표 익스포터 | — |
| `perf-k6` | 부하 발생기 (`--loadgen docker`일 때만 생성) | — |

포트를 표준값에서 옮긴 이유는 로컬에 이미 돌고 있는 MySQL·Redis와의 충돌을 피하기 위해서다.
바꾸려면 `.env.perf`에 `APP_HOST_PORT` / `MYSQL_HOST_PORT` / `REDIS_HOST_PORT`를 넣는다.
모든 포트는 **루프백에만 바인딩**된다(MySQL root 비밀번호가 기본값이고 Redis에 인증이 없다).

### 3.2 기동 · 확인 · 정지

```bash
# 기동 (앱 이미지 재빌드 포함)
docker compose -f environment/docker-compose.perf.yml --env-file environment/.env.perf up -d --build

# 기동 (재빌드 없이)
docker compose -f environment/docker-compose.perf.yml --env-file environment/.env.perf up -d

# 상태 확인 — 전 컨테이너가 healthy 여야 한다
docker compose -f environment/docker-compose.perf.yml --env-file environment/.env.perf ps

# 앱 헬스체크 / 지표 노출 확인
curl -s localhost:18080/actuator/health
curl -s localhost:18080/actuator/prometheus | head

# 로그
docker logs -f perf-app
docker logs --tail 100 perf-mysql

# 정지 (데이터 유지)
docker compose -f environment/docker-compose.perf.yml --env-file environment/.env.perf stop

# 완전 삭제 (볼륨까지 — 시드 재생성 필요)
docker compose -f environment/docker-compose.perf.yml --env-file environment/.env.perf down -v
```

> **`docker ps`의 STATUS를 함께 본다.** "Up N seconds"가 계속 초기화되면 크래시 루프다.
> 이 상태에서도 `/actuator/health`가 Tomcat이 잠깐 떠 있는 찰나에 `200 UP`을 반환해
> 정상으로 착각하게 만든 실측 사례가 있다.

### 3.3 실험 간 상태 리셋

```bash
# 캐시·JIT만 초기화 (데이터 유지) — 실험 사이의 기본 리셋
docker restart perf-app
docker exec perf-redis redis-cli FLUSHALL

# Redis만 비우기
docker exec perf-redis redis-cli FLUSHALL

# Redis 키 개수 확인 (cold / warm 판별)
docker exec perf-redis redis-cli DBSIZE
```

### 3.4 데이터셋 프로파일 전환

MySQL 데이터 볼륨은 프로파일별로 분리된다(`perf-mysql-data-<프로파일>`). 시드 비용을
**프로파일당 1회만** 내고 이후 전환은 컨테이너 재생성 수준으로 끝난다.

```bash
# 1) environment/.env.perf 에서 DATASET_PROFILE=medium 으로 수정
# 2) 다시 up (볼륨이 갈아끼워진다)
docker compose -f environment/docker-compose.perf.yml --env-file environment/.env.perf up -d
# 3) 전환 후 필수 정리 (Redis는 프로파일별로 분리되지 않으므로 반드시 비운다)
node environment/bootstrap.js --profile medium --skip-seed
```

**Redis는 볼륨 분리 대상이 아니다.** 전환해도 이전 프로파일의 캐시와 조회수 버퍼가 그대로
남으므로, `bootstrap.js`(또는 수동 `FLUSHALL`)를 거치지 않으면 다른 프로파일의 상태 위에서
측정하게 된다.

---

## 4. 데이터셋 운영 (`datasets/`)

### 4.1 프로파일 규모

| 프로파일 | 사용자 | 게시글 | 댓글 | 반응 | 용도 |
|----------|-------:|-------:|-----:|-----:|------|
| `smoke` | 20 | 50 | 150 | 300 | 스크립트 동작 확인 (1분) |
| `small` | 100 | 500 | 2,000 | 5,000 | 로컬 반복 실험 |
| `medium` | 1,000 | 10,000 | 40,000 | 100,000 | 표준 실험 (EXP 기본값) |
| `large` | 10,000 | 100,000 | 400,000 | 1,000,000 | 인덱스·페이징 병목 재현 |
| `xlarge` | 100,000 | 500,000 | 2,000,000 | 5,000,000 | 운영 1년 후 규모 가정 |

캐시·핫로우 실험은 **`medium` 이상**에서 한다. `small`은 사용자가 100명이라 한 글의 활성
반응 수 상한이 100이고, 그 때문에 상위 10% 집중도가 54%에 그쳐(명세 기대 ~80%) 인기 편중이
재현되지 않는다. 시드는 API 기반이라 `large` 이상은 적재에 수 시간~20시간이 걸린다.

### 4.2 부트스트랩 — 이걸 쓰는 것이 기본

`bootstrap.js`는 "리셋·전환 후 매번 해야 하는데 손으로 하면 반드시 빠뜨리는 일"을 묶은 도구다.
게시판 5행 선삽입, `daily_hot_post` 테이블 생성, Redis FLUSHALL, 볼륨-프로파일 일치 검사,
시드 중복 실행 차단을 처리하고 마지막에 `seed.js`를 호출한다.

```bash
# 표준 사용
node environment/bootstrap.js --profile small

# 이미 적재돼 있어도 강제로 다시 시드
node environment/bootstrap.js --profile small --force

# 스키마·캐시 정리만 하고 시드는 건너뜀 (프로파일 전환 직후)
node environment/bootstrap.js --profile medium --skip-seed

# 중단된 large 생성을 빈 단계부터 이어서
node environment/bootstrap.js --profile large --resume --tolerance 0.001

# 대상 서버·동시성 지정
node environment/bootstrap.js --profile medium --base http://localhost:18080 --concurrency 10
```

| 옵션 | 뜻 |
|------|-----|
| `--profile <name>` | 프로파일 (기본: `DATASET_PROFILE` 환경변수 → `medium`) |
| `--base <url>` | 대상 서버 (기본 `http://localhost:18080`) |
| `--concurrency <n>` | 시더 동시 요청 수 (기본 10) |
| `--force` | 이미 데이터가 있어도 재시드 |
| `--skip-seed` | 스키마·캐시만 정리 |
| `--resume` | 완료된 단계를 건너뛰고 이어서 생성 |
| `--tolerance <pct>` · `--on-failure <mode>` | `seed.js`로 그대로 전달 (§4.3) |

`bootstrap.js`가 대신 막아 주는 것:

| 검사 | 안 하면 |
|------|---------|
| 마운트된 볼륨 ↔ `--profile` 일치 | medium 데이터를 small 볼륨에 부어 두 프로파일이 동시에 오염된다 |
| 게시판 5행 선삽입 | `seed.js`가 `/api/boards`에서 빈 배열을 받아 조용히 실패 |
| `daily_hot_post` 생성 | `GET /api/hotposts/daily`가 항상 500 (BTL-009) |
| Redis FLUSHALL | 전환해도 이전 프로파일의 캐시·카운터가 남는다 |
| 시드 중복 실행 차단 | 계정만 건너뛰고 글·댓글은 매번 새로 만들어져 명세의 2배가 된다(실측: small 500 → 1065) |

### 4.3 시더 직접 실행

```bash
node datasets/seed.js --profile medium
node datasets/seed.js --profile medium --base http://localhost:18080 --concurrency 10

# 데드락이 잦은 large: 0.1%까지 허용하고 넘기면 즉시 중단
node datasets/seed.js --profile large --tolerance 0.1 --on-failure immediate

# 중단된 생성 이어서
node datasets/seed.js --profile large --resume
```

**실패 정책은 서로 다른 두 축이다.**

| 옵션 | 답하는 질문 | 기본값 | 값 |
|------|-------------|--------|-----|
| `--tolerance <pct>` | 무엇을 실패로 볼 것인가 (**단계별** 허용 실패율) | `0` | 0~100 백분율 |
| `--on-failure <mode>` | 허용치를 넘겼을 때 어디서 멈출 것인가 | `stage` | `stage` / `immediate` / `continue` |

- `stage` — 진행 중 단계는 끝까지 돌리고 다음 단계 전에 멈춘다. 원인 파악에 가장 유리하다.
- `immediate` — 허용치를 넘는 순간 그 단계도 중단한다. 오래 걸리는 생성의 설정 오류 조기 발견용.
- `continue` — 끝까지 돌린 뒤 요약만 보고한다. "무엇이 얼마나 실패하는가"를 한 번에 조사할 때.

허용치는 **단계마다 따로** 적용된다(전체 합으로 보면 "반응 단계만 100% 실패"가 다른 단계의
성공에 묻힌다). 허용 건수는 **내림**이다 — 목표 50건에 1%면 0건이다.
허용치를 **넘긴** 경우 어느 모드든 `generated/` JSON 산출물을 쓰지 않는다. 반쪽짜리
데이터셋이 파일로 남으면 다음 실행이 그것을 정상으로 착각한다.

**종료 코드**: `0` 모든 단계가 허용치 안 · `1` 허용치 초과 · `2` 실행 오류/잘못된 인자.

산출물은 `datasets/generated/<profile>/`에 생기고 k6가 직접 읽는다.

| 파일 | 내용 |
|------|------|
| `users.json` | 세션이 확인된 계정만. 비밀번호는 전 계정 공통 `PerfTest123!` |
| `posts.json` | `{id, boardId}` — **인기순 정렬. index 0이 최고 인기글** |
| `boards.json` | 게시판 목록 |
| `meta.json` | 생성 지문. 생성기 코드 + 프로파일 파라미터 + 단계별 실제 생성 개수를 해싱 |

### 4.4 검증 — 통과하지 못한 데이터셋은 쓰지 않는다

시더가 "성공"으로 끝나는 것과 데이터가 명세대로인 것은 다른 문제다. 시더는 자기가 보낸
요청만 알고 DB 안의 정합성은 모른다.

```bash
bash datasets/verify.sh medium
```

검사 항목: ① 수량 명세 대조 ② 비정규화 카운터 일치(**댓글은 불일치 0건이어야 한다**)
③ 참조 무결성·중복 쌍(전부 0) ④ `index 0 = 최고 인기글` 계약 ⑤ 작성 활동 분포
(`AUTHOR_SKEW = 1.3` 기준 large 예상: 작성자 약 4,900명, 최다 작성자가 전체의 약 20%).

`posts.json`의 순서가 실제 참여도와 어긋났다면(체크포인트를 DB에서 `ORDER BY PST_id`로
재구성한 경우 발생한다 — ID는 동시 레인의 완료 순, 랭크는 작업 순이라 머리 부분이
뒤섞인다) DB 실측 참여도로 순서를 다시 매긴다. 데이터셋 지문은 바뀌지 않는다.

```bash
node datasets/resort-by-engagement.js large
```

### 4.5 스냅샷과 상태 지문 (`--guard`)

**문제**: 쓰기 시나리오는 자기가 측정하는 대상을 오염시킨다. write-heavy를 200 VU로 15분
돌리면 게시글·댓글·반응이 수만 건 늘어난 채 끝나는데, 프로파일 이름도 생성 지문도 그대로라
다음 실행이 **비교 가능으로 판정된다.**

**해결**: 실행마다 시작 시점의 DB를 세어 **상태 지문**을 남기고, 스냅샷과 다르면 되돌린다.

```bash
# 검증 직후 상태를 불변 사본으로 보존
node tools/snapshot.js create large --note "P0-2 완료 직후"
node tools/snapshot.js create large --no-compress   # gzip 없이 (빠르지만 5배 크다)

# 목록
node tools/snapshot.js list

# 지금 DB가 스냅샷과 같은가
node tools/snapshot.js verify large

# 되돌린다 (Redis FLUSHALL 포함 — 복원 직후 캐시는 항상 cold)
node tools/snapshot.js restore large
node tools/snapshot.js restore --id large-20260816-043326
```

**guard 모드**

| 모드 | 동작 |
|------|------|
| `off` | 상태 지문을 **기록만** 한다. 판정·복원 없음 |
| `warn` | 스냅샷과 다르면 경고하고 그 실행의 기준선 자격을 뺏는다. 복원은 안 함 |
| `strict` | 다르면 **볼륨을 복원**하고 재확인한다. 그래도 다르면 실행을 거부 |

우선순위는 **`--guard` > `PERF_DATASET_GUARD` > `perf.config.json` > 기본값 `off`**.
**이 저장소는 `perf.config.json`으로 `strict`를 쓴다** — `large`는 시더의 난수 소비 순서
때문에 재현이 안 되는 일회성 자산이라, 오염되면 되돌릴 방법이 스냅샷뿐이다.

```bash
node tools/perf-run.js scenarios/write-heavy.js --dataset large              # strict (저장소 기본)
node tools/perf-run.js scenarios/deep-paging.js --dataset large --guard off   # 이번만 끈다
```

```powershell
$env:PERF_DATASET_GUARD = 'warn'   # 이 셸에서만
```

`strict`인데 해당 프로파일의 스냅샷이 없으면 실행이 거부된다 — 보장할 기준이 없으면 모드의
의미가 없기 때문이다. 그때는 `node tools/snapshot.js create <profile>`을 먼저 한다.

**측정은 항상, 판정만 스위치다.** `off`여도 지문은 계산해 `run.json`에 남긴다. 그래서 나중에
모드를 켜고 `node tools/history.js --rebuild`를 돌리면 과거 실행에 소급 적용된다 —
모드 변경이 재실행이 아니라 재계산으로 복구된다.

실측(large, 볼륨 2.72GB): 지문 계산 **0.4초**, 스냅샷 생성 **0.50GB / 110초**,
복원 **26~30초** + 앱 부팅까지 **82초**.

---

## 5. 부하 실행 (`tools/perf-run.js`)

### 5.0 측정 개시 점검 (`tools/preflight.js`)

판정에 쓸 측정 — Before/After 세트, 반복 정밀도 측정 — 을 시작하기 전에 **먼저 돌린다.**
통과하지 못하면 시작하지 않는다.

```bash
node tools/preflight.js --dataset medium --rate 4
node tools/preflight.js --dataset medium --rate 4 --json   # CI·스크립트용
```

종료 코드는 `0` 통과 / `1` 하나 이상 실패 / `2` 사용법 오류다.

여섯 관문을 본다. 각 항목은 과거에 실제로 겪은 사고에 대응한다.

| 관문 | 확인 | 어긋나면 |
|---|---|---|
| G1 프로파일·볼륨 | `--dataset` · `.env.perf` · 마운트된 볼륨이 모두 같은가 | 다른 데이터셋에 부하를 걸고 기록에는 안 남는다 (E-52) |
| G2 데이터셋 상태 | DB 상태 지문이 스냅샷과 같은가 | 이전 실행의 쓰기가 섞인다 |
| G3 측정 스펙 | 시드 완화 설정이 꺼졌는가, 자원 상한·풀 크기가 측정값인가 | 쓰기 지연이 낙관적으로 나온다 |
| G4 관측 경로 | Prometheus 와 5개 스크레이프 대상이 응답하는가 | 인프라 지표 결측 → `UNMEASURED` |
| G5 운용점·유휴 | 도착률이 4/s 이하인가, 지금 잔류 부하가 없는가 | 큐 대기를 애플리케이션 지연으로 읽는다 (E-46) |
| G6 코드 신원 | 이미지가 소스보다 낡지 않았는가 | 새 커밋을 기록하며 옛 코드를 잰다 (T-42) |

**이 도구가 하지 않는 것.** 이번 실행이 포화에 빠지지 않을 것임을 보장하지는 않는다.
포화는 부하를 걸어야 알 수 있고, 그 판정은 실행 후 `lib/saturation.js`가 회차마다 내린다.
G5가 보는 것은 그 전 단계 — **알려진 안전 운용점 이하인가, 지금 유휴인가** — 뿐이다.

우회 플래그는 일부러 만들지 않았다. 통과하지 못한 상태로 재야 할 이유가 있으면
`perf-run.js`를 직접 부르면 된다. 우회 수단을 두면 그것이 기본 사용법이 되고, 그러면 이
점검은 다시 사람의 기억으로 돌아간다.

### 5.1 표준 진입점

```bash
# 시나리오 실행 (권장 형태)
node tools/perf-run.js scenarios/normal-day.js --dataset medium --note "인덱스 추가 후"

# 단일 기능 스크립트
node tools/perf-run.js scripts/posts.js --vus 30 --duration 2m --dataset medium

# 부하 발생기를 계측 가능하게
node tools/perf-run.js scenarios/normal-day.js --loadgen docker

# 수집 없이 k6만
node tools/perf-run.js scripts/auth.js --no-collect

# 회귀가 있어도 종료 코드 0
node tools/perf-run.js scenarios/normal-day.js --no-gate
```

### 5.2 옵션 전체

| 옵션 | 기본값 | 뜻 |
|------|--------|-----|
| `--vus <n>` | 스크립트별 | VU 수. `-e VUS=`로 전달된다 |
| `--duration <d>` | 스크립트별 | 지속 시간 (예: `90s`, `5m`) |
| `--hold <d>` | 시나리오별 | 유지 구간 (ramping 시나리오) |
| `--warmup <sec>` | 시나리오 기본값 | **k6 ramp-up 단계 자체의 길이를 바꾼다** |
| `--env <name>` | `perf` | 환경 이름. 기준선이 환경별로 분리되므로 실험 목적별 전용 이름을 쓸 것 |
| `--dataset <name>` | `small` | 데이터셋 프로파일 |
| `--note "<text>"` | 없음 | 실행 메모. 보고서 상단에 표시된다 |
| `--wait <sec>` | `20` | Prometheus 스크레이프 지연 대기 |
| `--guard <mode>` | `perf.config.json` → `strict` | `off` / `warn` / `strict` |
| `--loadgen <mode>` | `local` | `local`(호스트 `k6.exe`) / `docker`(`perf-k6` 컨테이너) |
| `--no-collect` | — | k6만 실행하고 수집·판정·보고서를 건너뜀 |
| `--no-gate` | — | 회귀가 있어도 종료 코드 0 |
| `-e KEY=VALUE` | — | k6로 그대로 전달 |
| `--k6:<flag> <value>` | — | k6 플래그로 변환해 전달 |

> **`--warmup`은 사후에 자르는 옵션이 아니다.** 이 값은 `-e WARMUP`으로 k6에 전달되어
> **실행 계획의 ramp-up stage 길이 자체**를 바꾼다. k6 threshold와 Prometheus 조회 창이
> 둘 다 이 값을 기준으로 measure 구간을 판정하므로, 두 파이프라인이 "같은 값이길 바라는"
> 것이 아니라 애초에 같은 값을 공유한다. 미지정 시 시나리오 기본값(normal-day는 300초)이
> 유지되고, 명시적 `--warmup 0`은 "warmup 없음"으로 구분된다.

### 5.3 `--loadgen local` vs `docker` — 섞어서 비교하지 말 것

| | `local` (기본) | `docker` |
|---|---|---|
| k6 위치 | Windows 네이티브 `k6.exe` | `perf-k6` 컨테이너 |
| 접속 경로 | `localhost:18080` (포트 포워딩) | `app:8080` (컨테이너 네트워크) |
| 발생기 자원 측정 | **불가능** | cAdvisor가 CPU·메모리·throttling 계측 |

`local`에서는 아무도 부하 발생기를 측정하지 못한다 — cAdvisor는 컨테이너만 보고,
node-exporter가 보는 "호스트"는 WSL2 VM이라 그 밖의 `k6.exe`가 잡히지 않는다. 그래서
"이 실행의 지연이 서버 탓인지 발생기가 CPU를 뺏은 탓인지" 사후에 판별할 수 없다.

두 방식은 왕복 경로가 달라 **비교 조건 자체가 다르다**(실측 경로 오버헤드: 전체 평균 200ms
중 179ms, 서버측은 21ms). 시스템이 이를 blocking 조건으로 보므로 서로 기준선이 되지 않는다.

`docker`로 돌린 뒤 `loadgen.throttledPct`가 0이 아니면 **그 실행의 지연은 발생기가 만든
것일 수 있다** — 회귀 규칙에 경고(warn 1% / fail 5%, `gate:false`)로 걸려 있다.
실측(large, 10 VU · 45초): 발생기 CPU 최대 0.026코어 · throttled 0.194% · 메모리 145.5MB,
같은 구간 앱은 1.239코어 — 발생기가 앱의 1/48이다.

### 5.4 시나리오 카탈로그 (`scenarios/` 17종)

```bash
node tools/perf-run.js scenarios/normal-day.js         --dataset medium
node tools/perf-run.js scenarios/peak-hour.js          --dataset medium
node tools/perf-run.js scenarios/read-heavy.js         --dataset medium
node tools/perf-run.js scenarios/write-heavy.js        --dataset medium
node tools/perf-run.js scenarios/chat-heavy.js         --dataset medium
node tools/perf-run.js scenarios/notification-heavy.js --dataset medium
node tools/perf-run.js scenarios/exam-week.js          --dataset medium
node tools/perf-run.js scenarios/registration-day.js   --dataset medium
node tools/perf-run.js scenarios/cold-start.js         --dataset medium
node tools/perf-run.js scenarios/cache-warm.js         --dataset medium
node tools/perf-run.js scenarios/spike.js              --dataset medium
node tools/perf-run.js scenarios/stress.js             --dataset medium
node tools/perf-run.js scenarios/soak.js               --dataset medium
node tools/perf-run.js scenarios/breakpoint.js         --dataset medium
node tools/perf-run.js scenarios/failover.js           --dataset medium
node tools/perf-run.js scenarios/chaos.js              --dataset medium
node tools/perf-run.js scenarios/deep-paging.js        --dataset medium
```

| 시나리오 | 답하는 질문 | VU | 유지 | 중단 조건 |
|----------|-------------|----|------|-----------|
| `normal-day` | 지금 SLO를 지키는가 (기준선) | 200 | 20m | 없음 |
| `peak-hour` | 등교 피크를 버티는가 | 500 | 15m | 오류율 > 2% |
| `read-heavy` | 캐시 효율은 어떤가 | 300 | 15m | 없음 |
| `write-heavy` | 풀 고갈·락 경합이 나는가 | 200 | 15m | 쓰기 P99 > 3s |
| `chat-heavy` | WS 세션·브로드캐스트 한계 | 400 | 15m | RTT P95 > 1s |
| `notification-heavy` | 배지 폴링 + 대량 UPDATE | 300 | 12m | 없음 |
| `exam-week` | 검색(LIKE 쿼리) 급증 | 150 | 40m | 없음 |
| `registration-day` | BCrypt 로그인 폭주 | 300 | 10m | 로그인 P95 > 2s |
| `cold-start` | 캐시 미스 폭풍 (전 구간이 measure) | 100 | 10m | 없음 |
| `cache-warm` | cold-start 대조군 | 50→100 | 10m | 없음 |
| `spike` | 순간 6배 폭증과 회복 | 100→600→100 | 2m 폭증 | 없음 |
| `stress` | 한계점은 어디인가 (계단식) | 100→1000 | 단계별 | 오류율 > 10% 또는 P95 > 5s |
| `soak` | 오래 돌리면 새는가 | 150 | 2h | 오류율 > 2% |
| `breakpoint` | 도달률 기반 정밀 용량 | rate 10→300/s | 20m 선형 | 오류율 > 15% |
| `failover` | Redis 장애 중 연속성 | 150 | 15m | 없음 |
| `chaos` | 복합 장애 생존성 | 100 | 30m | 없음 |
| `deep-paging` | 페이지가 깊어질수록 비용이 어떻게 늘어나는가 | 5 | 3m | 없음 |

**페어 실험 규칙**

- `cold-start` ↔ `cache-warm`: 같은 날·같은 데이터셋·같은 VU로 **연속 실행**한다.
- `deep-paging`은 **`medium` 이상**에서만 유효하다. 500페이지 × size 10은 5,010번째 글까지
  존재해야 한다는 뜻이므로, `small`(전체 500건)로 돌리면 깊은 페이지가 빈 배열을 반환하고
  빈 응답은 빠르기 때문에 "깊은 페이지도 싸다"는 정반대 결론이 나온다. (그래서 이 시나리오는
  응답의 `total`로 요청 페이지가 범위 안인지 검사해 벗어나면 실행을 FAIL 시킨다.)
- `failover` · `chaos`: 장애 주입 시각을 초 단위로 기록해 Grafana annotation과 맞춘다.

### 5.5 단일 기능 스크립트 (`scripts/` 13종)

시나리오는 여러 기능을 섞지만 이쪽은 한 기능만 집중해서 때린다. 병목 범위를 좁힐 때 쓴다.

| 스크립트 | 대상 | 기본 VU | 기본 지속 |
|----------|------|--------:|-----------|
| `scripts/auth.js` | 로그인·토큰 재발급 | 20 | 1m |
| `scripts/boards.js` | 게시판 목록 | 50 | 1m |
| `scripts/posts.js` | 게시글 목록·상세·작성 | 30 | 2m |
| `scripts/comments.js` | 댓글 목록·작성 | 30 | 2m |
| `scripts/reactions.js` | 좋아요·싫어요 토글 | 50 | 2m |
| `scripts/scraps.js` | 스크랩 토글 | 20 | 1m |
| `scripts/notifications.js` | 알림 목록·읽음 처리 | 30 | 1m |
| `scripts/chat-rest.js` | 채팅 REST | 30 | 2m |
| `scripts/chat-ws.js` | 채팅 WebSocket | 50 | 2m |
| `scripts/friends.js` | 친구 요청·목록 | 20 | 1m |
| `scripts/mypage.js` | 마이페이지 | 20 | 1m |
| `scripts/school.js` | 학교 검색·급식 | 20 | 1m |
| `scripts/timetable.js` | 시간표 | 20 | 1m |

```bash
node tools/perf-run.js scripts/reactions.js --vus 100 --duration 3m --dataset large
```

### 5.6 k6 직접 실행 (권장하지 않음)

디버깅 목적이라면 가능하지만, 직접 치면 세 가지가 조용히 누락된다.
① `--summary-trend-stats`가 없어 **P99가 아예 계산되지 않는다** ② 커밋·브랜치·실행자
메타데이터 ③ 실행 후 지표 수집. 그래서 `perf-run.js` 래퍼가 존재한다.

```bash
k6 run scenarios/normal-day.js
k6 run scenarios/normal-day.js -e VUS=100 -e HOLD=5m -e BASE_URL=http://localhost:18080
k6 run scripts/posts.js -e DATASET=medium -e VUS=30 -e DURATION=2m

# P99를 얻으려면 반드시 이 플래그가 필요하다
k6 run scenarios/normal-day.js --summary-trend-stats "avg,min,med,max,p(90),p(95),p(99)"

# Prometheus로 실시간 전송 — 손으로 칠 일은 없다.
# tools/perf-run.js 가 기본으로 켜고 주소도 local/docker 에 맞춰 넣는다(--no-remote-write 로 끔).
# 굳이 k6 를 직접 칠 때만:
K6_PROMETHEUS_RW_SERVER_URL=http://localhost:9090/api/v1/write \
K6_PROMETHEUS_RW_TREND_AS_NATIVE_HISTOGRAM=true \
K6_PROMETHEUS_RW_PUSH_INTERVAL=5s \
k6 run -o experimental-prometheus-rw scenarios/normal-day.js
```

> **분위수를 직접 보내지 마라.** `K6_PROMETHEUS_RW_TREND_STATS` 는 5초마다 *이미 계산된*
> p95 를 하나씩 보내는데, **분위수는 구간끼리 합산되지 않는다** — 5초 p95 240개를 평균해도
> 20분 p95 가 나오지 않는다. 그래서 저장된 실행에서 앞 5분만 잘라 p95 를 다시 구하는
> 사후 분석이 근사치밖에 안 된다. 원본 분포를 보내는 native histogram 을 쓴다.

**k6 스크립트가 읽는 환경변수**

| 변수 | 기본값 | 뜻 |
|------|--------|-----|
| `BASE_URL` | `http://localhost:18080` | 대상 서버 |
| `WS_URL` | `BASE_URL` 기반 자동 유도 | WebSocket 엔드포인트 |
| `DATASET` | `small` | 사용할 시드 데이터 디렉터리 |
| `SEED_PASSWORD` | `PerfTest123!` | 시드 계정 공통 비밀번호 |
| `VUS` · `DURATION` · `HOLD` · `WARMUP` | 스크립트별 | 부하 형태 |
| `THINK_MIN` · `THINK_MAX` | 1 · 4 | Think time 범위(초) |
| `SPIKE_VUS` · `TARGET_RATE` · `MAX_VUS` · `RAMP` · `RAMP_UP` · `WARMUP_VUS` | 시나리오별 | 특정 시나리오 전용 |

---

## 6. 결과 보기

### 6.1 어디를 보는가

| 알고 싶은 것 | 어디 |
|--------------|------|
| 이번 실행 결과 전체 | `reports/runs/<runId>/report.html` |
| 이력·추세·누적 저하 | `reports/history.html` (`node tools/history.js`로 생성) |
| 실시간 그래프 | Grafana http://localhost:3001 (`admin` / `perf`) — 보고서의 딥링크가 구간까지 맞춰 준다 |
| 기계 판독용 원자료 | `reports/runs/<runId>/run.json` |
| k6 원본 | `reports/runs/<runId>/k6.json` |
| 터미널 요약 사본 | `reports/runs/<runId>/summary.txt` |

`report.html`은 **자기완결형**이다. 외부 CDN·폰트·스크립트를 쓰지 않으므로 슬랙에 올리거나
CI 아티팩트로 받아 인터넷 없이 열어도 같게 보인다.

보고서 구성 순서(결론이 맨 위): 판정 배지 → **병목 가설** → Performance Summary →
Regression → Infrastructure(포화도) → Breakdown(기능별 P95) → Trend → SLO Thresholds →
Grafana 딥링크.

> 병목 가설은 **가설이지 확정 원인이 아니다.** 포화도가 높은 순서로 조사 시작점을 제시할
> 뿐이다. 결론처럼 취급하면 잘못된 방향으로 몇 시간을 낭비한다.

### 6.2 수집·재처리 (`tools/collect.js`)

`perf-run.js`가 자동 호출하므로 보통 직접 쓰지 않는다. 쓰는 경우는 둘이다 —
**회귀 규칙을 고친 뒤 판정만 다시 하기**, **수집이 실패한 실행을 이어서 처리하기**.

```bash
node tools/collect.js                             # 최신 미처리 실행 수집
node tools/collect.js <runId>                     # 특정 실행
node tools/collect.js --all                       # run.json 없는 실행 전부
node tools/collect.js <runId> --force --no-wait    # 이미 처리된 것도 다시 (리포트 재생성)
node tools/collect.js --all --no-wait              # 과거 실행 일괄 재처리
node tools/collect.js <runId> --prom http://localhost:9090
```

| 옵션 | 기본값 | 뜻 |
|------|--------|-----|
| `--wait <sec>` | `15` | 스크레이프 지연 대기 |
| `--no-wait` | — | 대기 없이 즉시 조회 (과거 실행 재처리용) |
| `--force` | — | 이미 처리된 실행도 다시 |
| `--all` | — | 미처리 전부 |
| `--no-gate` | — | 회귀가 있어도 exit 0 |
| `--prom <url>` | `http://localhost:9090` | Prometheus 주소 |
| `--quiet` | — | 콘솔 출력 축소 |

### 6.3 이력·추세 (`tools/history.js`)

```bash
node tools/history.js                        # reports/history.html 생성
node tools/history.js --print                # 터미널 표로 출력
node tools/history.js --scenario normal-day  # 특정 시나리오만
node tools/history.js --env perf             # 특정 환경만
node tools/history.js --limit 50             # 최근 50회
node tools/history.js --rebuild              # index.json 을 run.json 들로부터 재생성
node tools/history.js --out /path/out.html   # 출력 경로 지정
```

**`--rebuild`가 중요한 이유**: `index.json`은 파생 캐시일 뿐이다. 판정 로직이나 guard 모드를
바꾼 뒤 이 명령을 돌리면 과거 실행 전체에 **소급 적용**된다.

**개별 판정이 통과해도 `history.html`의 누적 저하 경고를 본다.** 성능 저하는 대개 한 번의
사고가 아니라 매 배포 3~5%씩의 누적으로 오고, 그건 개별 판정으로 절대 안 잡힌다.
추세는 최근 N회를 전반·후반으로 나눠 **중앙값**을 비교한다(양 끝점 두 개만 쓰면 하필 그
두 번이 이상치였을 때 완전히 틀린 결론이 나온다).

### 6.4 종료 코드 — 누가 대응해야 하는가

| 코드 | 뜻 | 대응 주체 |
|-----:|-----|-----------|
| `0` | 통과 | — |
| `1` | **게이트 회귀** — 서버가 느려졌다 | 애플리케이션 개발자 |
| `2` | **실행 오류** — 도구가 예외로 죽었다 | 도구 담당 |
| `3` | **측정 불가** — 필수 지표를 못 받아 판정이 성립하지 않는다 | 측정 인프라(Prometheus·익스포터·k6) 담당 |

게이트 회귀와 측정 불가가 동시에 성립하면 **3이 이긴다.** 게이트 회귀는 측정을 고치면
다음 실행에서 다시 잡히지만, 측정 파이프라인이 깨진 상태를 방치하면 이후 모든 실행의
판정이 계속 무의미해진다.

---

## 7. 회귀 판정과 기준선 (`regression/`)

### 7.1 기준선은 손으로 지정하지 않는다

비교 대상은 "직전 실행"이 아니라 **"실행 조건이 같고 정상적으로 측정된 가장 최근 실행"**이다.

| 조건 | 등급 | 불일치 시 |
|------|------|-----------|
| 시나리오 | blocking | 기준선 자격 박탈 |
| 환경 (`--env`) | blocking | 기준선 자격 박탈 |
| 데이터셋 (프로파일 + 생성 지문 + **실행 시작 시점 DB 상태**) | blocking | 기준선 자격 박탈 |
| 부하 발생기 (`local` / `docker`) | blocking | 기준선 자격 박탈 |
| 부하 프로파일 (VU·executor·stage) | blocking | 기준선 자격 박탈 |
| 측정 구간 설계 (warmup/measure/rampdown 초 수·mode·gatePhase) | blocking | 기준선 자격 박탈 |
| 부하 스크립트 지문 | degrading | 비교하되 경고 + FAIL을 WARN으로 강등 |

- **blocking** — 수치가 *무의미*해진다. 데이터셋이 다른 두 실행의 P95를 나란히 놓는 것은
  "믿을 수 없는 비교"가 아니라 애초에 비교가 아니다. 상대 비교를 생략하고 절대 게이트만 남긴다.
- **degrading** — 수치가 *의심스럽다*. 비교는 하되 게이트를 열고 리포트에 사유를 띄운다.

**성능이 나빴다는 이유로는 기준선에서 빼지 않는다.** 기준선 자격은 측정 무결성과 비교
가능성으로만 정해진다 — 개선 전후를 비교하려면 느린 Before가 기준선이어야 한다.
느린 기준선을 써도 거짓 PASS가 되지 않는 이유는 절대 게이트가 기준선과 무관하게 계속 돌기
때문이다. 기준선 3,800ms · 현재 2,200ms · SLO 500ms면 **42% 개선이면서 동시에 FAIL**이고,
리포트는 두 사실을 함께 보여준다.

**비교하지 않았다면 그 사실을 말한다.** 보고서의 `baselineStatus`:

| 값 | 뜻 |
|----|-----|
| `compared` | 유효한 대조군과 비교했다 |
| `incomparable` | 과거 후보는 있었으나 자격 또는 조건 때문에 쓰지 못했다 (탈락 사유를 표시) |
| `first-run` | 이 시나리오의 과거 실행이 아예 없다 |

### 7.2 판정 기준 바꾸기

기준은 `regression/rules.json` 한 곳에만 있다. 코드를 고칠 필요가 없다.

```json
{
  "key": "k6.phases.measure.p95",
  "label": "P95 응답시간",
  "direction": "lower_is_better",
  "warn": { "changePct": 10 },
  "fail": { "changePct": 20 },
  "absolute": { "fail": { "gt": 500 } },
  "noiseFloor": 5,
  "minBaseline": 10,
  "gate": true
}
```

| 필드 | 역할 |
|------|------|
| `key` | run 레코드에서 값을 꺼낼 경로. `k6.phases.measure.*`(게이트 구간) / `k6.all.*`(전체 참고용) / `infra.flat.*` |
| `direction` | `lower_is_better` / `higher_is_better` — 어느 쪽 변화가 나쁜지 |
| `warn` · `fail` | 기준선 대비 **나쁜 방향** 변화율 임계 |
| `absolute` | 기준선과 무관한 절대 상·하한 (SLO 게이트) |
| `noiseFloor` | 이 값보다 작은 절대 변화는 회귀로 보지 않음 |
| `minBaseline` | 기준값이 이보다 작으면 비율 비교 생략 |
| `gate` | `true`면 CI 중단 대상이며 **동시에 "필수 지표" 선언**이다 |

규칙을 고친 뒤 과거 실행에 다시 적용:

```bash
node tools/collect.js <runId> --force --no-wait   # 한 건
node tools/collect.js --all --force --no-wait     # 전체 재판정
node tools/history.js --rebuild                   # 인덱스 갱신
```

**게이트 대상**은 응답시간(P95/P99/평균) · 오류율 · TPS/RPS · Check 성공률 ·
MySQL slow query · 커넥션 타임아웃 · CPU throttling뿐이다. 나머지(힙·GC·각종 포화도)는
`gate:false`로 정보 제공만 한다. 게이트를 남발하면 빌드가 상시 빨간색이 되고,
그러면 아무도 결과를 보지 않게 된다.

### 7.3 측정 상태 (verdict와 다른 축이다)

- `verdict`(PASS/WARN/FAIL) = "서버가 괜찮은가"
- `measurementStatus`(MEASURED/PARTIAL/UNMEASURED) = "그 판단을 내릴 데이터가 있었는가"

게이트 지표를 하나라도 못 받으면 `UNMEASURED`이고 종료 코드는 3이다. measure 구간이 계획보다
짧게 끝난 실행(조기 종료)은 필수 지표가 다 있어도 `PARTIAL`이다.

> **왜 값이 아니라 표본 수로 판정하는가**: k6는 threshold가 참조한 서브메트릭을 표본이 한
> 건도 없어도 **0으로 채워** 요약에 실어 준다(v2.1.0 실측 — `p(95)=0`, `rate=0`, 심지어
> `checks: rate>0.99`조차 PASS로 보고된다). 그래서 조기 종료로 measure 구간이 비면
> "P95 0ms, 오류율 0%"라는 완벽해 보이는 실행이 만들어진다. 값만으로는 가려낼 수 없으므로
> `http_reqs{phase:X}`의 표본 수를 먼저 보고 0건인 구간의 통계를 `null`로 되돌린다.

### 7.4 CI

`regression/perf-regression.yml`이 GitHub Actions 워크플로 템플릿이다. **아직
`.github/workflows/`에 복사되지 않았다** — 활성화하려면 복사해야 한다.

```bash
cp regression/perf-regression.yml ../.github/workflows/perf-regression.yml
```

CI는 축소 시나리오(3분)로 **큰 회귀만** 잡는다. 정밀 비교는 로컬 기준 환경에서 한다.
CI 러너 성능은 로컬과 다르므로 워크플로는 `--env ci`로 실행해 로컬 이력과 섞이지 않게 한다.

회귀가 났을 때의 조사 순서: 보고서의 병목 가설 확인 → Grafana 딥링크로 해당 구간 검증 →
로컬에서 풀버전 시나리오로 재현 → `git bisect`로 원인 커밋 이등분 탐색.

---

## 8. 반복 정밀도 측정 (`tools/repeatability.js`)

**언제 쓰는가**: 회귀 임계값이 "p95가 20% 나빠지면 실패"라고 말하려면, 아무것도 바꾸지 않고
같은 조건을 반복했을 때의 **자연 편차가 20%보다 작아야** 한다. 편차를 모르면 임계값은 근거
없는 숫자다. 이 도구는 그 편차를 **변동계수(CV = 표준편차 ÷ 평균)**로 남긴다.
CV는 무차원이라 절대 지연이 달라진 환경끼리도 비교할 수 있다 — 측정 환경 자체를 바꾼 전후를
비교하는 유일한 축이다.

```bash
node tools/repeatability.js scripts/posts.js --runs 10 --vus 20 --duration 90s \
  --dataset large --env perf-mi-before --reset restart
```

| 옵션 | 기본값 | 뜻 |
|------|--------|-----|
| `--runs <n>` | `10` | 반복 횟수 (최소 2) |
| `--vus` · `--duration` · `--dataset` · `--warmup` · `--hold` · `--loadgen` | — | `perf-run.js`로 그대로 전달 |
| `--env <name>` | `perf` | **기존 이력과 섞이지 않게 전용 이름을 쓸 것** |
| `--reset <mode>` | `restart` | `restart`(앱 재시작 + FLUSHALL) / `flush`(FLUSHALL만) / `none` |
| `--wait <sec>` | `20` | Prometheus 스크레이프 대기 |
| `--settle <sec>` | `5` | 리셋 후 안정화 대기 |
| `--note "<text>"` | — | 각 실행에 남길 메모 |
| `--out <path>` | `reports/repeatability/<env>-<ts>.json` | 결과 JSON 경로 |

> **리셋 모드는 편차의 구성 요소를 바꾼다.** `restart`는 매번 콜드 JVM에서 시작하므로 JIT
> 워밍업 편차가 CV에 포함된다. 문서화된 실제 실험 절차와 일치시킨 의도적 선택이며,
> 전후 비교 시 반드시 같은 모드를 써야 한다.

---

## 9. 장애 주입 (카오스)

```bash
# Redis 순단 반복: 3회, 10초 정지, 60초 간격
tools/chaos-redis-flap.sh 3 10 60

# 앱 CPU 제한: 1코어로 300초 제한한 뒤 2코어로 원복
tools/chaos-cpu-squeeze.sh 1 300 2

# 즉석 수동 주입
docker stop perf-redis && sleep 10 && docker start perf-redis
docker update --cpus 1 perf-app       # 제한
docker update --cpus 2 perf-app       # 원복
```

`failover` / `chaos` 시나리오를 돌리면서 별도 터미널에서 주입한다. **주입 시각을 초 단위로
기록해** 실험 문서와 Grafana annotation에 맞춘다. 네트워크 지연 주입(tc netem)은 Linux 호스트
전용이며, 대안은 pumba다:
`docker run gaiaadm/pumba netem --duration 5m delay --time 50 perf-mysql`

---

## 10. 심층 분석 (병목 원인 규명 단계)

지표로 병목 범위를 좁힌 **뒤에** 짧게 붙인다. 프로파일러 오버헤드가 측정을 오염시키므로
상시 켜 두지 않는다.

### JVM

```bash
# JFR — 컴포즈가 상시 기록 중 (maxsize 200MB). JDK Mission Control로 열기
docker cp perf-app:/tmp/perf.jfr .

# GC 로그 — "Full GC 유무"가 1차 확인
docker cp perf-app:/tmp/gc.log .
docker exec perf-app sh -c "tail -100 /tmp/gc.log"
```

### MySQL

```bash
# 접속
docker exec -it perf-mysql mysql -uroot -pperfroot highteenday

# slow query log (100ms 초과 전수 기록)
docker exec perf-mysql sh -c "tail -200 /var/lib/mysql/slow.log"

# 쿼리 digest별 통계 — 어느 쿼리가 시간을 다 썼는가
docker exec perf-mysql mysql -uroot -pperfroot highteenday -e "
SELECT DIGEST_TEXT, COUNT_STAR, SUM_TIMER_WAIT/1e12 sec, SUM_ROWS_EXAMINED
FROM performance_schema.events_statements_summary_by_digest
ORDER BY SUM_TIMER_WAIT DESC LIMIT 10;"
```

한글이 들어가는 SQL을 흘려넣을 때는 `--default-character-set=utf8mb4`를 반드시 붙인다
(없으면 mojibake로 저장된다 — 실측 확인됨).

```bash
docker exec -i perf-mysql mysql --default-character-set=utf8mb4 -uroot -pperfroot highteenday <<'SQL'
SELECT COUNT(*) FROM posts WHERE is_valid=1;
SQL
```

### Redis

```bash
docker exec -it perf-redis redis-cli
docker exec perf-redis redis-cli INFO stats
docker exec perf-redis redis-cli SLOWLOG GET 10
docker exec perf-redis redis-cli DBSIZE
```

### 컨테이너

```bash
docker stats                          # 즉석 확인 (기록은 cAdvisor→Prometheus)
docker exec perf-app sh -c "cat /sys/fs/cgroup/memory.events"
```

### Prometheus 직접 조회

```bash
curl -s "http://localhost:9090/api/v1/query?query=up" | head
curl -s --get "http://localhost:9090/api/v1/query" \
  --data-urlencode 'query=rate(mysql_global_status_slow_queries[1m])'
```

주요 PromQL 정의는 [`metrics/README.md`](metrics/README.md)에 지표별로 정리돼 있다.
지표를 하나 추가하려면 `tools/lib/metrics-catalog.js`의 해당 그룹에 한 줄 넣으면 되고,
수집기·리포트·회귀 분석이 전부 카탈로그를 순회하므로 다른 파일은 건드릴 필요가 없다.

---

## 11. 트러블슈팅 — 실측으로 확인된 함정

| 증상 | 원인 | 해결 |
|------|------|------|
| 앱 컨테이너가 무한 재시작 | `dev`/`local` 프로파일의 `AppStartupRunner`가 빈 DB에서 `boardId=1~5`를 가정해 기동 실패 | `SPRING_PROFILE=prod,perf` 유지 |
| 로그인은 200인데 이후 전부 401 | `prod` 단독은 쿠키에 `Domain=.highteenday.org`·`Secure`를 하드코딩 → k6 쿠키 저장소가 재전송하지 않음 | `prod,perf` 두 프로파일을 함께 활성화 |
| `seed.js`가 조용히 아무것도 안 만듦 | `spring.sql.init.mode=never`라 `data.sql`이 실행되지 않아 `/api/boards`가 빈 배열 | `bootstrap.js` 사용 (게시판 5행 선삽입) |
| `GET /api/hotposts/daily`가 항상 500 | `daily_hot_post` 테이블 미생성 (BTL-009) | `bootstrap.js` 사용 |
| 시드 데이터가 명세의 2배 | `seed.js` 두 번 실행 — 계정만 건너뛰고 글·댓글은 매번 새로 만들어짐 (실측: small 500 → 1065) | `bootstrap.js`의 중복 차단에 맡기고, 재시드는 `--force` |
| 로그인·회원가입이 500 | `JWT_KEY`가 512비트 미만 | `openssl rand -base64 64` |
| DB의 한글이 깨짐(mojibake) | `mysql` CLI에 `--default-character-set=utf8mb4` 누락 | 항상 명시 |
| "컨테이너 CPU" 패널만 No data | Docker Desktop의 containerd 이미지 스토어 때문에 cAdvisor가 컨테이너 핸들러 생성 자체를 실패 | Settings → General → **"Use containerd for pulling and storing images" 해제** 후 재시작 |
| MySQL CPU 지표가 없음 | mysqld-exporter에 CPU 지표가 아예 없다 (구조적 사각지대) | 위 cAdvisor 복구가 필요 |
| P99 칸이 항상 빔 | k6 기본 요약은 p(99)를 계산하지 않는다 | `perf-run.js`를 쓰거나 `--summary-trend-stats` 명시 |
| k6 실행만 `UNKNOWN`으로 실패 | Application Control이 Chocolatey shim을 차단 | `K6_BIN`으로 실제 exe 경로 지정 (§1.3) |
| `mysql/perf.cnf` 설정이 안 먹음 | Windows 바인드 마운트가 world-writable이 되어 mysqld가 설정 파일을 조용히 무시 | 실제 값은 컴포즈의 `command:` CLI 플래그에 있다. `perf.cnf`는 읽기용 참고 문서 |
| 메모리 포화도가 상시 100% | 힙 1G 프로세스의 실제 풋프린트가 컨테이너 한계 1536m와 같았음(anon 1518MB) | 컨테이너 메모리를 힙의 2.5배로 (이미 적용) |
| 모든 실행이 `incomparable` | 시드를 재생성해 데이터셋 지문이 바뀌면 그 이전 실행 전부가 후보에서 탈락한다 | 정상 동작이다. 새 지문으로 기준선을 다시 쌓는다 |
| `strict`인데 실행이 거부됨 | 해당 프로파일의 스냅샷이 없음 | `node tools/snapshot.js create <profile>` |
| 깊은 페이지가 싸다고 나옴 | `deep-paging`을 `small`로 돌려 빈 배열을 받음 | `medium` 이상에서 실행 |

---

## 12. 유지보수

### 12.1 도구 자체 테스트

판정을 내리는 코드는 스스로도 검증돼야 한다. 회귀 판정·기준선 선택 로직을 고치면 반드시 돌린다.

```bash
npm test                                  # = node tools/test/all.js
node tools/test/all.js
node tools/test/regression.test.js        # 개별 실행도 가능
```

검증 대상: `comparability`, `regression`, `repository`, `summary-parsing`, `phases`,
`collect-window`, `thresholds`, `scenario-thresholds`, `baseline-report`, `fingerprint`,
`sampling`, `dataset-guard`, `sanitize-reports`.

### 12.2 과거 실행 이관

`reports/raw/*.summary.json`(구버전 산출물)을 새 파이프라인으로 가져온다.
Prometheus 보관 기간(30일) 안의 실행이면 **운영 지표까지 소급해서 채워진다.**

```bash
node tools/migrate-raw.js --dry-run                        # 무엇이 이관될지만 출력
node tools/migrate-raw.js && node tools/collect.js --all --no-wait
```

### 12.3 공개 게시 전 정화

`reports/`는 실행자(`사용자명@호스트명`), 접속 URL, 커밋 해시, 실행 메모를 그대로 담는다.
**비공개 저장소라도 GitHub Pages 사이트는 기본적으로 공개**이므로 게시 전에 지운다.
원본(`performance/reports/`)은 건드리지 않고 게시용 복사본만 대상이다.

```bash
node tools/sanitize-reports.js _site --dry-run   # 무엇이 지워질지 확인
node tools/sanitize-reports.js _site             # 정화
node tools/sanitize-reports.js _site --verify    # 게시 직전 최종 확인 (결과물만 보고 판정)
```

### 12.4 Pages 게시

`.github/workflows/perf-reports-pages.yml`이 `performance/reports/` 전체를 Pages로 올린다.
`develop`/`main`에 `performance/reports/**`가 푸시되면 자동 배포되고, `history.html`이
`index.html`로 복사되어 랜딩 페이지가 된다. 저장소 설정에서 1회 활성화가 필요하다:
`Settings → Pages → Source: GitHub Actions`.

### 12.5 저장 공간과 실행 격리

실행당 약 120KB(`run.json` 51KB · `report.html` 50KB · `k6.json` 9KB). 500회면 약 60MB다.
`report.html`은 `run.json`으로부터 언제든 재생성되므로(`collect.js --force`), 부담되면
오래된 실행의 HTML만 지워도 이력과 추세는 그대로 유지된다.

기준선으로 쓰면 안 되는 실행은 지우지 않고 `reports/archive/<runId>/`로 옮긴다 —
인덱스·기준선 자동 선택·추세에서 전부 빠지지만 증거로는 남는다. 사유는
`reports/archive/README.md`에 적는다.

---

## 13. 환경변수 총람

| 변수 | 기본값 | 영향 |
|------|--------|------|
| `K6_BIN` | `k6` (PATH) | k6 실행 파일 경로 |
| `K6_IMAGE` | `grafana/k6:2.1.0` | `--loadgen docker`의 k6 이미지. **로컬 바이너리와 같은 버전이어야 한다** |
| `K6_NETWORK` | `environment_default` | 컨테이너 k6가 붙을 도커 네트워크 |
| `K6_CPUS` | `4` | 컨테이너 k6의 CPU 상한 |
| `K6_DOCKER_BASE_URL` | `http://app:8080` | 컨테이너 k6가 접속할 주소 |
| `PERF_LOADGEN` | `local` | `--loadgen` 기본값 |
| `PERF_LOADGEN_CONTAINER` | `perf-k6` | 부하 발생기 컨테이너 이름 |
| `PERF_DATASET_GUARD` | — | guard 모드 (`--guard`보다 낮고 `perf.config.json`보다 높은 우선순위) |
| `PERF_MYSQL_CONTAINER` · `PERF_REDIS_CONTAINER` · `PERF_APP_CONTAINER` | `perf-mysql` · `perf-redis` · `perf-app` | 컨테이너 이름 재정의 |
| `PERF_APP_HEALTH` | `http://127.0.0.1:18080/actuator/health` | 헬스체크 주소 |
| `PERF_BASE_URL` | `http://localhost:18080` | `repeatability.js`의 대상 서버 |
| `PERF_PROM_URL` | `http://localhost:9090` | Prometheus 주소 |
| `MYSQL_ROOT_PASSWORD` · `MYSQL_DATABASE` | `perfroot` · `highteenday` | DB 접속 |
| `PERF_BRANCH` · `PERF_COMMIT` · `PERF_BUILD` · `PERF_EXECUTOR` | Git·OS에서 자동 수집 | 실행 메타데이터 (CI에서 주입) |

CI 환경변수(`GITHUB_HEAD_REF`, `GITHUB_REF_NAME`, `GITHUB_SHA`, `GITHUB_RUN_NUMBER`,
`GITHUB_ACTOR`)도 자동 인식한다. CI는 detached HEAD로 체크아웃하는 경우가 많아
`git rev-parse --abbrev-ref HEAD`가 `HEAD`를 뱉으므로, CI가 넘겨준 값을 우선한다.
커밋되지 않은 변경이 있으면 기록되는 커밋 해시에 `+dirty`가 붙는다.

---

## 14. 실행 명령 색인

한눈에 보는 전체 목록. 자세한 옵션은 위 해당 절 참고.

```bash
# ── 환경 ─────────────────────────────────────────────────────────────
docker compose -f environment/docker-compose.perf.yml --env-file environment/.env.perf up -d --build
docker compose -f environment/docker-compose.perf.yml --env-file environment/.env.perf ps
docker compose -f environment/docker-compose.perf.yml --env-file environment/.env.perf stop
docker compose -f environment/docker-compose.perf.yml --env-file environment/.env.perf down -v
curl -s localhost:18080/actuator/health
curl -s localhost:18080/actuator/prometheus | head
docker restart perf-app
docker exec perf-redis redis-cli FLUSHALL

# ── 데이터셋 ──────────────────────────────────────────────────────────
node environment/bootstrap.js --profile <p> [--force | --skip-seed | --resume]
node datasets/seed.js --profile <p> [--tolerance <pct>] [--on-failure stage|immediate|continue] [--resume]
bash datasets/verify.sh <p>
node datasets/resort-by-engagement.js <p>

# ── 스냅샷 ────────────────────────────────────────────────────────────
node tools/snapshot.js create <p> [--note "..."] [--no-compress]
node tools/snapshot.js list
node tools/snapshot.js verify <p>
node tools/snapshot.js restore <p>
node tools/snapshot.js restore --id <snapshotId>

# ── 실행 ──────────────────────────────────────────────────────────────
node tools/preflight.js --dataset <p> [--rate n] [--json]   # 판정용 측정 전 필수
node tools/perf-run.js <script> [--vus n] [--duration d] [--hold d] [--warmup sec]
                                [--env name] [--dataset p] [--note "..."] [--wait sec]
                                [--guard off|warn|strict] [--loadgen local|docker]
                                [--no-collect] [--no-gate] [-e KEY=VALUE]
k6 run <script> [-e VUS=n] [-e DURATION=d] [-e DATASET=p] \
       --summary-trend-stats "avg,min,med,max,p(90),p(95),p(99)"

# ── 결과 ──────────────────────────────────────────────────────────────
node tools/collect.js [<runId> | --all] [--force] [--wait sec | --no-wait] [--no-gate] [--prom url] [--quiet]
node tools/history.js [--print] [--rebuild] [--scenario name] [--env name] [--limit n] [--out path]

# ── 정밀도 · 카오스 ───────────────────────────────────────────────────
node tools/repeatability.js <script> --runs n [--vus n] [--duration d] [--dataset p]
                                     [--env name] [--reset restart|flush|none]
                                     [--wait sec] [--settle sec] [--note "..."] [--out path]
tools/chaos-redis-flap.sh <반복> <정지초> <간격초>
tools/chaos-cpu-squeeze.sh <제한코어> <지속초> <원복코어>

# ── 유지보수 ──────────────────────────────────────────────────────────
npm test
node tools/migrate-raw.js [--dry-run]
node tools/sanitize-reports.js <dir> [--dry-run | --verify]
```

---

## 15. 더 읽을 것

| 문서 | 내용 |
|------|------|
| [`README.md`](README.md) | 프로젝트 목적·철학·테스트 종류 개요 |
| [`PERFORMANCE-MANAGEMENT.md`](PERFORMANCE-MANAGEMENT.md) | 파이프라인 구조와 **설계 근거** (2단계 분리, 기준선 자격, 저장 스키마) |
| [`DATASET-STATE.md`](DATASET-STATE.md) | 상태 지문·스냅샷의 설계와 실측값 |
| [`environment/README.md`](environment/README.md) | 환경 명세와 재현성 체크리스트 |
| [`datasets/README.md`](datasets/README.md) | Zipf 분포 근거, 검증 쿼리, 실패 정책 |
| [`scenarios/README.md`](scenarios/README.md) | 시나리오 카탈로그와 여정별 가중치 |
| [`metrics/README.md`](metrics/README.md) | 지표 정의와 PromQL, 해석 규칙 |
| [`regression/README.md`](regression/README.md) | 회귀 판정 흐름과 규칙 필드 |
| [`reports/README.md`](reports/README.md) | 산출물 구조와 보고서 섹션 |
| [`tools/README.md`](tools/README.md) | 도구별 책임과 외부 도구 카탈로그 |
| [`experiments/README.md`](experiments/README.md) | 실험 대장 (EXP-001~005)과 실험 규칙 |
| [`bottlenecks/README.md`](bottlenecks/README.md) | 병목 카탈로그 (BTL-001~012) |
| [`optimizations/README.md`](optimizations/README.md) | 개선 기록 규칙 (Before/After 필수) |
