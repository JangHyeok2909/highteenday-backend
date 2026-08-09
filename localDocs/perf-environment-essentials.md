# performance/environment/ — 내가 구축한 측정 환경, 내가 알아야 할 전부

> 목적: 이 환경을 "AI가 짜준 compose"가 아니라 **내 손바닥 위의 시스템**으로 만들기.
> 구성 → 설계 결정(왜) → 조작법 → 함정 → 한계 순서. 전 항목이 실제 파일 기준이며 경로를 병기한다.
> 원본 문서: `performance/environment/README.md` (이 문서는 그 요약+보강판)

---

## 1. 전체 그림 — 무엇이 떠 있나

`environment/docker-compose.perf.yml` 하나로 8개 컨테이너가 뜬다:

| 컨테이너 | 이미지(버전 고정) | 리소스 한계 | 호스트 포트 | 역할 |
|---|---|---|---|---|
| perf-app | 루트 Dockerfile 빌드 | **2.0 vCPU / 2560m** | **18080** | 측정 대상(SUT) |
| perf-mysql | mysql:8.0.36 | 2.0 vCPU / 2g | 13316 | DB |
| perf-redis | redis:7.2-alpine | 1.0 vCPU / 512m | 16389 | 캐시 |
| perf-prometheus | prom/prometheus:v2.51.0 | 무제한 | 9090 | 지표 저장(30일 보존) |
| perf-grafana | grafana:10.4.0 | 무제한 | 3001 | 대시보드 (admin/perf, 익명 Viewer 허용) |
| perf-mysqld-exporter | v0.15.1 | 무제한 | — | MySQL 상태 → 메트릭 |
| perf-redis-exporter | v1.58.0 | 무제한 | — | Redis 상태 → 메트릭 |
| perf-cadvisor | v0.49.1 (privileged) | 무제한 | — | 컨테이너 cgroup 지표 |

- 호스트 포트가 전부 표준에서 옮겨져 있는 이유: 로컬 MySQL(3306)/Redis(6379)/다른 서버(8080)와 충돌 방지. `.env.perf`의 `APP_HOST_PORT` 등으로 override 가능.
- Prometheus는 **5초 간격 스크레이프**(`environment/prometheus/prometheus.yml` — "15s 기본값으론 스파이크를 놓친다") + k6가 **remote write로 밀어넣는 수신구** 겸용(`--web.enable-remote-write-receiver`).
- 운영 스택(docker-compose.prod.yml)과의 차이 3줄: ① 리소스 상한 명시(재현성) ② 관측 스택 동봉 ③ MySQL/Redis 설정 고정(암묵 기본값 배제).

## 2. 핵심 설계 결정 7개 — "왜 이렇게 생겼나"

### 결정 1. 모든 서비스에 리소스 상한 명시
어떤 호스트에서 돌려도 같은 조건 재현 + **한계를 알아야 포화도(%)를 계산할 수 있다**(포화도 = 사용량/한계). 관측 계층(Prometheus/Grafana/exporter)은 무제한 — 측정 대상이 아니므로.

### 결정 2. MySQL 튜닝을 설정 파일이 아니라 CLI 플래그로 (compose `command:` 블록)
**Windows Docker Desktop의 바인드 마운트 파일은 world-writable 권한이 되는데, mysqld는 그런 설정 파일을 경고 한 줄만 남기고 통째로 무시한다** — buffer pool 128MB, slow log OFF로 조용히 기동해 알아채기 어렵다(실측). CLI 플래그는 이 검사를 안 받는다. 그래서 `environment/mysql/perf.cnf`는 **마운트되지 않는 참고 문서일 뿐**이다.
플래그 내용: buffer pool 1G, max_connections 200, **내구성은 운영과 동일**(flush-log-at-trx-commit=1, sync-binlog=1 — 완화 금지 원칙), slow log 0.1초 + 미인덱스 쿼리 로깅, performance-schema ON, utf8mb4, KST, `lower-case-table-names=1`(BTL-008 우회).

### 결정 3. MySQL 볼륨을 데이터셋 프로파일별로 분리 (`perf-mysql-data-${DATASET_PROFILE}`)
시드가 API 기반이라 large는 적재에 수 시간. 볼륨이 하나면 프로파일 전환 = 전체 재시드라 왕복이 비현실적. 분리하면 시드 비용은 프로파일당 1회, 전환은 컨테이너 재생성 수준. **규모별 비교(병목이 large에서만 재현되는가)는 전환이 싸야 성립한다.**
⚠ **Redis는 볼륨이 없어 분리 안 됨** — 전환해도 이전 프로파일의 캐시/카운터가 남는다. 그래서 전환 시 FLUSHALL 필수(bootstrap.js가 자동 처리).

