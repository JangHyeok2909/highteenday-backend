# 성능 개선 측정 시스템 초심자 완전 가이드

- 대상: HighTeenDay 성능 측정 시스템을 처음 사용하는 개발자
- 기준일: 2026-08-21
- 범위: 학습 순서, 로컬 환경 구축, 부하 실행, 개선 전후 비교, 리포트 판독, 병목 조사, 전문용어

이 문서는 `performance/` 폴더를 처음 본 사람이 **성능 개선을 실제로 측정하고, 결과를
과장하지 않고 설명할 수 있게 되는 것**을 목표로 한다. 명령어 목록만 제공하지 않는다.
각 단계에서 왜 그 일을 하는지, 무엇을 확인해야 다음 단계로 넘어갈 수 있는지, 리포트의
숫자가 무엇을 뜻하고 무엇을 뜻하지 않는지까지 설명한다.

이 문서에서 가장 중요한 원칙은 다음 한 문장이다.

> **리포트의 PASS/FAIL부터 보지 말고, 먼저 “같은 조건으로 제대로 측정했는가”와
> “용량 한계 아래에서 측정했는가”를 확인한다.**

---

## 1. 가장 먼저 알아야 할 결론

성능 개선을 입증하려면 아래 네 가지가 모두 필요하다.

1. **같은 일을 시켜야 한다.** 같은 시나리오, 같은 도착률, 같은 데이터셋, 같은 캐시 상태를
   사용해야 한다.
2. **같은 환경에서 재야 한다.** 앱·MySQL·Redis의 자원 한계, 부하 발생기 위치, 측정 구간이
   같아야 한다.
3. **여러 번 재야 한다.** 한 번의 빠른 결과는 개선이 아니라 우연일 수 있다.
4. **속도와 안전성을 함께 봐야 한다.** 응답 시간이 줄어도 오류가 늘거나 처리량이 줄거나
   데이터 정합성이 깨졌다면 성능 개선으로 인정하면 안 된다.

이 시스템은 위 조건을 돕기 위해 다음 세 가지 상태를 서로 분리해 기록한다.

| 축 | 질문 | 값 | 초심자가 해야 할 일 |
|---|---|---|---|
| 성능 판정 | 기준이나 과거보다 나쁜가? | `PASS` / `WARN` / `FAIL` | 마지막에 읽는다 |
| 측정 상태 | 판정할 데이터가 실제로 있었는가? | `MEASURED` / `PARTIAL` / `UNMEASURED` | 가장 먼저 읽는다 |
| 부하 체제 | 용량 한계 아래에서 잰 값인가? | `HEADROOM` / `NEAR_LIMIT` / `SATURATED` / `UNKNOWN` | 두 번째로 읽는다 |

세 축은 독립적이다. 예를 들어 `MEASURED + FAIL + HEADROOM`은 “정상적으로 쟀고 실제 성능이
기준에 못 미친다”는 뜻이다. `MEASURED + FAIL + SATURATED`는 숫자는 수집됐지만 응답 시간의
상당 부분이 처리 시간이 아니라 **대기열에서 기다린 시간**이라는 뜻이다. `PASS + UNMEASURED`는
통과가 아니다. 채점할 데이터가 없으므로 결과를 사용할 수 없다.

현재 개별 `report.html`은 `measurementStatus`와 회귀 판정을 잘 보여 주지만, `saturation`
상태를 항상 눈에 띄는 배지로 보여 주지는 않는다. 포화 상태는 다음 두 곳에서 반드시 추가로
확인한다.

- `reports/runs/<runId>/run.json`의 `saturation.status`
- `reports/history.html`에서 조건 계열의 **상세 보기**를 연 뒤 `체제` 섹션

---

## 2. 무엇부터 이해해야 하는가 — 권장 학습 순서

처음부터 도구 코드를 읽으면 파일은 많이 봤는데 무엇을 위한 코드인지 모르는 상태가 된다.
아래 순서를 지키는 편이 빠르다.

| 순서 | 먼저 답할 질문 | 읽을 자료 | 이 단계를 이해했다는 기준 |
|---:|---|---|---|
| 1 | HighTeenDay 요청 하나는 어디를 거치는가? | [서비스 개요](../../../docs/01-overview.md), [요청 흐름](../../../docs/04-request-flow.md) | 브라우저 요청이 Tomcat → Service → MySQL/Redis로 가는 흐름을 말할 수 있다 |
| 2 | 성능 측정은 무엇을 재는 일인가? | 이 문서 §3~5, [측정 원리 상세](perf-measurement-explained.md) | 지연·처리량·오류·포화의 차이를 설명할 수 있다 |
| 3 | 어떤 고정 환경에서 재는가? | 이 문서 §6, [환경 명세](../../environment/README.md) | 앱·DB·Redis·관측 컨테이너의 역할과 포트를 안다 |
| 4 | 같은 데이터라는 것을 어떻게 보장하는가? | 이 문서 §7, [데이터셋 상세](../../datasets/README.md), [상태 지문 설계](../../DATASET-STATE.md) | 프로파일·시드·스냅샷·지문·guard를 구분한다 |
| 5 | 가짜 사용자는 무엇을 하는가? | 이 문서 §8, [시나리오 목록](../../scenarios/README.md) | VU·iteration·think time·open/closed model을 구분한다 |
| 6 | 실행 한 번은 내부적으로 무엇을 하는가? | 이 문서 §9, [운영 매뉴얼](../../MANUAL.md) | `perf-run.js`가 실행·수집·판정·보고를 묶는 이유를 안다 |
| 7 | 결과를 어떤 순서로 읽는가? | 이 문서 §12~16 | 리포트 배지보다 측정 상태와 체제를 먼저 본다 |
| 8 | 개선을 어떻게 증명하는가? | 이 문서 §10~11, [실험 템플릿](../../experiments/TEMPLATE.md) | 가설·주 지표·보호 지표·반복 횟수를 사전에 적을 수 있다 |
| 9 | 병목 원인을 어디까지 좁힐 수 있는가? | 이 문서 §17, [병목 카탈로그](../../bottlenecks/README.md) | 단일 지표가 아니라 함께 움직인 지표로 가설을 세운다 |

첫날에는 1~7단계까지만 하면 충분하다. 첫 측정에 성공한 뒤 8~9단계로 넘어간다.

---

## 3. 성능 개선이란 정확히 무엇인가

“빨라졌다”는 말만으로는 부족하다. 성능은 적어도 네 축으로 나뉜다.

| 축 | 쉬운 뜻 | 대표 지표 | 개선 예 |
|---|---|---|---|
| 지연 시간(latency) | 요청 하나가 끝날 때까지 걸린 시간 | p50, p95, p99 | 게시글 조회 p95 400ms → 250ms |
| 처리량(throughput) | 일정 시간에 끝낸 일의 양 | RPS, TPS | 같은 지연에서 20 RPS → 30 RPS |
| 안정성(reliability) | 요청을 틀리지 않고 끝내는 정도 | 오류율, check 성공률, timeout | 오류율 0.8% → 0.1% |
| 효율(efficiency) | 일 하나를 처리할 때 쓴 자원 | 요청당 CPU, 요청당 쿼리 수 | 요청당 쿼리 40개 → 5개 |

한 축만 좋아지고 다른 축이 나빠질 수 있다. 캐시를 과도하게 쓰면 응답 시간은 줄지만 메모리와
데이터 불일치 위험이 늘 수 있다. 커넥션 풀을 크게 하면 순간 대기는 줄지만 MySQL이 감당할 수
있는 연결 수를 넘어 전체가 더 느려질 수 있다. 따라서 개선 실험에는 반드시 다음 두 종류의
지표가 있어야 한다.

- **주 지표(primary metric)**: 이번 개선이 좋아지게 만들려는 값. 예: 게시글 목록 p95.
- **보호 지표(guardrail metric)**: 주 지표를 좋게 만드는 동안 망가지면 안 되는 값. 예:
  오류율, check 성공률, RPS, DB 락 대기, 메모리 사용량.

### 3.1 병목과 포화는 다르다

**병목(bottleneck)**은 전체 처리 능력을 가장 강하게 제한하는 구성 요소다. **포화
(saturation)**는 어떤 자원의 수요가 공급 한계에 가까워져 대기열이 생기는 상태다. 병목이
CPU일 수 있고, DB 커넥션 풀일 수 있고, 행 잠금일 수도 있다.

포화 상태의 응답 시간은 코드 실행 시간만 뜻하지 않는다.

```text
사용자가 느낀 응답 시간 = 대기열에서 기다린 시간 + 실제 처리 시간 + 전송 시간
```

그래서 용량을 넘긴 상태에서 p95가 10초라고 해서 “이 메서드가 10초 걸린다”고 말하면 안 된다.
실제 처리는 200ms이고 앞선 요청이 끝나기를 9.8초 기다렸을 수도 있다.

### 3.2 평균보다 p95와 p99를 보는 이유

요청 100개 중 99개가 10ms이고 1개가 10초라면 평균은 약 110ms다. 평균만 보면 꽤 빨라
보이지만 실제 사용자는 반복해서 서비스를 쓰므로 느린 1%를 자주 겪는다.

- **p50**: 중앙값. 전형적인 요청이 얼마나 걸렸는지 보여 준다.
- **p95**: 요청의 95%가 이 시간 안에 끝났다는 뜻이다. 일반 사용자 경험의 주 판정값이다.
- **p99**: 요청의 99%가 이 시간 안에 끝났다는 뜻이다. 드문 긴 지연, 즉 꼬리 지연을 본다.
- **max**: 단 한 번의 최악값이다. 순간 장애에 매우 민감하므로 p99와 시계열을 함께 본다.

`p50=10ms`, `p95=300ms`, `p99=2s`라면 대부분은 빠르지만 일부 요청이 매우 느린 **두꺼운
꼬리(tail)**가 있다는 뜻이다. 평균 하나로는 이 모양이 보이지 않는다.

### 3.3 같은 p95라도 표본이 다를 수 있다

HTTP p95는 **요청들을 줄 세운 95분위**다. `cpu.cores.p95`는 Prometheus가 5초마다 읽은
**시간 표본을 줄 세운 95분위**다. 이름은 같지만 하나는 요청 분포이고 다른 하나는 시간
분포다. 두 값을 같은 의미로 해석하면 안 된다.

또한 클라이언트 p95에서 서버 p95를 빼서 “네트워크 p95”를 만들면 안 된다. 서로 다른 요청
집합을 독립적으로 줄 세운 두 분위수는 뺄셈이 성립하지 않는다. 네트워크·경로 문제는 k6의
`blocked`, `connecting`, `waiting`, `receiving`과 서버 시계열을 같은 시간대에 겹쳐 판단한다.

---

## 4. 이 측정 시스템의 전체 구조

한 번의 표준 실행은 다음 순서로 움직인다.

```text
사용자 명령
  node tools/perf-run.js <시나리오>
        │
        ├─ 1. 데이터셋 상태 확인 및 필요 시 스냅샷 복원
        ├─ 2. 실행 전 CPU 대조 벤치
        ├─ 3. Windows 호스트 프로브 시작
        ├─ 4. k6가 가상 사용자 부하 발생
        │      └─ k6 지표를 Prometheus에 remote-write
        ├─ 5. 실행 후 DB 상태와 호스트 표본 저장
        ├─ 6. collect.js가 같은 measure 구간의 서버 지표 수집
        ├─ 7. 비교 가능한 기준선 자동 선택
        ├─ 8. 회귀·측정 상태·포화 체제 판정
        └─ 9. run.json, report.html, history용 인덱스 생성
```

### 4.1 밖에서 보는 눈과 안에서 보는 눈

| 관측자 | 보는 위치 | 아는 것 | 모르는 것 |
|---|---|---|---|
| k6 | 사용자처럼 서버 밖 | 전체 응답 시간, 오류, 실제 받은 내용, 전송 단계 | 서버 안에서 CPU·DB·락 중 무엇이 느렸는지 |
| Spring Actuator + Micrometer | 애플리케이션 내부 | JVM, GC, Tomcat, HikariCP, 서버 HTTP 지연 | Windows 전체와 다른 컨테이너 상태 |
| mysqld-exporter | MySQL 내부 | 쿼리 수, slow query, 락, 버퍼풀 | 어떤 Java 메서드가 쿼리를 만들었는지 |
| redis-exporter | Redis 내부 | 명령 수, 적중률, eviction, 메모리 | 어느 API가 키를 사용했는지 |
| cAdvisor | 컨테이너 밖의 Linux 커널 | 컨테이너별 CPU·메모리·네트워크·디스크·제한 | Windows에서 직접 실행한 프로세스 |
| node-exporter | WSL2 가상 머신 전체 | VM CPU, run queue, iowait, 메모리 | VM 바깥 Windows 프로세스 |
| hostprobe | Windows | Windows 전체 CPU, 실행 대기, 가용 메모리, 코어별 표본 | 애플리케이션 메서드 수준 원인 |

