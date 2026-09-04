# EXP-006: HikariCP 풀 크기 10 → 20

> 상태: **부분 완료 — 판정 일부 무효**
> 날짜: 2026-08-29 | 관련: BTL-002(풀/스레드 불균형), BTL-005(댓글 N+1)
> 짝 문서: `performance/docs/investigations/perf-comment-nplus1-diagnosis.md`(1차 판단의 오독 기록)

---

## 1. 목적

리포트가 최상단 경고(score 95)로 올리는 **"DB 커넥션 풀 대기 발생 — 최대 20개 스레드가
커넥션을 기다렸다"** 를 그대로 따라가면 무엇이 달라지는가에 답한다.

개선이 목적이 아니다. **경고가 지목하는 자원을 실제로 늘렸을 때 어떤 지표가 움직이고
어떤 지표가 안 움직이는지**를 확인하는 관찰 실험이다.

## 2. 가설

> **H1**: 풀을 10에서 20으로 올리면 커넥션 대기(`pool.hikariPending`)와 포화 판정
> `NEAR_LIMIT` 은 사라지지만, **응답 p95 는 유의하게 변하지 않는다.** 왜냐하면 기준선
> 실행의 커넥션 획득 대기(`pool.hikariAcquireP95Ms`)가 **0.96ms** 인데 응답 p95 는
> 458.9ms 라서, 풀을 넓혀 회수할 수 있는 시간이 응답시간의 0.2% 뿐이기 때문이다.

- **반증 조건**: 풀 20에서 p95 가 기준선 CV(56.7%) 밖으로 내려가면 기각한다.
  그 경우 `acquireP95` 가 못 재는 대기가 있다는 뜻이며 새 조사 대상이 된다.

### 사전 등록한 예측

실행 전에 적었다. 결과를 보고 해석을 만들지 않기 위한 장치다.

| # | 예측 | 근거 |
|---|---|---|
| P1 | `hikariActive.avg` 는 1.36 근처로 **불변** | 커넥션 사용량 = 도착률 × 점유시간. 풀 크기와 무관 |
| P2 | `pending.max` 가 0 이 된다 | 대기줄 길이는 풀 크기에 직접 의존 |
| P3 | 포화 판정이 `HEADROOM` 이 된다 | 기준선의 `NEAR_LIMIT` 사유가 `hikariPending >= 1` 하나뿐 |
| P4 | p95 는 유의하게 안 변한다 | 회수 가능한 대기가 0.96ms |
| P5 | `efficiency.appCpuMsPerReq` 불변 | 하는 일의 양이 그대로 |
| P6 | `mysql.threadsConnected.max` 11 → **21** | 고정 크기 풀 20 + exporter 1 |

P6 은 안전장치다. `pool.hikariMax` 는 앱이 스스로 보고하는 값이라 "설정은 읽었지만
실제로는 안 쓴다"를 못 거른다. **DB 쪽에서 연결 수가 정확히 10개 늘어야** 물리적 반영이다.

## 3. 배경

`application.properties` 에 `spring.datasource.hikari.maximum-pool-size` 가 없어
HikariCP 기본값 10이 쓰이는 반면, 같은 파일 60행이 `server.tomcat.threads.max=400` 이다.
이 불균형이 BTL-002 로 기록돼 있고, BTL-002 의 "개선 전 선행 조건 ④" 가
**"Before 가 10이었다는 사실을 기록에 남길 것"** 을 요구한다. 이 실험이 그 기록이다.

`performance/docs/investigations/perf-comment-nplus1-diagnosis.md` 는 같은 경고를 1차 판단에서 병목으로 읽었다가
기각한 과정을 담고 있다. 이 실험은 그 기각을 **실측으로 확인**하려는 것이다.

## 4. 테스트 환경

| 항목 | Before | After |
|---|---|---|
| `run.json` 이 기록한 커밋 | `f915176e` | `d1f97cd` |
| **실제로 돈 바이너리** | **`environment-app` 이미지, 2026-08-14 빌드** | **동일** |
| 환경 이름 | `perf` | `perf-pool20` |
| 데이터셋 | medium, 스냅샷 `medium-20260816-062210` | 동일 |
| 캐시 상태 | cold (매 실행 FLUSHALL) | 동일 |
| 풀 크기 | 10 | **20** |
| 실행 수 | 5 | 3 |
| 실행 시각(KST) | 2026-08-25 23:53 ~ 08-26 00:44 | 2026-08-29 19:30 ~ 20:06 |

