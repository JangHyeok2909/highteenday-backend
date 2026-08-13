# 2026-08-12 성능 테스트 작업 메모

> 내일 열어보고 바로 작업하기 위한 일회성 메모다.
> 장기 장부처럼 문장과 상태를 엄격하게 관리하지 않아도 된다.
> 헷갈리면 이 문서의 순서대로 진행하고, 끝난 항목에는 체크만 한다.

## 내일의 목표

성능 테스트가 다음 세 질문에 거짓말하지 않게 만드는 것이 목표다.

1. 필요한 지표를 실제로 측정했는가?
2. 이전 실행과 비교할 수 있는가?
3. 테스트가 의도한 사용자와 부하를 만들었는가?

내일 하루에 전부 끝낼 필요는 없다. **T-08을 완성하는 것이 최소 목표**이고, 시간이 남으면
S-10까지 진행한다.

## 현재 출발점

- 브랜치: `personal/localdocs`
- S-01: iteration마다 로그인하던 문제 해결. 시작 로그인 몰림은 보류
- S-02: 인증을 `op:auth`로 분리해 해결 (`cad1cbc`)
- S-02 검증: write p95 `571.4ms → 23.0ms`, 인증 때문에 발생하던 write 거짓 FAIL 제거
- 성능 도구 테스트: 53개 통과
- smoke 데이터: Mac의 perf DB에 생성 완료
- Prometheus: S-02 A/B 실행 당시 미기동. 인프라 비교는 하지 않음

내일 시작할 때 먼저 확인한다.

```bash
rtk git status --short --branch
rtk git log -1 --oneline --decorate
rtk node performance/tools/test/all.js
```

## 한눈에 보는 순서

| 순서 | 항목 | 한 문장 목표 | 오늘 할 가능성 |
|---:|---|---|---|
| 1 | T-08 | 필수 지표가 없으면 PASS가 아니라 `UNMEASURED` | 반드시 |
| 2 | S-10 | 느린 실행도 측정이 정상이면 기준선으로 사용 | 가능하면 |
| 3 | S-03·S-04 | 인기글 1위와 게시판 첫 페이지가 실제로 선택되게 수정 | 다음 |
| 4 | T-04 | 단일 실행과 timeout 상한으로 회귀를 판단하지 않게 수정 | 다음 |
| 5 | S-06 | stress·spike를 open model로 전환 | 그다음 |
| 보류 | S-01·T-03 | 시작 로그인 몰림과 측정 구간 분리 | 나중에 별도 결정 |
| 후순위 | E-01 | 부하 발생기 분리 또는 호스트 오염 기록 | 환경 작업일에 |
| 마지막 | E-23·E-24 | 신뢰할 수 있게 된 판정을 CI에 연결 | 로컬 무결성 완료 후 |

---

## 1. T-08 — 필수 지표 결측을 PASS로 처리하지 않기

### 지금 문제

Prometheus가 꺼져 있거나 익스포터가 죽으면 인프라 값이 비어 있다. 현재 회귀 분석기는 빈 값을
`SKIP`으로 처리하고, FAIL과 WARN만 세기 때문에 최종 결과가 PASS가 될 수 있다.

```text
Prometheus 미응답
  → infra.flat = {}
  → 인프라 규칙 전부 SKIP
  → FAIL 0개
  → PASS
```

“CPU가 정상이다”와 “CPU를 측정하지 못했다”가 같은 결과가 되는 것이 문제다.

### 내가 만들 결과

성능 판정과 측정 상태를 분리한다.

```text
measurementStatus: MEASURED | PARTIAL | UNMEASURED
verdict:           PASS | WARN | FAIL
```

- `MEASURED`: 필수 지표가 모두 있음
- `PARTIAL`: 필수는 있지만 선택 지표 일부가 없음
- `UNMEASURED`: 필수 지표가 없어서 성능을 판정할 수 없음
- 게이트 모드에서 `UNMEASURED`는 종료 코드가 0이면 안 됨
- `--no-gate`에서는 결과를 저장하되 리포트에 `UNMEASURED`를 크게 표시

`UNMEASURED`를 성능 `FAIL`과 같은 뜻으로 쓰지 않는다. 서버가 느린 것이 아니라 시험지를
채점할 수 없다는 뜻이다.

### 먼저 결정할 것

