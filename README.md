# HighTeenDay Backend

10대 학생들을 위한 익명 커뮤니티 플랫폼의 백엔드 서버입니다.  
게시판, 댓글, 좋아요, 친구, 시간표, 급식 조회, 핫게시글 랭킹 등 학교생활에 필요한 기능을 제공합니다.

---

## 기술 스택

| 분류 | 기술 |
|------|------|
| Framework | Spring Boot 3.4, Java 17 |
| ORM / Query | Spring Data JPA, QueryDSL 5.0 |
| DB | MySQL 8 |
| Cache | Redis (Spring Data Redis) |
| Auth | OAuth2 (Google, Kakao, Naver) + JWT |
| Storage | AWS S3 |
| Load Test | k6 |
| Docs | Springdoc OpenAPI (Swagger UI) |
| CI/CD | GitHub Actions → EC2 (PM2) |

---

## 아키텍처

### 시스템 아키텍처

![시스템 아키텍처](docs/images/full-architecture.png)

### 배포 아키텍처



- `application.properties`는 `.gitignore` 처리되어 서버에만 존재
- PM2가 프로세스 관리 및 자동 재시작 담당

### 백엔드 레이어 아키텍처

![레이어 아키텍처](docs/images/layer-architecture.png)

---

## 데이터 설계 (ERD)

### Post Domain

게시글, 댓글, 반응(좋아요/싫어요), 스크랩, 미디어를 포함하는 핵심 도메인입니다.

![Post Domain ERD](docs/images/erd-post.png)

- `Post`에 `likeCount`, `viewCount`, `commentCount`를 비정규화하여 목록 조회 시 JOIN 제거
- `Post.nickname`을 비정규화하여 User 테이블 JOIN 없이 작성자 표시
- `Comment`는 `parent_id` 자기참조로 대댓글 구현
- `BaseEntity`의 `is_valid` 컬럼으로 Soft Delete 구현

### User / Friend Domain

소셜 로그인 기반 사용자와 친구 관계를 관리합니다.

![User Domain ERD](docs/images/erd-user.png)

- OAuth2 Provider(Google, Kakao, Naver) + Role(GUEST, USER) 구분
- `FriendRequests`의 `frq_status`로 요청/수락/거절 상태 관리
- `Token` 엔티티로 Refresh Token 관리, Access Token은 HttpOnly Cookie로 전달

### School Domain

학교, 급식, 시간표 관련 데이터를 관리합니다.

![School Domain ERD](docs/images/erd-school.png)

- 급식 데이터는 매월 말일 스케줄러로 NEIS API에서 자동 수집
- 시간표는 사용자별 템플릿 → 과목 → 요일/교시 매핑 구조

---

## 핵심 기능

### OAuth2 소셜 로그인

Google, Kakao, Naver 3사 OAuth2 로그인을 지원합니다.

```
1. /oauth2/authorization/{provider} → OAuth2 인증 페이지 리다이렉트
2. 콜백 → CustomOAuth2UserService.loadUser()
3. 신규 유저: ROLE_GUEST → /register 리다이렉트
   기존 유저: ROLE_USER → Access/Refresh Token 발급
4. Access Token → HttpOnly Cookie (SameSite=None, Secure)
5. 이후 요청: TokenAuthenticationFilter가 쿠키에서 JWT 추출 → SecurityContext 설정
```

### 게시글 조회 (Redis 조회수 캐싱)

조회수를 DB에 바로 반영하면 인기 게시글에 write 부하가 집중되므로, Redis를 버퍼로 활용합니다.

```
사용자 조회 → Redis SETNX viewed:{postId}:{userId} (중복 방지, 1h TTL)
           → Redis INCR post:views:{postId}

ViewCountScheduler (60초 주기)
           → KEYS post:views:* 스캔
           → DB에 누적값 일괄 UPDATE
           → Redis 키 삭제
```

### 게시글 작성 (S3 이미지 업로드)

게시글 본문(HTML)에 포함된 이미지를 자동으로 감지하여 S3에 영구 저장합니다.

```
1. 에디터에서 이미지 첨부 → S3 tmp/{userId}/ 에 임시 업로드
2. 게시글 저장 시 → content에서 S3 URL 파싱 (Jsoup)
3. tmp → post-file/{postId}/ 경로로 S3 복사
4. content 내 URL을 확정 경로로 치환
5. tmp 폴더 정리
```

