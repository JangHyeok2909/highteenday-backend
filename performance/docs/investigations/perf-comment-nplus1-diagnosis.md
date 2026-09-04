# 댓글 목록 N+1 — 1차 판단의 오독과 수정

> 기준 시점: 2026-08-27
> 답하는 질문: **"run `normal-day-2026-08-26T00-06-28` 리포트에서 병목을 무엇으로 읽었고,
> 그 판단은 왜 틀렸으며, 무엇으로 바로잡았는가?"**
> 성격: **조사 기록.** 병목 자체의 결론은 `performance/bottlenecks/BTL-005`,
> 측정과 판정은 `performance/experiments/EXP-005` 에 있다. **여기에는 판단 과정만 남긴다** —
> 어떤 지표를 어떻게 읽어 어떤 결론에 도달했고, 무엇이 그 결론을 무너뜨렸는가.
> 짝 문서: [perf-request-cost-skew.md](perf-request-cost-skew.md)(E-51 커넥션 풀 스파이크),
> [perf-report-redesign.md](../design/perf-report-redesign.md)(리포트 개선 과제),
> [perf-trust-levels.md](../planning/perf-trust-levels.md)(이 수치로 무엇을 주장할 수 있는가)
> 관련: `performance/bottlenecks/BTL-005-comment-nplus1.md`,
> `performance/experiments/EXP-005-comment-nplus1/README.md`

<!--
이 문서를 쓰는 이유.

이 저장소에는 오판을 지우지 않고 남기는 선례가 이미 둘 있다.
  - perf-session-drift.md   §0.1 "현상은 실재했다. 원인 해석이 틀렸다" / §0.4 "무엇을 잘못했나"
  - perf-request-cost-skew.md §1.1 "처음에는 1회차 효과로 오인했다" / §3 "기각한 원인 후보"
틀린 판단을 지우면 다음 사람이 같은 함정에 다시 빠진다. 그래서 1차 판단을 그대로 남기고,
무엇이 그것을 무너뜨렸는지를 나란히 적는다.

작성 규칙(performance/docs/README.md "발견 항목을 읽는 방법"):
  1. 쉽게 말하면  2. 현재 동작  3. 왜 문제인가  4. 근거(코드 위치·실행 ID·실측값)  5. 필요한 조치
  - 사실 / 추론 / 권고를 섞지 않는다.
  - 지표를 인용할 때는 값만 쓰지 말고 "무엇을 재는 값인지"를 한 번은 풀어 쓴다.
  - 코드를 언급할 때는 파일:라인을 함께 적는다.
-->

---

## 0. 한 줄 결론

<!--
두세 문장. 1차 판단이 무엇이었고, 실제 원인이 무엇이며, 그 둘의 관계(원인/증상)를 적는다.
perf-session-drift.md 의 "한 줄 결론" 문단 길이를 참고하면 된다.
예시 뼈대: "리포트의 OOO 를 보고 XXX 로 판단했다. 실제 원인은 YYY 이고, XXX 는 원인이
아니라 YYY 의 증상이다."
-->

---

## 1. 대상 실행 — 무엇을 보고 판단했나

### 1.1 실행 제원

<!--
판단의 출발점이 된 실행 하나를 특정한다. 나중에 이 문서를 읽는 사람이 같은 자료를
다시 열 수 있어야 한다. 값은 run.json 의 run.* 와 k6.phases.measure 에서 그대로 옮긴다.
-->

| 항목 | 값 |
|---|---|
| run id | `normal-day-2026-08-26T00-06-28` |
| 원자료 | `performance/reports/runs/normal-day-2026-08-26T00-06-28/` |
| 커밋 | |
| note | |
| 부하 모델 | |
| 데이터셋 / 캐시 상태 | |
| measure 구간 | |
| RPS / 오류율 | |
| 지연 avg / med / p95 / p99 / max | |

### 1.2 리포트에서 눈에 들어온 값

<!--
"어떤 화면의 어떤 숫자가 눈에 들어왔는가"를 적는다. 해석은 아직 쓰지 않는다.
이 절이 있어야 §5(왜 그렇게 읽었나)에서 리포트 표현 문제를 짚을 수 있다.
-->

| 지표 | 값 | 어디서 봤나 |
|---|---|---|
| | | |
| | | |
| | | |

---

## 5. 왜 처음에 그렇게 읽었나 — 재발 방지

<!--
개인 실수로 끝내지 않는다. 같은 표현을 보면 다음 사람도 같은 오독을 한다면,
그것은 리포트 쪽에 남길 개선 요구다.
-->