처음부터 모든 인프라 지표를 필수로 만들지 않는다. cAdvisor가 없는 환경에서는 모든 테스트가
영원히 막힐 수 있다. 첫 구현은 작게 시작한다.

추천 정책:

1. k6 핵심 지표는 항상 필수
   - `k6.overall.p95`
   - `k6.overall.p99`
   - `k6.overall.errorRate`
   - `k6.overall.checkRate`
2. `perf` 환경에서 Prometheus 연결 자체는 필수
3. 인프라 세부 지표는 규칙에 `required: true`가 있는 것만 필수
4. `gate:false` 진단 지표는 기본적으로 선택

처음 필수 인프라 지표는 너무 많이 고르지 말고 다음 정도로 시작한다.

- `infra.flat.cpu.throttledPct`
- `infra.flat.mysql.slowQueries`

둘 다 현재 `gate:true`라서 “없어도 괜찮은 값”으로 보기 어렵다.

### 손댈 파일

- `performance/regression/rules.json`
  - 규칙에 `required` 속성 추가
- `performance/tools/lib/regression.js`
  - 필수 결측 목록과 measurementStatus 계산
- `performance/tools/collect.js`
  - Prometheus 미응답을 측정 상태에 반영하고 종료 코드 결정
- `performance/tools/lib/report.js`
  - PASS/WARN/FAIL과 별도로 측정 불가 표시
- `performance/tools/test/regression.test.js`
  - 필수/선택 결측 테스트
- 필요하면 `performance/tools/test/repository.test.js`
  - `UNMEASURED` 실행의 인덱스 저장 검증

### 구현 순서

- [ ] `rules.json` 설명에 `required` 의미 추가
- [ ] `validateRules()`가 `required`를 boolean으로 검증하도록 수정
- [ ] `analyze()`가 `required:true`인데 현재 값이 없는 규칙을 수집
- [ ] 결과에 `measurementStatus`, `missingRequired`, `missingOptional` 저장
- [ ] Prometheus 전체 미응답이면 최소 `UNMEASURED`
- [ ] 리포트 상단에 측정 상태와 빠진 필수 지표 표시
- [ ] 게이트 모드에서 `UNMEASURED`일 때 non-zero 종료
- [ ] `--no-gate`에서는 저장과 리포트 생성을 계속함

### 꼭 넣을 테스트

```text
필수 지표 존재       → MEASURED
선택 지표만 결측     → PARTIAL 또는 MEASURED(정책에 맞게 하나로 고정)
필수 지표 하나 결측  → UNMEASURED
Prometheus 전체 없음 → UNMEASURED
UNMEASURED + gate     → non-zero exit
UNMEASURED + no-gate  → 결과 저장, 상태는 그대로 UNMEASURED
```

현재 `evaluateRule()`의 “값 없음 → SKIP” 동작은 유지해도 된다. 중요한 것은 `analyze()`가
SKIP 중 필수 결측을 따로 세어 최종 측정 상태를 만드는 것이다. SKIP 자체를 전부 FAIL로
바꾸면 선택 지표까지 테스트를 막게 된다.

### 완료 기준

- [ ] Prometheus를 끄고 실행했을 때 리포트가 PASS라고 말하지 않음
- [ ] 빠진 필수 지표 이름이 리포트에 나옴
- [ ] 서버 성능 실패와 측정 불가가 서로 다른 상태로 저장됨
- [ ] 도구 테스트 전부 통과
- [ ] `perf-findings-tools.md`의 T-08 상태와 `perf-review-summary.md` 갱신

### 주의

- `thresholdsPassed`는 k6 threshold 결과다. 여기에 인프라 결측 의미를 억지로 넣지 않는다.
- `verdict=FAIL`만 재사용하면 “서버가 느림”과 “측정기 고장”이 다시 섞인다.
- 모든 지표를 required로 시작하지 않는다.

---

## 2. S-10 — 기준선 자격과 성능 통과 여부 분리 — ✅ 완료 (2026-08-13, 미커밋)