이 관점들을 같은 시간 구간으로 맞춰야 “사용자가 느린 순간에 DB 락도 함께 늘었는가”를 볼 수
있다. 한쪽 시간대를 잘못 자르면 서로 관계없는 두 사건을 원인과 결과로 착각한다.

### 4.2 주요 도구를 쉬운 말로

- **k6**: JavaScript로 적은 사용자 행동을 여러 가상 사용자가 반복하게 하는 부하 발생기다.
- **Prometheus**: 지표를 시간순으로 저장하는 시계열 데이터베이스다. 이 프로젝트는 대부분의
  대상을 5초마다 읽는다.
- **Grafana**: Prometheus의 시계열을 그래프로 보여 주는 화면이다.
- **exporter**: MySQL·Redis처럼 Prometheus 형식을 직접 제공하지 않는 프로그램의 값을
  Prometheus 형식으로 번역한다.
- **Spring Actuator**: 실행 중인 Spring 애플리케이션의 건강 상태와 내부 지표를 HTTP로
  노출한다.
- **Micrometer**: Spring/JVM 지표를 Prometheus 같은 관측 시스템 형식으로 연결하는 계측
  라이브러리다.
- **Docker 컨테이너**: 애플리케이션과 의존성을 격리된 실행 환경에 넣어 버전과 자원 한계를
  고정하는 단위다.
- **WSL2**: Windows 안에서 Linux 가상 머신을 실행하는 계층이다. Docker Desktop의 Linux
  컨테이너는 이 안에서 돈다.

---

## 5. 부하 모델을 이해해야 숫자를 이해할 수 있다

### 5.1 VU, iteration, RPS, TPS

- **VU(Virtual User)**는 가상 사용자 한 명이다.
- **iteration**은 사용자 한 명이 수행하는 행동 묶음 한 바퀴다. 한 iteration 안에서 로그인,
  목록 조회, 상세 조회, 댓글 같은 HTTP 요청이 여러 번 발생할 수 있다.
- **RPS(Requests Per Second)**는 초당 HTTP 요청 수다.
- **TPS(Transactions Per Second)**는 이 시스템에서 초당 완료된 iteration 수다.

따라서 `--rate 4`는 현재 `normal-day`에서 **초당 iteration 4개가 도착하도록 하는 값**이지
4 RPS가 아니다. 한 iteration이 평균 4개의 HTTP 요청을 만든다면 약 16 RPS가 된다.

### 5.2 closed model과 open model

**closed model**은 VU 수를 고정한다. 가상 사용자는 앞 요청의 응답을 받아야 다음 행동을 한다.
서버가 느려지면 가상 사용자도 기다리므로 새 요청이 줄어든다. 결과적으로 가장 나쁜 순간의
부하가 통계에서 사라지는 **coordinated omission(조율된 누락)**이 생긴다.

**open model**은 초당 도착률을 고정한다. 앞 요청이 끝나지 않아도 계획한 속도로 새 iteration을
만든다. 서버가 감당하지 못하면 부하가 조용히 줄어드는 대신 `dropped_iterations` 또는 낮은
도착률 달성도로 드러난다.

성능 개선 전후의 판정용 측정에는 가능한 한 open model을 사용한다. 현재 `--rate`를 읽어
closed/open을 전환하는 시나리오는 `scenarios/normal-day.js`다. `breakpoint.js`는 원래부터
arrival-rate 방식이다. 다른 단일 기능 스크립트에 `--rate`를 전달해도 그 스크립트가 `RATE`를
읽지 않으면 효과가 없다.

### 5.3 warmup, measure, rampdown

| 구간 | 뜻 | 왜 필요한가 | 판정 사용 여부 |
|---|---|---|---|
| `warmup` | 부하를 올리고 JVM·풀·캐시를 준비하는 구간 | Java JIT, 커넥션 풀, 캐시의 시작 직후 편차 제거 | 사용하지 않음 |
| `measure` | 같은 부하를 유지하며 실제로 재는 구간 | 개선 전후 판정 대상 | 사용함 |
| `rampdown` | 부하를 줄여 종료하는 구간 | 갑작스러운 종료를 피하고 회복 모양 확인 | 사용하지 않음 |

`--warmup`은 이미 끝난 실행의 앞부분을 사후에 잘라내는 옵션이 아니다. k6 실행 계획 자체를
바꾸고, 그 계획이 `phasePlan`에 저장되어 k6 threshold와 Prometheus 조회 창이 같은 구간을
사용하게 한다.

### 5.4 생각 시간과 사용자 여정

**think time**은 실제 사람이 화면을 읽고 다음 행동을 하기 전 쉬는 시간이다. 이 프로젝트는
기본적으로 1~4초를 사용한다. 생각 시간이 없으면 VU 한 명이 쉬지 않고 요청을 보내 실제 사용자
여러 명분의 부하를 만든다.

**journey(사용자 여정)**는 “목록 보기 → 상세 보기 → 댓글 보기 → 반응 남기기”처럼 실제
사용자의 연속 행동이다. **scenario(시나리오)**는 여러 여정을 어떤 비율과 부하 곡선으로
섞을지 정의한 실험이다. `normal-day`, `read-heavy`, `write-heavy`가 같은 API를 사용해도
여정 비율이 다르므로 서로 다른 실험이다.

---

## 6. 전용 환경을 이해하고 준비하기

모든 명령은 저장소 루트가 아니라 아래 디렉터리에서 실행한다.

```powershell
cd C:\Users\user\Desktop\projects\highteen\highteenday-backend\performance
```

스크립트가 상대 경로로 다른 파일을 참조하기 때문이다.

### 6.1 필요한 프로그램

| 프로그램 | 용도 | 확인 명령 | 참고 |
|---|---|---|---|
| Node.js 18 이상 | 시드·수집·판정·리포트 도구 실행 | `node -v` | 전역 `fetch`가 필요하다 |
| Docker Desktop | 앱·MySQL·Redis·관측 스택 실행 | `docker version` | WSL2 백엔드 사용 |
| Git Bash | `verify.sh`, 카오스 셸 스크립트 실행 | Git Bash 실행 확인 | PowerShell과 문법이 다르다 |
| k6 2.1.0 | 로컬 부하 발생 | `k6 version` | `--loadgen docker`만 쓰면 로컬 설치는 필수가 아니다 |

개선 증거를 만들 때는 `--loadgen docker`를 권장한다. 컨테이너로 실행해야 부하 발생기의
CPU·메모리·throttling까지 측정할 수 있다. 로컬 k6와 컨테이너 k6는 네트워크 경로가 다르므로
두 방식의 결과를 섞어 비교하면 안 된다.

### 6.2 환경 파일 만들기

PowerShell:

```powershell
Copy-Item environment/.env.perf.example environment/.env.perf
```

`environment/.env.perf`에서 다음을 확인한다.

- `DATASET_PROFILE`: 처음 연습할 때는 `small`, 표준 개선 실험은 보통 `medium`.
- `JWT_KEY`: 64바이트 이상의 무작위 키. 저장소에 커밋하지 않는다.
- `SPRING_PROFILE`: `prod,perf`를 유지한다.
- OAuth2·NEIS·S3 값: 현재 부하 경로에서는 더미 값이면 된다.

OpenSSL이 있으면 `openssl rand -base64 64`로 JWT 키를 만든다. PowerShell만 있다면 다음처럼
만들 수 있다.

```powershell
$jwtBytes = New-Object byte[] 64
$jwtRng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$jwtRng.GetBytes($jwtBytes)
[Convert]::ToBase64String($jwtBytes)
$jwtRng.Dispose()
```

출력된 문자열을 `.env.perf`의 `JWT_KEY=` 뒤에 붙인다. 실제 키를 문서나 터미널 출력 사본에
남기지 않는다.

### 6.3 스택의 구성과 포트

| 서비스 | 역할 | 로컬 주소 |
|---|---|---|
| `perf-app` | Spring Boot 애플리케이션 | `http://localhost:18080` |
| `perf-mysql` | MySQL 8.0.36 | `localhost:13316` |
| `perf-redis` | Redis 7.2 | `localhost:16389` |
| `perf-prometheus` | 시계열 저장·질의 | `http://localhost:9090` |
| `perf-grafana` | 실시간 대시보드 | `http://localhost:3001` |
| exporter·cAdvisor·node-exporter | 앱 밖 지표 수집 | 보통 직접 접속하지 않음 |

기동:

```powershell
docker compose -f environment/docker-compose.perf.yml --env-file environment/.env.perf up -d --build
```

확인:

```powershell
docker compose -f environment/docker-compose.perf.yml --env-file environment/.env.perf ps
Invoke-RestMethod http://localhost:18080/actuator/health
```

다음 조건을 모두 만족해야 데이터를 만든다.

- `docker compose ps`에서 핵심 컨테이너가 계속 재시작하지 않는다.
- health 응답이 `UP`이다.
- `http://localhost:9090/targets`에서 수집 대상이 `UP`이다.
- `http://localhost:3001`에 접속할 수 있다. 기본 계정은 `admin / perf`다.

health가 잠깐 `UP`이어도 컨테이너의 실행 시간이 계속 초기화되면 크래시 루프다. `docker ps`의
상태와 `docker logs --tail 200 perf-app`을 같이 본다.

---

## 7. 데이터셋을 이해하고 고정하기

성능은 데이터 양과 분포에 따라 달라진다. 게시글 500개에서 빠른 쿼리가 10만 개에서 느릴 수
있고, 인기글 하나에 요청이 몰리면 행 잠금과 캐시 적중률이 달라진다.

### 7.1 프로파일

| 프로파일 | 사용자 | 게시글 | 댓글 | 반응 | 주 용도 |
|---|---:|---:|---:|---:|---|
| `smoke` | 20 | 50 | 150 | 300 | 스크립트가 실행되는지만 확인 |
| `small` | 100 | 500 | 2,000 | 5,000 | 초심자 연습·빠른 디버깅 |
| `medium` | 1,000 | 10,000 | 40,000 | 100,000 | 표준 개선 실험 |
| `large` | 10,000 | 100,000 | 400,000 | 1,000,000 | 인덱스·깊은 페이징·대규모 병목 |
| `xlarge` | 100,000 | 500,000 | 2,000,000 | 5,000,000 | 장기 규모 가정, 매우 비싼 생성 |

`small`이 빠르다는 이유로 모든 실험에 쓰면 안 된다. 예를 들어 500페이지를 조회하는
`deep-paging`은 최소 5,010번째 글이 있어야 하므로 `medium` 이상이어야 한다. 캐시와 핫 로우
경합도 `medium` 이상에서 보는 편이 의미가 있다.

### 7.2 seed, snapshot, fingerprint, guard

- **seed(시드 데이터)**: 부하 테스트 전에 만들어 두는 사용자·게시글·댓글·반응 데이터다.
- **snapshot(스냅샷)**: 검증을 통과한 DB 상태의 복구용 사본이다.
- **fingerprint(지문)**: 데이터 생성 규칙과 현재 DB 상태를 짧은 해시로 요약한 값이다.
- **guard**: 실행 전에 현재 DB가 기대한 스냅샷과 같은지 검사하는 정책이다.

이름이 둘 다 `medium`이어도 앞선 쓰기 테스트가 글 1만 개를 추가했다면 같은 데이터셋이 아니다.
그래서 이 시스템은 “어떻게 만들었는가”를 나타내는 생성 지문과 “실행 직전에 실제 무엇이
들어 있는가”를 나타내는 상태 지문을 함께 쓴다.

guard 모드:

| 모드 | 동작 | 개선 증거에 사용해도 되는가 |
|---|---|---|
| `off` | 상태를 기록만 한다 | 쓰기 시나리오 비교에는 권장하지 않음 |
| `warn` | 다르면 경고하고 기준선 자격을 뺀다 | 탐색용 |
| `strict` | 다르면 스냅샷으로 복원하고, 복구 실패 시 실행 거부 | 표준 개선 실험에 권장 |

이 저장소의 기본값은 `perf.config.json`에서 `strict`다. 스냅샷이 없으면 보장할 상태가 없으므로
실행을 거부하는 것이 정상이다.

### 7.3 처음 한 번 준비하는 순서

아래 예시는 `.env.perf`의 `DATASET_PROFILE=small`과 명령의 `--profile small`이 일치한다고
가정한다.

```powershell
node environment/bootstrap.js --profile small
```

Git Bash 또는 `bash`가 잡힌 터미널:

```bash
bash datasets/verify.sh small
```

검증을 통과한 뒤:

```powershell
node tools/snapshot.js create small --note "초심자 최초 검증 상태"
node tools/snapshot.js verify small
```

