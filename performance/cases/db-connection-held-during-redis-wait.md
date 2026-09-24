# Redis 장애 중 DB 커넥션 점유 증가

> 상태: needs-evidence — 점유 증가는 관측, OSIV 원인은 미검증
> 영향도: high — Redis 장애와 함께 MySQL 커넥션 풀이 최대 60/60까지 사용됨
> 대조군 실행: `redis-crash-2026-09-17T07-14-13` (서킷브레이커 없음)
> 비교 실행: `redis-crash-2026-09-17T06-14-24` (서킷브레이커 있음)
> 관련: [Redis 장애 전파](redis-failure-cascade.md)의 후속 조사

## 요약

Redis를 60초 중단한 대조군 실행에서 HikariCP active가 최대 60/60까지 올라갔다.
커넥션 1회 점유 시간은 정상 구간 28.36ms에서 장애 구간 57.56ms로 늘었고,
요청 평균 소요 시간도 45.38ms에서 119.89ms로 늘었다. Redis 장애 중 요청 지연과
커넥션 점유 증가가 함께 관측된 것이다.

서킷브레이커가 있는 같은 계획의 실행에서는 장애 구간 HTTP p95가 대조군
368ms에서 191ms로, HikariCP active 최대가 60개에서 35개로 낮았다. 이는
반복 Redis 대기를 줄인 완화 관측이다. **어떤 코드 경로가 커넥션을 오래 쥐었는지는
확인하지 못했다.** OSIV가 유력한 가설이지만 커넥션 획득·반납 시각을 요청별로
확인하지 않았다. 트랜잭션 내부 Redis 폴백은 전체 폴백의 7.8%였으나, 호출
건수만으로 트랜잭션의 기여를 배제할 수는 없다.

## 문제 개요와 영향

대조군은 Redis 장애 구간에 HikariCP active 평균 33.5개, 최대 60개를 기록했다.
Tomcat busy도 평균 31.5개, 최대 50개로 늘었다. 같은 구간의 커넥션 획득 대기 평균은
0.25ms였다. 풀이 최고치에 닿았지만 이 실행에서 지속적인 획득 대기나 다른 기능의
실패가 재현됐다고 보기는 어렵다. 평균 대기 시간은 개별 요청의 최대 대기 시간을
보여 주지도 않는다.

이 상태에서 도착률을 더 올리면 대기가 쌓일 수 있지만, 그 임계값은 이번 실행으로
측정하지 않았다. 앞선 [Redis 장애 전파](redis-failure-cascade.md) 실행은 다른 조건에서
커넥션 풀 대기와 인증 실패를 관측했다.

## 탐지와 관측 근거

Hikari의 `hikaricp_connections_usage_seconds`는 커넥션을 빌린 뒤 돌려주기까지의
시간을 기록한다. 같은 구간의 `_sum ÷ _count`로 아래의 평균 점유 시간을 계산했다.
요청 시간은 `http_server_requests_seconds`의 평균이다. 둘 다 **구간별 집계 평균**이므로
표의 점유/요청 비율은 개별 요청이 커넥션을 쥔 비율이 아니다.

| 실행 | 구간 | 커넥션 1회 점유 | 요청 1건 소요 | 두 평균의 비율 | 초당 체크아웃 |
|---|---|---:|---:|---:|---:|
| 대조군 | pre | 28.36ms | 45.38ms | 62% | 479 |
| 대조군 | fault | 57.56ms | 119.89ms | 48% | 515 |
| 서킷 | pre | 19.92ms | 32.56ms | 61% | 473 |
| 서킷 | fault | 27.38ms | 47.18ms | 58% | 563 |

대조군에서 요청 평균은 2.64배, 커넥션 점유 평균은 2.03배가 됐다. 초당 체크아웃은
479회에서 515회로 약 7.5% 늘었다. 체크아웃 횟수 증가보다 점유 시간 증가가
두드러진다. 다만 이 집계는 어떤 요청의 어느 구간에서 커넥션이 유지됐는지
보여 주지 않는다.

| 지표 | 대조군 pre | 대조군 fault | 서킷 fault |
|---|---:|---:|---:|
| Hikari active 평균 / 관측 최대 | 7.3 / 9 | 33.5 / **60** | 19.3 / 35 |
| MySQL threads_running 평균 / 관측 최대 | 10.0 / 19 | 20.8 / 42 | 14.3 / 23 |
| Tomcat busy 평균 / 관측 최대 | 6.5 / 8 | 31.5 / **50** | 16.3 / 35 |
| 커넥션 획득 대기 평균 | — | 0.25ms | 0.21ms |

`초당 체크아웃 × 평균 점유 시간`으로 계산하면 대조군 pre 약 13.6개, fault 약
29.6개의 동시 점유가 추정된다. 그러나 pre의 추정값 13.6개는 게이지의 관측 최대
9개보다 크다. 게이지 표본 간격이나 집계 구간 차이를 대조하기 전에는 이 곱을
실제 동시 점유 수로 사용하지 않는다. 이 문서의 확정된 관측은 **점유 시간 증가와
active 최고치 60/60**이다.

