# 데이터셋 상태 고정 — 스냅샷과 상태 지문

> 대상 독자: 이 저장소의 성능 측정 시스템을 처음 보는 개발자
> 관련 코드: `tools/lib/dbstate.js` · `tools/snapshot.js` · `tools/lib/guard.js` ·
> `tools/lib/conditions.js` · `tools/perf-run.js` · `perf.config.json`

---

## 1. 이 장치가 막는 사고

성능 실행 두 개를 비교하려면 **같은 것을 잰 실행인지** 먼저 판정해야 한다. 그 판정은
`tools/lib/comparability.js`가 하고, 판정에 쓰는 값을 **실행 조건(conditions)** 이라 부른다.
데이터셋도 그 조건 중 하나다.

이 장치가 들어오기 전, 데이터셋 조건은 두 값뿐이었다.

```js
{ profile: 'large', fingerprint: 'sha256:bb5fdd9cb816' }
//  프로파일 이름          meta.json 의 생성 지문
```

둘 다 **생성 시점에 결정되어 그 뒤로 변하지 않는다.** 그래서 다음이 통과한다.

```text
1) large 데이터셋을 만든다.                          지문 bb5fdd9cb816
2) write-heavy 를 200 VU 로 15분 돌린다.
   → 게시글·댓글·반응이 수만 건 늘어난다.
3) 다시 write-heavy 를 돌린다.                       지문 여전히 bb5fdd9cb816
4) 비교 시스템: "같은 데이터셋이군" → 두 실행을 비교한다.
```

3번은 2번보다 **행이 수만 개 많은 DB**에서 출발했다. 인덱스 깊이, 페이지 수, 카운터 값,
캐시 적중률이 전부 다르다. 그런데 조건은 같으므로 그 차이가 **코드 성능 변화로 보고된다.**

실제로 일어났던 일이다. 옛 `large` DB에는 시더가 만들지 않은 채팅 메시지 482건이 후속
테스트로 쌓여 있었고, 프로파일 이름과 지문은 그대로였다(발견 항목 S-11, E-44).

---

## 2. 해결 구조 — 축을 하나 더 만든다

기존 지문을 바꾸지 않고 **두 번째 축**을 얹었다. 둘은 다른 질문에 답하므로 합치면 안 된다.

| 축 | 답하는 질문 | 계산 시점 | 출처 |
|---|---|---|---|
| `generation` (기존) | 어떤 규칙·어떤 생성기로 만들었나 | 시딩 직후 1회 | `datasets/generated/<profile>/meta.json` |
| **`state` (신규)** | **실행이 시작될 때 무엇이 들어 있었나** | **실행 직전마다** | `tools/lib/dbstate.js` |
| **`snapshot` (신규)** | 어느 불변 사본에서 출발했나 | 복원 시 | `datasets/snapshots/<id>/snapshot.json` |

```text
generation 지문 (기본 축, 항상 켜짐)
        │  생성기·샘플러가 바뀌면 여기서 비교가 막힌다
        ▼
state 지문 (스위치로 켜고 끔)
        │
        ├─ 스냅샷 지문과 일치 → 그대로 실행
        └─ 불일치           → 볼륨 복원 → 재계산 → 일치 확인 후 실행
```

---

## 3. 상태 지문 — 무엇을 세는가

### 3.1 계산 방식: 집계 지문

`tools/lib/dbstate.js`의 `computeState()`가 `docker exec perf-mysql mysql` **한 번**으로
아래 값을 전부 읽고, 키를 정렬해 이어 붙인 문자열을 SHA-256으로 해싱한다(앞 12자 사용).

```
core:<table>.count   활성 행 수      COUNT(*) WHERE is_valid=1
core:<table>.maxId   PK 최댓값       MAX(pk)          ← is_valid 로 거르지 않는다
core:posts.sum*      비정규화 카운터 합계
```

대상 테이블 13개는 부하가 실제로 건드리는 것들이다.

```
users, posts, comments, posts_reactions, comments_reactions, scraps,
friends, friends_requests, chat_rooms, chat_participants, chat_messages,
notifications, medias
```

`medias`만 `is_valid` 컬럼이 없어 `COUNT(*)` 전체를 센다(스키마를 확인하고 넣은 값이지
추측이 아니다). `posts`는 추가로 `PST_comment_count`·`PST_like_count`·
`PST_dislike_count`·`PST_scrap_count`의 합을 넣는다 — 행 수가 같아도 카운터가 어긋나면
다른 상태다. KI-53이 정확히 그 상황이었다(댓글 행은 맞는데 저장된 카운터가 13,284 부족).

