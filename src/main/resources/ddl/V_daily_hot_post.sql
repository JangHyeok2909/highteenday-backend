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
