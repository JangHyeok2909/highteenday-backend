-- V6: 엔티티가 실제로 쿼리하는 daily_hot_post 테이블을 만든다 (BTL-009).
--
-- domain/hot/DailyHotPost.java 의 @Table 에는 name 이 없었다. Spring Boot 기본 네이밍
-- 전략은 CamelCase 를 스네이크케이스로 바꾸므로 Hibernate 는 daily_hot_post 를 쿼리한다.
-- 그런데 V1__baseline.sql 26번째 줄이 만드는 테이블명은 DailyHotPost 다. 이름 세 개가
-- 전부 달랐다:
--
--   Hibernate 가 기대하는 이름          daily_hot_post
--   V1__baseline.sql 이 만드는 테이블   DailyHotPost      <- 아무도 쿼리하지 않는 고아
--   ddl/V_daily_hot_post.sql (레거시)   daily_hot_post    <- 이름은 맞지만 FK 가 깨져 있다
--
-- BTL-008 과 달리 이건 대소문자 문제가 아니라 이름 자체가 다른 것이라, MySQL 의
-- lower_case_table_names 를 어떻게 두든 해결되지 않는다. 결과적으로 Flyway 마이그레이션만으로
-- 구성한 모든 DB(로컬 재현, CI, 신규 온보딩, 재해복구)에서 100% 재현됐다:
--
--   GET /api/hotposts/daily -> 500
--   java.sql.SQLSyntaxErrorException: Table 'highteenday.daily_hot_post' doesn't exist
--
-- HotScoreScheduler 도 주기마다 같은 예외를 던지고 있었다.
--
-- 참고로 V1 의 15번째 줄 주석("엔티티에 @Table(name=...)이 없어 테이블명이 DailyHotPost 가
-- 된다")은 전제가 틀렸다. 네이밍 전략이 적용되므로 daily_hot_post 가 된다.
--
-- 레거시 ddl/V_daily_hot_post.sql 을 그대로 쓰지 않는 이유: 그 스크립트의 FK 가
-- REFERENCES post(PST_id) 로 되어 있는데 실제 게시글 테이블명은 posts(복수형)라 실행 자체가
-- 실패한다. 아래에서 정정해 반영한다.
--
-- 운영 DB 가 셋 중 무엇을 갖고 있는지는 저장소만으로 알 수 없다(baseline-on-migrate 로
-- V1 을 실행하지 않았으므로 V1 의 내용이 곧 운영 스키마라는 보장이 없다). 그래서 아래는
-- "둘 다 없음 / 고아만 있음 / 정상만 있음" 세 경우 모두에서 같은 최종 상태로 수렴하게 썼다.

-- ------------------------------------------------------------------
-- 1. 정상 테이블 생성 (FK 는 아직 걸지 않는다)
-- ------------------------------------------------------------------
-- FK 제약명은 MySQL 에서 스키마 전역으로 유일해야 한다. 고아 테이블 DailyHotPost 가
-- 이미 fk_daily_hot_post_pst 를 점유하고 있으면 여기서 errno 121 로 실패한다.
-- 그래서 FK 는 고아를 정리한 뒤인 3단계에서 건다.
--
-- 컬럼 정의는 V1 의 DailyHotPost 와 동일하게 맞춘다. DHP_score 는 V1 이 float(53) 으로
-- 적혀 있는데 이는 MySQL 에서 DOUBLE 과 같은 타입이고, float(53) 표기는 8.0.17 부터
-- deprecated 라 DOUBLE 로 쓴다.
CREATE TABLE IF NOT EXISTS daily_hot_post (
    DHP_id               BIGINT       NOT NULL AUTO_INCREMENT,
    created_at           DATETIME(6)  NOT NULL,
    is_valid             BOOLEAN      NOT NULL DEFAULT TRUE,
    UPT_id               BIGINT,
    UPT_Date             DATETIME(6),
    DHP_leaderboard_date DATE         NOT NULL,
    DHP_score            DOUBLE       NOT NULL,
    PST_id               BIGINT       NOT NULL,
    PRIMARY KEY (DHP_id),
    UNIQUE KEY uk_daily_hot_post_date_post (DHP_leaderboard_date, PST_id),
    KEY idx_daily_hot_post_date_created (DHP_leaderboard_date, created_at DESC)
) ENGINE=InnoDB;

-- ------------------------------------------------------------------
-- 2. 고아 테이블 정리
-- ------------------------------------------------------------------
-- 존재 여부가 환경마다 다르므로 정적 SQL 로는 쓸 수 없다. 없는 테이블을 참조하는 문장은
-- 파싱 단계에서 실패하기 때문이다.
--
-- 데이터는 일일 리더보드 캐시라 유실돼도 HotPostService.syncLeaderboardDayToDb() 가
-- 다시 만들지만, 복사 비용이 거의 없으므로 보존한다.
DROP PROCEDURE IF EXISTS htd_v6_drop_orphan;
DELIMITER $$
CREATE PROCEDURE htd_v6_drop_orphan()
BEGIN
    DECLARE orphan_exists INT;

    -- lower_case_table_names 가 1인 서버에서는 저장된 이름이 dailyhotpost 이므로
    -- 소문자로 비교한다. 0/2 인 서버에서는 DailyHotPost 그대로 저장돼 있다.
    SELECT COUNT(*) INTO orphan_exists
      FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND LOWER(TABLE_NAME) = 'dailyhotpost';

    IF orphan_exists > 0 THEN
        -- posts 에 없는 게시글을 참조하는 행은 3단계 FK 생성을 실패시키므로 조인으로 거른다.
        -- INSERT IGNORE 는 daily_hot_post 에 이미 같은 (날짜, 게시글) 행이 있는 경우를 넘긴다.
        SET @sql = CONCAT(
            'INSERT IGNORE INTO daily_hot_post ',
            '(DHP_id, created_at, is_valid, UPT_id, UPT_Date, DHP_leaderboard_date, DHP_score, PST_id) ',
            'SELECT o.DHP_id, o.created_at, o.is_valid, o.UPT_id, o.UPT_Date, ',
            '       o.DHP_leaderboard_date, o.DHP_score, o.PST_id ',
            '  FROM DailyHotPost o ',
            '  JOIN posts p ON p.PST_id = o.PST_id');
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;

        DROP TABLE DailyHotPost;
    END IF;
END$$
DELIMITER ;

CALL htd_v6_drop_orphan();
DROP PROCEDURE htd_v6_drop_orphan;

-- ------------------------------------------------------------------
-- 3. FK 생성
-- ------------------------------------------------------------------
-- 고아 테이블이 제약명을 놓아준 뒤에야 걸 수 있다. 이미 daily_hot_post 를 갖고 있던
-- 환경(과거 ddl-auto=update 로 만들어진 경우)에는 FK 도 이미 있을 수 있으므로 확인 후 건다.
DROP PROCEDURE IF EXISTS htd_v6_add_fk;
DELIMITER $$
CREATE PROCEDURE htd_v6_add_fk()
BEGIN
    DECLARE fk_exists INT;

    SELECT COUNT(*) INTO fk_exists
      FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'daily_hot_post'
       AND COLUMN_NAME = 'PST_id'
       AND REFERENCED_TABLE_NAME IS NOT NULL;

    IF fk_exists = 0 THEN
        ALTER TABLE daily_hot_post
            ADD CONSTRAINT fk_daily_hot_post_pst FOREIGN KEY (PST_id) REFERENCES posts (PST_id);
    END IF;
END$$
DELIMITER ;

CALL htd_v6_add_fk();
DROP PROCEDURE htd_v6_add_fk;

-- 적용 확인:
--   SHOW TABLES LIKE '%aily%';        -- daily_hot_post 만 나와야 한다
--   SHOW CREATE TABLE daily_hot_post; -- fk_daily_hot_post_pst 가 posts 를 참조