> 실제 구현은 아래 계획과 두 곳에서 다르다. 판단 근거는
> [perf-findings-scripts.md](perf-findings-scripts.md)의 S-10 해결 기록에 남겼다.
> ⑴ **`MEASURED`만 허용하지 않는다** — 참고 지표만 빠진 `PARTIAL`은 기준선으로 쓰고,
> measure 구간을 못 채운 실행(`windowIncomplete`)만 제외한다.
> ⑵ **`measurementStatus` 없는 과거 레코드를 소급 탈락시키지 않는다** — T-08의 결정을
> 유지했다. 실측상 그 레코드들은 조건 미기록으로 comparability에서 이미 탈락하며,
> 소급 탈락시키면 탈락 사유만 덜 유용해진다.
> 계획에 없었지만 함께 고친 것: 사전 필터로 지워진 후보 때문에 리포트가 `first-run`이라고
> 거짓 보고하던 문제(`hadPriorCandidates` 도입), 탈락 사유의 `reasonCode` 구조화와
> 콘솔·HTML 문장 통일, 기준선의 당시 k6/Node 판정 노출.

### T-08 다음에 하는 이유

기준선이 되려면 “빠른 실행”일 필요는 없지만 “정상적으로 측정된 실행”이어야 한다. T-08에서
만든 `measurementStatus`를 기준선 자격에 그대로 사용할 수 있다.

### 지금 문제

`repository.findBaseline()`이 `thresholdsPassed === false`인 실행을 제외한다. 느린 Before가
write p95나 전체 p95를 실패하면 개선 후 결과와 영원히 비교할 수 없다.

```text
느리지만 정상 측정된 Before
  → threshold FAIL
  → 기준선 후보 제외
  → After가 와도 first-run
  → 개선율 없음
```

### 내가 만들 결과

기준선 자격은 다음만 본다.

```text
1. 조건이 비교 가능함
2. 실행 결과가 손상되지 않음
3. 필수 지표가 측정됨(MEASURED)
4. 현재 실행보다 과거임
```

성능 threshold의 PASS/FAIL은 기준선 자격에서 제외한다. 느린 실행도 정확히 측정됐다면 좋은
Before다.

### 손댈 파일

- `performance/tools/lib/repository.js`
  - `thresholdsPassed` 필터 제거
  - `measurementStatus` 기반 필터 추가
- `performance/tools/lib/repository.js`의 `toIndexEntry()`
  - 인덱스에 measurementStatus 저장
- `performance/tools/test/repository.test.js`
  - 기준선 선택 테스트 수정·추가
- `performance/tools/lib/report.js`
  - 기준선 탈락 사유에 측정 불가 표시
- 필요하면 `performance/tools/lib/comparability.js`
  - 성능 판정이 아니라 실행 조건만 비교한다는 경계 유지

### 구현 순서

- [x] 인덱스 엔트리에 `measurementStatus` 추가 (T-08에서 이미 완료)
- [x] `thresholdsPassed !== false` 필터 제거 (죽은 옵션 `includeFailed`도 함께)
- [x] ~~`measurementStatus === 'MEASURED'`만 기준선 후보로 허용~~ → `UNMEASURED`와
      `windowIncomplete`만 제외. 참고 지표 결측 `PARTIAL`은 허용
- [x] 과거 레코드에 measurementStatus가 없을 때 정책 결정
- [x] ~~추천: 과거 레코드는 자동 추측하지 말고 기준선에서 제외~~ → 소급 탈락시키지 않는
      T-08 정책 유지. comparability가 정확한 사유로 걸러낸다
- [x] 탈락 사유를 `reasonCode`로 기록 (`unmeasured` / `window-incomplete` / `conditions`)
- [x] 인덱스 엔트리에 `windowIncomplete` 추가
- [x] `hadPriorCandidates`로 `first-run` 오보 제거
- [x] 기준선의 당시 k6 threshold·Node 판정을 콘솔·HTML에 표시

### 꼭 넣을 테스트

```text
threshold FAIL + MEASURED      → 기준선으로 선택
threshold PASS + UNMEASURED    → 기준선에서 제외
조건 불일치 + MEASURED         → 기준선에서 제외
미래 실행                      → 기준선에서 제외
measurementStatus 없는 과거 값 → 제외 사유 표시
```

기존 테스트 `threshold 미달 실행은 기준선에서 제외된다`는 요구사항이 반대로 바뀐다. 테스트를
삭제만 하지 말고 `threshold 미달이어도 측정이 정상이면 기준선`으로 고친다.

### 완료 기준