**버린 대안 — 전수 해시.** 모든 행의 체크섬을 뜨면 더 정확하지만 100만 행에서 수 분이
걸린다. 이 값은 실행마다 **두 번**(전·후) 계산되므로 그 비용이 측정 자체를 방해한다.
집계 지문은 실측 **0.41초**다.

### 3.2 `MAX(pk)`를 넣는 이유 — 실제로 필요했다

행 수만 세면 **만들고 지운 경우를 놓친다.** 소프트 삭제라 활성 행 수가 돌아오기 때문이다.

통합 시험에서 실제로 발생했다. `scripts/posts.js`(생성 → 수정 → 삭제)를 5 VU로 20초
돌린 결과다.

```text
posts.count   100,000 → 100,000   그대로
posts.maxId   100,000 → 100,001   ← 여기서만 잡힌다
```

`MAX`를 `is_valid`로 거르지 않는 이유도 같다. 삭제된 행도 ID를 소비했다는 사실은 남아야
한다.

### 3.3 지문에서 **빼는** 값 — 이 설계에서 가장 중요한 판단

아래를 지문에 넣으면 **아무 일도 하지 않았는데 매번 불일치가 나서 복원이 무한히 반복된다.**

| 제외 대상 | 왜 |
|---|---|
| `tokens` | VU가 로그인할 때마다 토큰이 발급·회전된다. **읽기 전용 시나리오도 반드시 바꾼다** |
| `posts.PST_view_count` 합 | 조회수는 Redis에 버퍼링됐다가 스케줄러가 DB로 flush한다. 같은 상태여도 잰 시점에 따라 값이 다르다 |
| `daily_hot_post`, `recenthotpost` | hot score 스케줄러가 쓴다. 부하와 무관하게 시간이 지나면 바뀐다 |
| `flyway_schema_history`, `schools*`, `subjects`, `boards`, `timetables_templates` | 정적 참조 데이터. 부하가 건드리지 않는다 |

**실측이 이 판단을 확인했다.** 읽기가 섞인 짧은 실행 뒤 상태를 비교하니:

```text
✅ core 지문 일치 (sha256:c230eee635a4)
   posts.sumViewCount    +47          ← volatile
   daily_hot_post.count  4,996 → 5,004 ← volatile
```

이 둘을 core에 넣었다면 읽기만 해도 상태가 어긋나 무의미한 복원이 걸렸을 것이다.

제외한 값을 버리지는 않는다. `volatile` 블록으로 따로 기록해 리포트가 **"쓰기가
있었다"(core 변화)** 와 **"조회수·토큰만 움직였다"(volatile만 변화)** 를 구분해 말할 수
있게 한다.

### 3.4 실패 시 동작

읽힌 항목 수가 기대치와 다르면 `computeState()`는 **예외를 던진다.** 일부만 읽히고
조용히 넘어가면 "다른 상태인데 같은 지문"이 만들어지는데, 그건 이 장치가 막으려던 바로
그 상황이다.

---

## 4. 스냅샷

### 4.1 저장 형태

```
performance/datasets/snapshots/large-20260816-043326/
├── mysql.tar.gz      # 볼륨 전체 (gitignore)
└── snapshot.json     # 메타데이터 (커밋한다)
```

`snapshot.json`은 커밋한다. **어떤 스냅샷이 존재했고 그 상태 지문이 무엇이었는지**는
실행 기록을 나중에 해석할 때 필요하지만, 수 GB 아카이브는 저장소에 들어갈 수 없다.

```json
{
 "snapshotId": "large-20260816-043326",
 "profile": "large",
 "volume": "perf-mysql-data-large",
 "generation": "sha256:bb5fdd9cb816",
 "state": "sha256:c230eee635a4",
 "core": { "posts.count": 100000, "...": "..." },
 "volatileAtCapture": { "tokens.count": 10000, "...": "..." },
 "archiveBytes": 530000000,
 "note": "P0-2 완료 직후, verify.sh 전 항목 통과 상태"
}
```

### 4.2 왜 `mysqldump`가 아닌가

