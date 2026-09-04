# 성능 테스트 환경 필수 안내서

이 문서는 `performance/environment/`를 처음 보는 사람이 다음 세 가지를 할 수 있도록 만든다.

1. 어떤 프로세스가 어디에서 실행되는지 설명한다.
2. 스택을 안전하게 시작하고 데이터셋을 전환한다.
3. 결과가 이상할 때 환경 문제인지 애플리케이션 문제인지 구분한다.

원본 설정의 세부 항목은 `performance/environment/README.md`에 있다. 이 문서는 구성값을
나열하기보다 **왜 필요한지와 잘못됐을 때 어떤 증상이 생기는지**를 중심으로 설명한다.

## 먼저 알아야 할 결론

- 이 환경은 운영 환경을 그대로 복제한 것이 아니라, 같은 조건을 반복하기 위한 로컬 실험실이다.
- 애플리케이션·MySQL·Redis·관측 도구·k6가 같은 컴퓨터를 사용하므로 절대 성능보다는 같은
  환경에서의 상대 비교에 적합하다.
- Docker Compose 파일에 적힌 설정과 실제 컨테이너에 적용된 설정이 다를 수 있다. 실행 후
  반드시 실제 값을 확인해야 한다.
- 데이터셋 전환, Redis 초기화, 시딩은 서로 연결돼 있다. 일부 단계만 실행하면 결과가 섞인다.
- cAdvisor가 실행 중이라고 해서 컨테이너 CPU 지표가 실제로 수집된다는 뜻은 아니다.

## 1. 전체 구조

```text
호스트 Windows PC
│
├─ k6 부하 발생기
│       │ HTTP / WebSocket
│       ▼
├─ perf-app ─────► perf-mysql
│       │
│       └────────► perf-redis
│
├─ perf-mysqld-exporter ─┐
├─ perf-redis-exporter ───┼─► perf-prometheus ─► perf-grafana
├─ perf-cadvisor ─────────┤
└─ perf-app Actuator ─────┘
```

중요한 점은 **k6도 같은 호스트의 CPU를 사용한다**는 것이다. k6가 많은 요청을 만들수록
애플리케이션에 줄 CPU가 줄어들 수 있다. 이 문제는 E-01에서 별도로 추적한다.

## 2. 실행되는 컨테이너

`performance/environment/docker-compose.perf.yml`은 다음 8개 컨테이너를 실행한다.

| 컨테이너 | 역할 | 제한 | 호스트 접근 |
|---|---|---|---|
| `perf-app` | 실제 측정 대상 Spring 애플리케이션 | 2 CPU, 2560MB | `localhost:18080` |
| `perf-mysql` | 애플리케이션 데이터베이스 | 2 CPU, 2GB | `localhost:13316` |
| `perf-redis` | 캐시·카운터 저장소 | 1 CPU, 512MB | `localhost:16389` |
| `perf-prometheus` | 시계열 지표 저장 | 제한 없음 | `localhost:9090` |
| `perf-grafana` | 지표 대시보드 | 제한 없음 | `localhost:3001` |
| `perf-mysqld-exporter` | MySQL 상태를 Prometheus 형식으로 변환 | 제한 없음 | 내부 네트워크 |
| `perf-redis-exporter` | Redis 상태를 Prometheus 형식으로 변환 | 제한 없음 | 내부 네트워크 |
| `perf-cadvisor` | 컨테이너 CPU·메모리 지표 제공 | 제한 없음 | 내부 네트워크 |

포트를 8080·3306·6379 대신 다른 값으로 연 이유는 로컬 개발 서버와 충돌하지 않게 하기
위해서다. 실제 값은 `performance/environment/.env.perf`에서 바꿀 수 있다.

관측 도구에 자원 제한이 없다는 점도 기억해야 한다. Prometheus나 Grafana가 CPU를 많이 쓰면
측정 대상과 경합하지만, 현재 리포트는 그 비용을 충분히 보여주지 않는다.

## 3. 핵심 설계 결정

### 3-1. 애플리케이션 CPU와 메모리를 고정함

