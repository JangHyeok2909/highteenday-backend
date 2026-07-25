-- 반응 카운터 재집계 COUNT를 커버하는 인덱스.
--
-- PostReactionService / CommentReactionService 는 반응이 바뀔 때마다
--   SELECT COUNT(*) ... WHERE {PST|CMT}_id = ? AND kind = ? AND is_valid = true
-- 를 실행한다. 기존에는 유니크 제약 uk_*_reactions_*_usr (id, USR_id) 만 존재해
-- 게시글/댓글에 달린 반응 전체를 훑은 뒤 kind 와 is_valid 를 필터링해야 했다.
--
-- 운영은 ddl-auto=none 이므로 엔티티의 @Index 만으로는 적용되지 않는다.
-- 배포 전에 아래 문장을 수동으로 실행할 것.
--
-- 두 테이블 모두 온라인 DDL(ALGORITHM=INPLACE)로 처리 가능하지만,
-- 행 수가 많으면 트래픽이 적은 시간대에 수행할 것.

ALTER TABLE posts_reactions
    ADD INDEX idx_posts_reactions_pst_kind_valid (PST_id, PST_RCT_kind, is_valid);

ALTER TABLE comments_reactions
    ADD INDEX idx_comments_reactions_cmt_kind_valid (CMT_id, CMT_RCT_kind, is_valid);
