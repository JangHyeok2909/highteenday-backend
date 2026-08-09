# 발견 사항 — k6 스크립트/시나리오 (performance/scripts/, scenarios/)

리뷰 일자: 2026-08-05. 라인 번호는 당시 HEAD 기준.

## CRITICAL

### S-01. 매 iteration 전체 BCrypt 로그인 — 상태: 미해결
`scripts/lib/session.js:71-78` `ensureSession`은 쿠키 자를 확인하는데 k6는 iteration마다
쿠키 자를 리셋한다(63-69행 주석이 스스로 인정). `workload.js:276`이 무조건 호출하므로
**iteration의 100%가 `POST /api/user/login`으로 시작**한다.
실증(`normal-day-2026-08-04T06-38-42`): 559 iteration에 로그인 562회 = **전체 HTTP 요청의
19.4%가 BCrypt 로그인**. 선언된 relogin 가중치는 1%(workload.js:205). 문서의 저니 비율
(browse 40/engage 15/…)은 요청 레벨에서 허구이고, 2코어 제한 앱 컨테이너가 의도치 않은
패스워드 해싱 부하를 받아 모든 엔드포인트 지연이 간섭 오염된다. 전 시나리오가 상속.

### S-02. 쓰기 SLO가 사실상 로그인 SLO — 상태: 미해결
login/logout/refresh가 `op:write` 태그(session.js:23,35,42). 기준선 런에서 op:write 761건 중
**569건(75%)이 auth**, 실제 도메인 쓰기는 192건. `breakdown.op.write.p95`(95.8ms) ≈
`breakdown.feature.auth.p95`(98.7ms) — 같은 지표다. 쓰기 경합 회귀(likeCount 락, Hikari 포화)는
게이트에 닿기 전에 ~4:1로 희석된다. auth.js:24의 `name:login p95<800`과 config.js:65의
`op:write p95<500`이 같은 요청에 모순 SLO를 건다.

### S-03. zipfIndex가 index 0을 절대 반환하지 못함 — 상태: 미해결
`scripts/lib/data.js:39-43`: `idx = floor(n^(u^1.7)) % n`. `u∈[0,1)`에서 `n^x ∈ [1,n)`이므로
floor ≥ 1 — **시드의 인기순 정렬 1위인 `posts[0]`은 한 번도 조회·반응·스크랩된 적 없다**.
동시에 `P(idx==1)` = small(N=500)에서 27.5%, large(N=100000)에서 19% — 행 하나가 전체
접근의 1/5~1/4를 흡수. 문서의 "Zipf s≈1.07, 80-20"보다 훨씬 뾰족하고 N에 따라 모양이
변해 프로파일 간 비교 불가. "역변환 샘플링" 주석도 사실이 아님(어떤 Zipf의 역CDF도 아님).
BTL-003 실험과 캐시 적중률 수치 전부에 영향.

### S-04. 게시판 목록 0페이지가 전 시나리오에서 한 번도 요청 안 됨 — 상태: 미해결
`posts.js:120`, `workload.js:39`가 `listPosts(board.id, zipfIndex(5))` — S-03에 의해 1~4만
반환(~61%가 1페이지). 실서비스에서 가장 많이 조회되고 가장 캐시 친화적인 0페이지가
테스트에서 제외되고 깊은 페이지가 목록 트래픽의 100%를 받는다. 캐시 적중률·목록 지연
결론이 운영 대비 반전되어 있다.

### S-05. failedRequests가 성공 요청 수를 기록 — 상태: **해결** (2026-08-05, 미커밋)
> summary.js·migrate-raw.js 양쪽 passes/fails 수정 + 회귀 테스트. **주의: 과거 run.json에
> 저장된 failedRequests는 여전히 잘못된 값** — 1단계 기록에 구워진 값이라 재수집으로도 안
> 고쳐지고, rawMetrics에서 재계산해야 한다(이력 재계산은 별도 작업).
`summary.js:154`가 `val('http_req_failed','fails')` 사용 — k6 Rate에서 `passes`=실패 요청,
`fails`=성공 요청이다. 실증: `http_req_failed={rate:0.5578, passes:4051, fails:3212}`인데
기록은 `failedRequests:3212`(성공 수). `migrate-raw.js:128`에 동일 버그 중복.
모든 리포트의 "실패 요청" 칸이 과소 표기이며 같은 표의 errorRate와 자기모순.

