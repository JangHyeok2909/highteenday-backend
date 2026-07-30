# Transactions & Events — 경계 관례, 이벤트 전수표, AFTER_COMMIT 심화

## 이 문서가 답하는 질문

- @Transactional 경계는 어디에 어떤 관례로 걸려 있는가?
- 이벤트 7종은 각각 어디서 발행되고 누가 무엇을 후속 처리하는가?
- AFTER_COMMIT 리스너에 REQUIRES_NEW가 필요한 정확한 이유는 무엇인가?
- 트랜잭션 안에서 하면 안 되는 일(외부 I/O)이 실제로 어디서 일어나고 있는가?

## 3줄 요약

- 트랜잭션 경계는 서비스 계층의 관례다: 쓰기 메서드에 `@Transactional`, 읽기에 `readOnly = true` (예: `services/domain/ChatService`).
- 이벤트 7종 중 5종만 리스너가 있고, 리스너는 전부 `AFTER_COMMIT`이라 원본 트랜잭션과 실패가 격리된다 — 기본 구조는 [02-architecture.md](../02-architecture.md#이벤트-기반-부가-작업) 참고.
- 커밋 전에 외부 세계(S3, Redis 캐시, STOMP)를 바꾸는 코드가 여러 곳 있어, 롤백 시 DB와 외부 상태가 어긋난다 ([KI-21](../KNOWN-ISSUES.md#ki-21-s3-원격-호출이-트랜잭션-내부에서-실행됨)~[KI-24](../KNOWN-ISSUES.md#ki-24-stomp-발행이-트랜잭션-커밋-전에-일어남)).

## @Transactional 관례

| 관례 | 내용 | 근거 예 |
|---|---|---|
| 위치 | 서비스 계층 public 메서드. 컨트롤러·리포지토리에는 걸지 않는다 | `services/domain/` 전반 |
| 읽기 | `@Transactional(readOnly = true)` | `ChatService · getChatRoomList()`, `NotificationService · getNotifications()` |
| import | `org.springframework.transaction.annotation.Transactional`이 표준. 예외적으로 `TokenService`만 `jakarta.transaction.Transactional`을 쓴다 (`readOnly` 옵션 사용 불가 — [KI-14](../KNOWN-ISSUES.md#ki-14-tokenservice가-errorcode-없이-raw-runtimeexception을-던짐)에 부기) | `services/domain/TokenService.java` import 절 |
| 리스너 쓰기 | AFTER_COMMIT 리스너가 부르는 쓰기 메서드는 `REQUIRES_NEW` | `NotificationService · createCommentNotification()` 등 3개 |
| 자기호출 금지 | 같은 클래스 내부 호출은 프록시를 우회해 애노테이션이 무시된다. 위반 사례 존재 ([KI-23](../KNOWN-ISSUES.md#ki-23-viewcountscheduler의-자기호출-트랜잭션과-드레인-유실)) | `schedulers/ViewCountScheduler · applyViewCount()` |

## 이벤트 전수표 (7종)

`eventEntities/events/` 전 파일과 발행·수신처를 대조했다. 리스너는 2개뿐이고 모두 `@TransactionalEventListener(phase = AFTER_COMMIT)`이다.

| 이벤트 | 발행 위치 | 리스너 | 후속 작업 |
|---|---|---|---|
| `CommentCreatedEvent` | `services/domain/CommentService · createComment()` | `HotPostEventListener · onCommentCreated` / `NotificationEventListener · onCommentCreated` | 핫스코어 갱신 / 게시글 작성자에게 댓글 알림 저장 + STOMP 전송 |
| `PostReactedEvent` | `services/domain/PostReactionService · createReaction()` (신규·상태 변경 2곳) | `HotPostEventListener · onPostReacted` | 핫스코어 갱신 |
| `ScrapToggledEvent` | `services/domain/ScrapService · toggleScrap()` | `HotPostEventListener · onScrapToggled` | `newScrap == true`일 때만 핫스코어 갱신 |
| `FriendRequestSentEvent` | `services/domain/FriendService · sendFriendsRequest()` (시드용으로 `initializers/DataInitializer`도 발행) | `NotificationEventListener · onFriendRequestSent` | 친구 요청 알림 저장 + STOMP |
| `FriendRequestAcceptedEvent` | `FriendService · respondToFriendRequest()` 수락 분기 (+ `DataInitializer`) | `NotificationEventListener · onFriendRequestAccepted` | 수락 알림 저장 + STOMP |
| `FriendRequestDeclinedEvent` | `FriendService · respondToFriendRequest()` 거절 분기 | **없음** | 없음 — 발행만 되고 소멸 ([KI-25](../KNOWN-ISSUES.md#ki-25-리스너-없는-이벤트와-이벤트-페이로드-오류)) |
| `FriendBlockedEvent` | `FriendService · respondToFriendRequest()` 차단 분기 | **없음** | 없음 — 동일 ([KI-25](../KNOWN-ISSUES.md#ki-25-리스너-없는-이벤트와-이벤트-페이로드-오류)) |

핫스코어 갱신의 목적지(Redis ZSET)와 키는 [redis.md](redis.md), 주기 재계산은 [schedulers.md](schedulers.md) 참고.

## AFTER_COMMIT + REQUIRES_NEW 심화

02 문서의 요약을 넘어, 왜 정확히 그렇게 되는지:

1. `@TransactionalEventListener`는 발행 시점이 아니라 **발행 트랜잭션의 커밋 직후** 같은 스레드에서 실행된다. 이때 스레드에는 "이미 완료된" 트랜잭션 컨텍스트가 아직 바인딩되어 있다.
2. 그래서 리스너 안에서 기본 전파(`REQUIRED`)로 DB 쓰기를 하면 새 트랜잭션이 시작되지 않고 완료된 트랜잭션에 "참여"한 셈이 되어, **flush/commit이 다시 일어나지 않아 변경이 조용히 유실된다.** 이것이 `NotificationService`의 알림 생성 3개 메서드에 `REQUIRES_NEW`가 붙은 이유다.
3. 반면 `HotPostEventListener`가 부르는 `HotPostService · updateLeaderboardDayScore()`는 기본 전파 `@Transactional`이지만 하는 일이 DB 읽기 + Redis 쓰기뿐이라 유실될 DB 변경 자체가 없다 — 동작은 하지만 "읽기 전용이라 우연히 안전한" 상태다.
4. 발행 메서드에 활성 트랜잭션이 없으면 `AFTER_COMMIT` 리스너는 아예 실행되지 않는다(기본 `fallbackExecution = false`). 현재 발행처는 모두 `@Transactional` 메서드라 문제없지만, 새 발행처를 추가할 때 잊기 쉬운 전제다.
5. 리스너 예외는 원본 트랜잭션을 되돌리지 못하고(이미 커밋됨) 로그로만 남는다 — 알림 실패가 댓글 작성을 실패시키지 않는 것은 의도된 격리다.

## 커밋 전에 외부 세계를 바꾸는 코드들

이벤트로 분리된 부가 작업과 달리, 아래는 **트랜잭션 안에서 직접** 외부 상태를 바꾼다. 롤백이 나면 DB만 되돌아가고 외부는 남는다. 각각의 상세·영향은 KI 참조 — 본문에서는 위치만 짚는다.

| 위치 | 트랜잭션 안에서 하는 외부 작업 | KI |
|---|---|---|
| `services/domain/MediaProcessingService · processCreatePostMedia()` 등 전 메서드 | S3 복사·삭제 (`FileStoragePort` 호출) — DB 커넥션을 문 채 네트워크 I/O | [KI-21](../KNOWN-ISSUES.md#ki-21-s3-원격-호출이-트랜잭션-내부에서-실행됨) |
| `services/domain/PostService · createPost()` | Redis 게시글 캐시 evict·적재·카운트 증가 | [KI-22](../KNOWN-ISSUES.md#ki-22-게시글-생성-시-커밋-전에-redis-캐시를-갱신) |
| `services/domain/ChatService · markAsRead()` + `writeSystemMessage()` / `publishMemberEvent()`를 부르는 초대·강퇴·퇴장·이름변경 메서드들 | STOMP 브로드캐스트 | [KI-24](../KNOWN-ISSUES.md#ki-24-stomp-발행이-트랜잭션-커밋-전에-일어남) |
| `services/domain/NotificationService · saveNotification()` | STOMP 개인 전송 (REQUIRES_NEW 트랜잭션 안, 커밋 전) | [KI-24](../KNOWN-ISSUES.md#ki-24-stomp-발행이-트랜잭션-커밋-전에-일어남) |
| `schedulers/ViewCountScheduler · syncViewsToDB()` | Redis 카운터를 먼저 삭제(GETDEL)한 뒤 DB 반영 | [KI-23](../KNOWN-ISSUES.md#ki-23-viewcountscheduler의-자기호출-트랜잭션과-드레인-유실) |

채팅의 커밋 전 발행은 기존 문서도 스스로 인지하고 있다 — [GROUP_CHAT.md](../GROUP_CHAT.md) 8절 "알려진 한계: 트랜잭션 커밋 전에 WebSocket 메시지가 나갑니다".

## 코드 좌표

| 개념 | 위치 |
|---|---|
| 이벤트 정의 | `eventEntities/events/` (7개 클래스) |
| 리스너 | `eventEntities/eventListeners/HotPostEventListener.java`, `NotificationEventListener.java` |
| REQUIRES_NEW 알림 생성 | `services/domain/NotificationService · createCommentNotification() / createFriendRequestNotification() / createFriendAcceptNotification()` |
| 발행처 | `services/domain/CommentService · createComment()`, `PostReactionService · createReaction()`, `ScrapService · toggleScrap()`, `FriendService · sendFriendsRequest() / respondToFriendRequest()` |
| 읽기 전용 관례 예 | `services/domain/ChatService`, `NotificationService`의 `readOnly = true` 메서드들 |
| jakarta import 예외 | `services/domain/TokenService.java` |

## 알려진 문제·미확인 사항

- [KI-21](../KNOWN-ISSUES.md#ki-21-s3-원격-호출이-트랜잭션-내부에서-실행됨) 트랜잭션 내 S3 호출
- [KI-22](../KNOWN-ISSUES.md#ki-22-게시글-생성-시-커밋-전에-redis-캐시를-갱신) 커밋 전 캐시 갱신
- [KI-23](../KNOWN-ISSUES.md#ki-23-viewcountscheduler의-자기호출-트랜잭션과-드레인-유실) 스케줄러 자기호출 + 드레인 유실
- [KI-24](../KNOWN-ISSUES.md#ki-24-stomp-발행이-트랜잭션-커밋-전에-일어남) 커밋 전 STOMP 발행
- [KI-25](../KNOWN-ISSUES.md#ki-25-리스너-없는-이벤트와-이벤트-페이로드-오류) 리스너 없는 이벤트 2종, `parentCommentAuthorId` 오값, 본인 게시글 댓글 시 자기 알림
- `[미확인]` 리스너 예외 발생 시 로깅 형태 — Spring 기본 `ApplicationEventMulticaster` 경로를 실측하지 않음

마지막 검증일: 2026-07-30