게시글 수정 시에는 기존/신규 URL을 diff하여 추가된 이미지만 복사, 삭제된 이미지는 S3에서 제거합니다.

### 핫게시글 시스템

Redis Sorted Set 기반 실시간 인기 게시글 랭킹 시스템입니다.

```
score = sign × log₁₀(max(|weighted_sum|, 1))
weighted_sum = 5×좋아요 − 1×싫어요 + 2×스크랩 + 3×댓글 + 1×조회수
```

- **로그 스케일**: 좋아요 0→10의 영향이 10→100보다 크게 반영되어 초기 반응이 중요
- **일간 핫게시글**: 시간 감쇠 가산으로 최신 글 우대, 상위 10개 노출 (좋아요 ≥ 10 필터)
- **Redis ZSET**: `ZREVRANGE`로 O(log N + K) 시간에 상위 K개 조회
- **스케줄러**: 1분 주기로 전체 게시글 스코어 갱신

---

## 트러블슈팅

### 1. Redis 역직렬화 시 PostPreviewDto가 LinkedHashMap으로 반환

**문제**  
Redis에 캐싱된 게시글 목록을 조회하면 `PostPreviewDto`가 아닌 `LinkedHashMap`으로 반환되어 API 응답의 `content`가 `null`이 됨.

**원인**  
`GenericJackson2JsonRedisSerializer`를 사용했는데, `activateDefaultTyping`이 설정되지 않아 역직렬화 시 타입 정보가 없었음. JSON에 `@class` 메타데이터가 포함되지 않으면 Jackson은 기본적으로 `LinkedHashMap`으로 역직렬화함.

**해결**  
타입별 전용 serializer인 `Jackson2JsonRedisSerializer<PostPreviewDto>`로 교체. 타입이 컴파일 타임에 고정되므로 `@class` 메타데이터 없이도 정확한 타입으로 역직렬화됨.

```java
Jackson2JsonRedisSerializer<PostPreviewDto> serializer =
    new Jackson2JsonRedisSerializer<>(redisObjectMapper, PostPreviewDto.class);
```

### 2. QueryDSL `post.id.lt(null)` NullPointerException

**문제**  
`GET /api/boards/1/posts?sortType=RECENT&isRandomPage=true` 요청 시 `NullPointerException` 발생. QueryDSL의 `NumberExpression.lt(null)` 호출 시 `ConstantImpl`에서 NPE.

**원인**  
Redis 캐시 미스 시 내부적으로 `PostRepository.findByBoard()`를 호출하는데, 이때 `PostListingDto`의 `isRandomPage`가 Lombok `@Builder.Default`가 없어 `false`로 기본값 설정됨. `lastSeedId`는 `null`인 상태에서 커서 조건 분기(`!isRandomPage && lastSeedId != null`)에 진입하여 `post.id.lt(null)` 실행.

**해결**  
커서 조건에 `dto.getLastSeedId() != null` null 체크를 명시적으로 추가.

```java
if (dto.getSortType() == SortType.RECENT
    && !dto.isRandomPage()
    && dto.getLastSeedId() != null) {   // null 방어
    builder.and(post.id.lt(dto.getLastSeedId()));
    offset = null;
}
```

### 3. Redis 캐시에서 게시글 순서가 뒤섞이는 문제

**문제**  
Redis에 캐싱된 게시글 목록(0~4페이지)이 최신순이 아닌 뒤죽박죽으로 조회됨.

**원인**  
DB에서 `ORDER BY id DESC`로 가져온 결과(최신 → 오래된)를 순서대로 `leftPush`하면 Redis List에서는 순서가 반전됨. 예: `[100, 99, 98]`을 `leftPush` → Redis: `[98, 99, 100]`.

**해결**  
캐시 적재 시 DB 결과를 역순으로 순회하여 `leftPush` → 최신 게시글이 Redis List의 head에 위치하도록 보정. 이후 `rightPush`로 변경하여 근본적으로 해결.

### 4. Redis 캐시 응답에 null 포함 → 클라이언트 렌더링 에러

**문제**  
게시글 목록 API 응답의 `content` 배열에 `null`이 포함되어 프론트엔드에서 `Cannot read properties of null (reading 'id')` 에러 발생.

**원인**  
`RedisPostsCache`에서 Board ID 리스트 캐시로 postId 목록을 가져온 뒤, 각 Post 상세를 `multiGet`으로 조회할 때 일부가 캐시 미스 → DB 조회 시에도 찾지 못하면(소프트 삭제 등) `result` 리스트에 `null`이 그대로 남아 응답에 포함됨.