**두 세트는 같은 바이너리로 돌았다.** `run.json` 의 커밋 필드가 다른 것은 그 필드가
컨테이너가 아니라 작업 트리의 git HEAD 를 기록하기 때문이다 — 9.3 절에서 다룬다.

## 5. 실행 방법

```bash
# 노브 주입 (docker-compose.perf.yml 의 app.environment 에 아래 한 줄을 추가해 둠)
#   SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE: ${HIKARI_MAX:-10}
# .env.perf 에 HIKARI_MAX=20 을 넣고 앱 컨테이너만 재생성한다.
#
# --no-deps 필수. .env.perf 의 DATASET_PROFILE 이 large 인데 실제 기동 중인
#   perf-mysql 은 perf-mysql-data-medium 볼륨을 물고 있다. 서비스 이름 없이
#   `up -d` 를 치면 컴포즈가 MySQL 을 large 볼륨으로 재생성해 데이터셋이 바뀐다.
docker compose -f environment/docker-compose.perf.yml --env-file environment/.env.perf up -d --no-deps app

# 반영 확인 — 앱과 DB 양쪽에서 본다
curl -s localhost:18080/actuator/metrics/hikaricp.connections.max            # 20
docker exec perf-mysql mysql -uroot -pperfroot -N -e "SHOW STATUS LIKE 'Threads_connected'"  # 21

# 측정 — Before 세트(reports/repeatability/perf-2026-08-26T00-44-58.json)와 플래그 동일
node tools/repeatability.js scenarios/normal-day.js --runs 3 --rate 4 \
  --warmup 180 --hold 5m --dataset medium --loadgen docker --reset restart \
  --env perf-pool20 --note "EXP-006 A: pool 10->20 — KI-27 Before 세트와 동일 조건"

# 원복
# .env.perf 에서 HIKARI_MAX 줄 삭제 후 위 up -d --no-deps app 재실행
```

## 6. 측정 지표

기준선 5회의 변동계수(CV)를 먼저 계산해 **판정에 쓸 수 있는 지표를 골랐다.**
p95 는 기준선 CV 가 56.7% 라 단독 판정축으로 쓸 수 없다.

| 역할 | 지표 | 기준선 CV | 판정 기준 |
|---|---|---:|---|
| 1차 | `pool.hikariAcquireP95Ms` | **1.4%** | 대기가 실제로 있었는지 |
| 1차 | `pool.hikariPending.max` | (발생 1/5회) | 0 이 되는지 |
| 1차 | `saturation.status` | (NEAR_LIMIT 1/5회) | HEADROOM 이 되는지 |
| 보조 | `efficiency.appCpuMsPerReq` | 9.3% | 요청당 앱 CPU |
| 보조 | `efficiency.dbCpuUsPerQuery` | 6.5% | 쿼리당 DB CPU (경합 감지) |
| 보조 | `mysql.threadsConnected.max` | **0%** | 설정의 물리적 반영 |
| 참고 | p95 | **56.7%** | 단독 판정 불가 |

## 7. 결과

> 원자료: `reports/runs/normal-day-2026-08-29T10-30-28`, `...T10-43-08`, `...T10-56-00`
> 반복 정밀도: `reports/repeatability/perf-pool20-2026-08-29T10-56-21.json`
> 기준선: `reports/repeatability/perf-2026-08-26T00-44-58.json`

### 7.1 커넥션 풀 — 노브는 의도대로 작동했다

| 지표 | Before (n=5) | After (n=3) | 예측 |
|---|---|---|---|
| `pool.hikariMax` | 10 | 20 | — |
| `mysql.threadsConnected.max` | 11 · 11 · 11 · 11 · 11 | **21 · 21 · 21** | **P6 적중** |
| `pool.hikariPending.max` | 0 · **20** · 0 · 0 · 0 | **0 · 0 · 0** | **P2 적중** |
| `saturation.status` | HEADROOM 4 / **NEAR_LIMIT 1** | **HEADROOM 3/3** | **P3 적중** |
| `pool.hikariAcquireP95Ms` | 0.96 | 0.95 | — |
| `pool.hikariTimeouts` | 0 | 0 | — |
| `pool.hikariActive.avg` | 1.36 (CV 22%) | 1.92 (CV 35%) — 개별 2.4 · 2.2 · 1.15 | **P1 미결** |

