# System architecture

HighTeenDay는 MySQL을 영속 데이터의 정본으로 사용한다. Redis는 재생성 가능한 캐시와
손실을 허용한 조회수 버퍼를 함께 저장하며, S3는 사용자 업로드 파일을 저장한다.

## 요청 처리 경계

```text
HTTP request
  → Spring Security filter
  → Controller
  → Service transaction
  → JPA repository / external adapter
```

Controller는 입력과 HTTP 응답을 다루고 Service가 유스케이스와 트랜잭션을 조정한다.
외부 저장소는 domain port와 infrastructure adapter로 분리한다.

JWT 인증 요청은 `TokenAuthenticationFilter`를 거쳐 `TokenProvider.getAuthentication()`에서
사용자를 조회한다. 현재 이 조회는 매 요청마다 MySQL을 사용하므로 DB 풀이 막히면 인증도
영향을 받는다. 인프라 예외를 인증 실패로 바꾸는 문제는 [issues.md](issues.md)에서 추적한다.

## 데이터 소유권

| 데이터 | 정본 | 파생 또는 임시 저장소 |
|---|---|---|
| 사용자, 게시글, 댓글, 관계 | MySQL | Redis 캐시 |
| 리프레시 토큰 | MySQL | Redis 조회 캐시 |
| 일별 인기글 | MySQL 스냅샷 | Redis Sorted Set |
| 조회수 누적값 | MySQL | Redis 미반영 증가분 |
| 게시글과 댓글 이미지 | S3 영구 경로 | S3 임시 경로 |

Redis와 S3 작업은 MySQL 트랜잭션에 참여하지 않는다. 두 저장소를 함께 변경하는 유스케이스는
실패 순서, 재시도, 고아 데이터 처리 방법을 별도로 가져야 한다.

## Redis

| 키 | 용도 | 만료 | Redis 장애 시 결과 |
|---|---|---|---|
| `board:{boardId}:posts` | 최신 게시글 ID 목록 | 60분 | MySQL 조회 |
| `posts:{postId}` | 게시글 미리보기 | 30분 | MySQL 조회 |
| `board:{boardId}:count` | 게시판 글 수 | 60분 | MySQL count |
| `hot:leaderboard:day:{date}` | 일별 인기글 | 2일 | MySQL 스냅샷 조회 |
| `post:views:{postId}` | DB 반영 전 조회수 | 없음 | 새 증가분 기록 실패 |
| `viewed:{postId}:{userId}` | 중복 조회 방지 | 1시간 | 중복 방지 실패 |
| `RT:{refreshToken}` | 리프레시 토큰 조회 | 토큰 수명 | MySQL 조회 |

정확한 키와 TTL은 각 Redis adapter의 상수가 정본이다. 조회수 대기 키는 `SCAN`으로
순회하며, 반영에 성공한 증가분만 Redis에서 차감한다.

`@ResilientRedis`는 Redis 호출을 즉시 중단하지 않는다. Spring Data Redis가
`DataAccessException`을 던진 뒤 boolean은 `false`, 숫자는 `0`, 컬렉션은 빈 값,
그 밖의 참조 타입은 `null`을 반환한다. 연결 및 명령 timeout이 길면 기본값도 늦게
돌아온다. 현재 timeout은 명시적으로 설정되어 있지 않으며 [RES-001](issues.md)로 관리한다.

## 일관성 선택

### 조회수

상세 조회는 사용자별 중복 키를 만든 뒤 조회수 버퍼를 증가시킨다. 스케줄러가 60초 간격으로
증가분을 MySQL에 반영한다. Redis 장애 중 증가분과 Redis 데이터 유실 시 미반영 증가분은
복구할 수 없다. 이 동작은 [DATA-001](issues.md)로 수용한 위험이다.

### 반응 카운터

좋아요와 싫어요의 관계 행이 정본이고 `Post`의 카운터는 조회용 파생값이다. 현재 서비스는
반응 처리 뒤 count 쿼리로 값을 다시 계산한다. 잠금 없이 처리하므로 마지막 동시 요청 이후
파생 카운터가 어긋날 가능성과 인기 게시글 UPDATE 집중이 남는다.

### 게시글 페이지

최신순 연속 탐색은 ID 커서를 사용한다. 페이지 점프와 다른 정렬은 OFFSET을 사용한다.
큰 page 값과 좋아요·조회수 정렬은 OFFSET 비용을 그대로 가지므로 입력 상한과 실행 계획을
변경 시 확인해야 한다.

### 미디어

에디터는 먼저 `tmp/{userId}/...`에 이미지를 올린다. 게시글이나 댓글이 생성되면 S3 객체를
영구 경로로 복사하고 본문의 URL을 교체한다. DB 커밋과 S3 복사는 하나의 원자적 작업이
아니므로 복사 후 DB 실패 시 고아 객체가 남을 수 있다.

## 트랜잭션 원칙

DB 트랜잭션 안에서 Redis, S3 또는 메시지 브로커를 기다리면 외부 장애가 DB 커넥션 풀로
전파된다. DB 원자성에 필요하지 않은 외부 작업은 커밋 뒤나 트랜잭션 밖에서 실행한다.
비동기로 분리할 때는 실패 기록과 재시도 정책을 함께 둔다.

Redis 장애 전파의 실측과 불확실성은
[redis-failure-cascade.md](../performance/cases/redis-failure-cascade.md)에 기록한다.
