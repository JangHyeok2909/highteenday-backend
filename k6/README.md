# k6 부하 테스트 — HighTeenDay Backend

아키텍처 병목을 드러내기 위한 현실적 부하 테스트 환경.

## Prerequisites

```bash
# k6 설치 (macOS)
brew install k6

# 서버 실행
./gradlew bootRun --args='--spring.profiles.active=local'
```

## Quick Start

```bash
# 개별 시나리오 실행
k6 run k6/scenarios/01-baseline-browsing.js

# 오케스트레이터 (mixed workload)
k6 run k6/main.js

# 환경변수 조정
K6_BASE_URL=http://localhost:8080 K6_USERS=50 k6 run k6/scenarios/01-baseline-browsing.js

# JSON 출력
k6 run --out json=results.json k6/scenarios/02-lunch-rush.js
```

## 시나리오 목록

| # | 시나리오 | 타겟 병목 | Executor | 강도 |
|---|---------|----------|----------|------|
| 01 | Baseline Browsing | 기준선 (병목 없음) | ramping-vus 100 | 낮음 |
| 02 | Lunch Rush | HikariCP pool=10 고갈 | ramping-vus 500 | 높음 |
| 03 | Viral Post | 좋아요 Row Lock + 카운터 Race | constant-vus 200 | 중간 |
| 04 | Comment Battle | 댓글 카운트 Lost Update | constant-vus 100 | 중간 |
| 05 | Notification Storm | 알림 폴링 무캐시 DB 부하 | constant-vus 300 | 높음 |
| 06 | Search Spike | LIKE 풀 테이블 스캔 | ramping-arrival-rate 100/s | 높음 |
| 07 | Cache Miss Storm | Cache Stampede (Thundering Herd) | shared-iterations 200 | 순간 |
| 08 | Login Burst | bcrypt CPU 포화 | shared-iterations 500 | 중간 |
| 09 | New Post Surge | 캐시 무효화 쓰래싱 | constant-vus 120 | 중간 |
| 10 | Soak Test | 메모리 누수 / GC 압박 | constant-vus 80, 30분 | 지속 |

## 환경변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `K6_BASE_URL` | `http://localhost:8080` | 서버 URL |
| `K6_USER_PASSWORD` | `K6LoadTest!1` | 테스트 사용자 비밀번호 |
| `K6_USERS` | `100` | 등록할 테스트 사용자 수 |
| `K6_BASELINE_VUS` | `100` | 01 시나리오 최대 VU |
| `K6_LUNCH_PEAK` | `500` | 02 시나리오 피크 VU |
| `K6_VIRAL_POST_ID` | `1` | 03 시나리오 대상 게시글 |
| `K6_VIRAL_VUS` | `200` | 03 시나리오 VU |
| `K6_BATTLE_POST_ID` | `1` | 04 시나리오 대상 게시글 |
| `K6_BATTLE_VUS` | `100` | 04 시나리오 VU |
| `K6_NOTIF_VUS` | `300` | 05 시나리오 VU |
| `K6_SEARCH_PEAK_RATE` | `100` | 06 시나리오 피크 iter/sec |
| `K6_CACHEMISS_VUS` | `200` | 07 시나리오 VU |
| `K6_LOGIN_VUS` | `100` | 08 시나리오 VU |
| `K6_SOAK_VUS` | `80` | 10 시나리오 VU |
| `K6_SOAK_DURATION` | `30m` | 10 시나리오 지속 시간 |

## 디렉토리 구조

```
k6/
├── main.js              # 오케스트레이터
├── config/
│   ├── environments.js  # 환경 설정
│   └── thresholds.js    # 임계값 정의
├── data/
│   ├── boards.json      # 게시판 가중치
│   └── seed-posts.json  # 테스트 대상 게시글
├── utils/
│   ├── auth.js          # 토큰 풀 관리
│   ├── distributions.js # Zipf/가중 분포
│   ├── metrics.js       # 커스텀 메트릭
│   ├── http-helpers.js  # HTTP 래퍼
│   └── think-time.js    # 대기 시간
├── flows/
│   ├── browse-board.js  # 게시판 브라우징
│   ├── read-post.js     # 글 상세+댓글
│   ├── engage-post.js   # 좋아요/스크랩
│   ├── write-comment.js # 댓글 작성
│   ├── write-post.js    # 글 작성
│   ├── search.js        # 검색
│   ├── poll-notifications.js # 알림 폴링
│   ├── login.js         # 로그인
│   └── hot-posts.js     # 인기글
└── scenarios/           # 10개 시나리오
```

## 아키텍처 병목 TOP 10

1. **HikariCP pool=10 vs Tomcat=400** — 모든 시나리오에서 드러남
2. **댓글 카운트 Race Condition** — `post.getCommentCount()+1` read-then-write
3. **검색 LIKE 풀 테이블 스캔** — FULLTEXT 인덱스 없음
4. **알림 폴링 무캐시** — COUNT 쿼리 매번 DB 직접 조회
5. **캐시 스탬피드** — singleflight 없는 Redis 캐시 미스
6. **좋아요 Row Lock Contention** — syncCounts() COUNT + UPDATE
7. **인기글 N+1** — loop findOptionalById()
8. **매 요청 토큰 검증 DB 조회** — userRepository.findByEmail()
9. **Offset 페이지네이션 비용** — deep page OFFSET 스캔
10. **Redis KEYS 패턴 스캔** — ViewCountScheduler O(n)

## Observability

### 테스트 중 모니터링 포인트

```bash
# JVM 힙
curl localhost:8080/actuator/metrics/jvm.memory.used

# HikariCP 활성 커넥션
curl localhost:8080/actuator/metrics/hikaricp.connections.active

# Tomcat 활성 스레드
curl localhost:8080/actuator/metrics/tomcat.threads.busy

# Redis 상태
redis-cli INFO stats
redis-cli INFO memory
```

### 장애 직전 신호

1. HikariCP pending > 0 지속 → 커넥션 기아 임박
2. p99 500ms → 5s 급등 → 스레드 큐잉
3. 5xx burst → connectionTimeout 또는 deadlock
4. GC pause 빈도 증가 → 힙 압박
5. Redis latency 스파이크 → KEYS 스캔 또는 포화

## 권장 실행 순서

1. `01-baseline` — 기준선 확보
2. `04-comment-battle` — 가장 단순한 정합성 검증
3. `03-viral-post` — 카운터 contention
4. `02-lunch-rush` — 전체 부하
5. `05-notification-storm` — 알림 DB 부하
6. `06-search-spike` — 검색 부하
7. `07-cache-miss-storm` — 캐시 stampede (Redis flush 필요)
8. `08-login-burst` — CPU 부하
9. `09-new-post-surge` — 캐시 thrashing
10. `10-soak-test` — 30분 장기 안정성