이미 같은 프로파일의 올바른 스냅샷이 있다면 중복 생성하지 말고 먼저 목록과 검증 결과를 본다.

```powershell
node tools/snapshot.js list
node tools/snapshot.js verify small
```

`medium`으로 전환할 때는 `.env.perf`의 `DATASET_PROFILE`도 `medium`으로 바꾸고 스택을 다시
올린 뒤 `bootstrap → verify → snapshot`을 같은 순서로 수행한다. MySQL 볼륨은 프로파일별로
나뉘지만 Redis는 공유된다. 따라서 모든 Redis 키를 지우는 명령인 `FLUSHALL`을
`bootstrap.js`가 수행하는 절차를 생략하면 안 된다.

---

## 8. 어떤 시나리오를 선택해야 하는가

목적과 다른 시나리오를 고르면 정확히 측정해도 질문에 답하지 못한다.

| 알고 싶은 것 | 먼저 쓸 시나리오 | 주의 |
|---|---|---|
| 평상시 개선 전후 | `normal-day` + `--rate` | 먼저 용량 곡선으로 HEADROOM 도착률을 찾는다 |
| 특정 기능만 느린지 | `scripts/posts.js`, `comments.js` 등 | 현재 대부분 closed model이므로 절대 용량 주장 금지 |
| 읽기·캐시 | `read-heavy`, `cold-start` ↔ `cache-warm` | cold/warm을 같은 날 연속으로 짝지어 실행 |
| 쓰기·락·풀 | `write-heavy` | 상태 복원과 오류·정합성 확인 필수 |
| 최대 용량 | `stress` → `breakpoint` | 포화를 만드는 것이 목적이므로 일반 SLO FAIL을 그대로 결론으로 쓰지 않음 |
| 순간 폭증 | `spike` | 폭증 중 성능과 폭증 후 회복 시간을 함께 봄 |
| 장시간 누수 | `soak` | 힙·live data·스레드의 시간 방향을 봄 |
| Redis 장애 | `failover` | 장애 주입 시각을 초 단위로 기록 |
| 복합 장애 | `chaos` | 가용성·복구가 목적, 일반 성능 비교와 분리 |
| 깊은 OFFSET 비용 | `deep-paging` | 앞의 행을 건너뛰는 SQL 방식인 OFFSET을 시험하므로 `medium` 이상 필수 |
| 로그인 CPU | `registration-day` | BCrypt CPU 경합과 시작 로그인 몰림을 고려 |
| 시험 기간 검색 | `exam-week` | 문자열 패턴 검색 연산자 LIKE와 인덱스·스캔 지표 확인 |

시나리오 파일의 VU와 예상 RPS는 절대 진리가 아니다. 이 머신·이 데이터셋에서 실제 용량을
먼저 찾아야 한다. 운영 트래픽 비율도 현재 일부는 운영 로그가 아니라 가정에 기반하므로,
로컬 개선 전후 비교에는 쓸 수 있어도 운영 용량 예측에는 쓸 수 없다.

---

## 9. 첫 실행 — 기능 확인과 표준 진입점

### 9.1 스모크 실행

스모크 테스트는 “빠른가?”가 아니라 “로그인·데이터·스크립트·수집·보고서가 모두 동작하는가?”를
확인하는 짧은 실행이다.

```powershell
node tools/perf-run.js scripts/posts.js --vus 5 --duration 1m --dataset small --loadgen docker --env perf-learning --note "첫 스모크"
```

`perf-run.js`를 사용하는 이유:

- 실행 전 데이터셋 상태를 확인한다.
- k6 p99 계산 옵션을 강제로 넣는다.
- 브랜치·커밋·실행자·스크립트 지문을 기록한다.
- k6 지표를 Prometheus에 remote-write한다.
- Windows 호스트와 부하 발생기 상태를 기록한다.
- 같은 measure 구간의 인프라 지표를 수집한다.
- 기준선 선택, 회귀 판정, HTML 보고서 생성을 자동으로 수행한다.

직접 `k6 run`을 사용하면 이 중 여러 단계가 조용히 빠진다. 디버깅 외에는 표준 진입점으로
사용하지 않는다.

### 9.2 종료 코드 읽기

| 종료 코드 | 뜻 | 대응 |
|---:|---|---|
| `0` | 게이트와 threshold 통과 | 보고서 유효성 확인 후 사용 |
| `1` | k6 threshold 또는 성능 게이트 실패 | 서버·시나리오·SLO를 조사 |
| `2` | 실행·수집 도구 오류 | Docker, 파일, 인자, 도구 로그 조사 |
| `3` | 필수 지표 결측으로 측정 불가 | Prometheus·exporter·remote-write 조사 |

종료 코드 `1`이어도 보고서는 생성된다. 실패한 실행일수록 원인을 분석해야 하므로 수집을 계속하는
설계다. `--no-gate`는 회귀 게이트의 종료 코드만 무시한다. k6 자체 threshold 미달까지 성공으로
바꾸는 옵션은 아니므로, 탐색 실행의 비영(0이 아닌) 종료를 도구 고장으로 오해하지 않는다.

### 9.3 생성되는 파일

```text
performance/reports/runs/<runId>/
  ├─ k6.json          k6 원본 요약
  ├─ run.json         서버 지표·판정·조건을 합친 최종 기록
  ├─ report.html      사람이 읽는 개별 실행 보고서
  └─ summary.txt      터미널 출력 사본
```

실행 중에는 `<runId>.hostprobe.jsonl`, `dbstate.json` 같은 사이드카 원자료도 사용된다. HTML은
외부 인터넷 없이 열 수 있는 자기완결형 파일이다.

---

## 10. 개선 전 먼저 용량점을 찾는 법

새 환경이나 새 시나리오에서 한 점만 재면 그 점이 여유 영역인지 포화 영역인지 모른다. 최소
세 개의 부하점으로 **용량 곡선(capacity curve)**을 그린다.

```powershell
node tools/perf-run.js scenarios/normal-day.js --dataset medium --rate 3 --warmup 180 --hold 5m --loadgen docker --env perf-capacity --note "용량 탐색 rate 3"
node tools/perf-run.js scenarios/normal-day.js --dataset medium --rate 4 --warmup 180 --hold 5m --loadgen docker --env perf-capacity --note "용량 탐색 rate 4"
node tools/perf-run.js scenarios/normal-day.js --dataset medium --rate 5 --warmup 180 --hold 5m --loadgen docker --env perf-capacity --note "용량 탐색 rate 5"
```

위 3·4·5는 이 저장소의 한 로컬 환경에서 실제로 경계를 찾을 때 사용한 예시일 뿐이다. 다른
컴퓨터나 데이터셋에 그대로 적용하지 않는다.

각 실행에서 다음을 적는다.

| 확인값 | 의미 |
|---|---|
| `saturation.status` | `HEADROOM`, `NEAR_LIMIT`, `SATURATED` 중 무엇인가 |
| 목표/실제 도착률과 달성도 | 계획한 iteration/s를 실제로 넣었는가 |
| `dropped_iterations` | 필요한 VU를 확보하지 못해 시작조차 못 한 iteration이 있는가 |
| 앱 CPU와 throttling | CPU 한계에 붙었는가 |
| Hikari pending·acquire p95 | DB 커넥션 앞에 대기열이 생겼는가 |
| p95·p99 | 부하가 증가할 때 완만히 오르는가, 절벽처럼 튀는가 |

처리량이 더 이상 따라오지 못하고 지연만 급격히 오르는 지점을 **knee(무릎점)** 또는 용량
한계라고 부른다. 개선 전후 지연을 비교할 때는 그보다 충분히 낮은 `HEADROOM` 점을 선택한다.
최대 용량 개선이 목적이라면 경계 자체가 얼마나 오른쪽으로 이동했는지를 별도 실험으로 비교한다.

---

## 11. 성능 개선을 증명하는 표준 절차

### 11.1 실행 전에 실험 문장을 쓴다

다음 빈칸을 채우지 못하면 아직 측정할 준비가 되지 않은 것이다.

```text
가설:
  [코드/설정]을 [어떻게] 바꾸면 [원인]이 줄어
  [주 지표]가 [예상 방향]으로 변할 것이다.

반증 조건:
  [주 지표]가 좋아지지 않거나 [보호 지표]가 나빠지면 가설을 기각한다.

고정 조건:
  시나리오 / env / dataset / snapshot / rate 또는 VU / warmup / measure /
  loadgen / cache 상태 / Docker 자원 / 실행 위치

주 지표:
  예: post read p95, 요청당 쿼리 수, 최대 HEADROOM 도착률

보호 지표:
  오류율, check 성공률, RPS/TPS, CPU throttling, Hikari timeout, 데이터 정합성
```

공식 기록은 [실험 템플릿](../../experiments/TEMPLATE.md)을 사용한다.

### 11.2 Before를 반복 측정한다

탐색은 3회로 시작할 수 있지만 개선 폭을 근거로 남길 때는 보통 5회 이상을 사용한다. 실제
필요 횟수는 이력 상세 화면의 MDE를 보고 정한다.

```powershell
node tools/repeatability.js scenarios/normal-day.js --runs 5 --rate 4 --warmup 180 --hold 5m --dataset medium --loadgen docker --env perf-opt-post-query --reset restart --note "Before"
```

여기서 `rate 4`도 반드시 앞 절에서 이 환경의 `HEADROOM`으로 확인한 값이어야 한다.

### 11.3 한 번에 변수 하나만 바꾼다

인덱스 추가, 커넥션 풀 확대, 캐시 도입을 동시에 하면 결과가 좋아져도 무엇 때문인지 알 수 없다.
코드 변경 하나, 설정 변경 하나처럼 원인과 결과를 연결할 수 있는 크기로 나눈다.

앱 코드를 바꿨다면 이미지를 다시 빌드한다.

```powershell
docker compose -f environment/docker-compose.perf.yml --env-file environment/.env.perf up -d --build app
Invoke-RestMethod http://localhost:18080/actuator/health
```

### 11.4 같은 조건으로 After를 반복 측정한다

```powershell
node tools/repeatability.js scenarios/normal-day.js --runs 5 --rate 4 --warmup 180 --hold 5m --dataset medium --loadgen docker --env perf-opt-post-query --reset restart --note "After"
```

`--env`를 `before`와 `after`로 나누면 비교 조건이 달라져 자동 기준선이 끊긴다. 같은 실험의
Before/After는 같은 전용 env 이름을 쓰고 `--note`로 구분한다.

개별 실행의 Regression 표는 **그 실행과 가장 가까운 유효 기준선 한 회**를 비교한다. After
첫 회는 Before 마지막 회와 비교될 수 있지만, After 둘째 회부터는 앞선 After 회가 기준선이 될
수 있다. 따라서 개별 표 다섯 개의 변화율을 Before 대 After 효과로 평균내면 안 된다.
`repeatability.js`가 남긴 `reports/repeatability/*.json`의 두 반복 세트를 사용해 Before 대표값과
After 대표값을 별도로 계산한다. 각 파일의 `runs`에는 회차별 값, `summary`에는 평균·중앙값·
표준편차·CV가 들어 있다.

Before와 After 사이에 긴 시간을 두지 않는다. 로컬 호스트는 백그라운드 작업, 전원·열 상태,
WSL2 상태에 따라 변할 수 있다. 작은 개선을 입증해야 한다면 Before/After를 가능한 한 가까이
배치하고, 실행 전·부하 중 대조 벤치와 hostprobe도 함께 확인한다.

### 11.5 결과를 계산한다

낮을수록 좋은 지표:

```text
개선율(%) = (Before 대표값 - After 대표값) / Before 대표값 × 100
```

높을수록 좋은 지표:

```text
개선율(%) = (After 대표값 - Before 대표값) / Before 대표값 × 100
```

대표값은 한 번의 실행이 아니라 같은 조건 반복 결과의 중앙값 또는 평균을 사용하되, 어떤 것을
사용했는지 기록한다. 이상치가 있는 로컬 부하 테스트에서는 중앙값이 덜 흔들린다.

MDE가 필요하면 이력 상세 화면의 같은 계열 안정성 표를 보거나 반복 세트의 CV와 회차 수 `n`으로
다음 근사식을 사용한다. Before와 After 양쪽을 각각 `n`회 측정하는 두 집단 비교 기준이다.

```text
MDE(%) ≈ 2.8016 × CV(%) × √(2 / n)
```

두 세트의 반복 횟수가 다르면 이 단순식 대신 통계 검정을 별도로 설계한다.

### 11.6 개선으로 인정하는 조건

다음을 모두 만족해야 한다.

- Before와 After의 조건 계열(`seriesHash`)이 같고 비교 수준이 `exact`다. 같은 해시는 필수
  비교 조건이 같다는 뜻일 뿐이므로, 대조 벤치·remote-write·부하 스크립트 같은 경고 조건도
  따로 일치해야 한다.
