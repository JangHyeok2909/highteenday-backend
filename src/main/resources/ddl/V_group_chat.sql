-- 단체 채팅방 지원을 위한 스키마 변경 (MySQL)
-- dev 는 spring.jpa.hibernate.ddl-auto=update 로 자동 반영되지만
-- prod 는 ddl-auto=none 이므로 이 스크립트를 배포 전에 직접 실행해야 한다.
--
-- 실행 순서 주의: 1) 컬럼 추가 -> 2) 기존 행 백필 -> 3) NOT NULL / UNIQUE 제약
-- 백필 전에 제약을 걸면 기존 행 때문에 실패한다.

-- ------------------------------------------------------------------
-- 1. chat_rooms
-- ------------------------------------------------------------------
ALTER TABLE chat_rooms
    ADD COLUMN CHT_RM_pair_key VARCHAR(64) NULL AFTER CHT_RM_CAT,
    ADD COLUMN USR_owner_id    BIGINT      NULL AFTER CHT_RM_pair_key;

-- PRIVATE 방은 이름을 저장하지 않고 조회 시 상대 닉네임으로 조립하므로 NULL 허용으로 바꾼다.
ALTER TABLE chat_rooms
    MODIFY COLUMN CHT_RM_name VARCHAR(255) NULL;

-- 기존 PRIVATE 방에 pair_key 백필.
-- 참여자가 정확히 2명인 방만 대상으로 하고, "{작은USR_id}:{큰USR_id}" 형식을 맞춘다.
UPDATE chat_rooms r
    JOIN (
        SELECT p.CHT_RM_id                                      AS room_id,
               CONCAT(MIN(p.USR_id), ':', MAX(p.USR_id))        AS pair_key
        FROM chat_participants p
        WHERE p.is_valid = TRUE
        GROUP BY p.CHT_RM_id
        HAVING COUNT(*) = 2
    ) t ON t.room_id = r.CHT_RM_id
SET r.CHT_RM_pair_key = t.pair_key
WHERE r.CHT_RM_CAT = 'PRIVATE';

ALTER TABLE chat_rooms
    ADD CONSTRAINT uk_chat_rooms_pair_key UNIQUE (CHT_RM_pair_key),
    ADD CONSTRAINT fk_chat_rooms_usr_owner FOREIGN KEY (USR_owner_id) REFERENCES users (USR_id);

-- ------------------------------------------------------------------
-- 2. chat_participants
-- ------------------------------------------------------------------
ALTER TABLE chat_participants
    ADD COLUMN CHT_PT_role            VARCHAR(20) NULL AFTER CHT_RM_id,
    ADD COLUMN CHT_PT_last_read_msg_id BIGINT     NULL AFTER CHT_PT_last_read_date,
    ADD COLUMN CHT_PT_joined_at       DATETIME(6) NULL AFTER CHT_PT_last_read_msg_id,
    ADD COLUMN CHT_PT_joined_msg_id   BIGINT      NULL AFTER CHT_PT_joined_at,
    ADD COLUMN CHT_PT_notify          BOOLEAN     NULL AFTER CHT_PT_joined_msg_id;

-- 기존 참여자 백필: 전부 일반 멤버, 입장 시각은 행 생성 시각, 알림은 켜짐.
UPDATE chat_participants
SET CHT_PT_role      = 'MEMBER',
    CHT_PT_joined_at = COALESCE(created_at, NOW(6)),
    CHT_PT_joined_msg_id = 0,
    CHT_PT_notify    = TRUE
WHERE CHT_PT_role IS NULL;

-- 기존 lastReadDate 를 lastReadMsgId 로 환산한다.
-- 해당 시각 이전에 그 방에서 마지막으로 오간 메시지 ID 를 읽음 위치로 삼는다.
UPDATE chat_participants p
SET p.CHT_PT_last_read_msg_id = COALESCE((
        SELECT MAX(m.CHT_MSG_id)
        FROM chat_messages m
        WHERE m.CHT_RM_id = p.CHT_RM_id
          AND m.created_at <= p.CHT_PT_last_read_date
    ), 0)
WHERE p.CHT_PT_last_read_date IS NOT NULL;

UPDATE chat_participants
SET CHT_PT_last_read_msg_id = 0
WHERE CHT_PT_last_read_msg_id IS NULL;

ALTER TABLE chat_participants
    MODIFY COLUMN CHT_PT_role      VARCHAR(20) NOT NULL,
    MODIFY COLUMN CHT_PT_joined_at DATETIME(6) NOT NULL,
    MODIFY COLUMN CHT_PT_notify    BOOLEAN     NOT NULL DEFAULT TRUE;

-- 같은 방에 같은 사용자가 두 번 들어가지 않도록. 재입장은 is_valid 를 되살리는 방식이다.
ALTER TABLE chat_participants
    ADD CONSTRAINT uk_chat_participants_room_usr UNIQUE (CHT_RM_id, USR_id),
    ADD INDEX idx_chat_participants_usr (USR_id, is_valid);

-- 더 이상 쓰지 않는 컬럼. 롤백 여지를 두려면 이 줄만 나중에 실행해도 된다.
ALTER TABLE chat_participants
    DROP COLUMN CHT_PT_last_read_count;

-- ------------------------------------------------------------------
-- 3. chat_messages
-- ------------------------------------------------------------------
ALTER TABLE chat_messages
    ADD COLUMN CHT_MSG_type      VARCHAR(20) NULL AFTER USR_id,
    ADD COLUMN CHT_MSG_client_id VARCHAR(36) NULL AFTER CHT_MSG_img_url;

-- 기존 메시지는 이미지 URL 유무로 타입을 판정한다.
UPDATE chat_messages
SET CHT_MSG_type = CASE
        WHEN CHT_MSG_content IS NULL OR CHT_MSG_content = '' THEN 'IMAGE'
        ELSE 'TEXT'
    END
WHERE CHT_MSG_type IS NULL;

ALTER TABLE chat_messages
    MODIFY COLUMN CHT_MSG_type VARCHAR(20) NOT NULL;

-- IMAGE 타입은 본문 없이 전송할 수 있어야 한다.
ALTER TABLE chat_messages
    MODIFY COLUMN CHT_MSG_content TEXT NULL;

-- 재전송 멱등성. client_id 가 NULL 인 행은 MySQL UNIQUE 특성상 중복으로 보지 않으므로
-- 기존 메시지와 SYSTEM 메시지는 제약에 걸리지 않는다.
ALTER TABLE chat_messages
    ADD CONSTRAINT uk_chat_messages_room_client UNIQUE (CHT_RM_id, CHT_MSG_client_id),
    ADD INDEX idx_chat_messages_room_id (CHT_RM_id, CHT_MSG_id DESC);