성능 수치는 사용할 수 있는 자원에 따라 달라진다. 그래서 애플리케이션을 2 CPU와 2560MB로
제한한다. 한계가 있어야 CPU 포화도도 다음처럼 계산할 수 있다.

```text
CPU 포화도 = 실제 사용 CPU / 허용 CPU
```

예를 들어 2 CPU 한계에서 1.6 CPU를 사용하면 약 80%다.

컨테이너 메모리는 JVM 힙 1GB보다 크게 잡혀 있다. JVM은 힙 외에도 메타스페이스, 스레드
스택, 코드 캐시, 네이티브 버퍼, GC 자료구조를 사용한다. 과거 1536MB 설정에서는 실제
풋프린트가 한계에 붙어 71회 중 43회가 메모리 포화 100%로 기록됐다. 메모리 지표가 항상
100%면 병목을 구분하는 신호로 쓸 수 없어 2560MB로 늘렸다.

### 3-2. JVM 힙과 진단 자료를 고정함

`JAVA_TOOL_OPTIONS`의 핵심은 다음과 같다.

- `-Xms1g -Xmx1g`: 실행 중 힙 크기 변화가 결과에 섞이지 않게 함
- G1 GC와 동일한 pause 목표: 실행별 JVM 조건을 같게 유지
- GC 로그 회전 저장: GC가 지연에 관여했는지 사후 확인
- JFR 상시 기록: 느린 실행이 끝난 뒤 CPU·락·스레드 상태를 분석

JFR과 GC 로그는 “문제가 생기면 다음 실행에서 켠다”가 아니라, 문제가 발생한 실행의 원자료를
남기기 위해 처음부터 켠다.

### 3-3. MySQL 설정을 파일 마운트가 아니라 CLI 인자로 전달함

Windows Docker Desktop에서 바인드 마운트한 `perf.cnf`가 world-writable 권한으로 보이는
경우가 있다. MySQL은 이런 설정 파일을 경고만 남기고 무시할 수 있다. 컨테이너는 정상적으로
뜨지만 buffer pool은 기본 128MB, slow query log는 꺼진 채 실행될 수 있어 더 위험하다.

그래서 실제 적용값은 Compose의 `command:`에 CLI 옵션으로 넣는다.

- buffer pool 1GB
- 최대 연결 200개
- slow query 기준 100ms
- performance schema 활성화
- utf8mb4와 KST
- `lower-case-table-names=1`
- 내구성 설정 `innodb_flush_log_at_trx_commit=1`, `sync_binlog=1`

`performance/environment/mysql/perf.cnf`는 현재 동작을 결정하는 파일이 아니라 참고용이다.

### 3-4. 데이터셋마다 MySQL 볼륨을 분리함

large 데이터셋은 API를 통해 시딩하므로 오래 걸린다. 하나의 볼륨만 쓰면 small과 large를
오갈 때마다 전체 데이터를 다시 만들어야 한다.

```text
perf-mysql-data-smoke
perf-mysql-data-small
perf-mysql-data-medium
perf-mysql-data-large
perf-mysql-data-xlarge
```

이렇게 분리하면 프로파일당 한 번만 시딩하고 컨테이너를 재생성해 전환할 수 있다.

단, Redis는 데이터셋별 볼륨으로 분리되지 않는다. 이전 프로파일의 캐시와 카운터가 남을 수
있으므로 프로파일을 바꿀 때 `FLUSHALL`이 필요하다. `bootstrap.js`가 이를 수행한다.

### 3-5. Spring 프로파일은 `prod,perf`를 함께 사용함

두 프로파일은 서로 다른 문제를 해결한다.

| 프로파일 | 필요한 이유 | 없으면 생기는 일 |
|---|---|---|
| `prod` | 개발용 `AppStartupRunner`를 비활성화 | 빈 DB에서 초기 데이터 생성 중 실패하고 컨테이너가 반복 재시작 |
| `perf` | 로컬 HTTP에서 사용할 수 있도록 쿠키 속성을 덮어씀 | 로그인은 200이지만 Secure·Domain 쿠키가 재전송되지 않아 이후 요청이 401 |

`prod` 하나만 사용하면 운영용 `Domain=.highteenday.org; Secure` 쿠키가 만들어진다. k6는
localhost 평문 HTTP에서 이 쿠키를 다시 보내지 않는다. `perf`가 이 속성을 로컬 테스트용으로
바꾼다.

