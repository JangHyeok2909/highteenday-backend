# 발견 사항 — 환경/데이터셋/CI (performance/environment/, datasets/, regression/*.yml)

리뷰 일자: 2026-08-05. 라인 번호는 당시 HEAD 기준.
번호는 리뷰 원문(F-01~F-38)을 유지하되 접두사만 E-로 통일.

## 측정 유효성

### E-01. [CRITICAL] 부하 발생기가 SUT와 같은 호스트 — 상태: 미해결
`environment/README.md:32-33`이 격리를 제1원칙으로 명시("같은 호스트에서 돌리면 k6의
CPU 소비가 결과를 오염시킨다")하지만 강제 장치가 없다. `config.js:10` 기본
`localhost:18080`, 기록된 23런 전부 `executor: user@DESKTOP-DJJPASG` — k6+앱+MySQL+Redis+
Prometheus+Grafana+익스포터 3종이 한 Windows 데스크톱. CI 경로도 동일(ubuntu-latest에
k6 설치). 오염 정도는 E-09(node_exporter 부재) 때문에 측정 불가.

### E-02. [HIGH] CPU 한계 초과 배분 + 관측 계층 무제한 — 상태: 미해결
mysql 2.0 + redis 1.0 + app 2.0 = 5 vCPU (k6 제외). Prometheus/Grafana/익스포터/cAdvisor는
`deploy.resources` 자체가 없어 측정 윈도우에 무제한 CPU 소비 가능 — 그리고 그 소비는
컬렉터가 perf-app/perf-mysql만 조회하므로 보이지 않는다.

### E-03. [HIGH] perf 토폴로지가 운영과 다르고 운영 스펙은 미기록 — 상태: 미해결
운영은 EC2 host 네트워크 + RDS인데 perf는 같은 커널의 브리지 네트워크 컨테이너 MySQL.
environment/README.md의 하드웨어 표는 전부 "(실측 기입)" 플레이스홀더 — 2vCPU/2.5GB라는
한계값이 무엇에 대한 보정인지 근거가 없다.

### E-04. [MEDIUM] 데이터셋은 4자릿수 배율로 변하는데 MySQL/Redis 튜닝은 고정 — 상태: 미해결
buffer pool 1G, redis maxmemory 384mb가 smoke(50글)~xlarge(50만 글) 공통.
large 이상에선 워킹셋이 안 들어가 buffer pool 미스율·Redis eviction이 앱 신호가 아니라
장비 사이징의 함수가 되는데, rules.json은 이를 앱 신호처럼 게이트한다.

### E-05. [MEDIUM] mysql/perf.cnf가 미마운트 사문 — 상태: 미해결
같은 튜닝이 perf.cnf / docker-compose.perf.yml / docker-compose.seed.yml 3벌 수동 유지.
seed.yml 스스로 "command는 병합이 아니라 치환 — 빠뜨리면 조용히 깨진다"고 경고하면서
검증은 0.

### E-06. [MEDIUM] BTL-008을 재현하는 대신 우회 — 상태: 미해결
`--lower-case-table-names=1`로 운영에서 터질 수 있는 경로를 perf에서만 무마.
플래그는 datadir 최초 init에만 적용되어 기존 볼륨은 조용히 미적용.

### E-07. [MEDIUM] 시드가 측정과 다른 앱 구성으로 생성됨 — 상태: 미해결
seed 오버라이드: Hikari 10→50, 힙 1g→2g, flush 완화, slow log/perf schema 비활성.
API 기반 시딩의 존재 이유(비정규화 카운터·팬아웃·핫스코어가 실제와 동일)가 5× 풀에서
만들어진 데이터로 희석. 원복은 수동 curl 2줄 확인에 의존.

### E-08. [MEDIUM] warmup의 이중 의미 + 의도적 콜드 스타트 — 상태: 미해결
CI 주석은 "JIT 워밍업 제외"라지만 실제론 Prometheus 윈도우만 이동(T-03과 동일 사안의
환경 측면). 워밍업 트래픽 스테이지는 어디에도 없고, README는 실험 간
`docker restart + FLUSHALL`을 지시 — 매 런이 의도적으로 콜드인데 게이트는 콜드 구간을
포함한 백분위에 걸린다.

## 관측 공백

### E-09. [HIGH] node_exporter 없음 — 호스트 지표 전무 — 상태: 미해결
prometheus.yml의 job은 spring-app/mysql/redis/containers 4개뿐. E-01의 오염을 밝힐
유일한 신호(호스트 CPU, run-queue, steal, 페이지캐시, 디스크 지연)가 수집 안 됨.

### E-10. [HIGH] 주 환경에서 cAdvisor가 고장난 게 문서화돼 있는데 게이트가 의존 — 상태: 미해결
README.md:238-278: Docker Desktop+containerd에서 per-container 시리즈 생성 자체가 실패.
`container_*{name=…}` 기반의 CPU 포화/throttling/메모리/네트워크/디스크 전부 결측 —
그리고 `cpu.throttledPct`는 gate:true라 T-08(SKIP=PASS)과 결합해 공허하게 통과.
MySQL CPU는 아예 소스가 없음(mysqld-exporter에 CPU 지표 부재).

### E-11. [HIGH] 5s 스크레이프에 26~52s 런 다수 + 윈도우 밖 조회 — 상태: 미해결
샘플 5~10개로 increase() 외삽 — slowQueries/hikariTimeouts 게이트가 그 위에 있다.
`[1m]` 하드코딩 3곳(cpu rate, mysql qps max, redis peak)은 짧은 런에서 테스트 시작
이전 구간을 포함 — max_over_time이 잡으라는 피크를 계통적으로 평탄화.

### E-12. [MEDIUM] TSDB가 프로파일 무구분 공유 — 상태: 미해결
MySQL 볼륨만 프로파일별, perf-prom-data는 전역 30d. dataset/run_id 라벨이 없어
small 런과 large 런의 시리즈가 동일 라벨 — 타임스탬프로만 구분.

### E-13. [MEDIUM] 런 중 타깃 헬스 미감시 — 상태: 미해결
사전 체크는 spring-app `up` 1회뿐. 런 중 타깃 사망 감지 없음. 런 기록은
`infraAvailable` 불리언 하나 — 지표 절반 결측 런이 정상 런과 구분 불가.

### E-14. [MEDIUM] 무인증 원격 쓰기 경로 노출 — 상태: 미해결
`--web.enable-remote-write-receiver` + 9090 전 인터페이스 공개 + Grafana admin/perf +
익명 뷰어. 공유 네트워크에선 기준선을 만드는 저장소에 임의 시리즈 주입 가능.

## 데이터셋

### E-15. [HIGH] 채팅 메시지·알림이 시드되지 않음 — 상태: 미해결
seed.js는 1:1 방만 만들고 "메시지는 첫 실행이 쌓는다"며 중단 — 채팅 이력/페이징이
빈 테이블 대상 측정. 알림은 profiles.json에 차원 자체가 없고 댓글/반응의 부수효과로만
존재 — notification-heavy가 미지·미기록 볼륨을 상대로 돈다.

### E-16. [HIGH] 프로파일 크기의 운영 근거 부재 + 표준 프로파일 미생성 — 상태: 미해결
xlarge="운영 1년 후"라지만 DAU 도출 없음. 문서상 EXP 기본값인 `medium`은
generated/에 존재한 적도 실행된 적도 없다(실행은 small 8 + large 15뿐).

### E-17. [MEDIUM] Zipf 명세와 구현 불일치 + 미검증 — 상태: 미해결
README "s≈1.7" vs seed.js의 멱변환 근사(skew=0.7, %n 랩어라운드로 머리 왜곡).
검증은 사람이 붙여넣는 SQL 스니펫뿐. README 스스로 미달을 기록(54.4% vs 80% 기대)하고
게이트는 없음. (부하 쪽 S-03과 별개의 시드 쪽 문제)

### E-18. [MEDIUM] 시딩 비멱등 + 가드 우회 — 상태: 미해결
계정만 409 스킵, 글/댓글/반응은 매회 전량 재생성. 유일한 가드(bootstrap의 posts>0 거부)를
CI가 seed.js 직접 호출로 우회 — 문서화된 사고 사례 있음(500 명세 → 실제 1065).

### E-19. [MEDIUM] 시드 미달이 구조적·무기록 — 상태: 미해결
unique 쌍 생성 포기 로직(count×20 시도) — large의 반응 100만은 구조적 미달.
전부 stdout 경고뿐, 런 기록엔 프로파일 이름만 저장되고 달성 수량은 없음.
드리프트 체크는 양(+)의 방향만.

### E-20. [MEDIUM] 데이터셋 버전 미기록 — 상태: 미해결
PRNG 시드는 고정이지만 생성기 자체가 재작성됨("이 커밋 이후 시드 데이터는 이전과
다르다" 주석). 런 기록엔 k6 스크립트 해시만 있어 재생성된 데이터 대상 런이
구조가 다른 데이터 대상 런과 무경고 비교된다.

### E-21. [MEDIUM] 시더가 연구 대상 병목을 재시도로 흡수 — 상태: 미해결
시더는 데드락/풀 고갈에 6회 백오프 재시도(그러고도 smoke에서 댓글 2.7% 유실 기록).
k6 스크립트엔 동등한 재시도가 없어 시딩 때 관측된 쓰기 실패율(BTL-002/003의 실측)이
측정 런에서는 다른 조건이 된다.

### E-22. [MEDIUM] Redis 상태가 프로파일 전환을 넘어 표류 — 상태: 미해결
MySQL만 프로파일별 볼륨. FLUSHALL은 bootstrap에만 있고 CI는 bootstrap을 안 부름 —
프로파일만 바꿔 `up -d`하면 다른 프로파일의 캐시를 상대로 측정.

## CI 워크플로

### E-23. [CRITICAL] 회귀 워크플로 미설치 — 실행 이력 0 — 상태: 미해결
perf-regression.yml은 "루트 .github/workflows/로 복사하라"는 주석과 함께
performance/regression/에만 존재. .github/workflows/엔 deploy.yml과
perf-reports-pages.yml뿐. 23런 전부 로컬(env: perf), CI 런(env: ci) 0개.

### E-24. [CRITICAL] 설치해도 게이트 못 함 — 상태: 미해결
트리거가 push(develop)+주간 cron+수동뿐, **pull_request 트리거 없음** — 머지 후 검출.
deploy.yml은 perf 결과와 무관하게 main 푸시로 배포. 회귀가 develop→main→EC2까지
무저지 통과 가능.

### E-25. [HIGH] CI seed 단계는 확정 실패 — 상태: 미해결
bootstrap 없이 seed.js 직접 실행 — 보드 미생성(`data.sql` init 없음)이라
"게시판이 없습니다" throw로 exit 1. daily_hot_post도 미생성이라 hotposts는 500.
bootstrap.js:8-13이 정확히 이 실패 모드들을 존재 이유로 열거하는데 CI가 건너뜀.
→ 워크플로가 작성만 되고 실행된 적 없다는 증거.

### E-26. [HIGH] ubuntu-latest는 부하 발생에 부적합 + 노이즈보다 좁은 게이트 — 상태: 미해결
공유 2~4 vCPU VM에 스택 전체+k6. rules.json의 노이즈 플로어는 로컬 데스크톱에서
보정된 값 — CI 전용 플로어 없음(환경 분리 자체는 존재).

### E-27. [HIGH] 캐시 기반 이력이 주석의 주장보다 훨씬 취약 — 상태: 미해결
Actions 캐시는 브랜치 스코프 — cron은 기본 브랜치에서 돌아 develop 이력을 못 읽어
매주 기준선 없이 시작. 7일 미사용 축출 + 10GB 캡. key가 run_number라 항상 미스,
restore-keys 접두 매칭이 브랜치/시나리오/데이터셋 무관 최신을 반환.

### E-28. [MEDIUM] 리포트 게시가 CI와 단절 — 13MB 커밋 중 — 상태: 미해결
CI는 캐시+30일 아티팩트만, 커밋 안 함. Pages는 사람이 수동 커밋한 로컬 결과만 게시.
결과: 416파일/13MB 리포트가 저장소에 버전관리되고 CI 결과는 어떤 대시보드에도 안 감.
두 워크플로의 게시 범위도 불일치(runs+index vs reports/** 전체).

### E-29. [MEDIUM] Pages가 내부 메타데이터를 무여과 공개 — 상태: 미해결
executor 호스트명(user@DESKTOP-…), 브랜치명, +dirty SHA, 자유 텍스트 노트,
아카이브의 내부 호스트/포트가 공개 사이트로 그대로 게시. 마스킹/allowlist 없음.

### E-30. [MEDIUM] 시크릿·실패 진단·teardown 부재 — 상태: 미해결
CI가 커밋된 example의 root 비밀번호·HS512 키로 실행(secrets.* 참조 0).
실패 시 compose logs 캡처 없음, down -v 없음 — 크래시 루프가 curl 타임아웃으로만 표면화.

### E-31. [MEDIUM] CI의 k6 버전 미고정 — 상태: 미해결
apt 저장소에서 무제약 설치 — k6는 trend 집계/http_req_failed 의미가 버전에 따라
바뀐 적 있다. 런 기록에 k6 버전 필드 없음.

### E-32. [LOW] 활성 상태의 모순된 규칙 파일 2벌 — 상태: **해결** (2026-08-05, 미커밋)
compare.js·thresholds.json 삭제로 해소. (도구 쪽 T-20과 동일 사안 — 상세는 그쪽 참조)

## 재현성

### E-33. [HIGH] .env.perf가 example과 이미 드리프트 — 상태: 미해결
실파일 DATASET_PROFILE=large vs example medium. gitignore는 맞게 돼 있으나
모든 기록 런의 실효 프로파일이 미추적 로컬 상태다. compose up과 k6 -e DATASET이
서로 모순돼도 무오류.

### E-34. [MEDIUM] 실동작 HS512 키가 커밋됨 — 상태: 미해결
.env.perf.example:14의 유효 512bit 키가 compose 기본값으로도 중복. 헤더는 "실제 값
커밋 금지"라면서 정확히 그걸 커밋. 운영이 같은 변수명을 소비 — 복붙 시 토큰 위조 가능.
재사용 금지 경고 없음.

### E-35. [MEDIUM] 시스템 전체가 의존하는 환경 명세가 공란 — 상태: 미해결
"모든 실험은 이 문서의 환경에서만 유효" 선언 아래 CPU/RAM/Disk/Docker 버전이
플레이스홀더. BTL-002의 중심 가설인 HikariCP 값도 "확인 후 기입" 상태(값은 seed
오버라이드가 아는데도). 자기 기준으로 재현 가능한 실험이 0개.

### E-36. [MEDIUM] Windows/Docker Desktop 특수 우회가 정본 명세에 고착 — 상태: 미해결
MySQL 튜닝 CLI 플래그화(바인드마운트 권한), cAdvisor 불능 4개 대안 중 미적용,
perf-mysql/perf-redis/localhost:18080 하드코딩. Linux 런과 Windows 런이 **다른 지표
집합**을 수집하는데 회귀 엔진은 시나리오+환경명만으로 비교. → CLI 추출 시 일반화
대상 목록이기도 하다.

### E-37. [LOW] 리소스 한계 미검증 — 상태: 미해결
deploy.resources.limits는 Compose v2 비Swarm에서만 적용되는데 최소 버전 선언·적용
확인(docker inspect) 모두 없음. 무시되면 무제한으로 돌면서 saturation.cpuPct는
적용된 적 없는 한계 대비로 계산된다.

### E-38. [LOW] Grafana datasource UID 미고정 — 상태: 미해결
이름만으로 선언, uid 없음 — down -v 사이클 후 대시보드 JSON의 생성 UID가 깨질 수 있음.

---

## 2026-08-06 추가 조사 — MySQL 익스포터

### E-39. [HIGH] mysqld-exporter가 기본 collector만 켜져 있어 쿼리 특정이 불가능 — 상태: 미해결

**증상.** `performance/environment/docker-compose.perf.yml:160`의 mysqld-exporter는
`--mysqld.address`와 `--mysqld.username`만 넘긴다. collector 플래그가 하나도 없어
기본 collector(global_status, global_variables 등)만 동작한다. 2026-08-06 실측:

```
mysql_perf_schema_*                  → 0개 시리즈
mysql_info_schema_innodb_metrics_*   → 0개 시리즈
```

**핵심은 MySQL 쪽 준비는 이미 끝나 있다는 것.** 같은 파일의 MySQL 커맨드에
`--performance-schema=ON`, `--slow-query-log=1`, `--log-queries-not-using-indexes=1`이
전부 켜져 있다. **데이터는 MySQL 안에 쌓이고 있는데 익스포터가 안 긁어가고 있을 뿐이다.**
즉 오버헤드는 이미 내고 있으면서 이득만 못 받는 상태다.

**무엇을 못 하게 되나 — 진단 체인의 단절.**

```
지표로 "느리다" 확인   →  "이 쿼리다" 특정      →  EXPLAIN으로 "왜" 규명
     ✅ 된다              ❌ 여기가 끊겨 있다        (수동, 가능)
```

`performance/tools/lib/regression.js`의 `bottleneckHints()`는 QPS/RPS 비율로
"요청당 쿼리 과다 → N+1 가능성"까지 말해준다. 그런데 **어느 쿼리인지는 말할 수 없다.**
EXP-005(댓글 N+1)는 결국 "어느 쿼리가 몇 번 도는가"에 답해야 하는 실험이라 여기서 막힌다.

**사용 가능한 플래그 (v0.15.1에서 `--help`로 확인).**

```yaml
- --collect.perf_schema.eventsstatements           # 쿼리 digest별 통계 ★ 핵심
- --collect.perf_schema.eventsstatements.limit=50
- --collect.info_schema.innodb_metrics             # InnoDB 내부 카운터 대량
- --collect.engine_innodb_status                   # SHOW ENGINE INNODB STATUS → 데드락 정보 (T-29 참고)
- --collect.perf_schema.tablelocks
- --collect.perf_schema.indexiowaits
```

**그런데 그냥 켜면 안 되는 이유 두 가지.**

1. **카디널리티.** digest 50개 × 여러 지표 = 시리즈가 급증한다. 현재
   `metrics-catalog.js`는 "지표 하나 = 스칼라 하나"를 전제로 설계됐고
   (`collect.js:81`의 `flat[spec.key] = value`), 리포트도 그 모양에 맞춰져 있다.
   상위 N개 쿼리를 어떻게 담을지는 **새 설계 결정**이지 플래그 추가가 아니다.
2. **관측 오버헤드.** `eventsstatements`는 공짜가 아니다. 측정 대상을 관측이
   느리게 만들면 본말전도다.

**권고.** 상시 수집이 아니라 **분석할 때만 켜는 별도 오버레이**로 분리한다
(`environment/docker-compose.deep.yml` 같은 파일). `performance/tools/README.md`가 이미
"심층 도구는 원인 규명 단계에만 — 프로파일러 오버헤드가 측정을 오염시키므로 지표로 병목
범위를 좁힌 뒤 짧게 붙인다"는 원칙을 명시하고 있고, 이 판단이 그 원칙과 일치한다.

**순서.** T-29(공짜 지표 등록) → EXP 착수 → 쿼리 특정이 실제로 필요해진 시점에 E-39.
필요가 확인된 뒤에 켜야 오버헤드 판단도 정확해진다.

### E-40. [참고] 실행계획(EXPLAIN)은 이 시스템의 수집 대상이 아니다 — 상태: 해당 없음

기록용 판단. EXPLAIN은 **시계열이 아니라** 특정 쿼리 하나에 대한 구조적 설명이라
Prometheus로 긁을 수 있는 종류의 데이터가 아니다. 자동 수집 대상이 아니라
**원인 규명 단계의 수동 도구**이며, 결과물은 해당 실험 디렉터리에 첨부한다
(예: `performance/experiments/EXP-005-comment-nplus1/`에 쿼리 플랜 첨부).

`performance/tools/README.md`의 "DB / Redis 심층 분석" 표에 EXPLAIN·performance_schema
digest 조회·p6spy가 이미 그렇게 분류돼 있다. 이 분류를 유지한다.
