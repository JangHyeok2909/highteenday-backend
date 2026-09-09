# HighTeenDay 인기글 데이터 수집·서빙

```html-raw
<p class="lead">사용자 행동을 집계해 일간 인기글로 제공하고, 조회수 증가분 유실과 댓글 목록 N+1을 개선했습니다.</p>
<p class="meta">장혁 · Backend Engineer · 보충역 4급 · 산업기능요원 신규 편입 가능 · 2026.09</p>
```

[GitHub 저장소](https://github.com/JangHyeok2909/highteenday-backend) ·
[N+1 개선 근거](https://github.com/JangHyeok2909/highteenday-backend/blob/main/performance/optimizations/OPT-002-comment-author-fetch-join.md) ·
[부하 실험 대시보드](https://janghyeok2909.github.io/highteenday-backend/)

```html-raw
<div class="kpi">
  <div><b>1,507 &rarr; 3.9</b><span>댓글 목록 요청당 평균 쿼리 수<br>댓글 6건과 4,040건 모두 쿼리 4회</span></div>
  <div><b>226.7 &rarr; 34.3ms</b><span>API 혼합 시나리오 전체 p95<br>동일 조건에서 단계별 5회 측정</span></div>
  <div><b>119건 중 49건 제외</b><span>저장된 부하 실행 재판정<br>포화 실행을 비교 기준 후보에서 제외</span></div>
</div>
```

## 1. 프로젝트에 대해

| 기간 | 개발 형태 | 담당 범위 |
|---|---|---|
| 2025.05.07 ~ 2025.08.30 | 백엔드 3명·프론트엔드 4명 | 게시글·댓글·인기글·S3 파일 업로드 |
| 2025.08.31 ~ 현재 | 백엔드 단독 개발 | 기존 사용자·인증 영역을 포함한 백엔드 전반의 변경·유지보수, 성능 측정 자동화 도구 개발 |

HighTeenDay는 고등학생 대상 익명 커뮤니티입니다. 
게시글·댓글·반응·스크랩·조회 데이터를 사용해 일간 인기글을 제공하고, 알림·채팅·파일 업로드 기능을 함께 구현했습니다. 
동아리에서 부원들과 함께했고 제가 회장으로서 프로젝트를 리드했습니다. 

### 핵심 문제와 검증 방법

| 쪽 | 문제 | 변경 | 확인 방법 |
|---:|---|---|---|
| 3 | 조회수 DB 반영 실패 시 증가분 유실 | DB 반영 성공분만 Redis에서 차감 | 실패한 증가분 유지·다음 게시글 계속 처리 테스트 |
| 4~5 | 댓글 수와 작성자 수에 따라 쿼리 증가 | 일괄 조회·페치 조인 | 쿼리 수 테스트 |
| 6~7 | 조건이 다른 부하 실행을 비교 기준으로 선택 | 실행 조건 검사·포화 실행 제외 | 저장된 실행 재분석·선택 테스트 |

```html-raw
<div class="scope"><b>측정 환경과 범위</b><br>
medium 생성 데이터: 사용자 1,000명 · 게시글 10,000건 · 댓글 40,000건 · 반응 100,000건<br>
실험 환경: Docker 기반 로컬 · 애플리케이션 CPU 2코어<br>
모든 성능 수치는 생성 데이터와 로컬 부하 테스트 결과<br>
</div>
```

### 기술 스택

| 구분 | 내용 |
|---|---|
| 애플리케이션 | Java 17, Spring Boot 3.4, JPA, QueryDSL |
| 데이터 | MySQL 8, Redis, Flyway |
| 성능 측정 자동화 | k6, Actuator, Micrometer, Prometheus, Grafana |
| 배포 경험 | Docker, GitHub Actions, AWS EC2·S3 |

```html-raw
<div class="pagebreak"></div>
```

## 2. 사용자 행동 집계와 인기글 서빙

### 데이터 경로

댓글·반응·스크랩 저장이 커밋된 뒤 인기글 점수를 갱신합니다. 
조회는 요청마다 DB를 갱신하지 않고 Redis에 증가분을 저장해두었다가 60초 주기로 DB에 반영한 뒤
인기글 점수를 갱신합니다. 일간 인기글은 Redis Sorted Set의 점수 순으로 조회합니다.

```html-raw
<div class="fig">
  <div class="flow">
    <div class="flow-step"><b>사용자 행동</b><span>댓글·반응·스크랩<br>조회</span></div>
    <div class="flow-arrow">›</div>
    <div class="flow-step"><b>행동 수집</b><span>댓글·반응·스크랩: AFTER_COMMIT<br>조회: Redis INCR</span></div>
    <div class="flow-arrow">›</div>
    <div class="flow-step"><b>점수 갱신</b><span>즉시 또는<br>60초 주기</span></div>
    <div class="flow-arrow">›</div>
    <div class="flow-step"><b>인기글 서빙</b><span>Redis Sorted Set<br>상위 게시글</span></div>
  </div>
  <div class="fig-cap">그림 1. 사용자 행동이 인기글 목록으로 이어지는 경로</div>
</div>
```

### 구현 결정

| 결정 | 선택 이유 | 남은 한계                                                               |
|---|---|-------------------------------------------------------------------------|
| 댓글·반응·스크랩은 `AFTER_COMMIT`에서 반영 | 롤백된 행동이 인기글 점수에 남는 것을 방지 | 프로세스가 종료되면 커밋 뒤 실행하지 못한 이벤트는 재처리하지 못함      |
| 조회는 Redis에서 집계 | 조회 요청마다 게시글 행을 갱신하는 쓰기 부하 감소 | Redis 장애 중 들어온 조회수는 보존하지 못함                             |
| 일간 키에 TTL 지정 | 날짜별 키가 계속 남는 문제 방지 | ZADD 뒤 EXPIRE 전에 실패하면 키가 남을 수 있음                          |
| Redis Sorted Set으로 순위 조회 | 점수 갱신과 상위 N개 조회를 단순한 연산으로 처리 | Redis가 죽으면 인기글 갱신 불가, DB 폴백으로 동일한 인기글만 노출됨     |
| 상위 50개 점수를 5분마다 재계산 | 시간이 지난 게시글의 점수를 낮춰 순위에 반영 | 51위 밖의 오래된 글은 감쇠 전 점수가 남아 다음 재정렬 때 유리할 수 있음 |

### 운영 한계

좋아요·댓글·스크랩·조회 가중치는 실사용자 데이터로 검증하지 못했습니다. 
현재의 가중치는 임의로 정한 것이며 인기글 기능의 동작 자체에 집중했습니다.

```html-raw
<div class="pagebreak"></div>
```

## 3. 조회수 반영 실패 시 데이터 유실 축소

### 문제

기존 작업에는 결함이 둘 있었습니다.  
Redis 증가분을 `GETDEL`로 꺼내면서 먼저 삭제한 뒤 DB에 반영해서, 반영이 실패하면 이미 지운 증가분을 복구할 수 없었습니다.

다른 하나는 트랜잭션 경계입니다. 배치가 게시글별 반영 메서드를 같은 클래스 안에서 직접 호출해
그 메서드의 `@Transactional`이 프록시를 거치지 못했습니다. 그래서 게시글 단위로 나뉘어야 할
트랜잭션이 배치 전체 하나로 묶였고, 50번째 게시글이 실패하면 앞서 반영한 49개까지 롤백됐습니다.

### 변경한 순서

```html-raw
<div class="compare">
  <div><h5>변경 전</h5><b>Redis에서 읽고 삭제</b><br>DB 반영<br>실패하면 증가분 복구 불가</div>
  <div><h5>변경 후</h5><b>Redis에서 읽기</b><br>게시글별 DB 반영<br>성공한 값만 Redis에서 차감</div>
</div>
```

`ViewCountScheduler`는 Redis에 쌓인 게시글별 조회수 증가분을 읽고 DB 반영을 시도합니다. 
성공한 값만 `DECRBY`로 차감하고, 실패한 값은 Redis에 남겨 다음 주기에 다시 시도합니다. 
삭제된 게시글은 다시 시도해도 성공하지 않으므로 증가분을 정리합니다.

### 새 조회수를 보존하기 위한 DECRBY 차감

Redis 값을 읽은 뒤 DB에 반영하는 동안 새 조회가 들어올 수 있습니다. 
키를 삭제하면 새 증가분도 함께 사라지기에, 
읽었던 값만 `DECRBY`로 차감하여 이후에 들어온 증가분은 다음 주기에 반영되도록 했습니다.

### 검증

| 실패 조건 | 기대 결과 | 테스트 결과 |
|---|---|---|
| 첫 게시글 DB 반영 실패 | 실패한 증가분 Redis에 유지 | 통과 |
| 첫 게시글 실패 뒤 두 번째 게시글 처리 | 두 번째 게시글 DB 반영·점수 갱신 | 통과 |
| 삭제된 게시글 | 증가분 정리, 점수 갱신 생략 | 통과 |
| 정상 반영 | DB 반영 뒤 Redis 차감 | 호출 순서 검증 통과 |

### 남은 중복·유실 구간

이 변경은 DB 반영 실패 시 증가분 보존과 게시글별 실패 격리를 보장합니다. 그러나 DB 반영과
Redis 차감은 서로 다른 저장소 연산이기에, DB 커밋 뒤 `DECRBY` 전에 프로세스가 종료되면 증가분이 남아 다음 주기에 한 번 더 반영될 수 있습니다. 
이 중복까지 막으려면 이미 반영한 작업을 식별하는 멱등 기록이나 별도 이벤트 로그가 필요하다고 판단 중이고 현재는 이 문제에 대해 문서화만 해둔 상태입니다.

`DECRBY` 결과가 0 이하일 때 키를 삭제합니다. 차감 직후 키를 삭제하기 전에 새 조회가 들어오면
그 증가분은 유실됩니다. 저는 조회수가 정확성보다 게시글 조회의 가용성을 우선한 데이터라고 판단하고 있습니다. 
그렇기에 이 조건을 받아들였습니다. 
정확한 행동 로그가 필요하면 Lua script 또는 별도 이벤트 로그로 두 연산을 묶어야 합니다.


```html-raw
<div class="pagebreak"></div>
```

## 4. 댓글 목록 API N+1 원인 추적과 개선

### 문제

혼합 시나리오 부하 테스트의 결과로 슬로우 쿼리와 평균 요청당 쿼리 319.4개를 발견했습니다. 
이를 보고 N+1을 의심했지만 다양한 엔드포인트로의 요청이 섞인 테스트였기에 어디서 많은 쿼리가 발생했는지 파악할 수가 없었습니다.
그렇기에 엔드포인트별 쿼리 계측을 측정 시스템에 추가했습니다.

### 원인 추적 

엔드포인트별 요청당 쿼리 수와 실행된 SQL의 수를 측정하도록 하였고, 아래의 측정 결과를 얻었습니다.

- 댓글 목록 조회 엔드포인트의 요청당 쿼리 수: 1,507개
  - 반응 조회: 1,396개
  - 유저 조회: 108개

이를 통해 코드 레벨에서 문제를 찾을 수 있었습니다.

### 1단계: 댓글별 반응 조회 일괄 처리

댓글마다 내가 좋아요/싫어요를 누른 댓글인지 조회하는 쿼리가 있었습니다. 이를 댓글 ID 목록 한 번으로 조회하도록 바꿨습니다.

```java
// 변경 전
select r from CommentReaction r
where r.comment = :comment and r.user = :user and r.kind = :kind and r.isValid = true

// 변경 후
select r from CommentReaction r
where r.user = :user and r.isValid = true and r.comment.id in :commentIds
```

| 항목 | 변경 전 | 1단계 뒤 |
|---|---:|---:|
| 요청당 쿼리 | 1,507 | 112 |
| 댓글 목록 API 평균 응답 시간 | 350.0ms | 36.1ms |
| 혼합 시나리오 전체 p95 | 226.7ms | 57.2ms |

### 2단계: 작성자 페치 조인

댓글 목록을 가져올 때 `ManyToOne` 작성자를 페치 조인했습니다. 
댓글 한 건의 작성자는 한 명이므로 컬렉션 페치 조인처럼 결과 행이 늘어나지 않습니다.

```java
// 변경 전
select c from Comment c where c.isValid=true and c.post=:post

// 변경 후
select c from Comment c join fetch c.user where c.isValid=true and c.post=:post
```

```html-raw
<div class="fig">
  <div class="bar-row"><span class="bar-label">최초</span><span class="bar-track"><span class="bar-fill" style="width:100%"></span></span><span class="bar-val">1,507</span></div>
  <div class="bar-row"><span class="bar-label">반응 일괄 조회</span><span class="bar-track"><span class="bar-fill" style="width:7.4%"></span></span><span class="bar-val">112</span></div>
  <div class="bar-row"><span class="bar-label">작성자 페치 조인</span><span class="bar-track"><span class="bar-fill after" style="width:0.27%"></span></span><span class="bar-val">4</span></div>
  <div class="fig-cap">그림 2. 댓글 목록 단일 요청의 쿼리 수</div>
</div>
```

### 결과

| 단계 | 요청당 평균 쿼리 | 댓글 목록 API 평균 | 혼합 시나리오 전체 p95 | p95 변동계수(표준편차÷평균) |
|---|---:|---:|---:|---:|
| 최초 | 1,507 | 350.0ms | 226.7ms | 12.8% |
| 반응 일괄 조회 | 112 | 36.1ms | 57.2ms | 13.5% |
| 작성자 페치 조인 | 3.9 | 16.4ms | 34.3ms | 5.2% |

성능 수치는 2026년 9월 1일부터 4일까지 같은 조건에서 5분씩 5회 측정했습니다. 조건은
`open arrival-rate`, 목표 초당 4건, medium 데이터셋, 앱·MySQL 각 2코어, HikariCP 10개입니다.
226.7ms와 34.3ms는 API 혼합 시나리오(`normal-day`)의 회차별 p95 평균입니다.

## 5. N+1 검증과 부작용

### 데이터 크기와 쿼리 수

개선 이후 다시 잰 쿼리의 수입니다.

| 댓글 수 N | 서로 다른 작성자 U | 최초 (모델 3+U+2N) | 반응 일괄 조회 뒤 | 작성자 페치 조인 뒤 |
|---:|---:|---:|---:|---:|
| 6 | 5 | 20 | 9 | 4 |
| 492 | 130 | 1,117 | 134 | 4 |
| 4,040 | 450 | 8,533 | 454 | 4 |

이 표는 부하 없이 게시글 하나를 지정해 한 번 요청하고 센 값입니다. 
`최초` 열만 1단계 측정의 N과 U를 식에 넣어 계산했고, 나머지 두 열은 실측값입니다. 개선 뒤에는 인증, 게시글, 댓글 목록, 반응 일괄 조회가 각 1회 실행됩니다. 
댓글이 없는 게시글은 반응 조회를 건너뛰어 쿼리가 3회이므로 부하 중 평균은 3.92회였습니다.

### 페치 조인 제거 시 실패하는 테스트

테스트 데이터의 작성자가 영속성 컨텍스트에 남아 있으면 페치 조인이 없어도 테스트가 통과할 수
있습니다. 데이터 준비 뒤 `em.clear()`로 영속성 컨텍스트를 비우고 Hibernate 쿼리 수를 확인했습니다.
페치 조인을 제거하면 작성자마다 쿼리가 한 번씩 더 나가 테스트가 실패합니다. 

### 검토한 대안

| 대안 | 예상 쿼리 | 판단 |
|---|---:|---|
| `@BatchSize(100)` | 1 + ceil(U/100) | 작성자 450명이면 5회가 남고 다른 조회 경로에도 영향 |
| 전역 batch fetch | 1 + ceil(U/n) | 애플리케이션 전체 지연 로딩 동작 변경 |
| `@EntityGraph` | 1 | JPQL 필터와 연관 로딩 정의가 두 위치로 분리 |
| DTO projection | 1 | 읽는 컬럼은 줄지만 호출부 3곳 변경 필요, 별도 과제로 분리 |
| 작성자 일괄 조회 | 2 | 사용자 행 중복은 줄지만 왕복 1회 추가 |
| `ManyToOne` 페치 조인 | 1 | 변경 범위가 한 쿼리이며 결과 행 수 유지, 채택 |

### 채택안의 비용

페치 조인 뒤 MySQL이 초당 읽은 행은 5,935에서 7,294로 22.9% 늘었습니다. 
같은 실행에서 요청당 DB CPU 시간은 8.43ms에서 6.35ms로 줄었습니다. 
두 값은 함께 관측된 결과이며, 당시 버퍼풀 적중률은 100%였습니다. 
데이터가 버퍼풀보다 커지면 DTO projection 또는 작성자 일괄 조회를 다시 비교해야 합니다.

```html-raw
<div class="pagebreak"></div>
```

## 6. 성능 측정 자동화 도구와 비교 조건 검사

### 실행 흐름

`perf-run.js`에서 실행 조건 확인, 부하 실행, 지표 수집, 비교 기준 선택, HTML 보고서 생성을 한 번에 처리합니다. 
k6 결과, 데이터셋 상태, 앱 이미지, 측정 구간을 실행별로 저장합니다.

```html-raw
<div class="fig">
  <div class="flow">
    <div class="flow-step"><b>실행 조건 확인</b><span>데이터셋 상태<br>앱 이미지·부하</span></div>
    <div class="flow-arrow">›</div>
    <div class="flow-step"><b>부하 실행</b><span>k6<br>warm-up·측정·ramp-down</span></div>
    <div class="flow-arrow">›</div>
    <div class="flow-step"><b>지표 수집</b><span>앱·DB·Redis<br>컨테이너·호스트</span></div>
    <div class="flow-arrow">›</div>
    <div class="flow-step"><b>비교 기준 선택</b><span>조건이 같은<br>최근 유효 실행</span></div>
    <div class="flow-arrow">›</div>
    <div class="flow-step"><b>판정과 보고</b><span>포화·회귀<br>HTML 보고서</span></div>
  </div>
  <div class="fig-cap">그림 3. 성능 측정 자동화 도구의 실행 흐름</div>
</div>
```

필수 실행 조건이 다르거나 기록되지 않았으면 이전 실행과 비교하지 않고 그 이유를 보고서에 남깁니다.

### 비교 기준 선택 오류

성능 회귀 검사기는 시나리오 이름만 같으면 직전 실행을 비교 기준으로 사용했었습니다. 
그래서 200 VU·large 데이터셋 실행을 15 VU·small 데이터셋 실행과 비교하는 문제가 생겼습니다. 
부하는 13배, 데이터는 100배 차이가 났고 이전 p95 101ms와 현재 60,001ms를 비교하여 매우 큰 성능 저하로 오진했습니다.

그래서 비교 기준을 결정하는 조건을 만들었습니다.

| 비교 전 확인 조건 | 다르면 처리하는 방법 |
|---|---|
| 시나리오·실행 환경 | 이전 실행과 비교하지 않음 |
| 데이터 생성 조건·실행 전 DB 상태 | 이전 실행과 비교하지 않음 |
| 부하 방식·크기·발생 위치 | 이전 실행과 비교하지 않음 |
| warm-up·측정·ramp-down 구간 | 이전 실행과 비교하지 않음 |
| 앱 이미지·k6 스크립트 버전 | 비교 결과에 경고 표시 |
| 측정 중 별도 부하 작업·k6 지표 전송 여부 | 비교 결과에 경고 표시 |

조건 값이 없으면 이전 실행과 비교하지 않고 p95 500ms 같은 절대적으로 지켜야 하는 기준인 SLO만 확인합니다. 
비교 조건은 실행 전에 정한 시나리오·부하·데이터로 제한했습니다.

### 포화 환경에서 커진 세션 간 편차

포화 이하 반복의 p95 평균 차이는 1.5%였지만, 200 VU 포화 실행에서는 같은 코드와 초기 데이터에서도 하루 안에 48%까지 벌어졌습니다.
세션별 처리량 차이의 원인을 찾기 위해 동일한 2코어 제한에서 CPU 벤치마크를 반복하고 VM 재부팅 전후를 비교했습니다. 기존 지표만으로 구분되지 않아 GC·JIT·스레드 상태와 MySQL 행 잠금·쿼리 실행 상태를 확인하는 지표 23개를 추가했습니다. 각 지표를 실행별로 대조했지만 처리량 차이를 단독으로 설명할 근거를 찾지 못했습니다.

원인은 규명하지 못했지만, 코드를 바꾸지 않아도 p95가 최대 48% 달라져 회귀 검사 결과만으로 코드 변경 효과를 구분할 수 없었습니다. 원인 추적과 별개로 편차가 크게 나타난 포화 실행과 같은 편차가 재현되지 않은 포화 이하 실행을 구분해, 서로 다른 상태의 실행이 성능 비교에 섞이지 않도록 했습니다.

이후 포화 구간을 나누기 위해 같은 코드와 초기 데이터에서 초당 요청 수만 바꿔 측정했습니다.

| 목표 부하 | 실제 처리율 | 목표 처리 비율 | p95 | 앱 CPU | 커넥션 대기 스레드 |
|---|---:|---:|---:|---:|---:|
| 초당 4건 | 4.03/s | 101% | 402ms | 52% | 0 |
| 초당 5건 | 3.83/s | 77% | 11,871ms | 97% | 65 |
| 고정 200 VU | 5.96/s | 해당 없음 | 10,685ms | 100% | 145 |

이 표는 N+1 개선 전 코드를 60초 예열한 뒤 2분간 측정한 결과입니다. 
목표 부하를 초당 4건에서 5건으로 25% 올리자 실제 처리율은 목표의 77%에 그쳤고 p95는 약 30배가 됐습니다. 
요청이 쌓이지 않은 초당 4건에서 코드를 바꾸지 않고 4시간 간격으로 다시 측정하자 p95 차이는 1.5%였습니다.

이 편차가 코드 변경에 따른 성능 차이를 가릴 수 있어 포화 실행을 성능 비교 대상에서 분리했습니다.
저장된 실행 119건을 다시 판정해 49건을 비교 기준 후보에서 뺐습니다.

### 포화 상태 분류

```html-raw
<div class="mini-grid">
  <div><b>DB 커넥션 대기</b>대기 스레드 수와 커넥션 획득 시간</div>
  <div><b>CPU 상한</b>컨테이너 CPU 사용률과 CPU 제한 비율</div>
  <div><b>목표 부하 달성</b>open model의 목표 요청 수와 실제 처리 수</div>
  <div><b>실행 상태</b>HEADROOM(여유) · NEAR_LIMIT(한계 근접) · SATURATED(포화) · UNKNOWN(판정 불가)</div>
</div>
```

포화 자체는 정상적인 상황이기에 테스트 실패 레벨로 두지는 않았습니다. 
또한 포화된 상태에서의 테스트도 유의미하다고 판단하여 실행 결과는 보존하되 포화 상태와 비포화 상태의 성능 비교만을 막아 성능 변화의 신뢰도가 깨지지 않도록 했습니다.

## 7. AI 활용과 결과 검증

### AI 활용과 검증 책임

기능의 기대 동작과 재현 조건, 구현 대안, 완료 기준은 직접 정합니다.
AI 에이전트에는 구현·테스트·문서화 작업을 맡깁니다.
작성된 결과는 자동화 테스트와 측정으로 확인합니다.
댓글 N+1 개선은 페치 조인을 제거하면 실패하는 쿼리 수 테스트로 검증했고, 성능 변화는 같은 조건에서 5회씩 다시 측정했습니다.
이 결과를 바탕으로 구현 채택 여부와 성능 개선 여부를 직접 판단합니다.

### 공개 검증 자료

| 내용 | 링크 |
|---|---|
| 반응 조회 N+1 개선 | [OPT-001](https://github.com/JangHyeok2909/highteenday-backend/blob/main/performance/optimizations/OPT-001-comment-reaction-batch.md) |
| 작성자 조회 N+1 개선 | [OPT-002](https://github.com/JangHyeok2909/highteenday-backend/blob/main/performance/optimizations/OPT-002-comment-author-fetch-join.md) |
| 조회수 실패분 보존 | [스케줄러](https://github.com/JangHyeok2909/highteenday-backend/blob/main/src/main/java/com/example/highteenday_backend/schedulers/ViewCountScheduler.java) · [실패 테스트](https://github.com/JangHyeok2909/highteenday-backend/blob/main/src/test/java/com/example/highteenday_backend/schedulers/ViewCountSchedulerTest.java) |
| 비교 조건·포화 분류 | [오진 조사 기록](https://github.com/JangHyeok2909/highteenday-backend/blob/main/performance/docs/investigations/perf-session-drift.md) · [comparability.js](https://github.com/JangHyeok2909/highteenday-backend/blob/main/performance/tools/lib/comparability.js) · [saturation.js](https://github.com/JangHyeok2909/highteenday-backend/blob/main/performance/tools/lib/saturation.js) |
| 성능 측정 자동화 도구 | [performance/](https://github.com/JangHyeok2909/highteenday-backend/tree/main/performance) |
| 전체 코드 | [GitHub 저장소](https://github.com/JangHyeok2909/highteenday-backend) |

### 결과 요약

댓글·반응·스크랩·조회를 집계해 Redis Sorted Set에서 일간 인기글로 제공했습니다. 한 게시글의 조회수
DB 반영 실패가 다른 게시글 처리를 막지 않도록 격리하고, 반영에 성공한 값만 Redis에서 차감했습니다.
댓글 목록의 요청당 쿼리는 1,507개에서 3.9개로 줄였습니다. 
성능 측정 도구에는 실행 조건 검사와 포화 실행 제외 기준을 추가했습니다.

<!-- CUT -->

## 제출 뒤 구현 후보

- 인기글 Redis·DB fallback의 순서와 점수 동기화
- 조회수 정산 Lua script와 SCAN 전환
- AFTER_COMMIT 이벤트의 transactional outbox와 재처리
- 실험군·노출·클릭 이벤트 스키마 설계