### 3-6. 시딩과 측정의 자원 조건을 분리함

`performance/environment/docker-compose.seed.yml`은 시딩할 때만 붙이는 오버라이드다.

| 항목 | 측정 조건 | 시딩 조건 | 이유 |
|---|---:|---:|---|
| 애플리케이션 CPU | 2 | 6 | BCrypt 계정 생성 시간을 단축 |
| JVM 힙 | 1GB | 2GB | 대량 데이터 생성 안정화 |
| Hikari 최대 연결 | 10 | 50 | 시딩 속도 향상 |
| JFR·GC 로그 | 사용 | 사용 안 함 | 시딩은 측정 대상이 아님 |
| MySQL fsync | 운영과 같은 강한 설정 | 완화 | 대량 적재 시간 단축 |

측정할 때 Hikari를 10으로 유지하는 이유는 10이 옳아서가 아니다. 연결 풀 부족이 실제 병목
가설이기 때문에 임의로 50으로 올리면 관찰하려던 현상이 사라진다.

Compose의 `command:`는 합쳐지지 않고 통째로 교체된다. 시드 오버라이드에서 MySQL 옵션을
하나라도 빠뜨리면 문자셋·시간대·테이블명 규칙까지 사라질 수 있다.

### 3-7. Redis 디스크 저장을 끄고 eviction을 실험 범위에 포함함

Redis 설정은 다음 목적을 가진다.

- maxmemory 384MB
- allkeys-lru
- RDB와 AOF 비활성화
- slowlog 1ms
- 만료 이벤트 노출

디스크 저장을 끄는 이유는 RDB fork가 지연 스파이크를 만들지 않게 하기 위해서다. 단,
Redis 장애 복구나 failover 자체를 실험할 때는 운영과 같은 영속성 설정으로 별도 검증해야 한다.

## 4. 안전한 실행 절차

첫 명령은 저장소 루트에서 실행한다. `Set-Location performance` 이후의 모든 명령은
`performance/` 디렉터리를 현재 위치로 사용하는 PowerShell 기준이다.

### 4-1. 최초 설정과 기동

```powershell
Set-Location performance
Copy-Item environment/.env.perf.example environment/.env.perf

docker compose `
  -f environment/docker-compose.perf.yml `
  --env-file environment/.env.perf `
  up -d --build
```

### 4-2. 기동 직후 확인

컨테이너가 단순히 `Up` 상태인지만 보지 말고 다음을 확인한다.

```powershell
# 애플리케이션 생존 여부
Invoke-RestMethod http://localhost:18080/actuator/health