- 두 세트 모두 `MEASURED`이고 measure 창이 완전하다.
- 판정용 표본이 같은 부하 체제이며 보통 `HEADROOM`이다.
- 주 지표의 개선 폭이 자연 변동과 MDE보다 충분히 크다.
- 오류율, check 성공률, 처리량, timeout 같은 보호 지표가 나빠지지 않았다.
- 쓰기 경로라면 DB 카운터와 실제 행의 정합성도 검증했다.
- “로컬 medium·2코어·rate 4 조건에서”처럼 결과의 적용 범위를 함께 썼다.

“p95가 20% 줄었다”와 “운영에서도 20% 빨라진다”는 다른 주장이다. 이 로컬 스택은 앱·DB·Redis·
부하 발생기가 한 호스트에 있고 운영 토폴로지와 다르므로, 운영 용량을 직접 예측하는 근거로
사용하지 않는다.

---

## 12. 개별 `report.html`을 읽는 정확한 순서

보고서는 결론을 위에 배치하지만, 초심자는 아래 검증 순서로 읽는 것이 안전하다.

### 12.1 1순위 — 측정 상태와 실행 조건

헤더에서 다음을 확인한다.

- `측정 상태 = MEASURED`인가.
- 시나리오, 환경, 데이터셋, 부하 프로파일, 측정 구간이 의도와 같은가.
- 실행 메모가 Before/After와 변경 내용을 구분할 만큼 구체적인가.

현재 개별 HTML 헤더는 부하 발생기 종류와 커밋의 `+dirty` 표시를 모두 보여 주지 않는다.
따라서 같은 실행 폴더의 `run.json`도 열어 다음을 확인한다.

- `run.loadgen = docker`인가. `local`이면 부하 발생기 자원은 측정되지 않는다.
- `run.commit` 끝에 `+dirty`가 붙었는가. 붙었다면 커밋되지 않은 변경이 포함되어 그 커밋만으로
  완전 재현되지 않는다. HTML의 짧은 커밋 값만 보면 이 표시를 놓칠 수 있다.
- `run.remoteWrite = true`이고 `run.loadBench.available = true`인가. 전자는 k6 시계열 전송 여부,
  후자는 부하 발생기 벤치마크 결과의 가용 여부다. 둘 중 하나가 아니면 시계열이나 부하 발생기
  여유도 증거가 빠질 수 있다. `run.loadBench.errors`도 비어 있어야 한다.

`PARTIAL`은 필수 지표는 있지만 선택 지표가 빠졌거나 measure 구간이 계획보다 짧았다는 뜻이다.
구간은 완전하고 선택 지표만 빠진 `PARTIAL`은 핵심 판정 자체는 가능하지만, 빠진 계층에 대한
결론은 내릴 수 없다. `windowIncomplete = true`인 `PARTIAL`은 시간 조건이 달라졌으므로 기준선에서
제외된다. `UNMEASURED`는 필수 지표가 없어 판정을 신뢰할 수 없다는 뜻이다. 증거용 기준선은
가능하면 선택 지표까지 온전한 `MEASURED` 실행만 사용한다.

### 12.2 2순위 — 포화 체제와 부하 달성 여부

개별 HTML에서 간접 신호만 보이면 `run.json` 또는 이력 상세 화면을 연다.

```text
run.json
  ├─ saturation.status
  ├─ saturation.signals
  └─ saturation.achievedRate
```

- `HEADROOM`: 여유 영역. p95를 애플리케이션 지연으로 읽을 수 있다.
- `NEAR_LIMIT`: 대기열이 생기기 시작했다. 작은 자원 변화가 큰 지연 변화로 확대될 수 있다.
- `SATURATED`: 용량 초과. p95의 상당 부분이 큐다. 일반 코드 지연으로 인용하지 않는다.
- `UNKNOWN`: 포화 판단 지표가 없다. “여유”가 아니다.

open model에서는 목표 도착률 대비 실제 달성률이 98% 이상인지 보고, `dropped_iterations`가
0인지 확인한다. 이 값은 발생했을 때 `k6.json`의 `k6.rawMetrics`에 나타나며 0회이면 항목 자체가
없을 수 있다. 따라서 항목 부재만으로 판단하지 말고 `saturation.achievedRate`의 목표·실제·달성률도
반드시 함께 본다. 목표를 달성하지 못했다면 서버나 부하 발생기 중 하나가 이미 한계다.

### 12.3 3순위 — 오류율과 check 성공률

응답 시간이 매우 빨라도 요청이 실패했다면 성능이 좋은 것이 아니다.

- **HTTP 오류율**: 네트워크 실패나 기대하지 않은 HTTP 상태를 실패로 센 비율.
- **check 성공률**: 상태 코드뿐 아니라 응답 내용이 기대와 같은지 검사한 성공 비율.

오류율은 전체 비율이라 특정 기능이 100% 실패해도 다른 요청에 묻힐 수 있다. `checks` 이름별
실패와 Breakdown을 함께 본다. 현재 리포트는 상태 코드·엔드포인트별 오류 귀속이 충분하지
않으므로, 오류가 하나라도 생겼다면 앱 로그와 k6 check 이름을 추가 확인한다.

### 12.4 4순위 — Performance Summary

다음 순서로 읽는다.

1. **RPS/TPS가 의도한 부하와 맞는가.** 부하가 달라졌다면 지연 비교가 먼저 무효다.
2. **p50**으로 전형적인 요청을 본다.
3. **p95**로 주 사용자 경험을 본다.
4. **p99와 max**로 긴 꼬리와 순간 장애를 본다.
5. **waiting**과 전체 duration을 비교해 서버 대기 비중을 본다.

`waiting`은 요청 전송이 끝난 뒤 첫 바이트가 올 때까지의 시간, 즉 TTFB(Time To First Byte)에
가깝다. 서버 처리뿐 아니라 서버 앞 대기열도 포함하므로 순수 메서드 실행 시간은 아니다.

### 12.5 5순위 — Regression 표

| 열 | 읽는 법 |
|---|---|
| 직전/기준선 | 조건이 같은 자동 선택 기준선의 값 |
| 현재 | 이번 실행의 값 |
| 변화 | 기준선 대비 좋은 방향 또는 나쁜 방향 변화율 |
| 판정 | 규칙에 따른 PASS/WARN/FAIL/SKIP |
| GATE | 실패 시 자동화 종료 코드에 영향을 주는 필수 규칙 |
| 사유 | 상대 임계, 절대 상한, 노이즈 하한 등 실제 판정 근거 |

**상대 개선과 절대 SLO를 섞지 않는다.** 2,000ms에서 1,000ms로 줄면 50% 개선이지만 SLO가
500ms라면 여전히 FAIL이다. 반대로 기준선이 없어 상대 비교를 못 해도 절대 게이트는 계속
평가된다.

기준선 상태:

- `compared`: 유효한 기준선과 비교함.
- `incomparable`: 과거 실행은 있으나 조건이나 자격이 달라 비교하지 않음.
- `first-run`: 해당 시나리오의 과거 후보 자체가 없음.

`incomparable`을 PASS로 읽지 않는다. 상대 비교를 하지 않았다는 뜻이다.

조건 비교 수준도 확인한다.

- `exact`: blocking과 degrading 조건이 모두 같다. 상대 비교를 그대로 사용할 수 있다.
- `degraded`: 비교는 했지만 대조 벤치, remote-write, 부하 스크립트 지문 중 하나 이상이 다르다.
  이때 상대 변화만으로 생긴 FAIL은 WARN으로 낮아질 수 있다. 고정 절대 상한을 넘은 실패는
  그대로 FAIL이다.
- `incomparable`: blocking 조건이 달라 상대 비교 자체를 생략했다.

따라서 `seriesHash`가 같다는 사실만 보지 말고 조건 불일치 표가 비어 있는지도 확인한다.

### 12.6 6순위 — Breakdown

전체 p95가 느리면 다음 축으로 쪼갠다.

- `feature`: auth, post, comment, board 등 기능별.
- `op`: read, write, auth.
- `page`: 목록 페이지 깊이별.
- 요청 수: 느린 경로가 얼마나 자주 호출됐는지.

지연만 보지 말고 요청 수를 같이 본다. 5초짜리 요청이 1회이고 500ms 요청이 1만 회라면 전체
사용자 영향은 뒤쪽이 더 클 수 있다. **총 영향은 대략 호출 수 × 1건당 시간**으로 생각한다.

Breakdown의 느린 기능이 반드시 원인은 아니다. DB 커넥션 풀이 막히면 가벼운 API도 피해자로서
느려진다. 원인을 찾으려면 다음 Infrastructure와 Grafana 시계열에서 시간상 동반 상승을 본다.

### 12.7 7순위 — Infrastructure Summary

먼저 포화도 막대를 보고, 그다음 avg·p95·max를 읽는다.

- `avg`: 구간의 지속 비용.
- `p95`: 시간의 95%가 어느 수준 아래였는지.
- `max`: 단 한 번이라도 도달한 최악.

예를 들어 CPU `avg 40% / p95 93% / max 100%`면 평균 여유가 아니라 반복적인 포화 구간이
있었다는 뜻이다. `avg 40% / p95 45% / max 100%`면 짧은 단발 spike일 가능성이 크다.

### 12.8 8순위 — 병목 가설

자동 병목 가설은 조사 시작점이다. 확정 원인이 아니다. “Slow Query 다발”이 표시됐다고 바로
인덱스를 추가하지 않는다. 실제 slow log와 SQL digest, rows read, 락, 디스크를 교차 확인한다.

### 12.9 9순위 — SLO Thresholds

k6가 실행 중 평가한 절대 기준이다. 회귀 표는 과거 대비이고, SLO는 사용자가 정한 절대 약속이다.
둘 중 하나만 통과해도 전체 성공으로 결론내리면 안 된다.

### 12.10 10순위 — Grafana 링크

두 링크가 있으면 `measure` 링크를 먼저 연다. 전체 실행 링크에는 warmup과 rampdown이 포함된다.
그래프에서는 다음을 본다.

1. p95·p99가 오른 **정확한 시각**을 찾는다.
2. 같은 시각에 CPU, throttling, GC, Hikari, MySQL, Redis가 함께 움직였는지 본다.
3. 먼저 변한 지표와 뒤따라 변한 지표를 구분한다.
4. 평균선만 보지 말고 spike의 지속 시간과 반복 주기를 본다.

상관관계는 인과관계가 아니다. 두 값이 함께 올랐다는 사실만으로 하나가 다른 하나의 원인이라고
확정하지 않는다. 한 변수만 바꾸는 재실험으로 가설을 검증한다.

---

## 13. `history.html`과 조건 계열 상세 화면 읽기

생성:

```powershell
node tools/history.js
node tools/history.js --print
```

`reports/history.html`은 여러 실행을 보는 감시 화면이다.

### 13.1 시나리오 현황

시나리오별 최근 상태와 실행 수를 본다. 여기서 실패 수만 세지 말고 측정 불가 회차가 있는지
본다. 측정 불가를 제외하고 좋아 보이는 추세를 만들면 안 된다.

### 13.2 조건 계열

**조건 계열(series)**은 같은 시나리오 중에서도 데이터셋·부하·측정 구간·부하 발생기 위치처럼
비교를 막을 정도로 중요한 `blocking` 조건이 같은 실행 묶음이다. 이 조건들과 조건 스키마
버전을 SHA-256으로 요약한 12자리 값이 `seriesHash`다.

두 실행의 `seriesHash`가 다르면 그래프를 눈으로 나란히 놓고 개선율을 계산하지 않는다.
자동 비교기가 막아도 사람이 수동으로 비교하는 것까지 막아 주지는 못한다. 반대로 해시가
같다고 모든 조건이 같은 것은 아니다. 대조 벤치, remote-write, 부하 스크립트 지문은
`degrading` 조건이라 계열을 가르지 않고 비교 신뢰도만 낮춘다. 보고서의 조건 비교가 `exact`인지,
`degraded`인지까지 확인한다.

### 13.3 누적 저하

개별 실행이 매번 5%씩만 나빠지면 +20% 회귀 임계에는 한 번도 걸리지 않을 수 있다. 그러나
여러 번 누적되면 큰 저하가 된다. 이력은 최근 N회를 앞·뒤 절반으로 나눠 각 절반의 중앙값을
비교한다. 처음과 마지막 한 점만 비교하지 않는 이유는 두 점 중 하나가 이상치일 수 있기 때문이다.

### 13.4 계열 상세의 `체제`

회차마다 `HEADROOM`, `NEAR_LIMIT`, `SATURATED`, `UNASSESSED`를 본다. `UNASSESSED`는 포화
판정 기능이 생기기 전 실행이거나 필요한 값이 없다는 뜻이지 여유라는 뜻이 아니다.