### 5.1 지표 읽기 규칙

<!--
이번에 얻은 규칙을 일반화해서 적는다. "이 지표는 이렇게 읽어야 한다" 형태.
다음 실행에서도 그대로 적용할 수 있을 만큼 구체적이어야 한다.
-->

| 지표 유형 | 잘못된 읽기 | 올바른 읽기 |
|---|---|---|
| | | |
| | | |
| | | |

### 5.2 리포트에 남길 개선 요구

<!--
perf-report-redesign.md 에 이미 "첫 그리드가 포화된 자원을 지목하지 않음" 과제가 있다.
이번 오독이 그 과제의 실사용 증거인지 확인하고, 새 요구가 있으면 여기 적은 뒤
perf-report-redesign.md 에도 같은 결론을 남긴다(README: "같은 결론을 양쪽에 남긴다").
-->

---

## 6. 아직 확정하지 못한 것

<!--
2차 판단도 완전한 확정이 아니다. 무엇이 계측값이고 무엇이 코드를 읽고 세운 모델인지
구분해서 적는다. 이 절을 비워 두면 다음 사람이 모델을 계측값으로 오해한다.

최소한 아래 셋은 검토할 것:
  - 리포트의 "요청당 쿼리 수"는 전체 요청 평균인가, 특정 엔드포인트 값인가
  - 코드에서 세운 쿼리 수 모델을 실제로 계측했는가 (p6spy)
  - 데이터셋 상태가 결과를 낙관적으로 만들지는 않는가 (run.stateCoreBefore 확인)
-->

| # | 확정하지 못한 것 | 왜 아직 아닌가 | 확정 방법 |
|---|---|---|---|
| 1 | | | |
| 2 | | | |
| 3 | | | |

---

## 7. 다음 실험

<!--
EXP-005 는 이미 "상태: 계획"으로 존재하고 가설·반증 조건이 적혀 있다.
여기서는 이 문서가 그 실험에 무엇을 넘기는지만 적는다 — 실험 설계를 여기 복사하지 않는다.

BTL-005 의 선행 조건도 함께 확인할 것:
  ① 부하 테스트보다 코드 레벨 확정이 먼저다 (p6spy 로 요청당 쿼리 수)
  ② 2026-08-18 이전 실행을 Before 로 쓰지 말 것 (S-26)
  ③ 댓글 없는 글이 섞이면 효과가 희석된다 (S-16)
  ④ 대상 글의 댓글 수는 COUNT(*) 로 확인할 것 (E-45)
-->

| 넘기는 질문 | 받는 문서 |
|---|---|
| | `performance/experiments/EXP-005-comment-nplus1/README.md` |
| | `performance/bottlenecks/BTL-005-comment-nplus1.md` |

---

## 8. 재현 방법

<!--
이 문서의 판단을 다른 사람이 다시 밟을 수 있도록 명령만으로 적는다.
리포트 원자료를 여는 방법과, 인용한 지표를 run.json 에서 꺼내는 방법 둘 다.
-->

```bash
# 대상 실행의 원자료
# (명령 채울 것)
```

---

# 부록 A. 원자료 — run `normal-day-2026-08-26T00-06-28`

> **본문을 채울 때 쓰는 재료다.** 아래 값은 `run.json` 에서 직접 추출한 것이므로
> 파싱을 다시 하지 않아도 된다. 필요하면 8절의 명령으로 재확인한다.

## A.1 실행 제원

| 항목 | 값 |
|---|---|
| note | `KI-27 Before — API 축 포함 CV 확정용 5회 (재시작) — repeatability 2/5` |
| 커밋 | `f915176e` |
| 데이터셋 / 캐시 | `medium` / cold |
| 부하 모델 | `ramping-arrival-rate` — 목표 4 iteration/s, 달성률 **99.9%** |
| measure 구간 | 300초, 요청 5,329건, **17.76 RPS**, 오류율 **0%** |
| 지연 (measure) | avg 142 / med **6** / p90 171 / p95 **921** / p99 2,268 / max 14,296 ms |

## A.2 커넥션 풀 — 1차 판단이 무너진 지점

| 지표 | 값 |
|---|---|
| `pool.hikariMax` | 10 |
| `pool.hikariActive` avg / p95 / **max** | 1.85 / 3.35 / **10** |
| `pool.hikariPending` avg / p95 / **max** | 1.0 / 1.0 / **20** |
| `pool.hikariAcquireP95Ms` | **0.98ms** |
| `pool.hikariTimeouts` | 0 |
| `pool.tomcatBusy` avg / max / limit | 3.9 / 31 / 400 |
| saturation `acquireShare` | **0.11%** (p95 중 커넥션 대기 비중) |
| saturation 판정 | **NEAR_LIMIT** — 사유는 "대기 스레드 1" 하나뿐 |