**해결**  
결과 반환 전 `null` 필터링 추가.

```java
return result.stream().filter(Objects::nonNull).collect(Collectors.toList());
```

---

### 5. k6 부하 테스트 실패율 100% (connection reset by peer)

**문제**  
k6 실행 시 모든 요청이 `connection reset by peer`로 실패.

**원인**  
복합적인 원인:
1. k6 스크립트에서 `size` 쿼리 파라미터 누락 → 서버가 400 Bad Request 반환
2. Tomcat 기본 스레드 풀(200)과 accept-count(100)이 동시 요청(1000 VUs)에 비해 부족
3. 거부된 요청이 TCP 레벨에서 connection reset으로 표시

**해결**  
1. 컨트롤러의 `@RequestParam`에 `defaultValue` 추가하여 누락된 파라미터에 대한 방어
2. Tomcat 스레드/연결 설정 튜닝 (`threads.max=400`, `accept-count=200`, `max-connections=10000`)
3. k6 스크립트의 VU 수를 서버 용량에 맞게 조정 (1000 → 700)

---

## 성능 개선

### 개선 배경

100,000건의 테스트 데이터(MySQL 8 Recursive CTE 생성)를 대상으로 k6 부하 테스트를 수행하며, 게시글 목록 조회 API(`GET /api/boards/{boardId}/posts`)의 성능을 단계적으로 개선했습니다.

### 개선 결과 요약

| 버전 | 변경 사항 | p95 Latency | 평균 응답시간 | 최대 TPS | 동시 사용자 |
|------|-----------|:-----------:|:-----------:|:-------:|:---------:|
| v0 | 기본 구현 | 119ms | 28ms | 1,982 | 500 |
| v1 | N+1 제거, DTO Projection | **73ms** | **17ms** | **2,160** | 500 |

> v0 → v1: p95 latency **38% 개선**, TPS **9% 향상**

---

### 개선 1: N+1 문제 제거 — QueryDSL DTO Projection + 비정규화

**문제**: 게시글 10개 조회 시 작성자 닉네임, 게시판 ID를 가져오기 위해 `User`, `Board` 테이블을 각각 지연 로딩 → 페이지당 최대 20번 추가 쿼리 발생

**해결**: 두 가지를 조합하여 **단일 쿼리로 축소**

1. **비정규화**: `posts.USR_nickname` 컬럼 추가 → User JOIN 제거
2. **DTO Projection**: `Projections.fields()`로 필요한 컬럼만 SELECT

```java
queryFactory.select(Projections.fields(PostPreviewDto.class,
        post.id.as("id"),
        post.board.id.as("boardId"),     // board JOIN 없이 FK 직접 사용
        post.nickname.as("author"),       // 비정규화 컬럼
        post.title.as("title"),
        post.viewCount.as("viewCount"),
        post.likeCount.as("likeCount"),
        post.commentCount.as("commentCount"),
        post.created.as("createdAt")
))
```

`Projections.constructor` 대신 `Projections.fields`를 선택한 이유: 생성자 기반은 파라미터 순서에 의존하여 컬럼 추가/변경 시 런타임 에러 위험이 있으나, 필드 기반은 이름으로 매핑되어 유지보수에 안전합니다.

---

### 개선 2: 커서 기반 페이징 (Cursor-based Pagination)

**문제**: 최신순 정렬에서 깊은 페이지 조회 시 offset 비용이 선형 증가

```sql
-- Offset: page=5000일 때 50,000개 row를 읽고 버림
SELECT ... ORDER BY id DESC LIMIT 10 OFFSET 50000

-- Cursor: 시작점을 인덱스로 바로 찾음
SELECT ... WHERE id < :lastSeedId ORDER BY id DESC LIMIT 10
```

**해결**: `isRandomPage` 파라미터로 두 방식을 동적 전환

| 사용자 행동 | isRandomPage | 페이징 방식 |
|------------|:------------:|:----------:|
| 다음/이전 페이지 스크롤 | `false` | 커서 기반 (성능 일정) |
| 정렬 변경, 홈 복귀, 랜덤 점프 | `true` | 오프셋 기반 |

---

### 개선 3: Redis 다계층 캐싱

최신순 0~4페이지(가장 많이 조회되는 구간)를 Redis에 캐싱합니다.