# 애플리케이션 지표 생성 여부
(Invoke-WebRequest http://localhost:18080/actuator/prometheus).Content.Substring(0, 500)

# 반복 재시작 여부와 전체 컨테이너 상태
docker ps

# 실제 자원 한계
docker inspect perf-app --format '{{.HostConfig.NanoCpus}} {{.HostConfig.Memory}}'
docker stats --no-stream
```

브라우저에서 Prometheus의 `http://localhost:9090/targets`를 열고 모든 타깃이 UP인지 확인한다.
Grafana는 `http://localhost:3001`에서 확인한다.

### 4-3. 데이터셋 프로파일 전환

예를 들어 large에서 small로 바꿀 때:

1. `performance/environment/.env.perf`의 `DATASET_PROFILE=small`로 수정한다.
2. 기본 Compose로 컨테이너를 재생성한다.
3. bootstrap에 같은 프로파일을 전달한다.
4. 실제 마운트된 MySQL 볼륨과 Redis 초기화 결과를 확인한다.

```powershell
docker compose `
  -f environment/docker-compose.perf.yml `
  --env-file environment/.env.perf `
  up -d

node environment/bootstrap.js --profile small
```

`bootstrap.js` 없이 전환하면 이전 Redis 캐시가 남고, 다른 데이터셋 볼륨에 데이터를 넣는
실수도 감지하지 못한다.

### 4-4. 새 프로파일 시딩

```powershell
docker compose `
  -f environment/docker-compose.perf.yml `
  -f environment/docker-compose.seed.yml `
  --env-file environment/.env.perf `
  up -d

node environment/bootstrap.js --profile small
```

시딩이 끝나면 반드시 시드 오버라이드를 빼고 기본 Compose로 다시 기동한다.

```powershell
docker compose `
  -f environment/docker-compose.perf.yml `
  --env-file environment/.env.perf `
  up -d
```

복귀 확인:

```sql
SELECT @@innodb_flush_log_at_trx_commit, @@sync_binlog;
```

기대값은 `1, 1`이다. Hikari 최대 연결 수의 기대값은 10이다.

### 4-5. 실행 사이 cold 상태 만들기

데이터는 유지하고 애플리케이션 프로세스와 Redis 상태만 초기화한다.

```powershell
docker restart perf-app
docker exec perf-redis redis-cli FLUSHALL
```

이 절차는 “완전한 cold start”를 보장하지 않는다. MySQL buffer pool, 호스트 파일 캐시,
Docker Desktop 상태는 남을 수 있다. 실험 문서에 어떤 상태를 초기화했는지 정확히 기록한다.

### 4-6. 성능 시나리오 실행

```powershell
node tools/perf-run.js scenarios/normal-day.js
```

Windows에서 Chocolatey shim이 차단되면 실제 k6 실행 파일을 지정한다.

```powershell
$env:K6_BIN = 'C:\path\to\k6.exe'
node tools/perf-run.js scenarios/normal-day.js
```

### 4-7. 완전 초기화

> **주의:** 다음 명령은 현재 Compose 프로젝트의 볼륨을 삭제한다. 해당 데이터셋을 다시
> 사용하려면 전체 시딩이 필요하다. 대상 Compose 파일과 현재 프로파일을 먼저 확인한다.

```powershell
docker compose `
  -f environment/docker-compose.perf.yml `
  --env-file environment/.env.perf `
  down -v
```

## 5. bootstrap.js가 하는 일

`bootstrap.js`는 단순한 시더 실행기가 아니다. 잘못된 환경에서 측정하는 것을 막는 보호 장치다.

1. **프로파일과 실제 MySQL 볼륨 확인**
   `--profile small`인데 large 볼륨이 연결돼 있으면 중단한다.

2. **필수 게시판 5개 생성**
   게시판이 없으면 시더가 빈 목록을 받고도 대량 데이터 생성을 제대로 진행하지 못할 수 있다.

3. **`daily_hot_post` 테이블 생성**
   현재 Flyway baseline에 없는 테이블을 보완한다. 없으면 일간 인기글 API가 500을 반환한다.

4. **Redis 초기화**
   이전 데이터셋의 캐시·카운터가 현재 실행에 섞이지 않게 한다.

5. **중복 시딩 차단**
   시더를 다시 실행하면 기존 계정은 건너뛰지만 게시글과 댓글은 추가로 생성될 수 있다.
   실측에서 small 게시글 500개가 1,065개로 늘어난 적이 있다. 명시적인 `--force` 없이 재실행을
   막는 이유다.

## 6. 증상별 문제 해결

| 증상 | 먼저 의심할 원인 | 확인 또는 해결 |
|---|---|---|
| 컨테이너가 계속 재시작 | `prod` 프로파일 누락, 필수 환경변수 누락 | `docker ps`, 앱 로그, active profile 확인 |
| 로그인은 200인데 다음 요청이 401 | `perf` 프로파일 누락으로 운영 쿠키 발급 | `prod,perf` 조합 확인 |
| 로그인·회원가입이 500 | HS512 키가 64바이트보다 짧음 | `JWT_KEY` 길이 확인 |
| Grafana CPU 패널이 No data | cAdvisor가 컨테이너 시리즈 생성 실패 | Prometheus에서 컨테이너 쿼리 직접 확인 |
| cAdvisor 타깃은 UP인데 데이터 없음 | Docker Desktop containerd 이미지 저장 방식과 비호환 | 가능하면 containerd 이미지 저장 옵션을 끄고 overlay2로 재검증 |
| MySQL 설정이 기본값 | cnf가 무시됐거나 기존 볼륨에 초기화 전용 옵션을 뒤늦게 적용 | `SHOW VARIABLES`, Compose `command:` 확인 |
| `Token` 테이블 대소문자 오류 | `lower-case-table-names=1`이 기존 볼륨에 적용되지 않음 | 새 볼륨으로 재생성 후 검증 |
| 프로파일을 바꿨는데 결과가 이상함 | Redis 잔존 데이터 또는 잘못된 MySQL 볼륨 | bootstrap 실행과 실제 mount 확인 |
| 시딩 수량이 명세보다 많음 | 중복 시딩 | 현재 수량 확인 후 새 볼륨 또는 명시적 재시딩 |
| k6가 UNKNOWN 오류로 시작 실패 | Chocolatey shim 차단 | `K6_BIN`에 실제 실행 파일 지정 |

## 7. 현재 구조적 한계

이 항목들은 명령을 올바르게 실행해도 남는다.

- **같은 호스트 경합:** k6와 SUT가 같은 CPU를 사용한다. (E-01)
- **CPU 초과 배분 가능성:** 앱·MySQL·Redis 한계 합계가 5 CPU이고 관측 도구는 무제한이다. (E-02)
- **운영과 다른 토폴로지:** 운영은 EC2와 RDS, 테스트는 단일 호스트 Docker다. (E-03)
- **호스트 지표 부재:** node_exporter가 없어 호스트 CPU·디스크 오염을 볼 수 없다. (E-09)
- **cAdvisor 환경 의존성:** Windows Docker Desktop에서는 컨테이너 지표가 모두 빠질 수 있다. (E-10)
- **하드웨어 명세 미완성:** CPU·메모리·디스크·Docker Desktop 설정이 실행 기록에 충분히 남지 않는다. (E-35)
- **공유 Prometheus:** 데이터셋별 라벨이 부족하면 다른 실행의 시계열이 섞일 수 있다. (E-12)

따라서 이 환경의 결과를 보고할 때는 “운영에서 몇 TPS를 버틴다”보다 “이 고정된 로컬 조건에서
변경 전후가 어떻게 달라졌다”라고 표현하는 편이 정확하다.

## 8. 실행 전 체크리스트

- [ ] 작업 트리가 깨끗하고 실행 기록에 사용할 커밋이 확정돼 있다.
- [ ] `.env.perf`의 데이터셋과 실제 MySQL 볼륨이 일치한다.
- [ ] 애플리케이션 프로파일이 `prod,perf`다.
- [ ] 애플리케이션 health와 Prometheus Actuator가 응답한다.
- [ ] Prometheus 타깃별 UP 상태를 확인했다.
- [ ] cAdvisor가 실제 컨테이너별 시계열을 만드는지 확인했다.
- [ ] 시드 오버라이드가 제거되고 Hikari·MySQL 내구성 설정이 측정값으로 복귀했다.
- [ ] Redis 초기화 여부와 cold/warm 조건을 실험 문서에 기록했다.
- [ ] 호스트에서 다른 CPU·디스크 집약 작업을 중단했다.
- [ ] 실행 후 기능별 지표와 결측 지표를 함께 확인한다.

## 9. 스스로 설명해 보기

다음 질문에 코드를 보지 않고 답할 수 있으면 환경의 핵심을 이해한 것이다.

1. 왜 애플리케이션은 2 CPU이고 JVM 힙은 1GB인데 컨테이너 메모리는 2560MB인가?
2. 왜 MySQL 설정 파일을 마운트하지 않고 CLI 옵션을 사용하는가?
3. 왜 `prod`와 `perf` 프로파일이 모두 필요한가?
4. 왜 MySQL 볼륨은 데이터셋마다 분리하지만 Redis는 전환할 때 비워야 하는가?
5. 시딩할 때 Hikari를 50으로 올리고 측정할 때 10으로 되돌리는 이유는 무엇인가?
6. Prometheus 타깃이 UP이어도 CPU 지표가 없을 수 있는 이유는 무엇인가?
7. cold reset과 `down -v`는 무엇을 각각 삭제하는가?
8. 이 환경의 결과를 운영 용량으로 바로 해석할 수 없는 이유는 무엇인가?