**회수한 대기 시간은 0.01ms 다.** 커넥션을 받는 데 원래 1ms도 안 걸리고 있었다.
그런데 그 1ms 때문에 5회 중 1회가 `NEAR_LIMIT` 으로 판정되고, 리포트는
"최대 20개 스레드가 커넥션을 기다렸다"를 score 95 경고로 최상단에 올렸다.

### 7.2 지연 — 사용자 체감은 그대로

| 지표 | Before (n=5) | After (n=3) |
|---|---|---|
| p95 개별값 | 388 · **921** · 345 · 335 · 306 | 452 · 414 · 359 |
| p95 평균 / 중앙값 / CV | 458.9 / 345.1 / **56.7%** | 408.0 / 414 / 11.5% |
| p99 평균 | 1,942.7 (CV 13.1%) | 2,193.5 (CV 2.8%) |
| 평균 / 중앙값 | 86.9 / 5.65 | 87.5 / 5.80 |
| RPS / 오류율 | 17.54 / 0% | 17.29 / 0% |

After 3개 값이 **전부 Before 범위(306~921) 안**에 들어간다. 평균이 458.9 → 408.0 으로
11% 내려간 것처럼 보이지만 Before 평균은 921 하나가 끌어올린 값이고 중앙값은 345 다.
**After 에서 가장 빠른 실행(359)도 Before 중앙값보다 느리다.** P4 채택.

### 7.3 엔드포인트별 — 무엇이 사라졌고 무엇이 안 변했나

p95, 단위 ms.

| 엔드포인트 | Before 개별값 | After 개별값 | 성격 |
|---|---|---|---|
| `comment_list` | 2184 · 1906 · 1725 · 1866 · 1830 | **2227 · 2281 · 2176** | 병목. 오히려 +17% |
| `board_list` | 8 · **37** · 10 · 9 · 9 | 9 · 9 · 10 | Redis 캐시. 산발적 튐이 사라짐 |
| `hot_daily` | 20 · **109** · 25 · 24 · 30 | 26 · 28 · 27 | 상동 |
| `post_detail` | 10 · 19 · 14 · 14 · 13 | 13 · 14 · 15 | 변화 없음 |
| `post_list` | 36 · 39 · 30 · 35 · 35 | 36 · 39 · 38 | 변화 없음 |
| `notif_unread_count` | 11 · 10 · 12 · 12 · 11 | 12 · 12 · 11 | 변화 없음 |

**풀 확대의 실제 효과가 여기 보인다.** Before 의 `board_list 37ms`·`hot_daily 109ms` 는
커넥션 대기가 있었던 그 한 실행(`00-06-28`)에서 나온 값이다. 캐시 조회 경로인데도
느려졌던 것은 **풀이 모든 요청이 공유하는 자원이기 때문**이다. 풀 20 에서는 3회 모두
이 튐이 없다.

그러나 그 튐은 전체 p95 에 거의 기여하지 않았다. 전체 p95(459ms)를 지배하는 것은
전체 요청의 25%를 차지하면서 p95 가 1,900ms 인 `comment_list` 다.
**풀 확대는 실재하는 효과를 냈지만, 그 효과가 사용자 체감 지표를 못 움직였다.**

### 7.4 자원 — 예측 P5 위반처럼 보이는 값

| 지표 | Before (n=5) | After (n=3) | 변화 |
|---|---:|---:|---:|
| `efficiency.appCpuMsPerReq` | 43.97 (CV 9.3%) | 49.04 (CV 7.9%) | **+11.5%** |
| `efficiency.dbCpuUsPerQuery` | 107.08 (CV 6.5%) | 120.54 (CV 1.5%) | **+12.6%** |
| `cpu.cores.avg` | 0.76 | 0.84 | +10.0% |
| `mysql.cpuCores.avg` | 0.53 | 0.60 | +13.2% |
| `mysql.qps` | 5,105.9 | 5,101.7 | −0.1% |
| `mysql.threadsRunning.max` | 4.40 | 4.67 | +6.1% |
| `mysql.abortedConnects` | 0 | 0 | — |

쿼리 수는 그대로인데 **같은 일에 CPU 를 10~13% 더 썼다.** 이것만 보면 "풀을 넓혀
동시성이 늘어 경합이 생겼다"로 읽힌다. 9절에서 이 해석을 기각한다.

