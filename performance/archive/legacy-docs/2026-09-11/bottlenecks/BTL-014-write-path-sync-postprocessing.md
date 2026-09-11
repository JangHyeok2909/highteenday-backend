# BTL-014: 쓰기 경로가 응답에 필요 없는 일을 동기로 기다린다

> 유형: Event / DB (커밋)
> 상태: 의심 — 두 원인의 몫을 아직 가르지 못했다
> 관련: OPT 미착수

## 증상

쓰기 엔드포인트의 응답 시간이 **DB 에서 쓴 시간으로 설명되지 않는다.**

| 엔드포인트 | 쿼리/요청 | DB 시간 | 응답 시간 | **비-DB 시간** | 비-DB 비중 |
|---|---:|---:|---:|---:|---:|
| `POST /api/posts/{postId}/comments` | 8.0 | 3.55ms | 41.66ms | **38.11ms** | **91%** |
| `POST /api/posts/{postId}/reaction` | 11.3 | 5.81ms | 28.17ms | 22.36ms | 79% |
| `POST /api/posts` | 4.0 | 2.29ms | 23.89ms | 21.59ms | 90% |

비교 대상으로 읽기 엔드포인트는 비-DB 시간이 3~5ms 다(`GET /api/posts/{postId}` 4.95ms,
`GET /api/boards` 3.60ms). **쓰기만 한 자릿수가 다르다.**

k6 측정으로도 같은 그림이다. `comment_create` 는 **최솟값이 24.1ms, 중앙값 38ms** 로
절반 이상이 30ms 를 넘는다.

## 원인

두 후보가 있고, **둘 다 코드에서 확인되지만 각각의 몫은 아직 측정하지 않았다.**

### 후보 A — 응답에 필요 없는 후처리를 요청 스레드가 기다린다

`CommentCreatedEvent` 에 리스너가 둘 붙어 있는데 **둘 다 `@Async` 가 없다.**

- `eventListeners/NotificationEventListener.java:17` — `@TransactionalEventListener(AFTER_COMMIT)`.
  알림을 만든다: 사용자 2명 조회 + 알림 저장 + WebSocket 발행.
- `eventListeners/HotPostEventListener.java:17` — 같은 방식. 인기글 점수를 갱신한다:
  게시글 조회 + Redis ZADD.

`@TransactionalEventListener` 는 **동기가 기본**이다. `AFTER_COMMIT` 은 "커밋 뒤에"를
뜻할 뿐 "다른 스레드에서"를 뜻하지 않는다. 그래서 댓글을 하나 만들면 클라이언트는
알림 저장과 인기글 점수 갱신이 **끝날 때까지 기다린 뒤에야** 응답을 받는다.

둘 다 클라이언트가 응답으로 받아 가는 값이 아니다.

### 후보 B — 커밋 fsync 가 '비-DB 시간'에 숨는다

실행 중인 MySQL 설정이다.

```
innodb_flush_log_at_trx_commit = 1
sync_binlog                    = 1
log_bin                        = ON
```

커밋 한 번에 fsync 두 번이다. 그리고 **댓글 생성은 커밋을 두 번 한다** —
본 트랜잭션 하나, 그리고 `NotificationService.createCommentNotification` 이
`@Transactional(propagation = REQUIRES_NEW)`(`NotificationService.java:35`)라 알림 저장이
별도 트랜잭션으로 한 번 더. 즉 **요청 하나에 fsync 4회**다.

**이 시간이 지표에서 보이지 않는 이유가 계측 구조에 있다.** `QueryCountListener` 는
p6spy 의 `onAfterAnyExecute`·`onAfterExecuteBatch` 만 받는다(`metrics/QueryCountListener.java:39`).
커밋은 문장 실행이 아니라 `Connection.commit()` 이라 **어느 콜백에도 걸리지 않고**,
결과적으로 `http.server.query.time` 에 안 잡힌 채 응답 시간에만 남는다.

## 영향