한 계열에 서로 다른 체제가 섞여 있으면 p95 추세와 CV가 서로 다른 물리량을 섞은 결과일 수
있다. 대기 발생 회차를 제외한 표본 집합과 전체 표본 집합을 나란히 본다.

### 13.5 안정성, CV, MDE

- **표준편차(standard deviation)**: 반복값이 평균 주변에서 얼마나 퍼졌는지 나타내는 값.
- **CV(Coefficient of Variation, 변동계수)**: `표준편차 ÷ 평균 × 100`. 단위가 다른 지표의
  흔들림을 비교할 수 있다.
- **MDE(Minimum Detectable Effect, 최소 검출 가능 효과)**: 현재 반복 횟수와 변동성으로
  구분할 수 있는 최소 개선 폭의 근사치다.

예를 들어 MDE가 20%인데 기대 개선이 10%라면, 10% 개선이 실제로 있어도 현재 실험은 우연과
구분하기 어렵다. 해결 방법은 반복 횟수를 늘리거나, 포화 회차·호스트 간섭·캐시 상태처럼
변동 원인을 먼저 제거하는 것이다. MDE는 정규분포 근사에 기반한 낙관적 하한이므로 “MDE보다
크면 반드시 검출된다”가 아니라 “MDE보다 작으면 확실히 구분하기 어렵다”로 읽는다.

의도적인 코드 변경 전후가 한 계열에 함께 들어간 뒤 전체 CV를 계산하면, 개선으로 생긴 수준
차이까지 자연 변동으로 섞여 MDE가 커질 수 있다. 실험을 계획할 때는 변경 전의 안정된 구간이나
Before 반복 세트만으로 CV와 MDE를 구한다.

### 13.6 실패 축과 회차별 원본

실패 축은 어떤 게이트가 실행을 실패시켰는지 보여 준다. `*` 또는 절대 게이트 표시는 기준선과
무관하게 상한·하한을 넘었다는 뜻이다. 그래프가 이상하면 회차별 원본에서 runId, note, 체제,
측정 상태, 실제 수치를 다시 확인한다.

---

## 14. 주요 인프라 지표를 읽는 법

### 14.1 CPU와 throttling

| 지표 | 뜻 | 해석 |
|---|---|---|
| CPU cores | 실제 소비한 CPU 코어 수 | cgroup CPU 한계와 나란히 본다 |
| CPU saturation | 사용 코어 ÷ 한계 | 100%에 가까우면 작은 변화가 큰 대기로 확대될 수 있다 |
| throttled periods | CPU quota를 다 써 강제로 멈춘 주기의 비율 | 앱은 높으면 용량 제한, 부하 발생기는 낮아도 측정 오염 신호 |
| CPU seconds | measure 구간에 소비한 총 CPU 시간 | 요청 수로 나누면 요청당 CPU 비용 |

`throttledPct`는 잃어버린 벽시계 시간의 비율이 아니라 **CPU quota에 걸린 CFS 주기의 비율**이다.
10%라고 해서 실행 시간의 정확히 10%를 잃었다는 뜻은 아니다.

CPU가 높고 throttling과 p99가 함께 오르면 CPU 한계 또는 비싼 코드가 후보가 된다. CPU가
낮은데 지연이 높으면 I/O, 락, 풀 대기, 네트워크를 먼저 본다.

### 14.2 컨테이너 메모리와 JVM Heap

- **working set**: OOM 판단에 가까운 컨테이너 실사용 메모리. 쉽게 회수 가능한 캐시는 일부
  제외한다.
- **RSS(Resident Set Size)**: 프로세스가 실제 물리 메모리에 올려 둔 페이지 양.
- **JVM Heap**: Java 객체가 만들어지는 메모리 공간.
- **Non-heap**: 클래스 메타데이터와 JIT가 만든 기계어 등이 저장되는 영역.
- **live data**: GC 후에도 살아남은 객체 크기. 같은 부하 반복에서 계속 오르면 누수 후보.
- **OOM(Out Of Memory)**: 메모리가 부족해 할당에 실패하거나 컨테이너가 종료되는 상태.

메모리는 “많이 쓴다”만으로 병목이 아니다. 한계에 가까우면서 GC·OOM event·지연이 함께
악화되는지 본다. soak 테스트에서 live data와 스레드 수가 계속 우상향하면 누수를 의심한다.

### 14.3 GC와 JIT

- **GC(Garbage Collection)**: 더 이상 쓰지 않는 Java 객체를 찾아 메모리를 회수하는 작업.
- **STW(Stop-The-World)**: GC 중 애플리케이션 스레드가 잠시 멈추는 구간.
- **GC pause**: 한 번의 STW가 지속된 시간.
- **GC overhead**: 전체 시간 또는 CPU 중 GC가 차지한 비율.
- **allocation rate**: 초당 새로 만든 객체 바이트 수. 높으면 GC 빈도가 늘 수 있다.
- **promotion**: 오래 살아남은 객체가 Young 영역에서 Old 영역으로 이동하는 것.
- **JIT(Just-In-Time compilation)**: 자주 실행되는 Java 바이트코드를 실행 중 기계어로 바꾸는
  최적화. warmup이 필요한 이유다.

GC pause가 p99가 튄 시각과 겹치고 GC overhead도 높아야 GC를 강한 원인 후보로 본다. GC 횟수
하나만 많다고 튜닝부터 하지 않는다.

### 14.4 Tomcat과 HikariCP

- **Tomcat worker thread**: HTTP 요청 하나를 맡아 처리하는 서버 스레드.
- **HikariCP**: 애플리케이션이 MySQL 연결을 미리 만들어 빌려 쓰게 하는 커넥션 풀.
- **active**: 현재 빌려서 사용 중인 DB 커넥션 수.
- **pending**: 커넥션이 없어 기다리는 스레드 수.
- **acquire time**: 풀에서 커넥션 하나를 받을 때까지 기다린 시간.
- **timeout**: 제한 시간 안에 커넥션을 받지 못해 실패한 횟수.

`pending > 0`이 지속되면 정의상 커넥션 풀 앞에 큐다. 풀 크기를 바로 늘리기 전에 쿼리와
트랜잭션이 커넥션을 오래 잡고 있는지 확인해야 한다. 현재 자동 카탈로그는 커넥션 **획득 대기**는
잘 보지만 **보유 시간** 귀속은 부족하다는 한계가 있다.

### 14.5 MySQL

| 용어 | 뜻 | 무엇과 함께 보나 |
|---|---|---|
| QPS | MySQL이 초당 처리한 쿼리 수 | k6 RPS, 요청당 쿼리 수 |
| slow query | 100ms를 넘긴 쿼리 | slow log, SQL 실행 계획 |
| row lock wait | 다른 트랜잭션의 행 잠금 해제를 기다림 | 핫 로우 쓰기, p95 |
| buffer pool | InnoDB가 데이터·인덱스 페이지를 메모리에 보관하는 캐시 | hit ratio, 디스크 읽기 |
| full table scan | 인덱스로 좁히지 못하고 테이블 전체를 읽음 | rows read, select scan |
| temporary table | 정렬·그룹화 중 임시 결과를 저장하는 테이블 | 디스크 임시 테이블, I/O |
| rollback | 트랜잭션 변경을 취소함 | 예외, deadlock, 오류율 |

`QPS / RPS`가 급증하면 N+1 후보지만, 이 프로젝트에는 스케줄러 같은 배경 쿼리도 섞인다.
요청당 쿼리 수만으로 N+1을 확정하지 말고 기능별 재현과 SQL 로그로 확인한다.

버퍼풀 적중률 99.9%도 항상 충분하다는 뜻은 아니다. 전체 읽기가 매우 많으면 0.1% miss도 큰
디스크 I/O가 된다. hit ratio, rows read, disk read, API 경로별 latency를 함께 본다.

### 14.6 Redis

- **cache hit**: 요청한 키가 Redis에 있어 DB나 원본 계산을 피한 경우.
- **cache miss**: 키가 없어 원본을 다시 읽거나 계산한 경우.
- **hit ratio**: `hit ÷ (hit + miss)`.
- **eviction**: 메모리 한계 때문에 Redis가 기존 키를 내보내는 것.
- **TTL(Time To Live)**: 키가 자동 만료되기까지 남은 시간.
- **ops/sec**: 초당 처리한 Redis 명령 수.

적중률이 높다는 사실만으로 캐시가 성능을 개선했다고 결론내리지 않는다. 캐시를 끈 대조군과
같은 부하로 비교해 DB QPS·응답 시간·Redis 비용이 어떻게 바뀌는지 본다. eviction이 발생하면
적중률이 서서히 무너질 수 있다.

### 14.7 네트워크·디스크·호스트

- **bandwidth(대역폭)**: 초당 전송한 바이트 양. 많다는 사실만으로 병목은 아니다.
- **packet drop**: 네트워크 패킷이 버려진 것. 0이 정상이다.
- **I/O**: 디스크나 네트워크 같은 외부 장치와 데이터를 주고받는 작업.
- **iowait**: CPU가 할 일이 없어서가 아니라 디스크 I/O 완료를 기다린 시간 비율.
- **run queue**: CPU에서 실행되기를 기다리는 실행 가능 스레드 수.
- **context switch**: CPU가 실행 중인 스레드를 다른 스레드로 바꾸는 일. 지나치게 많으면
  스케줄링 비용이 커진다.
- **steal time**: 가상 머신이 원했지만 하이퍼바이저가 다른 작업에 준 CPU 시간. Hyper-V/WSL2는
  이 값을 충분히 보고하지 않을 수 있어 0이 외부 간섭 없음의 증거가 아니다.

Windows hostprobe와 WSL2 node-exporter는 서로 다른 층을 본다. 두 값을 합쳐 “물리 호스트”라는
하나의 값처럼 취급하지 않는다.

---

## 15. 증상별 병목 가설 세우기

아래 표는 확정 진단이 아니라 조사 순서다.

| 함께 보이는 신호 | 우선 가설 | 다음 확인 |
|---|---|---|
| CPU saturation·throttling·p99 동시 상승 | CPU quota 또는 CPU가 비싼 코드 | JFR hot method, 요청당 CPU, 낮은 rate 재실험 |
| CPU 낮음 + Hikari pending/acquire 상승 | DB 커넥션 대기 | 긴 트랜잭션, slow SQL, 커넥션 보유 시간 |
| RPS 동일 + QPS/요청당 쿼리 급증 | N+1 또는 배경 쿼리 증가 | 단일 기능 스크립트, SQL digest, Repository 호출 수 |
| slow query·rows read·select scan·disk read 상승 | 인덱스 누락 또는 비효율 쿼리 | `EXPLAIN`, slow log, 복합 인덱스 |
| row lock wait/time·rollback·쓰기 p99 상승 | 핫 로우 경합·deadlock | 같은 행 집중도, 트랜잭션 범위 |
| Redis hit ratio 하락 + DB QPS 상승 | 캐시 miss 증가 | TTL, 키 설계, cold/warm 대조 |
| live data·heap·GC overhead가 시간 따라 상승 | 객체 또는 스레드 누수 | soak, JFR allocation, heap dump |
| Tomcat busy가 max 근처 + Hikari 정상 | CPU·외부 API·락 또는 worker 포화 | 스레드 dump, 서버 API 경로별 지연 |
| k6 blocked/connecting 상승 + loadgen throttling | 부하 발생기 또는 경로 병목 | k6 컨테이너 자원, 네트워크 경로 |
| waiting이 전체 duration 대부분 | 서버/서버 앞 큐가 주 지연 | 앱·DB·풀 시계열 |
| receiving만 상승 | 큰 응답 본문 또는 네트워크 전송 | 응답 바이트, tx bandwidth |
| p50 안정 + p99만 주기적으로 상승 | GC, 스케줄러 burst, 간헐 락 | 같은 시각 시계열, 스케줄러 로그 |

원인 가설은 다음 형식으로 쓴다.

```text
관찰: measure 5분 중 p99가 30초 주기로 상승했다.
동반 신호: 같은 시각 GC가 아니라 scheduler 실행과 DB QPS가 상승했다.
가설: 특정 스케줄러의 burst 쿼리가 요청 처리와 커넥션을 경쟁한다.
반증 실험: 스케줄러만 끈 같은 rate 실행에서 주기적 p99가 그대로면 가설을 기각한다.
```

---

## 16. 초심자가 자주 하는 잘못된 해석