## 8. 그래프

Grafana(measure 구간 고정 링크)는 각 실행의 `run.json` → `links` 에 있다.

## 9. 병목 분석 — 무엇이 이 비교를 무효로 만드는가

### 9.1 데이터셋은 배제됐다 (측정으로 확인)

Before 는 8월 26일, After 는 8월 29일이다. 그 사이 여러 실행이 데이터를 썼다.
그런데 두 세트의 실행 직전 상태 지문이 **바이트 단위로 같다.**

| | Before | After |
|---|---|---|
| `datasetFingerprint` | `sha256:aae4bccfae5e` | `sha256:aae4bccfae5e` |
| `stateBefore` | `sha256:ffe696d17416` | `sha256:ffe696d17416` |
| `stateCoreBefore` 21개 항목 | 차이 0개 | 차이 0개 |

`--reset restart` 가 매 실행 전 스냅샷을 복원하기 때문이다. **추측이 아니라 측정으로
배제된 후보다.**

### 9.2 호스트 CPU 가 17% 느렸다 — 7.4 절을 과잉 설명한다

매 실행 직전 기록되는 유휴 CPU 벤치(고정 계산의 소요 ms, 클수록 느림):

| | Before 5회 | After 3회 |
|---|---|---|
| `cpuBench.single` | 5357 · 4960 · 4924 · 5024 · 5682 | **6049 · 6038 · 6114** |
| 평균 | 5,189ms | **6,067ms (+16.9%)** |
| `cpuBench.ctxswitch` 평균 | 2,276ms | 2,604ms (+14.4%) |

**After 3개 값이 Before 5개 값 전부보다 느리다. 겹치는 구간이 없다.**
CPU 가 16.9% 느리면 같은 일에 CPU 시간이 그만큼 더 든다. 관측된 상승폭(앱 +11.5%,
DB +12.6%)은 그보다 **작다.** 벤치로 나눠 정규화하면 앱 −4.6%, DB −3.7% 로 노이즈 범위다.

`comment_list` p95 가 +17% 인 것도 같은 크기다(CPU −16.9% ↔ 지연 +17%).

> **주의 — E-50 과의 관계.** E-50(`performance/docs/findings/perf-findings-environment.md`)은
> "실행 직전 벤치와 앱 p95 의
> 상관이 r = −0.006" 이므로 측정 시각을 고정할 필요가 없다고 결론지었다. 그 결론은
> 여기서도 유효하다 — CPU 가 17% 느린 날에도 p95 는 기준선 범위 안에 그대로 들어왔다.
>
> 다만 **7.4 절이 쓰는 지표는 p95 가 아니라 CPU 시간이다.** 둘은 성질이 다르다.
> p95 는 포화 이하에서 대기·스케줄링이 지배하므로 클럭에 둔감하다. 요청당 CPU 시간은
> "코어를 몇 ms 점유했나"이므로 클럭에 직접 비례한다. **같은 벤치가 한 지표에는
> 무의미하고 다른 지표에는 필수 보정이다.** E-50 은 "벤치를 보지 말라"가 아니라
> "p95 판정에 벤치를 끌어들이지 말라"로 읽어야 한다.
>
> 정규화 자체는 **추론이다.** 벤치는 단일 스레드 CPU 속도를 재는 값이고 요청 처리에는
> 메모리 접근과 컨텍스트 스위치가 섞여 있어 1:1 비례가 보장되지 않는다.

### 9.3 앱 바이너리는 같았다 — 커밋 필드가 측정된 코드를 가리키지 않는다

`run.json` 의 커밋이 `f915176e` → `d1f97cd` 로 달라서 처음에는 **"바이너리가 44커밋
다르므로 지연 비교가 무효"** 로 판단했다. **그 판단이 틀렸다.**

컨테이너를 확인하면 이렇다.

```
perf-app 이미지 : environment-app:latest, 생성 2026-08-14 13:41 KST (이 하나뿐)
컨테이너 안 jar : app.jar, Aug 14 04:41

jar 안 클래스 검색
  QueryCountFilter   : 0건   ← 없음
  QueryMetricsConfig : 0건   ← 없음
  CommentController  : 2건
```