### 결정 4. 앱 프로파일은 `prod,perf` 조합 (entrypoint 덮어쓰기)
Dockerfile ENTRYPOINT가 `--spring.profiles.active=prod`로 고정돼 있어 환경변수로는 못 바꾸므로 compose가 entrypoint 자체를 덮어쓴다. 조합의 이유:
- **prod가 필요한 이유**: dev/local에서는 `AppStartupRunner(@Profile("!prod"))`가 기동 시 테스트 데이터를 심으려다 **빈 DB에서 예외 → JVM 종료 → restart 정책 때문에 무한 크래시 루프**(실측 재현). prod는 이 러너가 비활성.
- **perf가 필요한 이유**: prod는 쿠키를 `Domain=.highteenday.org; Secure` 로 하드코딩 — localhost+평문 HTTP 부하에서는 RFC 6265를 지키는 모든 쿠키 저장소(k6 포함)가 그 쿠키를 재전송하지 않아 **로그인은 200인데 이후 전부 401**. `application-perf.properties`가 쿠키 속성만 되돌린다. 뒤에 오는 프로파일이 겹치는 키를 덮어쓴다.
- (재미: seed.js의 자체 쿠키 저장소는 Domain/Secure를 검사 안 해서 **스펙을 안 지킨 덕에 우연히 동작** — k6와 결과가 달랐던 이유)

### 결정 5. JVM — 힙 고정 + 관측 원자료 상시 기록 (`JAVA_TOOL_OPTIONS`)
`-Xms1g -Xmx1g`(동적 확장 노이즈 제거 — 힙은 통제 변수), G1 + MaxGCPauseMillis=200(실험 간 동일 조건 명시), GC 로그 rotate 5×20MB, **JFR 상시 기록**(200MB, dumponexit — 느려진 뒤에 소급 분석할 원자료).

### 결정 6. 컨테이너 메모리 = 힙의 2.5배 (2560m)
1536m 시절 실측: anon 1518MB/file 4MB(= 전부 JVM 자신), 커널 강제 회수 992회, OOM 0. 힙 1G + 비힙 ~200MB + 스레드 스택 + GC 구조체 = 실 풋프린트 1.5GB라 여유 0. 부작용은 지표 쪽이 더 컸다 — 실행 71건 중 43건이 메모리 포화 100%로 기록돼 **지표가 신호로서 죽었다**. 힙을 줄이지 않은 이유: GC 오버헤드 최대 0.18%로 힙은 문제가 아니었고, 힙 고정 원칙 유지. (이 변경 이후 실행은 이전과 비교 불가 — 커밋에 명시)

### 결정 7. Redis — eviction 포함 측정, 디스크 저장 제거 (`environment/redis/redis-perf.conf`)
maxmemory 384MB + allkeys-lru(eviction 거동까지 실험 대상), `save ""` + appendonly no(부하 중 RDB fork가 지연 스파이크를 만들지 않게 — 단 failover 실험 때는 운영과 동일하게 켜고 비교할 것), slowlog 1ms, keyspace 만료 이벤트 노출.

### (+) 시드 전용 오버라이드 `environment/docker-compose.seed.yml` — "되돌림이 기본값"
시드는 측정이 아니므로 빠르게: app CPU 2→6(BCrypt 2만 회가 병목), 힙 1→2g, JFR/GC로그 OFF, **Hikari 10→50**(10은 결함이 아니라 BTL-002 가설 — 영구히 올리면 발견이 지워진다), MySQL fsync 완화(trx-commit=2, sync-binlog=0), slow log OFF. `-f`로 붙였을 때만 적용되고 평소 명령으로 재기동하면 자동으로 측정 스펙 복귀.
⚠ compose는 `command:`를 **병합이 아니라 치환** — 오버라이드가 전체 플래그를 다시 적는다. 빠뜨리면 charset/timezone/lower-case가 사라져 한글 깨짐·테이블명 불일치.
복귀 검증: `SELECT @@innodb_flush_log_at_trx_commit, @@sync_binlog;` → 1, 1 / `hikaricp_connections_max` → 10.

## 3. 조작법 — 명령어 전부

