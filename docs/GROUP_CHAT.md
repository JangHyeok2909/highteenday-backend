> 이 문서의 내용은 [domains/chat.md](domains/chat.md)로 통합·현행화되었다. 최신 기준은 그쪽을 따른다.

# 단체 채팅방 (GROUP CHAT)

기존 1:1 채팅(`feature/chat-websocket`)에 단체 채팅방을 추가하고, 그 과정에서 읽음 처리 방식을
`lastReadDate`(시각) 기준에서 `lastReadMsgId`(메시지 ID) 기준으로 교체했습니다.

작업 브랜치: `feature/chat-websocket` (백엔드 / 프론트엔드 동일 이름)

---

## 1. 왜 스키마를 바꿨나

DB 구조(`chat_rooms` ← `chat_participants` → `users`)는 처음부터 N:M이라 단체방을 담을 수 있었습니다.
1:1 가정은 **서비스/DTO/UI 계층에만** 박혀 있었습니다.

다만 읽음 처리만은 스키마를 바꾸지 않으면 단체방에서 정확해질 수 없었습니다.

| 항목 | 변경 전 | 변경 후 | 이유 |
|---|---|---|---|
| 읽음 기준 | `CHT_PT_last_read_date` (시각) | `CHT_PT_last_read_msg_id` (ID) | 시각 비교는 서버·DB 시계 오차와 동시 삽입에 취약. ID는 단조 증가라 경계가 명확 |
| 1:1 중복 방지 | `findPrivateRoomBetween` 조회 후 생성 | `CHT_RM_pair_key` + UNIQUE | 조회와 생성 사이 race로 방이 두 개 생기는 문제 차단 |
| 재전송 | 없음 | `CHT_MSG_client_id` + UNIQUE | WebSocket 재연결 시 같은 메시지가 두 번 저장되는 것 차단 |
| 조회 | `findTop50...` | 커서 페이징 | 50개 넘는 히스토리를 못 보던 문제 |
| 안읽음 집계 | 방마다 COUNT 쿼리 | 전체를 native 쿼리 1회 | 방 목록의 N+1 제거 |

`CHT_PT_last_read_count`는 쓰기만 하고 아무데서도 읽지 않는 죽은 컬럼이라 제거했습니다.

---

## 2. 스키마 변경

### enum (신규 2 / 수정 1)

```java
ChatRoomCategory { PRIVATE, GROUP, SCHOOL, GRADE }   // GROUP 추가
ChatMsgType      { TEXT, IMAGE, SYSTEM }             // 신규
ChatRole         { OWNER, ADMIN, MEMBER }            // 신규
```

`SCHOOL` / `GRADE`는 enum에만 있고 이번 작업에서 쓰지 않습니다. 자동 가입·나가기 불가 등
권한 모델이 달라 별건으로 남겨두었습니다.

### `chat_rooms`

| 컬럼 | 변경 | 설명 |
|---|---|---|
| `CHT_RM_name` | NOT NULL → NULL | PRIVATE은 이름을 저장하지 않고 조회 시 상대 닉네임으로 조립 |
| `CHT_RM_pair_key` | 추가 `VARCHAR(64)` UNIQUE | `"{작은USR_id}:{큰USR_id}"`. GROUP은 null |
| `USR_owner_id` | 추가 FK | GROUP 방장. PRIVATE은 null |

### `chat_participants`

| 컬럼 | 변경 | 설명 |
|---|---|---|
| `CHT_PT_role` | 추가 NOT NULL | OWNER / ADMIN / MEMBER |
| `CHT_PT_last_read_msg_id` | 추가 | 읽음 위치. 안읽음 = 이 값보다 큰 메시지 수 |
| `CHT_PT_joined_at` | 추가 NOT NULL | 입장 시각. 재입장 시 갱신 |
| `CHT_PT_joined_msg_id` | 추가 | 입장 시점 마지막 메시지 ID. 이전 대화를 가리는 하한선 |
| `CHT_PT_notify` | 추가 NOT NULL | 방별 알림 on/off |
| `CHT_PT_last_read_count` | **삭제** | 죽은 컬럼 |
| — | UNIQUE `(CHT_RM_id, USR_id)` | 같은 방 중복 참여 방지 |
| — | INDEX `(USR_id, is_valid)` | 내 방 목록 조회 |

### `chat_messages`