- [x] 느린 Before와 개선된 After가 실제로 compared 상태가 됨 (합성 e2e: p95 3800→2200,
      deltaPct -42.1%, 동시에 절대 SLO 500ms 위반으로 gateFailed=true)
- [x] UNMEASURED 실행은 빠르더라도 기준선이 되지 않음
- [x] 기준선이 없을 때 왜 없는지 리포트에 표시 (콘솔·HTML 같은 문장)
- [x] T-02의 데이터셋·부하 조건 비교는 그대로 통과 (기존 테스트 전부 유지)
- [x] S-10 문서와 P0 목록 갱신

---

## 3. S-03·S-04 — 인기 데이터와 첫 페이지 분포 수정

### 지금 문제

현재 `zipfIndex()`는 최소값이 1이라 index 0을 절대 반환하지 않는다.

```javascript
floor(n ^ (u ^ 1.7)) % n
```

그 결과:

- 가장 인기 있는 `posts[0]`이 선택되지 않음
- `zipfIndex(5)`를 쓰는 게시판 목록에서 0페이지가 선택되지 않음
- 캐시·핫 로우·첫 페이지 실험의 트래픽 전제가 틀림

### 중요한 설계 결정

게시글 인기 분포와 게시판 페이지 분포를 같은 함수로 처리하지 않는 것을 추천한다.

- 게시글: 데이터 크기가 50~100,000까지 변하는 hot-data 분포
- 페이지: 0~4의 다섯 값에 대한 명시적인 앞 페이지 편중

페이지까지 Zipf 공식 하나로 처리하면 원하는 비율을 설명하기 어렵다.

추천 구조:

```text
hotPostIndex(n)    → 게시글 인기 분포
frontPageIndex()   → [0, 1, 2, 3, 4] 명시적 가중치
```

페이지 가중치는 먼저 문서로 정하고 구현한다. 예시는 다음과 같지만 임의로 확정하지 않는다.

```text
0페이지 55%
1페이지 20%
2페이지 12%
3페이지  8%
4페이지  5%
```

### 손댈 파일

- `performance/scripts/lib/data.js`
- `performance/scripts/posts.js`
- `performance/scenarios/lib/workload.js`
- 분포 테스트를 둘 위치
  - 실제 샘플러를 Node와 k6 양쪽에서 불러올 수 있게 분리하는 방법 권장
  - 테스트에 알고리즘을 복사하면 구현과 테스트가 함께 틀릴 수 있으므로 금지

### 구현 순서

- [ ] 게시글 hot 분포의 목표를 숫자로 확정
- [ ] 페이지 0~4 목표 비율 확정
- [ ] 게시글 샘플러와 페이지 샘플러 분리
- [ ] `hotPost()`가 index 0을 선택하는지 확인
- [ ] `posts.js`와 `workload.js`의 `zipfIndex(5)`를 페이지 전용 함수로 변경
- [ ] 고정된 대량 표본으로 허용 오차 테스트

### 꼭 넣을 테스트

```text
index 0이 실제 선택됨
모든 값이 0 <= index < n
n=1에서도 0만 반환
페이지 비율이 목표값 허용 오차 안
small/large에서 상위 구간 접근 비율이 지나치게 달라지지 않음
```

### 완료 기준

- [ ] 0페이지 요청이 리포트 또는 카운터에서 확인됨
- [ ] `posts[0]` 접근이 표본에서 확인됨
- [ ] 목표 분포와 실제 표본 결과가 문서에 함께 있음
- [ ] S-03과 S-04를 동시에 해결 처리

---

## 4. T-04 — 반복 측정과 timeout 검열

이 작업은 한 번에 끝내지 말고 두 부분으로 나눈다.

### 4-A. 단일 실행 비교에서 반복 분포 비교로

현재는 Before 한 번과 After 한 번을 비교한다. 자연 편차가 큰 환경에서는 우연히 빠른 실행과
느린 실행을 비교해 회귀라고 부를 수 있다.

이미 있는 `performance/tools/repeatability.js`를 재사용한다.

추천 첫 단계:

- 같은 조건 최소 5회
- 평균보다 중앙값 우선
- CV(변동계수)를 반드시 기록
- 기준선 분산보다 작은 변화는 회귀로 단정하지 않음

처음부터 회귀 엔진을 대규모로 바꾸지 말고, 반복 실행 결과를 하나의 comparison set으로 묶는
데이터 구조부터 정한다.

