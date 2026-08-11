# 발견 사항 — 분석 도구 파이프라인 (performance/tools/)

리뷰 일자: 2026-08-05. 라인 번호는 당시 HEAD 기준 — 코드가 바뀌면 어긋날 수 있다.

## CRITICAL

### T-01. infra 규칙 25/32개가 한 번도 작동한 적 없음 — 상태: **해결** (2026-08-05, 미커밋)
> `pick()`을 "남은 경로 전체가 키로 존재하면 우선" 방식으로 수정. 회귀 테스트 추가
> (tools/test/regression.test.js). 실측 검증: 문제의 normal-day 런 재분석 시 skipped 25→0,
> throttling·hikari 게이트 6건 FAIL 정상 발동. **저장된 과거 런의 판정은 여전히 옛 결과** —
> 필요 시 `node tools/collect.js --all --force --no-wait`로 재판정.
`tools/lib/regression.js:30-32`의 `pick()`은 `'infra.flat.saturation.cpuPct'`를 점 단위로
중첩 탐색하지만, `infra.flat`은 **키 자체에 점이 든 평면 맵**(`'saturation.cpuPct'`)이다
(metrics-catalog.js:477-489, collect.js:90-91). 결과: 모든 infra 규칙이 `undefined` → SKIP.
실증: `normal-day-2026-08-05T09-39-43/run.json`은 `counts={total:32, fail:5, skipped:25}`,
infra 비교 전부 "현재 값 없음" — 같은 파일의 `infra.flat`에는 `cpu.throttledPct=99.98`,
`pool.hikariTimeouts=5316`, `pool.hikariPending.max=205`가 실존. 게이트인
throttledPct/slowQueries/hikariTimeouts는 **탄생 이래 발동 불가능**이었다.
`bottleneckHints`(regression.js:239-245)는 브래킷 접근이라 정상 동작 — 리포트가
"CPU throttling 발생"이라 말하면서 회귀 표는 "값 없음"인 자기모순 상태.

### T-02. 기준선 선택이 dataset/VU/duration을 무시 — 상태: **해결** (2026-08-09, 미커밋)
> `tools/lib/comparability.js` 신설 — 실행 조건(conditions)을 일급 개념으로 분리하고
> 등급(blocking/degrading)을 선언적으로 정의. `findPrevious` → `findBaseline`으로 교체:
> "직전 실행"이 아니라 "비교 가능한 가장 최근 실행"을 고르고, 탈락 후보와 사유를 함께 반환.
> `analyze`의 scriptVersion 사후 강등 특수 분기를 이 메커니즘으로 흡수. 실측 검증:
> 같은 조건 → 비교, 부하/데이터셋 변경 → 상대 비교 생략 + 사유 표시, 스크립트만 변경 → 경고 후 비교.
>
> 함께 처리한 것:
> - **부하 프로파일을 실제로 기록** — `exec.test.options.scenarios`(k6가 해석 완료한 선언 값).
>   `handleSummary(data)`의 `data.options`에는 summaryTrendStats/summaryTimeUnit/noColor 3개뿐이라
>   부하 설정이 없다(실측 확인).
> - **`vusMax`를 조건으로 쓰지 않음** — 관측값이라 arrival-rate(`scenarios/breakpoint.js`)에서
>   서버가 느려질수록 올라간다. 조건으로 쓰면 회귀가 심할수록 기준선이 탈락해 게이트가 열리는
>   역전이 생긴다. 회귀 테스트로 고정(`tools/test/comparability.test.js`).
> - **`baselineStatus` 신설** (compared/incomparable/first-run) — 조건이 엄격해지면 기준선 없는
>   실행이 흔해지는데, 그게 조용한 PASS로 새면 고치기 전보다 나쁘다. 절대 게이트는 계속 돈다.
> - **`recentRuns` 계열 분리** — 리뷰에 없던 같은 결함. 추세 그래프가 small/15VU와 large/200VU를
>   한 선에 섞고 있었다.
>
> 남은 것: 데이터셋 시드 매니페스트 해시(프로파일 이름만으로는 다른 `seed.js`가 만든 `large`를
> 구분 못 함), 인프라 스펙 해시(`docker-compose.seed.yml`의 HikariCP 50 / sync_binlog=0을
> 되돌리지 않은 채 측정하는 실패 모드). 둘 다 conditions 표에 한 줄씩 추가하면 된다.
> **저장된 과거 런은 조건이 없어 기준선 후보에서 제외된다** — 의도된 동작(사용자 결정).