| 잘못된 결론 | 왜 틀렸나 | 올바른 확인 |
|---|---|---|
| PASS니까 개선됐다 | 기준선이 없거나 측정 불가일 수 있다 | measurementStatus, baselineStatus, saturation부터 확인 |
| p95가 낮으니 서버가 빠르다 | 부하가 목표보다 적게 들어갔을 수 있다 | rate 달성도, RPS/TPS, dropped iterations |
| p95가 높으니 코드가 느리다 | 포화 큐 대기일 수 있다 | HEADROOM 여부, pending, throttling |
| CPU 평균 40%라 여유다 | p95 95%, max 100%일 수 있다 | avg·p95·max 같이 확인 |
| 메모리 0은 문제없음이다 | 지표 결측을 0으로 오해했을 수 있다 | null/`—`/errors/measurementStatus 확인 |
| 기준선보다 40% 빨라 SLO 통과다 | 절대 상한은 여전히 넘을 수 있다 | 상대 변화와 절대 게이트 분리 |
| 캐시 적중률 99%라 캐시가 효과적이다 | 원래 DB도 빨랐거나 Redis 비용이 더 클 수 있다 | cold/warm 대조와 DB QPS·지연 함께 비교 |
| QPS가 높으니 DB가 병목이다 | 높은 처리량의 자연스러운 결과일 수 있다 | RPS 대비 QPS와 DB CPU·대기 확인 |
| Hikari pending이 있으니 풀만 늘리면 된다 | 긴 트랜잭션이 원인일 수 있다 | 보유 시간·slow SQL·DB 용량 확인 |
| 두 p95를 빼면 네트워크 p95다 | 분위수끼리 뺄셈은 성립하지 않는다 | 동일 요청 단계 지표와 시계열 사용 |
| 한 번 Before/After가 좋아졌다 | 자연 편차나 호스트 드리프트일 수 있다 | 반복, CV, MDE, 가까운 시간대 비교 |
| `small`에서 빨랐으니 `large`도 빠르다 | 데이터 크기와 메모리 적중이 다르다 | 목적에 맞는 프로파일로 재실행 |
| local k6와 docker k6를 비교해도 된다 | 네트워크 경로와 계측 범위가 다르다 | 같은 loadgen 모드만 비교 |
| 운영에서도 같은 RPS가 나온다 | 로컬 단일 호스트와 운영 토폴로지가 다르다 | 로컬 상대 비교로 범위를 한정 |

---

## 17. 심층 분석은 언제 시작하는가

먼저 리포트와 Grafana로 범위를 CPU/JVM/풀/DB/Redis/호스트 중 하나로 좁힌다. 그 뒤에만
프로파일러와 로그를 사용한다. 심층 도구는 오버헤드가 있어 기준 측정과 동시에 켜면 결과를
바꿀 수 있다.

### JVM

```powershell
docker cp perf-app:/tmp/perf.jfr .
docker cp perf-app:/tmp/gc.log .
docker exec perf-app sh -c "tail -100 /tmp/gc.log"
```

- **JFR(Java Flight Recorder)**: 메서드 CPU, 할당, 락, 스레드 이벤트를 비교적 낮은 비용으로
  기록하는 JVM 진단 파일.
- **JDK Mission Control**: JFR 파일을 분석하는 GUI 도구.

### MySQL

```powershell
docker exec perf-mysql sh -c "tail -200 /var/lib/mysql/slow.log"
docker exec perf-mysql mysql -uroot -pperfroot highteenday -e "SELECT DIGEST_TEXT, COUNT_STAR, SUM_TIMER_WAIT/1e12 sec, SUM_ROWS_EXAMINED FROM performance_schema.events_statements_summary_by_digest ORDER BY SUM_TIMER_WAIT DESC LIMIT 10;"
```

- **SQL digest**: 상수값이 다른 같은 형태의 SQL을 한 종류로 묶은 요약.
- **EXPLAIN**: MySQL이 어떤 인덱스와 조인 순서로 쿼리를 실행할지 보여 주는 실행 계획 명령.

### Redis

```powershell
docker exec perf-redis redis-cli INFO stats
docker exec perf-redis redis-cli SLOWLOG GET 10
docker exec perf-redis redis-cli DBSIZE
```

`SLOWLOG`는 실행 시간이 긴 Redis 명령을 기록한다. 네트워크 왕복 시간은 포함하지 않는다.

---

## 18. 현재 시스템으로 주장할 수 있는 것과 없는 것

### 조건을 붙이면 주장할 수 있는 것

- 같은 `seriesHash`, 같은 부하 체제, 같은 데이터셋에서 개선 전후 상대 변화.
- 로컬 고정 자원에서 특정 도착률의 SLO 충족 여부.
- 어느 자원 계층이 포화 또는 대기 상태였는지.
- 특정 실험에서 요청당 CPU·쿼리 수·캐시 적중률이 어떻게 변했는지.
- 반복 실행의 변동성과 현재 표본 수의 MDE.

### 현재 자동 리포트만으로 확정하기 어려운 것

- 어느 API·서비스 메서드가 CPU와 커넥션을 가장 많이 점유했는지.
- slow query가 정확히 어떤 SQL이었는지. 별도 slow log/digest 확인이 필요하다.
- Hikari 커넥션을 어느 요청이 오래 보유했는지.
- WebSocket RTT SLO의 완전한 자동 회귀 판정.
- 특정 HTTP 상태 코드와 엔드포인트에 오류가 얼마나 몰렸는지.
- 로컬 결과로부터 운영 EC2/RDS/ElastiCache의 절대 용량 예측.

자동 병목 가설은 위 공백을 메우지 못한다. 범위를 좁힌 다음 JFR·SQL digest·로그·단일 기능
재현으로 원인을 확정한다.

---

## 19. 문제 해결 빠른 표

| 증상 | 가장 흔한 원인 | 해결 |
|---|---|---|
| 앱이 계속 재시작 | `dev/local` 프로파일로 빈 DB 기동 | `.env.perf`의 `SPRING_PROFILE=prod,perf` 유지 |
| 로그인은 200, 이후 요청은 401 | `prod` 단독의 Secure/Domain 쿠키 | `prod,perf` 함께 사용 |
| 로그인·회원가입 500 | JWT 키가 HS512 최소 길이보다 짧음 | 64바이트 이상 키 생성 |
| 시드가 아무것도 만들지 않음 | 게시판 초기 행이 없음 | `bootstrap.js` 사용 |
| 데이터가 목표보다 두 배 | 시드를 중복 실행 | bootstrap 중복 차단 사용, 재생성은 `--force` |
| strict 실행 거부 | 해당 프로파일 스냅샷 없음 또는 상태 불일치 | verify 후 snapshot 생성·복원 |
| 모든 실행 incomparable | 프로파일·지문·rate·loadgen·측정 창이 다름 | 조건 차이 확인 후 새 계열 기준선 축적 |
| P99가 비어 있음 | k6 직접 실행으로 p99 미계산 | `perf-run.js` 사용 |
| 컨테이너 CPU가 `—` | cAdvisor/Prometheus 문제 | `/targets`, cAdvisor 로그, Docker Desktop 설정 확인 |
| measurementStatus가 UNMEASURED | 필수 게이트 지표 결측 | `infra.errors`, Prometheus target, remote-write 확인 |
| deep-paging이 비정상적으로 빠름 | 작은 데이터셋에서 빈 페이지 조회 | `medium` 이상 사용 |
| loadgen 지표가 전부 `—` | `--loadgen local` 실행 | 증거용 실행은 `--loadgen docker` |
| k6 실행 파일 UNKNOWN | Windows 패키지 관리자가 만든 중간 실행 파일(shim)을 정책이 차단 | docker loadgen 사용 또는 실제 k6 경로를 `K6_BIN`에 지정 |