논리 백업은 복원할 때 댓글 40만·반응 100만 건을 INSERT로 재생한다. large면 수십 분이라
실행마다 돌릴 수 없다. 볼륨 tar는 물리 복사라 파일 교체로 끝난다(실측 26초).

대가는 **뜨는 동안 MySQL이 정지해야 한다**는 것이다. 돌아가는 중 복사하면 InnoDB가
일관되지 않은 상태로 복사된다. `snapshot.js`는 앱과 MySQL을 멈추고, 복사한 뒤 다시 띄우고,
**재기동 후 지문이 그대로인지 확인한다.** 달라졌다면 정지·복사 절차 자체가 데이터를
건드렸다는 뜻이고, 그 스냅샷은 무엇의 사본인지 알 수 없으므로 예외를 던진다.

### 4.3 복원이 Redis를 반드시 비우는 이유

Redis에는 아직 DB로 내려가지 않은 **조회수 버퍼**가 들어 있다. DB만 과거로 되돌리고
Redis를 남기면 스케줄러가 **미래 상태의 버퍼를 과거 데이터 위에 얹는다.** 캐시된 게시글
목록도 복원 후 DB에 없는 ID를 가리킬 수 있다.

그래서 복원 절차에 `FLUSHALL`이 들어 있고, **그 대가로 복원 직후 캐시는 항상 cold다.**
warm 상태를 재려면 복원 뒤 워밍업 구간(`--warmup`)을 둬야 한다. 복원한 실행에는
`cacheState: cold`가 기록된다.

### 4.4 스냅샷 선택 규칙

`restore <profile>`은 **생성 지문이 현재 `meta.json`과 같은 스냅샷만** 고른다. 데이터셋을
다시 만들었는데 옛 스냅샷으로 복원하면 `posts.json`이 가리키는 ID가 DB에 없는 사태가 된다
— 이미 한 번 겪은 실패다. 지문이 다르면 복원하지 않고 재생성을 안내하며 종료한다.

---

## 5. 스위치 (`datasetGuard`)

### 5.1 세 가지 모드

| 모드 | 상태 지문 | 스냅샷과 불일치하면 | 언제 쓰나 |
|---|---|---|---|
| `off` | **계산·기록만** | 아무것도 안 함 | 코드 기본값. 스냅샷이 없는 환경 |
| `warn` | 판정에 사용 | 경고 + **그 실행의 기준선 자격 박탈** | 도입 초기 관찰 |
| `strict` | 판정에 사용 | **볼륨 복원** 후 재확인, 실패 시 실행 거부 | 쓰기 시나리오·반복 측정 |

`warn`이 따로 있는 이유는 도입 순서 때문이다. 처음부터 `strict`로 켜면 매 실행마다 복원이
걸려 무엇이 정상인지 모르는 채 시간을 쓸 수 있다. `warn`으로 며칠 돌려 "읽기 시나리오가
정말 core를 안 바꾸는가"를 확인한 뒤 올리는 편이 안전하다.

### 5.2 우선순위

```
--guard <mode>  >  PERF_DATASET_GUARD  >  perf.config.json  >  기본값 off
```

```bash
node tools/perf-run.js scenarios/write-heavy.js --dataset large   # perf.config.json → strict
node tools/perf-run.js scenarios/deep-paging.js --guard off       # 이번 실행만 끈다
PERF_DATASET_GUARD=warn node tools/perf-run.js ...                # 이 셸에서만
```

**이 저장소는 `perf.config.json`으로 `strict`를 쓴다.** 코드 기본값을 `off`로 둔 이유는
이 도구를 다른 저장소로 가져갔을 때 스냅샷도 없는 상태에서 갑자기 실행이 거부되면 안 되기
때문이다.

선택된 모드와 **그 출처**가 `run.json`에 기록된다(`datasetGuard`, `datasetGuardSource`).
나중에 "이 실행은 왜 복원을 안 했지"에 답하려면 값뿐 아니라 어디서 온 값인지 알아야 한다.

**오타는 조용히 넘어가지 않는다.** `--guard strcit`는 예외를 던진다. 알 수 없는 값을 `off`로
떨어뜨리면 보호가 꺼진 줄 모른 채 계속 돌게 된다.

### 5.3 측정은 항상, 판정만 스위치

`off`여도 상태 지문은 계산해서 기록한다. 계산 비용이 0.41초라 아낄 이유가 없고, 더 중요한
이유가 있다.