```
┌─────────────────────────────────────────────────┐
│  1단계: Board List Cache (Redis List)            │
│  board:1:posts → [id:100, id:99, id:98, ...]    │
│  TTL: 60min                                      │
└──────────────────────┬──────────────────────────┘
                       │ multiGet
                       ▼
┌─────────────────────────────────────────────────┐
│  2단계: Post Preview Cache (Redis String)        │
│  posts:100 → { id, title, author, likeCount, ...}│
│  TTL: 30min                                      │
└─────────────────────────────────────────────────┘
```

**캐시 미스 처리**:
- Board List 미스 → DB에서 최근 50개 조회 후 전체 캐싱
- Post Preview 부분 미스 → 미스된 ID만 선별하여 DB 조회 후 개별 캐싱

Board ID 리스트와 Post 상세를 분리하여, 게시글 수정(좋아요 등) 시 해당 Post 캐시만 갱신하면 되고 Board 리스트 캐시는 무효화할 필요가 없습니다.

---

### 개선 4: 정렬별 복합 인덱스

**문제**: LIKE/VIEW 정렬 시 100,000건 full sort 발생 → 700 VUs 동시 요청에서 p95 = **27초**

**해결**: 정렬 기준별 복합 인덱스 추가

```sql
-- 최신순: 커서 기반 페이징에 최적화
CREATE INDEX idx_posts_brd_valid_id   ON posts (BRD_id, is_valid, PST_id DESC);

-- 좋아요순: full sort 제거 → 인덱스 스캔
CREATE INDEX idx_posts_brd_valid_like ON posts (BRD_id, is_valid, PST_like_count DESC);

-- 조회수순: full sort 제거 → 인덱스 스캔
CREATE INDEX idx_posts_brd_valid_view ON posts (BRD_id, is_valid, PST_view_count DESC);
```

`WHERE brd_id = ? AND is_valid = true ORDER BY like_count DESC LIMIT 10` 쿼리가 인덱스 순서대로 읽기만 하면 되므로, full sort 없이 상위 10건을 즉시 반환합니다.

**인덱스 write 비용 트레이드오프**: `likeCount`, `viewCount` 변경 시 인덱스 재배치(O(log N))가 발생하지만, 조회수는 이미 Redis 배치 동기화로 1분 단위 1회 UPDATE로 합산되고, 커뮤니티 특성상 읽기가 쓰기보다 수십~수백 배 많으므로 합리적인 선택입니다.

---

### 개선 5: 조회수 Redis 배치 동기화

개선 4의 인덱스와 시너지를 내는 구조입니다.

```
실시간 조회 → Redis SETNX (유저별 중복 방지) → Redis INCR (카운터)

ViewCountScheduler (60초 주기)
  → post:views:* 키 스캔
  → DB에 누적값 일괄 UPDATE (1분간 100회 조회 → 1회 UPDATE)
  → 인덱스 재배치도 1분에 1회로 제한
```

조회수를 매 요청마다 DB에 반영하면 인기 게시글에 초당 수십 회의 `UPDATE`가 발생하여 row lock과 인덱스 갱신 비용이 급증합니다. 배치 처리로 이를 1분에 1회로 압축했습니다.

---

## 코드 품질 개선

### 1. ViewCountScheduler — GETDEL 원자적 처리 + 트랜잭션 격리

**기존 문제**

```java
// 문제 1: getValue() 반환값이 null이면 NPE
String value = redisService.getValue(key).toString();

// 문제 2: 두 명령 사이에 다른 요청이 INCR하면 해당 카운트가 유실 (race condition)
redisService.getValue(key);
redisService.delete(key);

// 문제 3: @Transactional이 메서드 전체에 걸려 있어, 하나의 게시글 처리 실패 시
//         전체 롤백 → Redis에서 이미 삭제한 조회수 데이터 영구 유실
```

**개선**

```java
// GETDEL: 조회와 삭제를 단일 Redis 명령으로 원자적 처리 → race condition 제거
String value = redisTemplate.opsForValue().getAndDelete(key);

// 게시글 1건씩 독립 트랜잭션으로 분리 → 하나 실패해도 나머지 정상 반영
@Transactional
public void applyViewCount(Long postId, long increment) { ... }

// 삭제된 게시글은 예외 캐치 후 스킵 → 데이터 유실 없음
try {
    applyViewCount(postId, increment);
} catch (ResourceNotFoundException e) {
    log.warn("조회수 동기화 스킵 - 삭제된 게시글. postId={}", postId);
}
```