더 자세한 실측 사례는 [공식 운영 매뉴얼의 트러블슈팅](../../MANUAL.md#11-트러블슈팅--실측으로-확인된-함정)을 본다.

---

## 20. 전문용어 사전

본문에서 설명한 말을 다시 찾기 쉽게 주제별로 모았다.

### 요청과 부하

| 용어 | 상세 설명 |
|---|---|
| API | 프로그램이 다른 프로그램에 기능이나 데이터를 요청하는 약속. 이 프로젝트에서는 주로 HTTP 주소·메서드·요청/응답 형식을 뜻한다. |
| API endpoint | 하나의 API 기능을 호출하는 구체적인 HTTP 메서드와 경로 조합. 예를 들어 `GET /api/posts`는 게시글 목록 endpoint다. |
| HTTP | 브라우저나 k6가 서버와 요청·응답을 주고받는 통신 규칙. 상태 코드 2xx는 보통 성공, 4xx는 요청·인증 문제, 5xx는 서버 문제다. |
| latency | 요청 시작부터 응답 완료까지의 지연 시간. 평균뿐 아니라 분포와 꼬리를 봐야 한다. |
| throughput | 단위 시간에 끝낸 일의 양. 요청은 RPS, 사용자 여정은 TPS로 표현한다. |
| concurrency | 같은 시각에 시스템 안에서 처리 중이거나 기다리는 일의 수. 처리량과 다른 개념이다. |
| error rate | 전체 요청 중 실패로 분류된 요청의 비율. 빠른 실패도 실패이므로 latency와 함께 본다. |
| check | k6가 응답 상태나 본문이 기대와 같은지 검사하는 불리언 조건. HTTP 통신이 성공해도 내용이 틀리면 check는 실패할 수 있다. |
| timeout | 작업을 무한정 기다리지 않도록 정한 최대 시간. 넘으면 중단하고 실패로 처리한다. |
| VU | k6의 가상 사용자. closed model에서 동시 사용자 수를 만드는 실행 주체다. |
| iteration | VU가 수행하는 사용자 여정 한 바퀴. 여러 HTTP 요청을 포함할 수 있다. |
| RPS | Requests Per Second. 초당 HTTP 요청 수. |
| TPS | Transactions Per Second. 이 프로젝트에서는 초당 완료한 iteration 수. DB의 트랜잭션/초와 혼동하지 않는다. |
| think time | 사용자 행동 사이의 인위적 대기. 사람이 화면을 읽는 시간을 흉내 낸다. |
| workload | 서버에 가하는 요청 종류·비율·도착 시간·데이터 접근 분포 전체. |
| scenario | 특정 질문에 답하도록 workload와 부하 곡선, 종료 조건을 묶은 실행 정의. |
| load test | 예상 부하에서 SLO를 지키는지 확인하는 시험. |
| stress test | 부하를 계속 올려 한계와 붕괴 방식을 찾는 시험. |
| breakpoint test | 처리할 수 있는 최대 도착률 경계를 더 정밀하게 찾는 시험. |
| spike test | 짧은 시간의 급격한 트래픽 증가와 회복을 보는 시험. |
| soak test | 오랜 시간 돌려 메모리·스레드 누수와 누적 저하를 찾는 시험. |
| failover test | Redis 같은 의존성이 실패했을 때 대체 경로와 회복을 보는 시험. |
| chaos test | 통제된 장애를 주입해 시스템의 생존성과 복구를 검증하는 시험. |
| closed model | VU 수를 고정하는 부하 모델. 서버가 느려지면 요청 생성도 줄어든다. |
| open model | iteration 도착률을 고정하는 부하 모델. 서버가 느려져도 계획한 새 작업을 계속 만든다. |
| coordinated omission | closed model에서 서버가 막힌 동안 새 요청이 생성되지 않아 가장 나쁜 구간이 통계에서 빠지는 현상. |
| Little's Law | 평균 동시 체류 수 = 도착률 × 평균 체류 시간이라는 관계. 큐가 생기면 동시 체류와 지연이 함께 늘어나는 이유를 설명한다. |
| dropped iteration | arrival-rate 실행에서 필요한 VU를 확보하지 못해 시작하지 못한 iteration. 서버 또는 발생기 용량 부족 신호다. |

### 통계와 판정

| 용어 | 상세 설명 |
|---|---|
| sample | 측정된 값 하나. HTTP 요청 시간 하나 또는 5초마다 읽은 CPU 값 하나가 표본이다. |
| distribution | 표본들이 어떤 값에 얼마나 퍼져 있는지를 나타내는 분포. |
| mean / average / avg | 모든 값을 더해 개수로 나눈 산술평균. 극단적으로 큰 값에 끌려가므로 percentile과 함께 본다. |
| min / max | 관측한 표본 중 가장 작은 값과 가장 큰 값. max는 단 한 번의 spike에도 크게 반응한다. |
| percentile | 값을 작은 순서로 정렬했을 때 특정 백분율 위치의 값. p95는 95% 지점이다. |
| median / p50 | 중앙값. 절반은 이보다 빠르고 절반은 느리다. 이상치에 평균보다 덜 민감하다. |
| tail latency | p95·p99처럼 분포의 느린 끝부분에 해당하는 지연. |
| outlier | 나머지 표본에서 멀리 떨어진 이상값. 원인을 확인하지 않고 임의 삭제하면 안 된다. |
| SLO | Service Level Objective. 팀이 지키기로 정한 서비스 수준 목표. 예: 읽기 p95 300ms 미만. |
| threshold | k6가 실행 중 지표에 적용하는 통과·실패 조건. 일부 느슨한 threshold는 태그별 서브메트릭 생성을 위해 사용된다. |
| gate | 실패 시 자동화나 종료 코드를 실패로 만드는 규칙. 이 시스템에서는 동시에 필수 지표 선언 역할도 한다. |
| PASS / WARN / FAIL | 성능 규칙 판정. PASS는 평가한 규칙 통과, WARN은 주의가 필요하지만 자동 실패로 확정하지 않은 상태, FAIL은 게이트 위반이다. 측정 유효성이나 포화 여부와는 별도 축이다. |
| MEASURED / PARTIAL / UNMEASURED | 측정 자료의 완전성. MEASURED는 필수·선택 지표와 창이 온전함, PARTIAL은 필수는 있지만 선택 지표 누락 또는 불완전 창이 있음, UNMEASURED는 필수 지표가 없어 판정을 신뢰할 수 없음을 뜻한다. |
| baseline | 현재 실행과 비교할 과거 기준 실행. 조건이 같은 최근 유효 실행을 자동 선택한다. |
| regression | 이전 기준보다 성능이 나빠진 변화. |
| absolute gate | 기준선과 무관하게 고정 상한·하한을 평가하는 규칙. SLO 위반과 누적 저하를 막는다. |
| relative comparison | 기준선 대비 몇 % 좋아지거나 나빠졌는지 보는 비교. |
| noise floor | 이보다 작은 절대 변화는 측정 잡음으로 보고 회귀 판정을 억제하는 하한. |
| standard deviation | 반복값이 평균 주변에서 퍼진 정도. 원래 지표와 같은 단위를 가진다. |
| CV | 표준편차를 평균으로 나눈 비율. 서로 단위가 다른 지표의 상대 흔들림을 비교한다. |
| MDE | 현재 변동성과 반복 횟수에서 구분 가능한 최소 효과 크기의 근사. 작은 개선을 주장하기 전에 확인한다. |
| correlation | 두 값이 함께 움직이는 정도. 상관이 높아도 제3의 원인 때문에 함께 움직였을 수 있어 인과를 증명하지 않는다. |
| causal relation | 한 변화가 다른 변화를 실제로 일으키는 인과관계. 한 변수 실험과 반증으로 확인한다. |

### 실행 조건과 데이터

| 용어 | 상세 설명 |
|---|---|
| warmup | JIT·풀·캐시를 안정시키며 목표 부하로 올리는 준비 구간. |
| measure | SLO와 회귀를 판정하는 실제 측정 구간. |
| rampdown | 부하를 낮추며 종료하는 구간. 진단에는 쓰지만 판정에서는 제외한다. |
| env | 비교 계열을 분리하는 실험 환경 이름. 같은 실험의 Before/After에는 같은 값을 쓰며, Spring profile과는 역할이 다르다. |
| load profile | executor, VU·도착률, 단계별 시간처럼 “어떤 부하를 만들었는가”를 정규화한 기록. |
| measurement profile | warmup·measure·rampdown 길이와 실제 판정 구간처럼 “어느 시간대를 채점했는가”를 정규화한 기록. |
| loadgen | load generator의 줄임말. 부하를 만드는 k6가 Windows 로컬에서 도는지 Docker 컨테이너에서 도는지를 나타낸다. |
| CPU bench / load bench | CPU bench는 실행 전 유휴 환경 속도를 재고, load bench는 warmup 중 같은 계산을 반복해 부하 중 호스트 변화의 대조 신호를 남긴다. 애플리케이션 성능 지표가 아니라 측정 환경 지표다. |
| profile | 데이터 규모나 Spring 설정 조합에 붙인 이름. 같은 단어가 데이터셋 프로파일과 Spring 프로파일 두 의미로 쓰이므로 문맥을 본다. |
| seed | 테스트 전에 생성한 결정된 사용자·콘텐츠·관계 데이터. |
| snapshot | 검증된 DB 상태를 나중에 그대로 복원하기 위한 사본. |
| fingerprint | 내용이나 조건을 SHA-256 등으로 요약한 해시 문자열. 조금이라도 달라지면 보통 다른 값이 된다. |
| SHA-256 | 입력을 256비트 고정 길이 값으로 요약하는 암호학적 해시 함수. 여기서는 비밀화가 아니라 동일성 확인에 사용한다. |
| guard | 실행 전 데이터 상태를 검사하고 경고하거나 복원하는 정책. |
| runId | 실행 하나의 고유 이름. 보통 시나리오와 UTC 시각으로 구성된다. |
| sidecar file | 주 결과 파일 옆에서 원시 표본이나 추가 상태를 보존하는 보조 파일. hostprobe JSONL과 DB state 파일이 예다. |
| blocking condition | 다르면 같은 실험으로 볼 수 없어 상대 비교를 금지하는 조건. 시나리오, env, 데이터셋, 부하 프로파일, loadgen, 측정 구간 설계가 해당한다. |
| degrading condition | 달라도 비교 자체는 하되 신뢰도를 낮추고 경고하는 조건. 현재 대조 벤치, remote-write, 부하 스크립트 지문이 해당한다. |
| exact / degraded / incomparable | 두 실행의 조건 비교 수준. 전부 일치 / 경고 조건만 불일치 / 필수 조건 불일치를 뜻한다. |
| seriesHash | blocking 조건과 조건 스키마 버전을 SHA-256으로 요약한 12자리 계열 ID. 같아야 같은 추세선 후보가 되지만, degrading 조건까지 같다는 보장은 아니다. |
| dirty | 현재 작업 폴더에 커밋되지 않은 변경이 있다는 Git 상태. 실행 커밋만으로 완전 재현하기 어렵다는 뜻이다. |
| cache cold/warm | cold는 필요한 키·페이지가 아직 캐시에 없는 상태, warm은 반복 접근으로 캐시에 들어온 상태. |
| Zipf distribution | 상위 몇 개 항목에 접근이 집중되는 현실의 인기 편중을 표현하는 분포. 캐시·락 실험 결과를 크게 바꾼다. |

### 실행 환경·보안·클라우드

| 용어 | 상세 설명 |
|---|---|
| Node.js | 브라우저 밖에서 JavaScript를 실행하는 런타임. 이 시스템의 시드·수집·판정·리포트 도구를 실행한다. |
| JavaScript | k6 시나리오와 Node.js 도구를 작성한 프로그래밍 언어. Java와 이름은 비슷하지만 다른 언어다. |
| k6 | HTTP·WebSocket 요청을 정해진 동시 사용자 수나 도착률로 만들어 지연·오류·처리량을 기록하는 부하 발생 도구. |
| Docker image / container | image는 프로그램·라이브러리·설정을 담은 실행 틀이고, container는 그 틀을 실제로 실행한 격리 프로세스다. 같은 image를 쓰면 도구 버전을 고정하기 쉽다. |
| Docker Compose | 여러 컨테이너, 네트워크, 볼륨, 환경 변수를 들여쓰기로 구조를 표현하는 설정 형식인 YAML 파일 하나에 선언하고 함께 기동하는 도구. |
| volume | 컨테이너가 재생성돼도 DB 파일 등을 유지하는 Docker 저장 공간. 프로파일별 MySQL volume이 데이터셋 혼입을 줄인다. |
| WSL2 / VM | WSL2는 Windows 위에서 Linux를 실행하는 가상화 계층이고, VM은 Virtual Machine의 약자로 가상 컴퓨터다. Docker Desktop의 Linux 컨테이너는 이 층 안에서 실행된다. |
| Git / commit | Git은 파일 변경 이력을 관리하는 버전 관리 도구이고, commit은 특정 시점의 변경 묶음이다. dirty 상태는 아직 commit하지 않은 변경이 있음을 뜻한다. |
| environment variable | 프로세스 밖에서 이름과 값으로 전달하는 설정. `JWT_KEY`, `K6_BIN`처럼 비밀이나 실행 경로를 코드에 고정하지 않게 한다. |
| Spring profile | 같은 Spring 애플리케이션에서 환경별 설정 묶음을 선택하는 이름. `prod,perf`는 운영형 설정 위에 성능 측정 전용 덮어쓰기를 함께 적용한다. |
| JWT | JSON Web Token. 사용자 신원과 만료 시각 등을 서명해 담는 토큰 형식. 서버는 서명을 검증해 변조 여부를 확인한다. 성능 환경의 긴 무작위 키는 이 서명에 사용된다. |
| HS512 | SHA-512와 공유 비밀 키로 메시지 인증 코드를 만드는 HMAC 방식의 JWT 서명 알고리즘. 수신자는 같은 키로 변조 여부와 발급자를 검증한다. 충분히 긴 무작위 키가 필요하며 암호화와 달리 토큰 내용을 숨기지는 않는다. |
| OAuth2 | 사용자가 Google 같은 외부 제공자에게 로그인한 뒤, 그 권한으로 애플리케이션이 사용자 신원을 확인하게 하는 권한 위임 표준. 현재 부하 경로가 사용하지 않으면 성능 환경에 더미 설정을 둘 수 있다. |
| NEIS | 한국 교육행정정보시스템. 학교·급식 등 교육 데이터를 제공하는 외부 API 문맥에서 쓰인다. 현재 부하 경로가 호출하지 않으면 더미 설정을 사용한다. |
| AWS | Amazon Web Services. 서버·DB·캐시·파일 저장소 등을 인터넷을 통해 제공하는 클라우드 서비스 묶음. |
| S3 | AWS의 객체 저장 서비스. 이미지 같은 파일을 객체 단위로 저장한다. 현재 성능 시나리오가 업로드를 호출하지 않을 때만 더미 설정이 허용된다. |
| BCrypt | 비밀번호를 일부러 계산 비싸게 해 무차별 대입을 어렵게 만드는 단방향 해시 함수. 로그인·가입이 몰리면 CPU 비용이 눈에 띌 수 있다. |
| UTC | 세계 협정시. 시간대가 다른 컴퓨터에서도 실행 시각을 동일하게 식별하기 위해 runId에 사용한다. 한국 표준시는 UTC보다 9시간 빠르다. |
| JDK | Java Development Kit. Java 실행기와 컴파일러, JFR·Mission Control 연계 같은 개발·진단 도구의 기반이다. |
| GUI | Graphical User Interface. 명령줄 대신 창·메뉴·그래프로 조작하는 화면. JDK Mission Control이 예다. |
| EC2 / RDS / ElastiCache | 각각 AWS의 가상 서버, 관리형 관계형 DB, 관리형 Redis·Memcached 서비스다. 운영에서는 로컬 Docker와 자원·네트워크 구조가 다르다. |
| CDN | Content Delivery Network. 여러 지역의 캐시 서버에서 정적 파일을 가까이 전달하는 체계. 자기완결형 리포트는 CDN 연결 없이도 열린다. |

### 관측과 시계열

| 용어 | 상세 설명 |
|---|---|
| observability | 외부 출력인 지표·로그·트레이스를 이용해 시스템 내부 상태를 추론할 수 있는 능력. |
| infrastructure | 애플리케이션이 실행되고 의존하는 기반 계층. 이 문서에서는 컨테이너, JVM, MySQL, Redis, 네트워크, 디스크, 호스트를 묶어 부른다. |
| instrumentation | 코드나 실행 환경에 측정 지점을 심는 행위. Micrometer timer 추가 등이 해당한다. |
| metric | 숫자로 표현한 측정 항목. CPU 사용률, 요청 수, GC 시간 등이 있다. |
| time series | 같은 지표를 시간 순서로 저장한 `(시각, 값)` 기록. |
| scrape | Prometheus가 대상의 현재 지표를 주기적으로 읽는 행위. |
| exporter | 외부 시스템의 상태를 Prometheus 지표 형식으로 변환해 노출하는 프로그램. |
| label | Prometheus 시계열을 구분하는 키·값. 같은 metric 이름도 label이 다르면 다른 시계열이다. |
| tag | k6 요청에 붙이는 분류값. feature, op, phase 등이 있다. 역할은 label과 비슷하지만 k6 문맥에서 부르는 이름이다. |
| cardinality | label/tag 값 조합의 가짓수. 지나치면 시계열 수와 메모리가 폭발한다. |
| counter | 재시작 전까지 누적 증가하는 지표. 현재값보다 `rate`와 `increase`로 구한 구간 변화가 중요하다. |
| gauge | 오르내리는 현재 상태 지표. active connection, 현재 메모리 등이 해당한다. |
| histogram | 값을 여러 구간으로 나누어 각 구간의 누적 개수를 저장하는 분포 지표. |
| bucket | histogram의 한 구간. 예: 100ms 이하 요청 수. |
| PromQL | Prometheus Query Language. rate, increase, histogram_quantile 같은 함수로 시계열을 질의한다. |
| remote-write | k6가 자기 지표를 Prometheus 쓰기 API로 밀어 넣는 방식. 사후에 임의 시간 창을 다시 분석하게 해 준다. |
| stale marker | 실행이 끝난 시계열이 더 이상 현재값이 아님을 Prometheus에 알리는 표식. 없으면 마지막 VU 값이 잠시 계속 보일 수 있다. |
| null / `—` | 측정할 값이 없거나 수집하지 못했다는 뜻. 실제로 0건 발생한 `0`과 다르다. |
| Prometheus | 숫자 지표를 label이 붙은 시계열로 저장하고 PromQL로 질의하는 관측 데이터베이스. 이 시스템의 서버·컨테이너·k6 지표를 한 시간축에 모은다. |
| Grafana | Prometheus 같은 데이터 원본을 그래프와 표로 시각화하는 대시보드 도구. 리포트의 링크는 실행 구간을 미리 맞춘 화면을 연다. |
| Spring Actuator / Micrometer | Actuator는 실행 중 Spring 앱의 health와 지표 HTTP 주소를 열고, Micrometer는 JVM·서버 계측값을 Prometheus 형식으로 연결한다. |
| cAdvisor / node-exporter / hostprobe | 각각 컨테이너 자원, WSL2 Linux VM 전체, Windows 호스트 상태를 측정한다. 서로 보는 경계가 달라 수치를 합산하면 안 된다. |

### CPU·메모리·운영체제

| 용어 | 상세 설명 |
|---|---|
| CPU core | 명령을 실행하는 논리적 처리 단위. 컨테이너의 `2 CPU`는 시간 할당량 기준일 수 있다. |
| cgroup | Linux가 프로세스 그룹의 CPU·메모리 사용량을 제한하고 회계하는 기능. Docker 자원 제한의 기반이다. |
| CPU quota | 일정 주기마다 컨테이너가 사용할 수 있는 CPU 시간 할당량. |
| CFS throttling | quota를 다 쓴 컨테이너를 다음 주기까지 강제로 멈추는 현상. 꼬리 지연을 만들 수 있다. |
| saturation | 자원 수요가 한계에 가까워져 더 많은 일을 즉시 처리하지 못하는 상태. |
| headroom | 현재 사용량과 한계 사이의 여유. 작은 부하 증가를 대기 없이 받을 수 있는 영역. |
| queue | 즉시 처리되지 못한 일이 순서를 기다리는 대기열. |
| working set | 최근 실제로 사용되어 쉽게 회수하기 어려운 메모리 집합. 컨테이너 OOM 위험 판단에 사용한다. |
| RSS | 물리 메모리에 올라온 프로세스 페이지 크기. 공유 페이지 처리 등 때문에 working set과 정확히 같지 않다. |
| OOM | Out Of Memory. 메모리 부족으로 할당 실패 또는 강제 종료가 발생한 상태. |
| I/O | 디스크·네트워크 등 외부 장치와 데이터를 주고받는 작업. CPU 계산과 달리 대기 시간이 크다. |
| iowait | CPU가 디스크 I/O 완료를 기다리는 데 소비된 시간 비율. |
| context switch | CPU가 실행 스레드를 교체하면서 레지스터와 실행 상태를 저장·복원하는 작업. |
| run queue | CPU를 사용할 준비가 되었지만 차례를 기다리는 스레드 목록. |
| hypervisor | 한 물리 머신에서 가상 머신을 실행·스케줄링하는 계층. Hyper-V는 Windows에 포함된 Microsoft의 hypervisor이며 WSL2를 실행한다. |

### JVM·서버·데이터 계층

| 용어 | 상세 설명 |
|---|---|
| JVM | Java Virtual Machine. Java 바이트코드를 실행하고 메모리·스레드·GC를 관리한다. |
| heap | Java 객체가 만들어지는 JVM 메모리 영역. `-Xmx`가 최대 크기를 정한다. |
| non-heap | 클래스 메타데이터, JIT 코드 캐시 등 heap 밖 JVM 메모리. |
| GC | 사용하지 않는 객체를 찾아 heap 공간을 회수하는 작업. |
| STW | Stop-The-World. GC 등으로 애플리케이션 스레드가 모두 잠시 멈추는 구간. |
| live data | GC 후에도 참조가 남아 살아 있는 객체의 크기. 반복해서 오르면 누수 후보다. |
| allocation | 새 객체를 위해 heap 공간을 배정하는 일. 할당률이 높으면 GC 압력이 커진다. |
| promotion | Young 영역에서 살아남은 객체가 Old 영역으로 이동하는 것. |
| JIT | 실행 중 자주 쓰는 바이트코드를 기계어로 컴파일하는 JVM 최적화. |
| JFR | JVM 내부의 CPU·할당·락·스레드 이벤트를 기록하는 진단 기능. |
| Tomcat | 이 Spring Boot 앱의 HTTP 서버. worker thread가 요청을 처리한다. |
| connection pool | DB 연결을 매번 새로 만들지 않고 미리 보관했다가 빌려 주는 구조. |
| HikariCP | Spring Boot가 기본적으로 사용하는 고성능 JDBC connection pool. |
| JDBC | Java 애플리케이션이 관계형 DB에 연결하고 SQL을 실행하는 표준 API. |
| DB / relational DB | DB는 Database의 약자다. 관계형 DB는 데이터를 행과 열의 테이블로 저장하고 SQL로 조회·변경하며 테이블 간 관계를 정의한다. |
| MySQL / InnoDB | MySQL은 이 프로젝트의 관계형 DB 서버이고, InnoDB는 MySQL 안에서 트랜잭션·행 잠금·버퍼풀을 제공하는 기본 저장 엔진이다. |
| SQL | 관계형 DB의 데이터를 정의·조회·변경하는 언어. `SELECT`는 조회, `LIKE`는 문자열 패턴 비교, `OFFSET`은 앞쪽 결과 행을 건너뛰는 절이다. |
| transaction | 여러 DB 작업을 하나의 성공·실패 단위로 묶는 것. 오래 열면 락과 커넥션을 오래 잡는다. |
| row lock | 여러 트랜잭션이 같은 DB 행을 동시에 바꾸지 못하도록 거는 잠금. |
| deadlock | 트랜잭션들이 서로 가진 락을 기다려 영원히 진행할 수 없는 상태. DB가 하나를 롤백해 해소한다. |
| buffer pool | InnoDB가 데이터와 인덱스 페이지를 메모리에 보관하는 캐시. |
| slow query | 설정한 시간보다 오래 실행된 SQL. 이 환경의 기준은 100ms다. |
| full scan | 인덱스로 범위를 줄이지 못하고 테이블이나 인덱스 대부분을 훑는 실행 방식. |
| N+1 | 목록 쿼리 1번 뒤 각 항목마다 추가 쿼리 N번을 보내 총 N+1회가 되는 비효율. |
| Redis | 메모리 기반 key-value 저장소. 이 프로젝트에서는 캐시·카운터·랭킹 등에 사용한다. |
| cache hit/miss | 원하는 값이 캐시에 있음/없음. miss면 DB나 원본 계산으로 돌아간다. |
| eviction | Redis가 메모리 한계 때문에 기존 키를 제거하는 일. |
| TTL | 캐시 키의 자동 만료까지 남은 시간. |
| WebSocket | HTTP 요청마다 연결하지 않고 하나의 양방향 연결을 유지하는 통신 방식. 채팅에 사용한다. |
| RTT | Round-Trip Time. 메시지를 보내고 대응 응답을 받을 때까지의 왕복 시간. |
| TTFB | Time To First Byte. 요청 전송 완료 후 첫 응답 바이트를 받을 때까지의 시간. |

### 자동화와 산출물

| 용어 | 상세 설명 |
|---|---|
| CI | Continuous Integration. 코드 변경마다 빌드·테스트를 자동 실행하는 과정. 현재 성능 워크플로는 공식 경로에 설치되지 않아 로컬 도구가 중심이다. |
| artifact | 실행이 남긴 결과 파일. run.json, report.html, JFR, 로그 등이 해당한다. |
| JSON | 키와 값 구조로 데이터를 저장하는 텍스트 형식. `run.json`은 사람이 읽을 수 있지만 주로 기계 처리용이다. |
| HTML | 브라우저가 표시하는 문서 형식. `report.html`과 `history.html`이 해당한다. |
| exit code | 프로세스가 끝날 때 상위 도구에 전달하는 숫자 상태. 이 시스템은 0/1/2/3을 서로 다른 책임으로 구분한다. |
| self-contained report | 외부 CDN·폰트·스크립트 없이 파일 하나만으로 열리는 보고서. 인터넷 장애 중에도 분석할 수 있다. |

---

## 21. 실행 직전·직후 체크리스트

### 실행 직전

- [ ] 질문과 가설을 한 문장으로 적었다.
- [ ] 주 지표와 보호 지표를 정했다.
- [ ] 목적에 맞는 시나리오와 데이터 프로파일을 골랐다.
- [ ] `.env.perf`의 `DATASET_PROFILE`과 명령의 `--dataset`이 일치한다.
- [ ] 모든 핵심 컨테이너가 안정적으로 실행 중이다.
- [ ] 앱 health와 Prometheus targets가 정상이다.
- [ ] 데이터 검증과 스냅샷이 존재하며 guard가 `strict`다.
- [ ] 판정용 rate가 현재 환경의 `HEADROOM` 영역임을 확인했다.
- [ ] Before/After의 env, rate, warmup, hold, loadgen, 캐시 상태가 같다.
- [ ] `--loadgen docker`, remote-write, 대조 bench를 끄지 않았다.
- [ ] 다른 무거운 로컬 작업을 중단했다.
- [ ] `--note`에 목적과 Before/After를 적었다.

### 실행 직후

- [ ] 종료 코드의 뜻을 구분했다.
- [ ] `measurementStatus`가 `MEASURED`다.
- [ ] `saturation.status`가 비교 목적에 맞다.
- [ ] 목표 도착률을 달성했고 dropped iteration이 없다.
- [ ] 오류율과 check 실패를 먼저 확인했다.
- [ ] 기준선 상태와 `seriesHash`, 조건 비교 수준 `exact/degraded/incomparable`을 확인했다.
- [ ] p50/p95/p99와 RPS/TPS를 함께 읽었다.
- [ ] Breakdown에서 기능별 지연과 호출 수를 함께 봤다.
- [ ] Infrastructure와 Grafana에서 같은 시각의 동반 신호를 확인했다.
- [ ] 자동 병목 가설을 확정 원인으로 쓰지 않았다.
- [ ] 반복 결과의 CV와 MDE를 확인했다.
- [ ] 결론에 환경·데이터·부하 조건과 한계를 함께 적었다.

---

## 22. 다음에 읽을 문서

| 목적 | 문서 |
|---|---|
| 이 시스템이 무엇을 측정하고 못 측정하는지 더 깊게 이해 | [perf-measurement-explained.md](perf-measurement-explained.md) |
| 실제 명령 전체와 운영 절차 | [performance/MANUAL.md](../../MANUAL.md) |
| 환경 자원과 Docker 설정의 근거 | [perf-environment-essentials.md](perf-environment-essentials.md) |
| 데이터 생성·분포·검증 | [performance/datasets/README.md](../../datasets/README.md) |
| 기준선·회귀·측정 상태의 설계 | [PERFORMANCE-MANAGEMENT.md](../../PERFORMANCE-MANAGEMENT.md) |
| 지표와 PromQL 원문 | [performance/metrics/README.md](../../metrics/README.md) |
| 현재 결과를 어디까지 믿을 수 있는지 | [perf-trust-levels.md](../planning/perf-trust-levels.md) |
| 포화 상태를 잘못 읽었던 실제 조사 | [perf-session-drift.md](../investigations/perf-session-drift.md) |
| 실험 기록 | [performance/experiments/](../../experiments/README.md) |
| 확인된 병목과 재현법 | [performance/bottlenecks/](../../bottlenecks/README.md) |

이 문서의 최종 완료 기준은 명령을 외우는 것이 아니다. 다음 문장을 실제 runId와 수치로 채워
말할 수 있으면 된다.

> “같은 `<seriesHash>`와 `exact` 조건의 `<데이터셋·부하·측정 구간>`에서 Before와 After를
> 각각 N회 측정했다. 두 세트는 `MEASURED + HEADROOM`이었고 목표 도착률을 달성했다. 주 지표는
> `<값>`만큼 개선됐으며 이 폭은 해당 계열의 MDE `<값>`보다 크다. 오류율·처리량·timeout과
> 데이터 정합성은 악화되지 않았다. 따라서 **이 로컬 조건 안에서** 개선 효과가 있다고
> 판단한다.”