> **안 재 두면 나중에 켰을 때 과거 실행 전부가 비교 불가가 된다.**
> 항상 재 두면 모드를 바꿔도 `history.js --rebuild`로 조건을 다시 유도할 수 있다.
> 즉 **모드 변경이 재실행이 아니라 재계산으로 복구된다.**

이게 "간편하게 끄고 켠다"의 실질이다. 스위치가 바꾸는 것은 *기록 여부*가 아니라
*판정 여부*다.

---

## 6. 실행 흐름

```text
perf-run.js
 │
 ├─ preflight()                                    [k6 를 띄우기 전]
 │    ├─ dbstate.computeState()  → stateBefore     (모드와 무관하게 항상)
 │    ├─ guard=off  → 여기서 끝
 │    ├─ snapshot.latestFor(profile)
 │    │    └─ 생성 지문이 다르면 예외 (잘못된 스냅샷 복원 방지)
 │    ├─ 일치      → 그대로 진행
 │    └─ 불일치
 │         ├─ warn   경고 + stateMatchedSnapshot=false
 │         └─ strict snapshot.restore() → 재계산 → 여전히 다르면 예외
 │
 ├─ k6 실행
 │
 └─ postflight()
      ├─ dbstate.computeState()  → stateAfter
      ├─ diff() → core 변화 / volatile 변화 분리
      └─ reports/runs/<runId>.dbstate.json 에 기록
```

상태 확인과 복원은 **k6를 띄우기 전에 끝난다.** 실행 중에 복원하면 무엇을 잰 것인지 알 수
없다. preflight에서 예외가 나면 실행 자체가 시작되지 않는다.

### 왜 사이드카 파일인가

`stateAfter`는 k6가 끝난 뒤에야 알 수 있으므로 환경변수로 전달할 방법이 없다. 그래서
`perf-run.js`가 `reports/runs/<runId>.dbstate.json`에 쓰고, `collect.js`가 읽어
`run.json`에 합친다. `repository.js`의 `promoteStaged()`가 다른 스테이징 파일과 함께
`<runId>/dbstate.json`으로 승격하므로, `--all` 재수집에도 상태 축이 유지된다.

---

## 7. 비교 판정에 반영되는 방식

### 7.1 조건 스키마 v3

> 이후 **v4** 에서 부하 발생기 실행 방식(`local` | `docker`)이 조건으로 추가됐다. 이 문서는
> 데이터셋 상태 축만 다루므로 그쪽 설명은 `PERFORMANCE-MANAGEMENT.md` 의 기준선 선택 절에
> 있다. 아래 "스키마 버전을 올리는 이유"는 v4 에도 그대로 적용된다.

`tools/lib/conditions.js`의 `SCHEMA_VERSION`이 **2 → 3**이 됐다. 이 조건은 `seriesHash()`에
들어가므로 값 형태가 바뀌면 과거 계열과 섞이면 안 된다 — 안 올리면 추세 그래프에서 도입
시점이 성능 변화처럼 보인다.

```js
// guard 가 off 이거나 미기록(이 변경 이전 실행)이면 상태 축을 넣지 않는다
{ profile, fingerprint }
// guard 가 warn|strict 이면
{ profile, fingerprint, state, snapshot }
```

리포트 표시도 두 축을 구분한다.

```
데이터셋: large (생성 지문 없음 · 상태 미판정(guard off))
       → large (생성 sha256:bb5fdd9cb816 · 상태 sha256:c230eee635a4)
```

과거 실행이 `상태 미판정(guard off)`으로 나오는 것은 의도한 동작이다. **소급 적용하지
않는다** — 상태를 보장한 실행과 그러지 않은 실행은 같은 증거가 아니다.

### 7.2 기준선 자격

`repository.js`의 `eligibilityOf()`에 사유가 하나 추가됐다.

```js
if (entry.stateMatchedSnapshot === false) → reasonCode: 'dataset-state-drift'
```

`warn` 모드에서만 발생한다(`strict`는 복원하고, `off`는 이 값을 남기지 않는다). 이 판정은
**성능이 나빴다는 뜻이 아니라 무엇을 잰 것인지 확정할 수 없다는 뜻**이다. 기준선으로 쓰면
뒤따르는 모든 비교가 오염된다.