- 전체 요청의 **약 3.7%** 가 이 세 엔드포인트다. 그중 30ms 를 넘는 것이 약 626건으로,
  느린 요청 전체(4,053건)의 **15.4%** 다.
- 쓰기가 늘수록 선형으로 커진다. 지금 부하 모델은 도착률 4/s 의 읽기 위주라
  **쓰기 비중이 높은 시간대(등교 직후·시험 기간)에는 더 크게 나타날 수 있다.**
- 후보 A 가 사실이라면 **장애 전파 경로**이기도 하다. Redis 가 느려지면 인기글 점수
  갱신이 늦어지고, 그 지연이 그대로 댓글 작성 응답 시간이 된다.

## 재현 방법

```bash
# 1) 엔드포인트별 DB 시간 vs 응답 시간 — 비-DB 몫을 본다
node tools/perf-run.js scenarios/normal-day.js --dataset medium --warmup 180
node -e "const r=require('./reports/runs/<실행ID>/run.json');
  r.infra.endpointQueries.endpoints
    .filter(e=>e.endpoint.startsWith('POST'))
    .forEach(e=>console.log(e.endpoint, 'db='+e.dbMsPerRequest.toFixed(2),
                            'resp='+e.responseMsPerRequest.toFixed(2)));"

# 2) 후보 A 의 몫만 분리 — 리스너를 @Async 로 바꾸고 같은 명령을 다시 돌린다
#    줄어든 만큼이 A, 남는 것이 B
```

관찰 지표: `http.server.queries` / `http.server.query.time`(엔드포인트별),
`efficiency.dbCpuMsPerReq`.

## 해결 방법

| 후보 | 효과 | 트레이드오프 |
|------|------|--------------|
| **리스너에 `@Async`** | 알림·인기글 갱신이 응답에서 빠진다. 코드 변경이 작고 세 엔드포인트에 동시에 걸린다 | **① 실패가 조용해진다** — 지금은 예외가 요청 스레드에 올라오지만 비동기로 가면 삼켜진다. 실패 로깅·재시도를 같이 설계해야 한다. **② 계측이 새어 나간다** — `QueryCountRecorder` 는 "한 요청은 한 스레드"를 전제로 동기화 없이 동작한다(`QueryCountRecorder.java:13`). 비동기 경로의 쿼리는 요청에 귀속되지 않고 `db.queries.outside.request` 로 빠진다 |
| 알림 저장의 `REQUIRES_NEW` 제거 | 커밋이 2회에서 1회로 줄어 fsync 절반 | `AFTER_COMMIT` 리스너는 이미 커밋된 트랜잭션 밖에서 돈다 — 새 트랜잭션 없이 저장하려면 리스너 위치나 전파 설정을 바꿔야 하고, **알림 실패가 댓글 작성을 롤백시키는지**가 달라진다. 정합성 결정이 먼저다 |
| `sync_binlog=0` 또는 `innodb_flush_log_at_trx_commit=2` | fsync 제거로 커밋이 크게 빨라진다 | **내구성을 버리는 선택이다.** 장애 시 마지막 커밋들이 사라진다. 성능 실험 환경을 실제 운영과 다르게 만들면 측정의 의미도 함께 사라진다 — **권하지 않는다** |
| 계측 개선 (p6spy `onAfterCommit` 으로 커밋 시간 별도 측정) | 최적화가 아니라 **가르는 도구**다. 후보 B 의 몫을 숫자로 만든다 | 지표가 하나 늘고 리포트를 손봐야 한다 |

**순서는 계측 → 분리 → 개선이다.** 지금은 38ms 중 A 와 B 의 몫을 모른다. 그 상태에서
`@Async` 를 넣으면 효과가 나와도 "무엇이 얼마나"를 말할 수 없다. 재현 방법 2번(리스너만
비동기화하고 재측정)이 가장 싼 분리 실험이므로 그것부터 하고, 커밋 비용이 크다고 나오면
계측(`onAfterCommit`)을 만든다.