**`max 10` 과 `avg 1.85` 가 같은 실행에서 나온다.** 게이지는 주기적으로 현재값을 찍는
계기판이라 `max` 는 "한 번 이렇게 찍혔다"는 뜻이고, `acquireP95 0.98ms` 는 그 대기줄이
즉시 빠졌다는 뜻이다.

## A.3 쿼리와 행 — N+1 은 맞고 풀스캔은 아니다

| 지표 | 값 | 해석 |
|---|---|---|
| `mysql.qps` | 5,674 /s | RPS 17.76 로 나누면 **요청당 319.4 쿼리** (임계 warn 10 / fail 50) |
| `mysql.rowsReadPerSec` | 4,910 /s | qps 로 나누면 **쿼리당 0.865행** → PK 시크의 지문 |
| `mysql.selectScan` | 997건 (300초 누적) | 총 약 170만 쿼리의 **0.059%** |
| `mysql.selectFullJoin` | **0** | 인덱스 없는 조인 0건 |
| `mysql.tmpDiskTables` | **0** | |
| `mysql.slowQueries` | 759건 | 요청당 0.14건, 전체 쿼리의 **0.045%** |
| `mysql.bufferPoolHitPct` | 99.998% | |
| `disk.readBytesSec` | **0** | 디스크에서 읽은 것이 없음 |
| `mysql.innodbRowLockWaits.max` | 0 | |
| `redis.hitRatioPct` | 99.05% | |

**쿼리당 0.865행이 1 미만인 이유**: 데이터셋의 `comments_reactions` 가 **0건**이라
`existsBy...` 쿼리가 인덱스만 확인하고 **0행**을 반환한다. 그런 쿼리가 댓글당 2개씩 나간다.

## A.4 자원 — 대기가 아니라 일하는 중

| 지표 | 값 |
|---|---|
| 앱 CPU | 0.84 / 2코어 = **42%**, throttle **13.1%**, threadsBlocked **0** |
| 앱 힙 | used max 810MB, GC overhead 0.25%, GC pause max 174ms |
| MySQL CPU | 0.58 / 2코어 = **29%** |
| MySQL threadsRunning avg / max | 2.6 / 5 |
| MySQL threadsConnected / maxConnections | **11** / 200 |
| 호스트 CPU | 8.7% (20코어) |

**`threadsConnected = 11` 은 병목 신호가 아니라 HikariCP 10 + Prometheus exporter 1 이다.**

## A.5 엔드포인트별 지연 — 느린 건 하나뿐

| 엔드포인트 | 건수 | med | **p95** | max |
|---|---|---|---|---|
| **comment_list** | 1,347 | 83 | **1,906** | **18,004** |
| post_update | 16 | 17 | 674 | 2,099 |
| login (BCrypt) | 117 | 84 | 633 | 923 |
| hot_daily | 741 | 11 | 109 | 3,359 |
| post_list | 741 | 3 | **39** | 2,176 |
| board_list | 741 | 3 | **37** | 3,682 |
| post_detail | 2,492 | 5 | **19** | 4,603 |
| notif_unread_count | 168 | 4 | **10** | 1,976 |

(단위 ms)

**풀은 모든 요청이 공유하는 자원이다. 풀이 병목이면 전부 같이 느려져야 하는데 그렇지 않다.**

## A.6 리포트가 스스로 지목한 것

```
[95] DB 커넥션 풀 대기 발생 — 최대 20개 스레드가 커넥션을 기다렸다.
     풀 크기(10)가 동시성 대비 부족하거나, 커넥션 보유 시간이 긴 쿼리가 있다.
[92] HTTP 요청당 쿼리 수 과다 — 요청 1건당 평균 319.4개 쿼리. N+1 패턴 가능성이 높다.
[88] Slow Query 다발 — 요청 1000건당 142.4건 (총 759건).
[85] DB 커넥션 풀 포화 — 풀 사용률이 100%까지 올라갔다.
```

**score 95 항목의 문구가 두 가능성을 병기한다** — "풀 크기가 부족하거나, **커넥션 보유
시간이 긴 쿼리가 있다**". 1차 판단은 앞쪽만 읽었다.

---