### 4-B. timeout 값을 실제 지연처럼 비교하지 않기

`60000ms` 근처 p95는 실제 60초 응답이 아니라 클라이언트 timeout 상한에 잘린 값일 수 있다.
이 값은 일반 p95가 아니라 검열된(censored) 실행으로 표시해야 한다.

추천 상태:

```text
latencyStatus: MEASURED | CENSORED
```

`CENSORED`면 p95 개선율 비교를 중지하고 다음을 함께 본다.

- `http_req_failed`
- check 성공률
- timeout 요청 수
- 완료 iteration과 중단 iteration

### 손댈 파일 후보

- `performance/tools/repeatability.js`
- `performance/tools/lib/repository.js`
- `performance/tools/lib/regression.js`
- `performance/scripts/lib/summary.js`
- HTTP 요청 timeout 원인을 잡기 위한 공통 래퍼 또는 custom Counter
- 관련 테스트 파일

### 완료 기준

- [ ] 같은 조건의 반복 횟수와 CV가 결과에 저장됨
- [ ] timeout 상한 지연이 정상 p95와 같은 방식으로 비교되지 않음
- [ ] `CENSORED` 이유와 timeout 수가 리포트에 표시됨

---

## 5. S-06 — stress·spike를 open model로 전환

### 지금 문제

stress와 spike가 `ramping-vus` closed model을 사용한다. 서버 응답이 느려지면 VU가 다음 요청을
늦게 보내므로 서버가 힘들수록 요청 도착률이 떨어진다.

### 범위를 작게 잡기

- stress: open model 전환
- spike: open model 전환
- breakpoint: 이미 `ramping-arrival-rate`, 참고 구현으로 사용
- soak: 사용자 체류를 보는 목적이면 closed model 유지 가능
- chaos/failover: 목적을 다시 확인한 뒤 별도 결정

### 손댈 파일

- `performance/scenarios/stress.js`
- `performance/scenarios/spike.js`
- 참고: `performance/scenarios/breakpoint.js`
- 공통 threshold와 `dropped_iterations` 기록 경로
- `performance/scripts/lib/summary.js`
- 필요하면 리포트와 비교 가능성 조건

### 구현 순서

- [ ] 기존 VU 수를 arrival rate로 그대로 치환하지 말고 현재 정상 RPS를 기준으로 목표율 계산
- [ ] `preAllocatedVUs`, `maxVUs`를 충분히 설정
- [ ] `dropped_iterations`를 저장하고 리포트에 표시
- [ ] 목표 arrival rate와 실제 RPS를 함께 기록
- [ ] spike가 서버 지연 중에도 계획한 요청률을 유지하는지 확인

### 완료 기준

- [ ] stress·spike가 `ramping-arrival-rate` 또는 적절한 arrival-rate executor 사용
- [ ] dropped iteration이 보이지 않는 상태로 숨지 않음
- [ ] 서버 포화 시에도 계획한 요청률과 실제 요청률 차이를 설명할 수 있음

---

## 이번에는 일부러 하지 않는 것

### 시작 로그인 몰림

S-02는 인증을 write에서 분리했지만 전체 HTTP p95에는 시작 로그인 20건이 남는다. 이 문제는
바로 고치지 않는다. 나중에 아래 선택지를 비교해서 결정한다.

- VU 램프업으로 로그인 분산
- VU별 작은 지연
- setup/warmup에서 로그인
- 측정 phase 태그로 시작 구간 제외

### 부하 발생기 분리

E-01은 중요하지만 다른 호스트나 VM이 필요하다. 로컬 판정 로직을 먼저 고친 뒤 환경 작업일에
진행한다.

### CI 연결

E-23/E-24를 먼저 하면 잘못된 판정을 자동화하게 된다. 최소한 T-08과 S-10이 끝난 뒤 한다.

## 내일 마무리할 때

완료한 항목만 실제 장부에 반영한다.

```text
1. 해당 perf-findings 문서 상태 변경
2. perf-review-summary 우선순위 동기화
3. 관련 테스트 실행
4. 원자료가 있으면 run ID 기록
5. 커밋 전 git diff --check
```

```bash
rtk node performance/tools/test/all.js
rtk git diff --check
rtk git status --short
```