### S-06. 한계 탐색 시나리오가 전부 closed 모델 — 상태: 미해결
`stress.js`, `spike.js`, `soak.js`, `chaos.js`, `failover.js` 모두 `ramping-vus`/`constant-vus`.
closed 모델에선 도착률 = VUs/(think+응답시간)이라 서버가 느려질수록 발생기가 자동으로
물러난다(coordinated omission) — stress는 한계를 못 찾고 spike는 스파이크를 재현 못 한다.
arrival-rate는 breakpoint.js뿐. 복합 효과: 로그인 실패 시 `fail()`로 iteration 즉시 중단
(session.js:29) → 포화 상태에서 iteration이 짧아져 **시스템이 무너질수록 TPS가 상승**
(실증: 8/5 런 — 2403 iteration, 오류율 55.8%, 로그인 1499/2571 실패, TPS는 정상 기록).

## HIGH

### S-07. VU 수 > 시드 계정 수 — 계정 공유 — 상태: 미해결
`data.js:28-30` `users[(vu.idInTest-1) % users.length]`. 기본 데이터셋 small=100명인데
normal-day 200VU, peak-hour 500, stress 1000, breakpoint maxVUs 2000. VU 2~20개가 같은
계정을 동시 사용: 같은 USR_id 행 경합, 같은 refresh token 행 동시 재작성, 한 VU의
logout이 다른 VU 세션을 무효화. 운영에 존재하지 않는 인공 경합.

### S-08. k6 지표는 램프업 포함, infra는 트림 — 윈도우 불일치 — 상태: 미해결
`summary.js:146-169`는 전체 구간(normal-day는 램프 5m+램프다운 2m = 런의 26%가 저부하)
집계. `--warmup`은 Prometheus 쪽만(T-03과 동전의 양면). HOLD만 바꿔도 서버 무변경에
p95가 움직인다. 게이트되는 headline p95가 두 부하 수준의 혼합물.

### S-09. stress/breakpoint/spike/chaos/failover는 breakdown·check 게이트 없음 — 상태: 미해결
각자 자체 thresholds를 정의하며 DEFAULT_THRESHOLDS를 버림 — k6는 threshold에 등장한
태그만 서브메트릭을 만들므로 이 런들은 `feature:*`/`op:*` 분해가 **아예 없다**.
"무엇이 먼저 무너지는가"가 목적인 테스트만 어느 기능이 무너졌는지 답할 수 없다.
기준선(normal-day)도 `name:` 축이 없고 시나리오마다 breakdown 스키마가 달라
시나리오 간 비교·엔드포인트 추세가 불가능.

### S-10. 기준선 자격의 생존 편향 — 상태: 미해결
`repository.js:211`의 `thresholdsPassed !== false` — thresholdsPassed는 엄격한
`op:read p95<300`+`checks>0.99` 포함 전체 AND(summary.js:189)라 운 좋은 런만 기준선이
될 수 있다(낙관 드리프트 → 정상 런이 "회귀"로 보임). 빈 threshold 배열은 `every()`가
true라 무조건 통과. cold-start.js는 의도적 저성능인데 영구 FAIL 마킹되어 기준선 부적격.

### S-11. 런이 데이터셋을 오염 — 리셋 없음 — 상태: 미해결
`workload.js:78-83` 쓰기 저니의 ~80%가 글 생성, 댓글/반응/스크랩 누적. setup/teardown
없고 perf-run에 재시드 없음. "같은 데이터셋" 비교가 실은 매번 커진 DB 비교 —
인덱스 스캔·페이징 비용의 보이지 않는 우상향 드리프트가 코드 회귀로 오독될 것.

### S-12. 상태 소모 저니가 런 중반에 측정 대상을 잃음 — 상태: 미해결
알림 readAll/readOne은 시드 알림을 영구 소진(notifications.js:96-100) — 이후 0행 UPDATE.
friends는 NONE 관계 소진(100명 small에선 확정) 후 요청 가능 상대가 없어 친구 쓰기 경로와
알림 팬아웃이 조용히 사라짐. 스킵됐다는 카운터도 없음. friends.js:132는 항상 reqs[0]에
응답해 한 요청 행에 응답자 집중.

### S-13. WebSocket 저니의 시간 가중 왜곡 + 유실 침묵 — 상태: 미해결
chatWs iteration은 15~30s로 평균 저니(~9s)의 2~3배 — 가중치는 iteration 단위라 시간 가중
점유율은 명목의 ~2배(측정: 5% 가중치가 VU-초의 10.6%). chat-heavy의 "동시 160 세션"
주장은 큰 폭으로 틀림. RTT는 돌아온 메시지만 기록(chat-ws.js:112-120) — 브로커 포화
시점에 정확히 생존 편향. 유실 브로드캐스트는 무메트릭·무체크.

## MEDIUM

### S-14. 균일 think time·페이싱 없음 — 상태: 미해결
전 저니 공통 uniform(1,4). 실제 행동은 heavy-tail — 버스트성이 제거되어 큐잉 유발이
약함. 채팅 타이핑 간격은 별도 하드코딩이라 THINK 스윕이 WS 강도에 안 먹힘.

