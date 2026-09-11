# Redis contract

Redis는 캐시만 저장하지 않는다. 재생성 가능한 데이터와 손실 가능한 버퍼가 함께 있으므로
키마다 장애 시 동작을 따로 정의한다.

## 키 소유권

| 키 | 값 | TTL | Redis가 없을 때 |
|---|---|---|---|
| `board:{boardId}:posts` | 최신 게시글 ID 목록, 최대 50개 | 60분 | DB 목록 조회 |
| `posts:{postId}` | 게시글 미리보기 | 30분 | DB 조회 |
| `board:{boardId}:count` | 게시판 글 수 | 60분 | DB count |
| `hot:leaderboard:day:{yyyyMMdd}` | 일별 인기글 ZSET | 2일 | `daily_hot_post` 조회 |
| `post:views:{postId}` | 아직 DB에 반영하지 않은 조회수 | 명시적 TTL 없음 | 증가를 기록하지 못함 |
| `viewed:{postId}:{userId}` | 중복 조회 방지 마커 | 1시간 | 중복 방지 불가 |
| `RT:{refreshToken}` | 리프레시 토큰 조회 캐시 | 최대 7일 | DB 토큰 조회 |

정확한 문자열과 TTL은 각 Redis adapter의 상수가 정본이다.

## 실패 처리

`@ResilientRedis`는 Redis 호출을 중단시키는 장치가 아니다. Spring Data Redis가
`DataAccessException`을 던진 뒤 반환 타입에 맞는 기본값을 돌려준다.

| 반환 타입 | 장애 시 값 |
|---|---|
| `void` | `null` 반환으로 종료 |
| `boolean` | `false` |
| 숫자 | `0` |
| `List`, `Set`, `Map` | 빈 컬렉션 |
| 그 밖의 참조 타입 | `null` |

따라서 연결·명령 timeout이 길면 폴백도 그 시간만큼 늦어진다. 현재 timeout과 장애 전파
문제는 [CASE-007](../../performance/cases/CASE-007-redis-failure-cascade/)에서 추적한다.

## 조회수

상세 조회는 중복 방지 키를 먼저 만든 뒤 `post:views:{postId}`를 증가시킨다. 스케줄러는
주기적으로 버퍼를 읽어 게시글별 DB 트랜잭션으로 반영하고 성공한 증가분만 차감한다.

- DB 반영 실패분은 Redis에 남아 다음 주기에 재시도된다.
- Redis 프로세스가 데이터를 잃으면 미반영 버퍼도 사라진다.
- Redis 장애 중에는 새 조회를 기록하지 못한다.
- Redis 재시작으로 중복 방지 키가 사라지면 같은 사용자의 조회가 다시 집계될 수 있다.
- 현재 버퍼 검색은 `KEYS`를 사용한다. 이는 [CACHE-001](../issues/)이다.

이 손실 허용 설계는 [ADR-002](../adr/adr-002-viewcount-redis-buffer.md)에 기록한다.

## 트랜잭션 경계

DB 트랜잭션 안에서 Redis를 기다리면 DB 커넥션도 함께 점유될 수 있다. Redis 캐시 갱신,
랭킹 갱신, 메시지 발행처럼 DB 원자성에 참여하지 않는 작업은 기본적으로 커밋 뒤 또는
트랜잭션 밖에서 실행한다. 비동기화할 때는 실패 관측과 재시도 정책을 함께 설계한다.

## 운영 확인

Redis 장애나 재시작 뒤에는 다음을 확인한다.

1. 연결·명령 timeout 안에 요청이 실패하거나 폴백하는가.
2. HikariCP active/pending이 함께 증가하지 않는가.
3. 인기글과 게시판 목록이 DB 폴백으로 응답하는가.
4. `post:views:*` 손실 범위가 허용한 정책 안에 있는가.
5. 헬스 체크가 의도한 상태 코드와 시간 안에 응답하는가.