**이미지는 8/14 이후 한 번도 다시 만들어지지 않았다.** 그래서 Before(8/26)도
After(8/29)도 같은 jar 을 돌렸다. 커밋 `d29d9eb` 이 추가한 엔드포인트별 쿼리 수
계측(`QueryMetricsConfig`)은 **양쪽 실행 어디에도 없었다** — After 에 계측 한 겹이
더 얹혔다는 앞선 서술은 사실이 아니다.

원인은 명령의 차이다.

| 명령 | 컨테이너 | 이미지 | 코드 |
|---|---|---|---|
| `docker restart perf-app` (`--reset restart` 가 쓰는 것) | 껐다 켬 | 그대로 | **그대로** |
| `docker compose up -d app` | 설정 바뀌면 재생성 | **기존 것 재사용** | **그대로** |
| `docker compose up -d --build app` | 재생성 | 다시 빌드 | 새 코드 반영 |

풀 크기 20 은 **환경변수**라 컨테이너 재생성만으로 반영됐고(MySQL `Threads_connected`
11 → 21 로 확인), 코드는 이미지 안에 있어 따로 놀았다.

**남는 문제는 더 크다.** `run.json` 의 `run.commit` 은 실행 시점의 **작업 트리 git HEAD**
를 기록할 뿐, 컨테이너가 무엇을 돌리는지와 무관하다. 8/26 실행도 `f915176e` 로 적혀
있지만 실제로는 8/14 코드였다. **저장된 모든 실행의 커밋 메타데이터가 측정된 코드를
가리키지 않는다.** 계측 결함으로 별도 등록한다(발견 장부 `T-##`).

### 9.4 결론 — 무엇이 유효하고 무엇이 무효인가

| 판정 | 유효한가 | 이유 |
|---|---|---|
| P6 연결 수 11 → 21 | **유효** | 설정의 물리적 반영. 커밋·CPU 와 무관 |
| P2 대기줄 소멸 | **유효** | 풀 크기의 직접 귀결 |
| P3 포화 판정 소멸 | **유효** | 판정 사유가 P2 하나뿐 |
| 7.3 캐시 경로 튐 소멸 | 개연적 | 기전은 명확하나 Before 표본 1건에 근거 |
| P4 p95 무변화 | **유효** | 바이너리·데이터셋 동일. 남는 교란은 CPU 속도뿐이고, 그건 p95 에 전달되지 않는다(E-50, r=−0.006) |
| P5 자원 비용 | **무효** | 호스트 CPU 16.9% 저하와 풀 효과를 분리할 수 없다 |
| P1 `hikariActive.avg` | **미결** | n=3, 개별값 2.4·2.2·1.15 로 갈림 |

**여기서 한 실수를 명시해 둔다.** 8월 26일 세트와 8월 29일 세트를 손으로 나란히 놓았고,
저장소 README 는 "사람이 리포트 두 개를 손으로 나란히 놓는 것은 못 막는다 — 실제로
그렇게 틀렸다"고 이미 적고 있다. **도구는 그렇게 하지 않았다** — `comparability`
판정이 `incomparable` 이었고 사유는 `environment: perf → perf-pool20` 이다.

그런데 그 판정이 잡아낸 것은 **내가 붙인 이름표**이지 실제 위험이 아니었다. 진짜로
확인해야 했던 것은 "같은 코드가 돌았는가"인데, 비교 조건 목록(blocking: `scenario`
`environment` `dataset` `loadProfile` `loadgen` `measurementProfile` / degrading:
`loadBench` `remoteWrite` `scriptVersion`)에 **앱 바이너리가 아예 없다.** 이름표를
그대로 뒀다면 두 세트는 같은 계열로 묶여 한 추세선에 그려졌을 것이고, 도구는 아무
경고도 하지 않았을 것이다.

## 10. 개선

**없음 — 관찰 실험.** 풀 크기는 측정 후 기본값 10으로 원복했다
(연결 수 21 → 11, 볼륨 `perf-mysql-data-medium` 유지 확인).

저장소에 남긴 변경은 `environment/docker-compose.perf.yml` 의 한 줄뿐이다.

```yaml
SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE: ${HIKARI_MAX:-10}
```

기본값이 HikariCP 자체 기본값과 같은 10이라, 변수를 주지 않으면 이전 모든 실행과
동일하게 돈다.

## 11. 재실험 (Before / After)

**두 세트는 같은 바이너리·같은 데이터셋에서 쟀다**(9.1·9.3 절). 남는 교란은 호스트
CPU 16.9% 저하 하나이고, 그것은 CPU 시간 계열 지표에만 전달된다(9.2 절).

