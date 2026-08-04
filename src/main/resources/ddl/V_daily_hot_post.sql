-- [폐기] 실행하지 말 것. db/migration/V6__create_daily_hot_post.sql 로 대체되었다.
--
-- 이 스크립트는 두 가지 이유로 지금 스키마에서 그대로 돌아가지 않는다:
--   1) 아래 FK 가 REFERENCES post(PST_id) 인데 실제 게시글 테이블명은 posts(복수형)다.
--      실행하면 "Table 'highteenday.post' doesn't exist" 로 실패한다.
--   2) 제약명 fk_daily_hot_post_pst 가 V1__baseline.sql 이 만드는 고아 테이블
--      DailyHotPost 와 충돌한다(MySQL 의 FK 제약명은 스키마 전역에서 유일해야 한다).
--
-- 기록용으로만 남긴다. BTL-009 참고.

CREATE TABLE daily_hot_post (
    DHP_id               BIGINT AUTO_INCREMENT PRIMARY KEY,
    PST_id               BIGINT       NOT NULL,
    DHP_score            DOUBLE       NOT NULL,
    DHP_leaderboard_date DATE         NOT NULL,
    created_at           DATETIME(6)  NOT NULL,
    UPT_Date             DATETIME(6),
    UPT_id               BIGINT,
    is_valid             BOOLEAN      NOT NULL DEFAULT TRUE,
    CONSTRAINT fk_daily_hot_post_pst FOREIGN KEY (PST_id) REFERENCES post(PST_id),
    UNIQUE INDEX uk_daily_hot_post_date_post (DHP_leaderboard_date, PST_id),
    INDEX idx_daily_hot_post_date_created (DHP_leaderboard_date, created_at DESC)
);