`=== false`로 비교하는 것이 중요하다. 이 필드가 없는 과거 엔트리는 `undefined`라 그대로
통과한다 — 소급 탈락시키지 않는다.

---

## 8. 사용법

```bash
# 스냅샷 — 데이터셋 검증(datasets/verify.sh) 이 통과한 직후에 뜬다
node tools/snapshot.js create large --note "P0-2 완료 직후"
node tools/snapshot.js list
node tools/snapshot.js verify large     # 지금 DB 가 스냅샷과 같은가
node tools/snapshot.js restore large    # 되돌린다 (Redis FLUSHALL 포함)
node tools/snapshot.js restore --id large-20260816-043326

# 실행 — guard 는 perf.config.json 을 따른다
node tools/perf-run.js scenarios/write-heavy.js --dataset large
node tools/perf-run.js scenarios/deep-paging.js --dataset large --guard off
```

옵션:

| 옵션 | 뜻 |
|---|---|
| `--no-compress` | gzip 없이 tar만. 빠르지만 5배 크다 |
| `--note "<text>"` | 스냅샷 메타데이터에 남길 메모 |
| `--id <snapshotId>` | 최신이 아닌 특정 스냅샷을 복원 |

환경변수: `PERF_MYSQL_CONTAINER`(기본 `perf-mysql`) · `PERF_REDIS_CONTAINER` ·
`PERF_APP_CONTAINER` · `MYSQL_ROOT_PASSWORD` · `PERF_APP_HEALTH`.

---

## 9. 실측값 (large, 볼륨 2.72GB · 2026-08-16)

| 항목 | 값 | 비고 |
|---|---|---|
| 상태 지문 계산 | **0.41 ~ 0.44초** | 4회 모두 동일 지문. 설계 시 우려한 10초의 4% |
| 스냅샷 생성 (gzip -1) | **0.50GB · 109.5초** | 2.72GB → 5.4배 압축 |
| 스냅샷 생성 (비압축) | 2.70GB · 81.8초 | 압축이 **28초** 더 쓰고 **2.2GB**를 아낀다 |
| 복원 (압축 해제 구간) | **26 ~ 30초** | |
| 복원 (앱 부팅까지 전체) | **82초** | 반복 측정 5회 = 약 7분 오버헤드 |

세 값 모두 alpine 이미지가 로컬에 캐시된 상태에서 잰 것이다. 최초 1회는 이미지를 내려받느라
약 12초가 더 걸린다(실측: 같은 조건에서 121.2초).

`gzip -1`을 쓴다. DB 페이지는 압축이 잘 되지만 `-9`는 시간이 몇 배로 늘고 그만큼 MySQL
정지 시간이 길어진다. 스냅샷은 자주 뜨는 물건이라 시간이 더 비싸다.

**버린 대안 — 두 단계 복원.** 생성된 행만 지우는 "델타 롤백"을 빠른 경로로 두고 볼륨
복원을 정확한 경로로 두는 안을 설계 단계에서 검토했다. 복원 실측이 26초로 나와 **복잡도를
더할 이유가 없어졌다.** 복원이 5분을 넘었다면 다시 꺼냈을 안이다.

---

## 10. 아직 하지 않은 것

- **`warn` 모드 관찰 기간.** 도입 순서상 `warn`으로 시나리오별 실제 변화량을 모은 뒤
  `strict`로 올리려 했으나 바로 `strict`로 켰다. 그래서 "읽기 시나리오가 정말 core를 안
  바꾸는가"에 대한 데이터는 위 두 사례가 전부다.
- **캐시 warm/cold를 실행 조건에 포함.** 복원 시 `cacheState: cold`를 기록만 하고 비교
  조건에는 넣지 않았다. 관측 경로 정상화 작업과 함께 정할 사항이다.
- **스냅샷 보관 정책.** 개당 0.53GB짜리를 몇 벌 유지하고 언제 지울지 정하지 않았다.
- **CI에서의 사용.** 공유 러너에는 볼륨과 스냅샷이 없다. CI 연결은 별도 과제다.

---

## 관련 문서

- [`PERFORMANCE-MANAGEMENT.md`](PERFORMANCE-MANAGEMENT.md) — 측정 시스템 전체 구조
- [`datasets/README.md`](datasets/README.md) — 데이터셋 생성·검증·재개
- `datasets/verify.sh` — 스냅샷을 뜨기 전에 통과해야 하는 검증