| 컬럼 | 변경 | 설명 |
|---|---|---|
| `CHT_MSG_type` | 추가 NOT NULL | TEXT / IMAGE / SYSTEM |
| `CHT_MSG_client_id` | 추가 `VARCHAR(36)` | 클라이언트 발급 UUID. 멱등성 키 |
| `CHT_MSG_content` | NOT NULL → NULL | IMAGE는 본문 없이 전송 가능 |
| — | UNIQUE `(CHT_RM_id, CHT_MSG_client_id)` | 재전송 중복 차단 |
| — | INDEX `(CHT_RM_id, CHT_MSG_id DESC)` | 커서 페이징 |

### 마이그레이션

- **dev**: `ddl-auto=update`로 자동 반영됩니다.
- **prod**: `ddl-auto=none`이므로 **`src/main/resources/ddl/V_group_chat.sql`을 배포 전에 직접 실행**해야 합니다.

이 스크립트는 `컬럼 추가 → 기존 행 백필 → NOT NULL/UNIQUE 제약` 순서로 되어 있습니다.
백필 전에 제약을 걸면 기존 행 때문에 실패하므로 순서를 바꾸지 마세요. 주요 백필:

- 참여자가 정확히 2명인 PRIVATE 방에만 `pair_key`를 채웁니다.
- 기존 참여자는 전부 `MEMBER`, `joined_at = created_at`, `notify = TRUE`.
- 기존 `last_read_date`는 **"그 시각 이전 마지막 메시지 ID"** 로 환산해 `last_read_msg_id`에 넣습니다.
- 기존 메시지 타입은 본문 유무로 TEXT / IMAGE를 판정합니다.

> `CHT_MSG_client_id`가 NULL인 행은 MySQL UNIQUE 특성상 중복으로 보지 않으므로,
> 기존 메시지와 SYSTEM 메시지는 제약에 걸리지 않습니다.

---

## 3. 읽음 처리 — 이번 작업의 핵심

1:1은 "읽음/안읽음" 이진값이면 됐지만, 단체방은 **메시지마다 "안 읽은 N명"** 이 필요합니다.

### 규칙

> 메시지 M을 안 읽은 사람 수 = `lastReadMsgId < M.id` 인 참여자 수

참여자 수 P는 작으므로(최대 100), 방 진입 시 참여자들의 읽음 위치를 **한 번만 정렬**해두고
메시지마다 이진탐색합니다. 전체 비용 `O(P log P + M log P)`.

```java
// ChatService
private static long[] readPositionsOf(List<ChatParticipants> members) { ... }   // 정렬 1회
private static int countLessThan(long[] sorted, long value) { ... }             // 메시지당 O(log P)
```

### 이 규칙이 성립하는 조건

`sendMessage()`에서 **보낸 사람의 읽음 위치도 함께 전진**시킵니다.

```java
chatPTRepository.findByChatRoomAndUser(chatRoom, sender)
        .ifPresent(p -> p.updateLastReadMsgId(chatMsg.getId()));
```

그래서 발신자는 자기 메시지의 미읽음 집계에 절대 포함되지 않고, 메시지마다 발신자를
따로 제외하는 분기가 사라집니다.

### 공짜로 따라오는 것

신규 입장자는 `lastReadMsgId = joinedMsgId`(입장 시점 최신 메시지)로 시작합니다.
그러면 입장 이전 메시지는 `id < joinedMsgId ≤ lastReadMsgId`가 되어 **자동으로 "읽음"** 처리됩니다.
과거 메시지의 미읽음 카운트가 신규 입장자 때문에 늘어나는 버그가 원천 차단됩니다.

나갔다 재입장할 때도 `rejoin()`이 `joinedMsgId`를 다시 찍으므로 그 사이 대화는 보이지 않습니다.

### 브로드캐스트 증폭 방지

`markAsRead()`는 **읽음 위치가 실제로 전진했을 때만** 발행합니다.

```java
boolean advanced = !Objects.equals(before, participant.getLastReadMsgId());
if (!advanced) return;
```

100명 방에서 전원이 활발히 읽으면 무조건 발행 시 `100 x 100 = 10,000`건으로 증폭됩니다.
`updateLastReadMsgId()`는 단조 증가라 지연 도착한 오래된 요청은 상태를 되돌리지도, 발행하지도 않습니다.

> 아직 하지 않은 것: 서버측 디바운스(500ms~1s 묶음 발행). 실사용 부하를 보고 판단하는 게 낫다고 판단해
> 이번에는 "전진했을 때만" 조건까지만 넣었습니다.

---

## 4. API

### REST (`/api/chat`)