`tools/lib/repository.js:203-214` `findPrevious`는 scenario+environment+`thresholdsPassed!==false`만
필터. `toIndexEntry`가 `dataset`·`vusMax`를 저장하는데(124, 130행) 사용하지 않는다.
실증: normal-day large/200VU/1650s 런이 small/15VU/545s 런(`normal-day-2026-08-04T06-38-42`)을
기준선으로 판정됨. p95 101ms→60001ms가 "회귀"로 보고됐지만 실제로는 13× 부하 + 100× 데이터.

## HIGH

### T-03. `--warmup`이 infra 윈도우만 자름 — 상태: 미해결
`collect.js:200-204`는 Prometheus 조회 구간만 트림. k6 p95/errorRate는 전체 구간.
같은 리포트의 두 숫자가 다른 시간대를 설명한다. warmup 값은 `infra.window`에만 남고
인덱스·기준선 비교에는 반영 안 됨 — warmup이 다른 런끼리 비교하면 increase() 계열
카운터(gc.count, slowQueries)가 윈도우 길이 차이만큼 가짜 개선/악화를 보인다.

### T-04. N=1 비교 + 타임아웃 검열 미감지 — 상태: 미해결
단일 런 vs 단일 런 비교이고 분산 측정이 없다(rules.json:19의 "반복 실행 편차 근거" 주장은
구현 안 됨). 노이즈 플로어가 절대값이라 저RPS 시나리오에선 상대 게이트가 사실상 꺼진다
(실증: RPS -17.3%가 "변화 0.92 < 하한 1.00"으로 PASS). p95=60000.96은 k6 60s 타임아웃에
잘린 검열값 — 이후 10배 더 나빠져도 변화 0%로 PASS. errorRate 0.558 + checkRate 0.443이라는
페어 신호가 있는데도 게이트 로직은 검열을 인지하지 못한다.

### T-07. scriptVersion이 진입 파일만 해시 + 스크립트 변경 시 게이트 전면 해제 — 상태: 미해결
`perf-run.js:88-95`는 시나리오 파일만 SHA-256. `scripts/lib/session.js`, `data.js`,
`config.js`, `scenarios/lib/workload.js` — 실제 요청 믹스가 사는 곳 — 은 미포함.
반대로 `regression.js:183-188,200`은 `scriptChanged`면 FAIL→WARN으로 강등: 시나리오에
주석 한 줄만 추가해도 진짜 실패하는 빌드가 게이트를 통과한다. `--strict` 같은 오버라이드 없음.

### T-08. 결측 지표 ⇒ SKIP ⇒ 사실상 PASS — 상태: 미해결
`regression.js:67-71` 현재값 null이면 SKIP, `analyze()`(171-178행)는 FAIL/WARN 수만 본다.
`collect.js:212-214` Prometheus 접속 불가 ⇒ `infra.flat={}` ⇒ verdict PASS, exit 0.
익스포터 하나가 죽어도 동일. "게이트 지표를 평가할 수 없었다"는 상태가 없다.

### T-14. perf-run이 수집 대상을 알파벳순으로 선택 — 상태: **해결** (2026-08-05, 미커밋)
> perf-run이 실행 전후 스테이징 diff로 runId를 식별해 collect에 직접 전달.
> 결과 파일 부재(k6 급사) 시 수집을 건너뛰고 실패 종료. collect의 무인자 선택도
> 사전순 → 파일 mtime 기준으로 변경(newestByMtime).
`perf-run.js:173-177`은 runId 없이 collect를 실행하고, `collect.js:248-250`은
`pending[pending.length-1]`, `repository.js:59-67`은 `[...ids].sort()` — **사전순이라
시나리오 이름이 지배**한다. 수집 실패한 `timetable-*` pending 런 하나가 이후 모든
auth/boards/comments/posts 런의 결과를 영구 하이재킹한다. 동시 실행 2개도 같은 충돌.