## 원인과 촉발 요인

**촉발 요인:** Redis를 60초 중단했다. 서킷브레이커가 없는 대조군에서 요청과
커넥션의 평균 점유 시간이 함께 늘었다. 서킷을 사용한 비교 실행에서는 두 값이
상대적으로 낮았지만, 그 비교만으로 커넥션 유지의 주체를 알 수 없다.

**트랜잭션 경로:** 코드 조사에서 트랜잭션 안의 Redis 호출은
`HotPostService.updateLeaderboardDayScore`의 `addScore`,
`TokenService.saveOrUpdate`의 `tokenCache.delete`·`put`,
`TokenService.deleteByUserEmail`의 `tokenCache.delete`로 분류됐다.
대조군 장애 구간 폴백은 이 경로에서 382 + 116 + 82 = 580건,
전체 7,400건의 7.8%였다. 나머지 경로에는 `PostService`의 커밋 뒤 캐시 갱신과
트랜잭션이 없는 읽기·조회수 호출이 포함된다. **폴백 건수의 7.8%는 커넥션
점유 시간의 7.8%가 아니다.** 이 수치만으로 트랜잭션이 풀 사용에 기여하지
않았다고 결론 내릴 수 없다.

**OSIV 가설:** 측정 당시 `spring.jpa.open-in-view`가 명시되지 않았고 기동 로그에
기본 활성화 경고가 남았다. OSIV는 요청이 끝날 때까지 EntityManager를 유지한다.
트랜잭션 밖에서 지연 로딩 쿼리가 나간다면 커넥션 반납이 요청 종료와 가까워질
수 있어 관측과 맞는다. `PostPreviewDto.fromEntity`는 LAZY 관계인 `Post.user`와
`Post.board`에 접근한다. 하지만 그 접근이 장애 구간에 몇 번 일어났는지,
커넥션을 정확히 언제 반납했는지는 계측하지 않았다. 따라서 OSIV는 **원인 후보**다.

## 적용된 완화와 남은 검증

9월 17일 두 실행은 같은 `redis-crash.json`, medium 데이터 지문 `24ddff07519b`,
warm 캐시, 도착률 60/s, HikariCP 최대 60, Tomcat 최대 50으로 기록됐다. 앱 이미지는
다르고 실행 기록의 소스 커밋에는 `+dirty`가 붙어 있어 이미지의 모든 코드 차이를
원자료로 재구성할 수 없다. 실행 메모는 서킷브레이커 유무를 대조 변수로 명시한다.
또 서킷 적용 실행이 먼저, 미적용 대조군이 나중에 수행됐다.

| 지표 | 서킷 없음 | 서킷 있음 |
|---|---:|---:|
| fault HTTP p95 | 368ms | 191ms |
| post HTTP p95 | 443ms | 169ms |
| fault HikariCP active 최대 | 60/60 | 35/60 |
| fault Tomcat busy 최대 | 50/50 | 35/50 |
| fault HTTP 오류율 | 0% | 0.007% |

서킷이 열린 뒤 Redis 호출을 보내지 않고 폴백하는 현재 코드와 결과는 **반복 대기
완화** 설명을 지지한다. 실행 순서, dirty 이미지, 자연 변동 때문에 이 수치 차이
전부를 서킷 단독 효과로 확정하지 않는다. 서킷 도입 뒤 MySQL 반영 후 Redis 정산이
거절된 별도 위험은 [정산 Case](circuit-open-skips-viewcount-settlement.md)가 소유한다.

### 커넥션 점유 원인 검증 계획

이 Case에서 OSIV 설정이나 호출 경로를 변경하지 않았다. 먼저 트랜잭션 밖 DTO
변환을 정리한 뒤, 서킷브레이커가 없는 대조군 조건에서
`spring.jpa.open-in-view=false`만 바꿔 비교한다. 데이터셋은 medium 지문
`24ddff07519b`, `HIKARI_MAX=60`, 도착률 60/s, 장애 계획은 `redis-crash.json`으로
맞춘다. DTO 변환을 정리한 상태에서 OSIV 켜짐/꺼짐을 다시 비교해야 두 변경의
효과가 섞이지 않는다.

- OSIV를 끈 실행에서 커넥션 점유 시간이 짧아지고 Hikari active가 낮아지면
  가설을 지지한다. 요청별 커넥션 획득·반납 추적까지 확보하면 인과를 더 직접
  확인할 수 있다.
- 점유 시간과 active가 그대로면 다른 경로를 조사한다. 집계 지표만으로는
  엔드포인트별 원인을 구분할 수 없으므로 요청 경로별 추적이 필요하다.