```bash
# 최초 1회
cp environment/.env.perf.example environment/.env.perf

# 기동 (프로파일은 .env.perf의 DATASET_PROFILE이 결정 — 현재 large)
docker compose -f environment/docker-compose.perf.yml --env-file environment/.env.perf up -d --build

# 확인
curl -s localhost:18080/actuator/health              # {"status":"UP"}
curl -s localhost:18080/actuator/prometheus | head   # 지표 노출 확인
# Grafana: http://localhost:3001 (admin/perf)

# 프로파일 전환 (예: large → small): .env.perf에서 DATASET_PROFILE=small 수정 후
docker compose -f environment/docker-compose.perf.yml --env-file environment/.env.perf up -d
node environment/bootstrap.js --profile small        # 전환 후 필수 절차 일괄 실행

# 시드 (신규 프로파일 최초 1회 — 시드 오버라이드 붙여서 빠르게)
docker compose -f environment/docker-compose.perf.yml -f environment/docker-compose.seed.yml \
  --env-file environment/.env.perf up -d
node environment/bootstrap.js --profile <p>          # 내부에서 datasets/seed.js 호출
# 끝나면 오버라이드 없이 up -d 로 재기동 → 측정 스펙 자동 복귀

# 실험 간 상태 리셋 (데이터 유지, 캐시/JIT만 초기화 — cold 조건)
docker restart perf-app && docker exec perf-redis redis-cli FLUSHALL

# 완전 초기화 (현재 프로파일 볼륨까지 삭제 — 재시드 필요)
docker compose -f environment/docker-compose.perf.yml down -v

# 부하 실행 (perf-run이 k6 실행→수집→판정→리포트까지)
node performance/tools/perf-run.js performance/scenarios/normal-day.js
# k6 바이너리를 못 찾으면(Windows shim 차단): K6_BIN=<k6.exe 절대경로> 지정
```

### bootstrap.js가 대신 막아주는 5가지 (손으로 하면 반드시 빠뜨린다 — 실측)
`environment/bootstrap.js`:
1. **마운트된 볼륨 ↔ --profile 일치 검증** — 환경변수가 아니라 실제 컨테이너 마운트를 조회(.env.perf 값은 셸에 없어서 환경변수는 못 믿음). 없으면 medium 데이터를 small 볼륨에 부어 양쪽 오염.
2. **게시판 5행 선삽입** — `sql.init.mode=never`라 data.sql이 안 돌므로. 없으면 seed.js가 `/api/boards` 빈 배열을 받고 **조용히** 실패. (utf8mb4 명시 필수 — 없으면 한글 mojibake, 실측)
3. **daily_hot_post 테이블 생성** — Flyway baseline이 안 만드는 테이블(BTL-009). 없으면 `GET /api/hotposts/daily` 항상 500. (레거시 ddl 스크립트는 FK 오타·제약명 충돌이 있어 수정판 사용)
4. **Redis FLUSHALL** — 결정 3의 주의사항.
5. **시드 중복 실행 차단** — seed.js를 두 번 돌리면 계정만 건너뛰고 글/댓글은 또 만들어져 명세의 2배가 된다(실측: small 500 → 1065). `--force`로만 재시드 허용.

## 4. 함정 목록 — 실측으로 확인된 것들 (겪은 순서 무관, 전부 재현 근거 있음)

| # | 함정 | 증상 | 원인/해법 |
|---|---|---|---|
| 1 | dev/local 프로파일로 기동 | 무한 크래시 루프. health가 찰나에 200이라 착시 — `docker ps`의 "Up N seconds" 리셋 반복까지 봐야 함 | 결정 4. 반드시 prod,perf |
| 2 | prod 단독 기동 | 로그인 200, 이후 전부 401 | 쿠키 Domain/Secure — 결정 4 |
| 3 | **cAdvisor 컨테이너별 지표 없음** | "컨테이너 CPU" 패널만 No data. 타겟은 up, 시리즈는 cgroup 루트뿐 | Docker Desktop containerd 이미지 스토어(`overlayfs` 드라이버) — cAdvisor가 도커 레이어 경로를 못 찾아 **컨테이너 핸들러 생성 자체가 실패**. 1순위 해법: Docker Desktop 설정에서 "Use containerd..." 해제 → overlay2 복귀. 임시 대안: 앱은 `process_cpu_usage`(Micrometer), Redis는 exporter CPU 카운터로 부분 관측. **MySQL CPU는 이 경로로 관측 불가**(사각지대) |
| 4 | `lower-case-table-names=1`이 안 먹음 | Token 테이블 대소문자 불일치 재발(BTL-008) | 이 플래그는 **데이터 디렉터리 최초 초기화 시점에만** 적용 — 기존 볼륨에 나중에 붙이면 무효. 볼륨 재생성 필요 |
| 5 | JWT_KEY를 짧게 넣음 | 로그인/회원가입 500 | HS512는 최소 64바이트 키 필요 |
| 6 | OAuth2/NEIS/S3 env 누락 | 부팅 자체 실패(PlaceholderResolutionException) | 기본값 없는 `${VAR}` 프로퍼티 — 부하 경로에서 실제로 안 쓰니 더미로 충분(compose에 기본 더미 내장) |
| 7 | data.sql 통째로 실행 | 내장된 10만 건 더미 게시글까지 들어감 | 게시판 5행만 옮겨 심는다(성능 데이터는 seed.js가 원칙) |
| 8 | k6 실행이 UNKNOWN으로 실패 | 같은 날 아침엔 되던 명령이 갑자기 안 됨 | Chocolatey shim(.NET)을 Application Control이 차단 — k6 자체는 멀쩡. `K6_BIN`으로 실제 바이너리 지정 |
| 9 | 지표가 조용히 비어 있음 | 대시보드 패널 "No data" | 지표 **생성** 설정은 base properties에 있어야 함: `tomcat.mbeanregistry.enabled=true` 없으면 `tomcat_threads_*` 자체가 안 생기고(BTL-002 관측 불가), percentiles-histogram 없으면 `_bucket`이 없어 서버 관점 p95 계산 불가. 버킷 범위를 5ms~10s로 좁힌 이유는 카디널리티(시리즈당 51버킷, uri×method×status마다 곱해짐) |
| 10 | WSL2 메모리 | Docker Desktop이 호스트 RAM의 50%만 사용 | `.wslconfig`에 memory 명시 + 실험 문서에 기록 |