### T-15. index.json 비원자적 쓰기 + 파싱 실패 시 이력 소멸 — 상태: **해결** (2026-08-05, 미커밋)
> writeJson temp+rename 원자화. loadIndex는 "파일 없음(빈 이력)"과 "손상(예외 + rebuild 안내)"을
> 구분 — 손상을 빈 이력으로 대체하던 조용한 소멸 제거. history.js --rebuild 복구 경로는 유효 확인.
`repository.js:45-48` 단순 writeFileSync(temp+rename 없음), `saveRun`은 전체 read-modify-write.
`loadIndex`(161-165행)는 파싱 실패 시 `{runs:[]}` 반환 → 다음 saveRun이 런 1개짜리 새 인덱스로
덮어씀 → 이력 조용히 소멸 → findPrevious null → "첫 실행" 처리 → 게이트 통과.
`rebuildIndex`(226-238행)는 수동 전용이며 실행 시 전 런을 시간순 재번호 — `run.json`의
번호와 어긋난다(collect.js:193-195는 번호 보존).

### T-16. 실패 삼킴 + exit 코드 오류 — 상태: **해결** (2026-08-05, 미커밋)
> collect: --all 포함 수집 실패 1건 이상이면 exit 2. perf-run: col.error 검사 추가,
> status null(시그널 종료)을 0으로 새지 않게 처리, --no-collect 경로도 동일.
> --wait/--warmup NaN 즉시 거부.
`collect.js:276-279`: `--all`에서 전 런 실패해도 exit 0 (`targets.length===1`일 때만 exit 2).
`perf-run.js:180`: collector가 시그널로 죽으면 `col.status===null` → `process.exit(null)` → **0**.
`col.error` 미검사. k6가 handleSummary 전에 죽으면 staged 파일이 없는데 이를 단언하는
코드가 없어 무관한 pending 런을 수집한다.

## MEDIUM