- OSIV를 끄고 HTTP 500이 발생하면 성능 수치를 비교하기 전에 지연 로딩 실패
  경로를 바로잡아야 한다.

### OSIV를 끄기 전에 확인할 호출 경로

문서 작성 당시 코드 조사에서 `FetchType.LAZY`로 선언된 연관은 19개 엔티티의
36개였다. 그중 DTO 변환이 관계에 접근하지만 트랜잭션 밖에서 실행될 수 있는
호출을 14곳, 컨트롤러 6개로 분류했다. 실제 `LazyInitializationException` 발생을
모든 경로에서 재현한 목록은 아니다.

| 호출 경로 | DTO가 접근하는 연관 | 장애 부하 경로 |
|---|---|:---:|
| 게시글 상세 | `Post.user`, `Post.board` | ✔ |
| 게시글 검색 | `Post.user`, `Post.board` | ✔ |
| 일별 인기글 | `Post.user`, `Post.board` | ✔ |
| Redis 장애 시 인기글 DB 폴백 | `Post.user`, `Post.board` | ✔ |
| 댓글 목록 2곳 | `Comment.user`, `.post`, `.parent` | |
| 마이페이지 게시글 2곳 | `Post.user`, `Post.board` | |
| 마이페이지 댓글 | `Comment.user`, `.post`, `.parent` | |
| 급식 조회 2곳 | `SchoolMeal.school` | |
| 시간표 3곳 | `UserTimetable.subject` | |

특히 인기글 DB 폴백은 Redis 장애 때 실행되므로 OSIV를 끈 상태에서 지연 로딩이
실패하면 장애 구간의 인기글 요청이 500이 될 수 있다. 현재 장애 시나리오가 밟는
것은 위 14곳 중 4곳이다. 나머지 10곳도 별도 요청이나 테스트로 확인해야 한다.

DTO를 트랜잭션 안에서 만들거나 필요한 연관을 fetch join·DTO projection으로
가져오는 방법이 있다. `PostService.createPost`는 트랜잭션 안에서 DTO를 만들고,
[댓글 쿼리 Case](comment-query-amplification.md)는 fetch join을 사용한 선례다.
반면 `ChatService`, `NotificationService`, `FriendService` 등 트랜잭션 안에서
DTO를 만드는 경로는 이 코드 조사에서 위험 경로로 분류하지 않았다.

## 배운 점과 남은 위험

- 요청 시간과 커넥션 점유 시간의 동반 상승은 원인 후보를 좁히지만,
  집계 평균만으로 OSIV와 트랜잭션의 기여를 분리할 수 없다.
- 현재 장애 실행은 풀 사용 최고치 60/60을 보였지만 획득 대기는 평균 0.25ms였다.
  지속적인 풀 대기와 그 이후의 실패 지점은 추가 부하에서 검증해야 한다.
- OSIV를 끄는 실험은 지연 로딩 실패를 낼 수 있다. 14개 후보 경로를 확인하지
  않고 성능 결과만 읽으면 기능 회귀를 놓칠 수 있다.

## 후속 조치

| 할 일 | 확인할 것 | 상태 |
|---|---|---|
| DTO 변환 위험 경로 14곳을 최신 코드에서 확인하고 테스트 | OSIV 비활성화 시 기능 회귀 방지 | 미검증 |
| 동일 조건에서 OSIV만 켜고 끈 실행과 커넥션 수명 추적 | OSIV와 점유 증가의 인과 | 미실행 |
| 도착률을 높인 별도 실행 | 커넥션 획득 대기가 쌓이기 시작하는 지점 | 미실행 |

OSIV를 꺼도 점유 시간과 active가 줄지 않으면 가설을 수정한다. 트랜잭션 내부
폴백의 시간 비중이 호출 건수 비중보다 크다면 트랜잭션 경로도 다시 평가한다.

## 근거

- 대조군: [report.html](../resilience/reports/redis-crash-2026-09-17T07-14-13/report.html) · [run.json](../resilience/reports/redis-crash-2026-09-17T07-14-13/run.json)
- 서킷 비교: [report.html](../resilience/reports/redis-crash-2026-09-17T06-14-24/report.html) · [run.json](../resilience/reports/redis-crash-2026-09-17T06-14-24/run.json)
- 커넥션 점유 시간은 `run.json`에 없다. 당시 Prometheus 질의:

  ```promql
  1000 * sum(increase(hikaricp_connections_usage_seconds_sum{job="spring-app"}[60s]))
      / sum(increase(hikaricp_connections_usage_seconds_count{job="spring-app"}[60s]))
  1000 * sum(increase(http_server_requests_seconds_sum{job="spring-app",uri!~"/actuator.*"}[60s]))
      / sum(increase(http_server_requests_seconds_count{job="spring-app",uri!~"/actuator.*"}[60s]))
  ```

- 관련 코드: `Post`, `PostPreviewDto.fromEntity`, `PostService`, `AfterCommitExecutor`