# 부록 B. normal-day 27개 실행 비교 — 게이지 읽기의 실증

> **같은 시나리오인데 실행마다 풀 사용 양상이 완전히 다르다.** `max` 만 보면 넷이 같아
> 보이지만 `avg`·`대기`·`획득 p95` 를 함께 보면 성격이 갈린다.

| 실행 | RPS | p95 | 풀 avg / max | 대기 max | 획득 p95 | 판정 |
|---|---:|---:|---:|---:|---:|---|
| 08-19T09-46-07 | 20.6 | 11,006 | **10.0** / 10 | 180 | **6,659ms** | SATURATED |
| 08-19T14-32-46 | 26.9 | 9,998 | **10.0** / 10 | 190 | **5,745ms** | SATURATED |
| 08-25T09-13-14 | 9.3 | 8,250 | **9.25** / 10 | 38 | **3,436ms** | SATURATED |
| 08-25T11-09-17 | 17.5 | 1,057 | 2.1 / 10 | 29 | 73ms | NEAR_LIMIT |
| **08-26T00-06-28** | 17.8 | 921 | **1.85** / 10 | 20 | **0.98ms** | NEAR_LIMIT |
| 08-26T00-19-13 | 17.9 | 345 | 1.4 / 6 | 0 | 1.0ms | HEADROOM |
| 08-26T00-44-37 | 17.0 | 306 | 1.3 / 3 | 0 | 1.0ms | HEADROOM |

**대조점**: 진짜 고갈(08-25T09-13-14)에서는 `board_list` p95 가 **3,941ms** 였다.
같은 Redis 캐시 조회가 00-06-28 에서는 **37ms** 다. **100배 차이가 풀 병목의 지문이다.**

> 재현: `performance/reports/runs/` 의 `normal-day-*/run.json` 에서
> `infra.flat['pool.hikariActive.avg' | '.max' | 'pool.hikariPending.max' |
> 'pool.hikariAcquireP95Ms']` 와 `saturation.status` 를 추출한다.

---

# 부록 C. 코드 경로 — 댓글 M 개당 3M+1 쿼리

```
CommentController.java:36  getComments()
 │
 ├ commentService.getCommentsByPost(post)
 │   └ CommentRepository.java:15
 │       "select c from Comment c where c.isValid=true and c.post=:post"
 │       JOIN FETCH 없음                                            → 쿼리 1
 │
 ├ commentAnonymizationService.anonymize(post, comments)
 │   └ CommentDto.fromEntity(comment)
 │       └ CommentDto.java:50  comment.getUser().getProfileUrl()
 │          Comment.java:23  @ManyToOne(fetch = LAZY), @BatchSize 없음
 │                                                                  → 쿼리 M
 │
 └ CommentController.java:46~55  for 루프 (로그인 사용자일 때)
     └ commentReactionService.getLikeSatateDto(c, user)
         └ CommentReactionService.java:21~27
            existsByCommentAndUserAndKindAndIsValidTrue(LIKE)       → 쿼리 M
            existsByCommentAndUserAndKindAndIsValidTrue(DISLIKE)    → 쿼리 M

합계 = 3M + 1
```

**OSIV 가 커넥션 점유를 요청 전체로 늘린다.** `application.properties` 에
`spring.jpa.open-in-view` 설정이 없어 Spring Boot 기본값 `true` 다. 조회 경로에
`@Transactional` 이 없으므로 각 쿼리는 짧은 autocommit 트랜잭션이지만, **커넥션은 요청이
끝날 때까지 스레드에 묶인다.** 그래서 `커넥션 사용량 = RPS × 응답시간` 이 성립한다.

검산: `1.85 ≈ 17.76 RPS × 0.104초`. 실측 `hikariActive.avg = 1.85` 와 일치한다.

## 개선 후보 (BTL-005 문서의 표와 같음)

| 후보 | 효과 | 트레이드오프 |
|---|---|---|
| `findByPost` 에 `join fetch c.user` | M 개 제거 | 컬렉션 fetch 시 페이징과 충돌 주의 |
| 반응 조회를 `where comment_id in (:ids) and user_id = ?` 한 방으로 | 2M 개 제거 | 결과를 Map 으로 재조립해야 함 |
| `default_batch_fetch_size=100` 전역 | 최소 수정 최대 효과 | 1+N/100 으로 남음 (완전 제거 아님) |
| QueryDSL DTO 프로젝션 | 엔티티 로드 자체 제거 | 코드량 증가 |

**둘을 다 적용하면 3M+1 → 2 가 된다.**