### S-15. 문서와 다른 쿼리 경로 + 죽은 코드 — 상태: 미해결
보드 선택 균일(자유게시판 지배 현실과 다름). posts.js는 `sortType=RECENT`만 —
스스로 측정한다고 주장하는 `isRandomPage=true`(BTL-001의 주제)를 안 보냄.
`data.js:50-53` randomPost(콜드 데이터 샘플러)는 **호출처 0 죽은 코드** — 콜드 읽기
경로가 스위트 전체에 없어 버퍼풀/Redis 적중률이 과대평가.

### S-16. 체크가 상태코드만 검증 + 집계 체크의 은폐 — 상태: 미해결
`200 []`를 반환해도 전 체크 통과. small에선 계정 절반이 채팅방 없음 → 조기 return하고도
iteration/TPS로 집계 — "실행된 저니"와 "스킵된 저니" 구분 메트릭 없음.
전역 `checks: rate>0.99`라 저빈도 엔드포인트는 100% 고장나도 1% 예산 아래
(실증: `read all` 6회/2900요청). 커버리지 0 엔드포인트: 미디어 업로드(아마 최고 비용),
회원가입, 계정 삭제, 비번/닉네임 변경, 중복확인 3종, 친구 삭제/차단, 채팅방 생성/관리,
시간표 쓰기 전부, `GET /comments/{id}` 등. 시나리오 공백: smoke 없음,
open-model 정상부하 기준선 없음, 스케줄러 간섭(BTL-007) 시나리오 없음.

### S-17. cache-warm의 위상 혼입 + 서브메트릭 파싱 버그 — 상태: **부분 해결** (2026-08-05, 미커밋)
> 파싱 버그 해결: 다중 태그 서브메트릭({phase:...,op:...})을 오파싱하지 않고 축 분해에서
> 제외(summary.js·migrate-raw.js 동일 규칙 + 테스트). **위상 혼입(overall에 warmup 포함)은
> 미해결** — 측정 윈도우 설계(P1-1)와 함께 결정할 사안.
warmup+measurement가 한 프로세스인데 overall은 위상 무구분 — cold-start와의 비교가
사과 대 사과가 아님. `{phase:measurement,op:read}`는 summary.js:93 정규식이
tagKey=phase, tagVal="measurement,op:read"로 오파싱해 엉뚱한 breakdown 항목 생성.

### S-18. breakpoint가 서버보다 자기 VU 한도에 먼저 도달 — 상태: 미해결
목표 300 iter/s × 평균 iteration ~9s ⇒ Little's law로 무열화 시에도 ~2700 VU 필요한데
maxVUs 2000 — 130~200 iter/s쯤 클라이언트 사유로 dropped_iterations 발생.
threshold 없어 서버 포화처럼 보이는 가짜 고원이 "최대 지속 TPS"로 기록될 것.

### S-19. 믹스가 비결정적이고 사후 검증 불가 — 상태: 미해결
전 분기 비시드 Math.random(). 저니별 Counter 없고 trend 서브메트릭엔 count가 없어
실현된 믹스를 사후에 알 수 없다. 그런데 TPS/RPS를 ±10%로 게이트 — 500~2500 iteration에
12-way 다항 믹스면 샘플링 노이즈만으로 게이트를 넘을 수 있다.

## LOW / 엔지니어링

### S-20. 주석-코드 불일치 — 미해결
timetable.js 헤더는 "생성·추가"라는데 GET 3개뿐. posts.js는 isRandomPage 주장.
reactions.js는 댓글 반응 경합 문서화하고 standalone은 미호출. PROFILE_REGISTRATION은
"회원가입 폭증"인데 가입 저니 자체가 없음(registration-day는 /register를 안 침).

### S-21. 설정 드리프트/중복 — 미해결
spike/stress 하드코딩 VU 단계(README의 `-e VUS=` 만능 주장과 불일치).
gracefulRampDown 3개 시나리오만 — 나머지는 30s gracefulStop이 WS 세션을 단계 경계마다
절단. JSON_HEADERS 4중 선언, 검색어 배열 2벌 상이, "목록에서 id 뽑기" 관용구 4중 복제.

### S-22. boards.js만 비인증 실행 — 미해결
같은 엔드포인트가 시나리오에선 세션 쿠키를 달고 다른 경로를 탐 — standalone의
최엄격 SLO(p95<100)와 시나리오 수치가 비교 불가.

### S-23. withAuth 재시도의 오류 집계 왜곡 — 미해결
401 → refresh → 재시도가 http_req_failed와 op:write 지연에 3중 반영.
"복구됨"과 "실패"를 가르는 메트릭 없음(auth_token_refreshes는 threshold 미적용).