| 메서드 | 경로 | 권한 | 설명 |
|---|---|---|---|
| POST | `/rooms` | — | 1:1 방 생성/조회 |
| POST | `/rooms/group` | — | **단체방 생성** `{name, memberIds[]}` |
| GET | `/rooms` | 참여자 | 방 목록 (PRIVATE+GROUP 통합) |
| GET | `/rooms/{id}` | 참여자 | 방 상세 |
| PATCH | `/rooms/{id}` | OWNER/ADMIN | 방 이름 변경 |
| GET | `/rooms/{id}/messages?cursor=&size=` | 참여자 | 커서 페이징 |
| GET | `/rooms/{id}/read-status` | 참여자 | 참여자별 읽음 위치 |
| PATCH | `/rooms/{id}/read?lastMsgId=` | 참여자 | 읽음 처리 |
| GET | `/rooms/{id}/members` | 참여자 | 멤버 목록 |
| POST | `/rooms/{id}/members` | OWNER/ADMIN | **초대** `{memberIds[]}` |
| DELETE | `/rooms/{id}/members/me` | 참여자 | **나가기** |
| DELETE | `/rooms/{id}/members/{userId}` | OWNER/ADMIN | **강퇴** |
| PATCH | `/rooms/{id}/members/{userId}/role` | OWNER | 관리자 임명/해제 |
| PATCH | `/rooms/{id}/notification?enabled=` | 참여자 | 방별 알림 |

`name`을 비우고 단체방을 만들면 참여자 닉네임을 이어붙여 이름을 만듭니다(최대 30자).

### DTO 변경 (하위 호환 깨짐)

`ChatRoomDto`에서 `otherUserId` / `otherUserNickname` / `otherUserProfileUrl` **3개 필드를 제거**했습니다.
`feature/chat-websocket`이 develop에 머지되기 전이라 API 계약이 아직 공개되지 않았기에
호환 레이어 없이 정리했습니다.

```java
ChatRoomDto(roomId, roomName, category, lastMessage, lastMessageAt,
            unreadCount, memberCount, myRole, notificationEnabled, List<ChatMemberDto> members)
```

핵심은 **`roomName`을 PRIVATE일 때 서버가 상대 닉네임으로 채워 내려주는 것**입니다.
덕분에 프론트는 `category` 분기 없이 `roomName` 하나만 렌더하면 되고 목록 화면 코드가 통합됩니다.
`members`는 목록에서는 아바타용으로 나를 제외한 최대 4명만 담습니다.

`ChatMessageDto`에는 `type`, `clientMsgId`, `unreadCount`가 추가됐습니다.

### WebSocket

```
/app/chat/send                    발행 (clientMsgId 포함)
/topic/chat/room/{id}             메시지 (SYSTEM 포함)
/topic/chat/room/{id}/read        읽음 위치 이동 {userId, lastReadMsgId, readAt}
/topic/chat/room/{id}/members     멤버 변경 (신규)
```

`ChatMemberEventDto.EventType`: `JOINED`, `LEFT`, `KICKED`, `ROOM_RENAMED`, `OWNER_CHANGED`, `ROLE_CHANGED`

---

## 5. 정책

| 동작 | 권한 | 비고 |
|---|---|---|
| 초대 | OWNER, ADMIN | 아무나 초대는 분쟁 소지가 있어 관리자 이상으로 제한 |
| 강퇴 | OWNER, ADMIN | 방장은 강퇴 불가. 관리자는 방장만 강퇴 가능 |
| 방 이름 변경 | OWNER, ADMIN | 1~30자 |
| 관리자 임명 | OWNER | 방장 자리 양도는 별도 |
| 나가기 | 전원 | |

- **정원**: 100명 (`MAX_MEMBERS`)
- **방장 퇴장**: 관리자 우선 → 없으면 가장 오래된 멤버에게 자동 위임. 마지막 1명이 나가면 방을 닫음(`isValid=false`)
- **친구 검증**: 단체방 생성·초대에도 적용. 초대자와 대상이 친구여야 함
- **신규 멤버의 과거 대화**: 입장 이전 메시지는 보이지 않음 (`joinedMsgId` 하한선)
- **SYSTEM 메시지**: 안읽음으로 세지 않음

### 명시적으로 정하지 않고 기본값으로 진행한 것

질문 없이 진행하라는 지시에 따라 아래는 위 표의 값으로 정했습니다. 바꾸려면 각각 한 줄 수정입니다.

1. 초대 권한을 관리자 이상으로 제한 → `inviteMembers()`의 `requireManagePermission()` 제거하면 전원 허용
2. 과거 대화 비공개 → `getChatMessages()`의 `floor` 계산을 `0L` 고정으로 바꾸면 전체 공개
3. 초대에도 친구 관계 요구 → `requireFriendship()` 호출 제거. **"같은 반 단톡" 같은 시나리오는 현재 막힙니다**
4. `SCHOOL`/`GRADE`는 이번 범위에서 제외

