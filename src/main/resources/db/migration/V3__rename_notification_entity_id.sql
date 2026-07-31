-- notifications.entityId -> NT_entity_id
--
-- 이 컬럼만 프로젝트 네이밍 컨벤션({DOMAIN_PREFIX}_{column})에서 벗어나 있었다.
-- 바로 옆 컬럼이 NT_entity_type 인데 이것만 접두사 없이 camelCase 였다
-- (V1__baseline.sql 이 Flyway 도입 이전 운영 스키마를 그대로 가져오면서 굳어진 것).
--
-- 엔티티 Notification.entityId 에는 @Column 지정이 없어 Hibernate 기본 네이밍 전략이
-- entity_id(스네이크케이스)로 변환해 쿼리했고, 그런 컬럼은 존재하지 않으므로
-- 알림 기능이 조회·저장 양쪽 모두 100% 실패하고 있었다:
--
--   [insert into notifications (... entity_id ...)] Unknown column 'entity_id' in 'field list'
--   [select ... n1_0.entity_id ...]                 Unknown column 'n1_0.entity_id' in 'field list'
--
-- 부하 테스트 시드 1회(small)에서 INSERT 실패 8748건, SELECT 실패 80건이 실측됐다.
-- 알림은 댓글/친구요청/좋아요 임계치 등에서 발생하므로 영향 범위가 넓다 (BTL-011).
--
-- RENAME COLUMN 은 데이터를 보존하며 MySQL 8 에서 메타데이터 연산으로 처리된다.
-- 컬럼명은 대소문자를 구분하지 않으므로 Hibernate 가 만드는 nt_entity_id 와도 매칭된다.

ALTER TABLE notifications
    RENAME COLUMN entityId TO NT_entity_id;