| 지표 | Before (pool 10) | After (pool 20) | 변화 |
|---|---:|---:|---:|
| RPS | 17.54 | 17.29 | −1.4% |
| P95 | 458.9ms (중앙값 345.1) | 408.0ms | 판별 불가 (CV 56.7%) |
| P99 | 1,942.7ms | 2,193.5ms | +12.9% (CV 13.1% 안) |
| Error Rate | 0% | 0% | — |
| `hikariAcquireP95Ms` | 0.96ms | 0.95ms | −0.01ms |
| `hikariPending.max` | 20 (1/5회) | 0 (3/3회) | 소멸 |
| `saturation` NEAR_LIMIT | 1/5회 | 0/3회 | 소멸 |

## 12. 결론

**H1 채택.** 풀을 10에서 20으로 올리자 커넥션 대기와 포화 경고는 사라졌고
(`pending.max` 20 → 0, `NEAR_LIMIT` 1/5회 → 0/3회), 응답 p95 는 기준선 범위 안에
그대로 머물렀다(408.0ms, 기준선 306~921ms).

**회수한 대기 시간은 0.01ms 다.** 경고가 가리키던 대기의 실제 크기가 응답 p95 459ms 중
1ms 였다. 이 실험이 확인한 것은 개선이 아니라 **경고와 원인의 불일치**다.

풀 확대가 아무 효과도 없었던 것은 아니다. 캐시 조회 경로(`board_list` 37ms,
`hot_daily` 109ms)에서 산발적으로 나타나던 튐이 3회 모두 사라졌다. 풀은 모든 요청이
공유하는 자원이라 부족하면 DB 를 거의 안 쓰는 경로까지 같이 느려진다. 다만 그 튐은
전체 p95 에 거의 기여하지 않는다 — 전체 p95 를 지배하는 것은 전체 요청의 25%를
차지하면서 p95 가 1,900ms 인 `comment_list` 이고, 이쪽은 풀과 무관하다(BTL-005).

**남은 한계는 둘이다.** ① 호스트 CPU 가 16.9% 느린 날에 After 를 쟀기 때문에
**자원 비용(P5)의 비교는 무효**다 — 지연(P4)은 CPU 속도에 둔감하므로(E-50) 영향받지
않는다. ② `hikariActive.avg`(P1)는 n=3 으로 갈리지 않아 미결이다.

**그리고 이 실험은 스스로 계측 결함 하나를 드러냈다** — `run.json` 의 커밋 필드가
실제로 측정된 코드를 가리키지 않는다(9.3 절). 이 실험의 비교가 유효한 이유가
"바이너리가 같아서"인데, 그 사실은 저장된 메타데이터가 아니라 컨테이너를 직접
열어 봐야 알 수 있었다.

## 13. 향후 개선

| # | 다음 질문 | 방법 |
|---|---|---|
| 1 | **어떤 코드를 쟀는지 기록에 남기기** | 실행마다 이미지 다이제스트를 `run.json` 에 적고, 비교 조건에 degrading 등급으로 추가. 지금은 작업 트리 HEAD 만 남아 실제 코드를 못 가린다(9.3 절) |
| 2 | `hikariActive.avg` 는 풀 크기와 무관한가 (P1) | pool 20 을 5회로 늘려 리틀의 법칙 검증 |
| 3 | 풀을 **줄이면** 어떻게 되는가 | HikariCP 공식 `코어×2+디스크` = **5**. OSIV 때문에 이 공식의 전제가 깨져 있어, 문서대로 따라간 값이 해로운지 확인 |
| 4 | 대기 지점을 앞으로 옮기면 | `server.tomcat.threads.max` 400 → 100 |
| 5 | 부족을 어떤 모양으로 드러낼지 | `connection-timeout` 30s → 1s. 같은 병목이 지연이 아니라 오류율로 나타나고, **p95 만 보는 게이트는 이걸 개선으로 읽는다**(BTL-002 2절) |

3번은 이 실험의 대조군이 된다. 지금은 "풀이 병목이 아닐 때의 지표"만 있고
**"풀이 진짜 병목일 때의 지표"가 같은 조건에서 잰 것으로는 없다.** 둘이 다 있어야
리포트의 경고 문구가 두 상태를 구분하지 못한다는 것을 보일 수 있다.