### 신규 에러 코드

```
CHAT_ROOM_FULL(400)            CHAT_NO_PERMISSION(403)
CHAT_CANNOT_KICK_OWNER(400)    CHAT_CANNOT_KICK_SELF(400)
CHAT_ALREADY_PARTICIPANT(409)  CHAT_NOT_GROUP_ROOM(400)
CHAT_INVALID_MEMBER_COUNT(400) CHAT_INVALID_ROOM_NAME(400)
CHAT_EMPTY_MESSAGE(400)
```

---

## 6. 변경 파일

### 신규
```
enums/ChatMsgType.java
enums/ChatRole.java
dtos/Chat/ChatMemberDto.java
dtos/Chat/ChatMemberEventDto.java
dtos/Chat/CreateGroupRoomDto.java
dtos/Chat/InviteMembersDto.java
dtos/Chat/UpdateChatRoomDto.java
resources/ddl/V_group_chat.sql
docs/GROUP_CHAT.md
```

### 수정
```
enums/ChatRoomCategory.java        GROUP 추가, isMultiParty()
enums/ErrorCode.java               채팅 에러 9개 추가
domain/chat/ChatRoom.java          pairKey, owner, name nullable
domain/chat/ChatParticipants.java  role, lastReadMsgId, joinedAt/joinedMsgId, notify, rejoin()
domain/chat/ChatMsg.java           type, clientMsgId, content nullable, 인덱스
domain/chat/ChatRoomRepository.java   findByPairKey
domain/chat/ChatMsgRepository.java    커서 페이징, 멱등성 조회, 안읽음 일괄 집계
domain/chat/ChatPTRepository.java     방 목록/멤버 조회 (fetch join)
domain/friends/FriendRepository.java  findFriendIdsAmong (초대 시 1인 1쿼리 방지)
services/domain/ChatService.java      전면 개편
controllers/ChatController.java       엔드포인트 8개 추가
```

`ChatWebSocketController`, `WebSocketConfig`, 인증 인터셉터는 그대로입니다.
단체방도 기존 브로드캐스트 방식과 참여자 검증을 그대로 씁니다.

---

## 7. 검증 상태

- `./gradlew compileJava` 통과
- `./gradlew compileTestJava` 통과
- **런타임 테스트는 하지 않았습니다.** 실제 DB 연결, WebSocket 송수신, 단체방 시나리오
  (생성 → 초대 → 대화 → 읽음 카운트 감소 → 강퇴 → 나가기)는 아직 검증되지 않았습니다.
- 단위 테스트도 작성하지 않았습니다. 우선순위가 높은 것은
  `unreadCountOf()` / `countLessThan()` 경계 조건과 방장 위임 로직입니다.

## 8. 알려진 한계

**트랜잭션 커밋 전에 WebSocket 메시지가 나갑니다.**
`writeSystemMessage()`와 `publishMemberEvent()`는 `@Transactional` 안에서
`messagingTemplate.convertAndSend()`를 호출합니다. 이후 트랜잭션이 롤백되면
클라이언트는 실제로 저장되지 않은 이벤트를 이미 받은 상태가 됩니다.

기존 `markAsRead()`도 같은 방식이라 이번에 새로 생긴 문제는 아니지만,
멤버 변경처럼 되돌리기 어려운 이벤트가 늘어난 만큼 정리하는 편이 좋습니다.
`TransactionSynchronizationManager.registerSynchronization()`으로
`afterCommit` 시점에 발행하도록 옮기는 것이 표준적인 해법입니다.

## 9. 남은 작업

1. **커밋 후 발행으로 전환** — 위 한계 항목
2. **읽음 이벤트 서버측 디바운스** — 대형 방 부하 확인 후
2. **`ChatContext` per-user queue 전환** — 현재 프론트가 방마다 STOMP 구독을 걸어
   방 수에 비례해 구독이 늘어납니다. `feature/realtime-notification`의 per-user queue 패턴을
   재사용해 목록 갱신을 개인 큐 하나로 받는 것이 낫습니다
3. **커서 페이징 프론트 연동** — 백엔드는 됐지만 프론트는 아직 첫 페이지만 불러옵니다
4. `SCHOOL` / `GRADE` 자동 가입방
5. 단체방 알림(`CHT_PT_notify`)을 실제 푸시 경로에 연결