---

### 2. RedisService 제거 → 도메인 전용 캐시 레이어

**기존 문제**  
`set`, `get`, `delete`를 단순 위임하는 `RedisService` 범용 래퍼가 존재했음. `RedisTemplate`이 이미 제공하는 API를 한 번 더 감싸는 구조라 불필요한 추상화 레이어였으며, `getAndDelete()` 같은 유용한 명령어를 활용하지 못하도록 가로막음.

**개선**  
`RedisService` 삭제. `ViewCountService`가 `StringRedisTemplate`을 직접 주입받아 조회수 도메인의 Redis 로직을 완전히 캡슐화.

```
Before:
  ViewCountService ──→ RedisService ──→ RedisTemplate
  ViewCountScheduler ──→ RedisService ──→ RedisTemplate

After:
  ViewCountService ──→ StringRedisTemplate   (조회수 캐시 전용)
  RedisPostsCache  ──→ RedisTemplate<>       (게시글 캐시 전용)
```

Redis 키 구조나 TTL 변경이 필요할 때 해당 도메인 클래스만 수정하면 되므로 변경 영향 범위가 명확해짐.

---

### 3. 리스트 조회 API 응답 일관성 개선 (404 → 200 빈 배열)

**기존 문제**  
게시글/댓글/스크랩 목록이 비어있으면 `ResourceNotFoundException`을 던져 **404** 반환. 클라이언트 입장에서 "리소스 없음(404)"과 "데이터가 0건인 정상 응답"을 구분할 수 없었음.

**개선**  
데이터가 없는 경우 **200 OK + 빈 배열** 반환. 단건 조회(`findById`)는 리소스 존재 여부가 중요하므로 404 유지.

| 케이스 | 변경 전 | 변경 후 |
|--------|---------|---------|
| 게시글 목록이 0건 | 404 Not Found | 200 OK `{ "content": [] }` |
| 댓글 목록이 0건 | 404 Not Found | 200 OK `[]` |
| 스크랩 목록이 0건 | 404 Not Found | 200 OK `[]` |
| 게시글 단건 조회 (없음) | 404 Not Found | 404 Not Found (유지) |

---

## API 엔드포인트

| 도메인 | 경로 | 주요 기능 |
|--------|------|-----------|
| 인증 | `/api/user/*` | OAuth2 로그인, 회원가입, 프로필 수정 |
| 게시판 | `/api/boards` | 게시판 목록 |
| 게시글 목록 | `/api/boards/{boardId}/posts` | 페이징 조회 (캐시, 커서, 정렬) |
| 게시글 | `/api/posts` | CRUD, 검색 |
| 댓글 | `/api/posts/{postId}/comments` | CRUD (대댓글 지원) |
| 반응 | `/api/posts/{postId}/like, dislike` | 좋아요/싫어요 토글 |
| 스크랩 | `/api/posts/{postId}/scraps` | 스크랩 토글 |
| 핫게시글 | `/api/hotposts/daily` | 일간 인기글 TOP 10 |
| 마이페이지 | `/api/mypage/*` | 내 글, 댓글, 스크랩 |
| 친구 | `/api/friends/*` | 친구 요청/수락/차단 |
| 학교 | `/api/schools/*` | 학교 검색, 급식 조회 |
| 시간표 | `/api/timetableTemplates/*` | 시간표 템플릿 CRUD |
| 미디어 | `/api/media` | 이미지 업로드 (S3) |

---

## 실행 방법

### 필요 환경
- Java 17+
- MySQL 8
- Redis

### 실행

```bash
./gradlew build
java -jar build/libs/highteenday-backend-0.0.1-SNAPSHOT.jar
```

### 부하 테스트

```bash
k6 run load-tests/k6-board-posts.js
```

### 환경 설정

`src/main/resources/application.properties`에 아래 항목을 설정합니다.

```properties
spring.datasource.url=jdbc:mysql://localhost:3306/highteenday
spring.datasource.username=
spring.datasource.password=

spring.data.redis.host=localhost
spring.data.redis.port=6379

jwt.secret=
jwt.access-token-expiration=
jwt.refresh-token-expiration=

spring.security.oauth2.client.registration.google.client-id=
spring.security.oauth2.client.registration.google.client-secret=

cloud.aws.s3.bucket=
cloud.aws.credentials.access-key=
cloud.aws.credentials.secret-key=
cloud.aws.region.static=
```