### T-17. promoteStaged가 기록 저장 전에 실행 — 상태: **해결** (2026-08-05, 미커밋)
> 승격을 saveRun·리포트 기록 이후 마지막으로 이동 — repository.js 주석("수집 성공 후에만
> 승격")과 코드가 이제 일치.
`collect.js:230-235`: staged k6.json을 saveRun/renderReport **전에** 이동.
repository.js:85-86 주석("수집 성공 후에만 승격")과 코드가 다르다. renderReport가
던지면(비래핑) staged는 이미 사라짐 — 복구가 우연히만 동작.

### T-18. PromQL 품질 문제 묶음 — 상태: 미해결
- `increase(...[$RANGE])`는 외삽 추정치인데 count로 취급 (실증: slowQueries=839.155…)
- `rate(...[$RANGE])`는 전구간 평균 — 램프 구간이 지배, 피크 은폐. `*Max` 변형은 규칙에서 미사용
- 서브쿼리 해상도 기본 15s(evaluation_interval) vs 스크레이프 5s — max/p95가 피크를 계통 과소평가.
  `cpu.cores.*`는 `rate[1m]` 하드코딩이라 10초 CPU 고정이 안 보임 — saturation.cpuPct의 분자
- 컨테이너 매칭 `name="perf-app"` + `max()` 폴드 — 재시작 시 카운터 합산 누락, Compose v2
  프리픽스 환경에선 전부 null → SKIP → PASS
- MySQL/Redis 쿼리에 job/instance 셀렉터 없음 — 다른 익스포터가 있으면 합산 오염
- `redis.hitRatioPct`: 트래픽 0일 때 0%로 계산되어 "캐시 붕괴" 오경보 (clamp_min(x,1) 편향)

### T-19. 도구 테스트 0개, package.json 없음, lint 없음 — 상태: **부분 해결** (2026-08-05, 미커밋)
> performance/package.json + tools/test/ 도입 (`npm test`, node:test, 28개).
> pick/evaluateRule/analyze/validateRules/writeJson/loadIndex/breakdown/convert 커버.
> lint 및 나머지 모듈(report/history/promql) 테스트는 미도입.
`evaluateRule`, `findPrevious`, `trendStat`, `computeDerived`, `pick` 전부 순수 함수인데
테스트가 하나도 없다. `analyze()` 결과의 infra 비교가 SKIP이 아님을 단언하는 테스트
하나면 T-01이 잡혔다. CI를 게이트하는 도구가 스스로는 게이트되지 않는다.

### T-20. 구버전 판정 시스템 공존 — 상태: **해결** (2026-08-05, 미커밋)
> compare.js·thresholds.json 삭제, summary.js의 reports/raw 이중 기록 제거,
> tools/README·regression/README 갱신. reports/raw 기존 파일은 이관 이력용으로 유지.
`compare.js`+`thresholds.json`(p95 +10%)과 `regression.js`+`rules.json`(warn 10/fail 20)이
서로 다른 기준으로 공존. compare.js는 존재하지 않는 `regression/baseline.json`을 요구해
사실상 사문(死文)인데 `summary.js:210`이 여전히 raw summary를 계속 쓴다.

### T-21. 중복 구현 — 상태: 미해결
migrate-raw.js가 summary.js 파싱 로직의 포크(동일 정규식 포함). 증감률 계산이 4곳에
서로 다른 컷오프로 구현(regression.js/report.js×2/history.js). fmtNum vs format.num 불일치.
TREND_METRICS 목록 2벌 수동 유지.

### T-22. 시나리오 무관 단일 rules.json — 상태: 미해결
`regression.js:165-168`이 모든 런에 동일 32규칙 적용. stress/spike/breakpoint/chaos는
p95>500ms·오류>1%를 넘는 게 **목적**인데 둘 다 게이트라 구조적 FAIL 확정.
습관성 `--no-gate` 사용을 유발해 진짜 게이트까지 무력화될 위험.

### T-23. 게이트 선택이 진단 가치와 반대 — 상태: 미해결
게이트인 infra 3개(throttling/slowQueries/hikariTimeouts)는 T-01로 작동 불능이었고,
자원 문제를 정확히 가리키는 `saturation.hikariPct`, `pool.hikariPending.max`,
`saturation.tomcatPct`, `saturation.heapPct`는 전부 비게이트. 실증 런: hikariPending 205,
타임아웃 5316인데 k6 지연으로만 게이트됨. `k6.breakdown.*`을 다루는 규칙은 0개.

### T-24. 강상관 지표 5개 동시 게이트 — 상태: 미해결
avg/p95/p99/tps/rps는 같은 현상의 상관 측정치 — 검출력은 거의 안 늘고 오탐률만 곱해진다
(규칙당 FP 5%면 런 레벨 ~25%). errorRate 절대 warn이 0.001(1000건 중 1건)로 과민,
반면 slowQueries는 2배가 되어야 FAIL이고 4→400 점프는 minBaseline=5에 걸려 SKIP.

### T-25. counts.skipped 의미 오류 — 상태: **해결** (2026-08-05, 미커밋)
> counts를 skipped(평가 불가: 값 미수집)와 suppressed(판정 생략: 노이즈 억제)로 분리,
> 리포트 문구도 둘을 구분해 표기. 평가 불가 > 0이면 익스포터 점검 안내 표시.
`regression.js:206`은 verdict==='SKIP'만 세는데, 노이즈 억제는 PASS+skipped 문자열로 남는다.
report.js:509는 skipped를 "노이즈 하한 미만"이라 설명 — 실제 25개는 전부 "값 없음"이었다.

## LOW

### T-26. rules.json 무검증 — **해결** (2026-08-05, 미커밋)
> validateRules 도입 — key 부재, 미지 direction, fail<warn 역전, 비숫자 임계값을 즉시 예외 처리.
> 현행 rules.json 통과 확인.
오타 key, 미지 direction, warn>fail 역전 모두 무경고 통과. T-01을 숨긴 바로 그 실패 모드.

### T-27. history.js 엣지 케이스 — 미해결
이전 중앙값 0이면 추세 자체를 드롭(0→80 슬로우쿼리 같은 최중요 전이 은폐).
시나리오만으로 그룹핑 — dataset/VU/환경이 한 추세로 합산되어 자기 각주와 모순.

### T-28. 런 번호 전역·경쟁·불안정 — 미해결
동시 수집 시 중복 번호, rebuild 시 재번호로 run.json과 불일치.

---

## 2026-08-06 추가 조사 — MySQL 내부 지표

### T-29. [HIGH] Prometheus에 이미 오는 락·트랜잭션·풀스캔 지표가 카탈로그에 미등록 — 상태: 미해결

**증상.** `performance/tools/lib/metrics-catalog.js:221`의 mysql 그룹에 등록된 지표는 9개뿐이다
(maxConnections, slowQueries, qps, qpsMax, bufferPoolHitPct, rowsReadPerSec, abortedConnects,
threadsRunning, threadsConnected, innodbRowLockWaits). 그런데 **Prometheus는 이미 더 많은 것을
수집하고 있다** — 익스포터 설정을 바꿀 필요도, 새 수집 경로를 만들 필요도 없다.
카탈로그에 등록만 안 돼 있어서 안 쓰이는 것뿐이다.

**왜 심각한가.** `localDocs/`의 병목 카탈로그에서 **BTL-003(인기글 카운터 락 경합)이 "확정"**
상태다 — 실측 데드락까지 재현됐다고 기록돼 있다. 그런데 시스템에 **락 대기 시간 지표가 없다.**
현재 있는 `innodbRowLockWaits`는 `Innodb_row_lock_current_waits`, 즉 "지금 이 순간 대기 중인 수"
라 순간 스냅샷일 뿐이고, 구간 누적 대기 시간을 알 수 없다. 자기가 확정했다고 선언한 병목을
측정할 수단이 없는 상태다. EXP-003을 시작하면 바로 막힌다.

**2026-08-06 실측 검증 완료.** 아래 PromQL은 전부 실제 값을 반환하는 것을 확인했다.

| 추가할 key | PromQL | 왜 |
|---|---|---|
| `mysql.rowLockTimeMs` | `increase(mysql_global_status_innodb_row_lock_time[$RANGE])` | 구간 누적 락 대기 (검증: 295) |
| `mysql.rowLockTimeMaxMs` | `max_over_time((mysql_global_status_innodb_row_lock_time_max)[$RANGE:])` | 최악 단일 대기 (검증: 84) |
| `mysql.commits` | `increase(mysql_global_status_commands_total{command="commit"}[$RANGE])` | 실제 트랜잭션 수 |
| `mysql.rollbacks` | `increase(mysql_global_status_commands_total{command="rollback"}[$RANGE])` | 데드락·충돌의 간접 신호 (검증: 0) |
| `mysql.fullScanRows` | `increase(mysql_global_status_handlers_total{handler="read_rnd_next"}[$RANGE])` | **풀스캔 지표** (검증: 47,215,458 — 상당히 크다) |
| `mysql.tmpDiskTables` | `increase(mysql_global_status_created_tmp_disk_tables[$RANGE])` | 정렬/그룹핑이 메모리를 넘침 (검증: 0) |

**주의.** `mysql_global_status_innodb_deadlocks`는 **존재하지 않는다**(0개 시리즈). MySQL 8 기본
상태변수에 없다. 데드락 횟수를 직접 세려면 익스포터의 `--collect.engine_innodb_status`가 필요하고
(→ E-39), 그 전까지는 롤백 수로 간접 추정해야 한다.

**부수 사실.** `created_tmp_disk_tables`는 `performance/PERFORMANCE-MANAGEMENT.md` §10에서
"지표를 하나 추가하려면"의 **예시로 쓰인 바로 그 지표**다. 예시로만 적혀 있고 실제 추가는 안 됐다.

**비용.** 카탈로그 파일 한 개에 6줄. 수집 오버헤드 0(이미 오고 있다). 30분 작업.

**선행 조건.** T-08(게이트 지표 결측 처리)을 먼저 정하는 게 안전하다 — 방침 없이 지표를 늘리면
그 지표가 어떤 환경에서 결측일 때 또 조용히 SKIP→PASS 된다. T-01과 같은 함정을 늘리는 셈이다.
rules.json에 락 대기 규칙을 넣을지도 T-08 결정 후에.