## 5. 알려진 구조적 한계 (고치기 전까지 실험 문서에 명시할 것)

- **부하 발생기와 SUT가 같은 호스트** — 기록된 실행 전부. k6의 CPU 소비가 결과를 오염(원칙은 분리, E-01).
- **CPU 초과 배분** — app 2 + mysql 2 + redis 1 = 5 vCPU 한계 합이 호스트 코어 대비 과할 수 있고, 관측 계층은 무제한이라 경합 가능(E-02).
- **운영 토폴로지와 다름** — 운영은 EC2+RDS, 여긴 단일 호스트 컨테이너(E-03). 절대값이 아니라 상대 비교용 환경.
- **README의 하드웨어 명세가 플레이스홀더** — "(실측 기입)" 상태. 실험 전에 채워야 재현성 문서로 완성(E-35).
- **.env.perf에 유효한 512bit JWT 키가 커밋됨**(E-34) — 보안 위생 이슈, 로테이션 대상.
- host CPU/디스크를 보는 node_exporter 없음(E-09).

## 6. 이 환경을 설명할 때 쓰는 포인트 (면접 연결)

한 문단 버전:
"측정 환경을 compose로 고정했습니다 — 앱 2코어/2.5GB, MySQL 2코어에 buffer pool 1G, Redis 512MB에 eviction까지 실험 범위로. 힙은 1G 고정이고 GC 로그와 JFR을 상시 기록해 소급 분석이 가능합니다. 데이터셋은 5단계 프로파일로 MySQL 볼륨을 분리해 규모별 비교 왕복을 싸게 만들었고, 리셋·전환·시드 절차는 스크립트로 묶어 손실수를 차단했습니다. 내구성 설정은 운영과 동일하게 유지하고, 시드처럼 측정이 아닌 구간만 오버라이드로 완화한 뒤 자동 복귀시킵니다."

파고들면 꺼낼 카드 3장:
1. **"설정 파일이 조용히 무시되던 것"** — Windows 바인드 마운트 world-writable → mysqld가 무시 → CLI 플래그로 전환. "환경이 의도대로 떠 있는지 검증한다"는 태도의 증거.
2. **"프로파일 조합으로 푼 쿠키 401"** — prod 하드코딩 쿠키가 RFC 6265 때문에 로컬 부하에서 재전송 안 됨 → perf 프로파일이 덮어씀. 스펙을 안 지키는 자체 쿠키 저장소는 우연히 동작했다는 대조까지.
3. **"시드와 측정의 조건 분리"** — Hikari 10을 시드 때만 50으로 올리고 되돌리는 이유("10은 가설이지 결함이 아니다 — 영구히 올리면 발견이 지워진다"). 통제 변수 개념의 실물.

## 7. 스스로 점검 (이 문서를 덮고 답해보기)

1. 스택 기동 명령과, 기동 직후 확인 3가지는? (§3)
2. 프로파일을 large→small로 바꾸는 정확한 절차는? bootstrap 없이 하면 뭐가 깨지나? (§3)
3. 왜 MySQL 설정이 cnf 마운트가 아니라 CLI 플래그인가? (§2 결정 2)
4. 왜 prod,perf 두 프로파일인가? 하나만 쓰면 각각 무슨 일이 나나? (§2 결정 4)
5. 컨테이너 메모리 2560m의 근거 수치 3개는? (anon 1518MB / 강제 회수 992회 / 43·71건 포화 100%)
6. 시드 오버라이드가 바꾸는 것 5개와 "되돌림이 기본값"인 이유는? (§2 결정 7+)
7. 컨테이너 CPU 패널이 No data면 원인과 1순위 해법은? (§4-3)
8. 실험 간 리셋(cold)과 완전 초기화의 명령 차이는? (§3)
