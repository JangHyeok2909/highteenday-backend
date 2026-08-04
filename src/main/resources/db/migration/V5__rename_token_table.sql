-- V5: Token 테이블을 프로젝트 네이밍 컨벤션에 맞춘다 (BTL-008).
--
-- 엔티티 domain/Token/Token.java 에는 @Table 이 없었다. 그러면 Spring Boot 기본
-- 네이밍 전략(CamelCaseToUnderscoresNamingStrategy)이 클래스명 Token 을 token 으로
-- 바꿔 쿼리하는데, V1__baseline.sql 이 만든 실제 테이블은 Token(대문자 T)이다.
--
-- macOS/Windows 의 MySQL 은 lower_case_table_names 가 1 또는 2라 Token 과 token 을
-- 같은 테이블로 취급해 이 불일치가 드러나지 않는다. 반면 배포 대상인 Linux(EC2, 공식
-- mysql 도커 이미지)는 기본값이 0(대소문자 구분)이라 테이블을 찾지 못한다:
--
--   [select t1_0.id, ... from token t1_0 where t1_0.usr_id=?]
--   Table 'highteenday.token' doesn't exist
--
-- TokenService 가 사용자마다 이 행을 조회/저장하므로 회원가입·로그인·토큰 재발급·
-- 로그아웃 등 인증 관련 전 기능이 장애였다.
--
-- 이참에 이 테이블만 벗어나 있던 나머지 컨벤션도 함께 맞춘다:
--
--   테이블명   Token  -> tokens        (다른 테이블은 전부 소문자, 대부분 복수형)
--   PK 컬럼    id     -> TNK_id        (다른 테이블은 전부 {DOMAIN_PREFIX}_id)
--   FK 명      fk_token_usr -> fk_tokens_usr
--   UNIQUE     UK7b8q... 등 Hibernate 자동생성 -> uk_tokens_*
--
-- 감사 컬럼(created_at, is_valid, UPT_id, UPT_Date)은 일부러 추가하지 않았다. Token 은
-- TokenService.delete() 와 TokenCleanupScheduler.deleteAllExpired() 로 하드 삭제되는
-- 세션 자산이라, is_valid 소프트 삭제를 붙이면 만료된 리프레시 토큰이 논리적으로만
-- 지워져 오히려 보안 리스크가 된다.

-- ------------------------------------------------------------------
-- 1. 테이블명
-- ------------------------------------------------------------------
-- 이 한 줄은 lower_case_table_names 0/1/2 어디서든 동작한다. 1·2인 서버는 이름 비교가
-- 대소문자 무관이라 저장된 이름(token 또는 Token)을 그대로 찾아가고, 0인 서버는 실제
-- 이름이 Token 이라 정확히 일치한다. 환경별 분기가 필요 없다.
RENAME TABLE Token TO tokens;

-- ------------------------------------------------------------------
-- 2. FK 분리
-- ------------------------------------------------------------------
-- USR_id 의 인덱스를 뒤에서 갈아끼우므로 그 인덱스에 의존하는 FK 를 먼저 떼어낸다.
-- 이름을 하드코딩하지 않는 이유: 이 스키마가 어느 시점에 Hibernate 가 만든 것인지에
-- 따라 제약명이 다를 수 있고, 여기서 실패하면 마이그레이션 전체가 멈춰 앱이 뜨지 않는다.
DROP PROCEDURE IF EXISTS htd_v5_drop_usr_fk;
DELIMITER $$
CREATE PROCEDURE htd_v5_drop_usr_fk()
BEGIN
    DECLARE fk_name VARCHAR(64);

    -- MAX() 로 감싸면 결과가 없을 때 NOT FOUND 경고 없이 NULL 이 들어온다.
    SELECT MAX(CONSTRAINT_NAME) INTO fk_name
      FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'tokens'
       AND COLUMN_NAME = 'USR_id'
       AND REFERENCED_TABLE_NAME IS NOT NULL;

    IF fk_name IS NOT NULL THEN
        SET @sql = CONCAT('ALTER TABLE tokens DROP FOREIGN KEY `', fk_name, '`');
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END$$
DELIMITER ;

CALL htd_v5_drop_usr_fk();
DROP PROCEDURE htd_v5_drop_usr_fk;

-- ------------------------------------------------------------------
-- 3. PK 컬럼명
-- ------------------------------------------------------------------
-- CHANGE 는 컬럼 정의 전체를 다시 써야 하므로 AUTO_INCREMENT 를 빠뜨리면 안 된다.
ALTER TABLE tokens CHANGE COLUMN id TNK_id BIGINT NOT NULL AUTO_INCREMENT;

-- ------------------------------------------------------------------
-- 4. UNIQUE 제약명
-- ------------------------------------------------------------------
-- V1__baseline.sql 16번째 줄이 이미 경고해 둔 대로, 이 세 제약의 이름은 Hibernate 가
-- 자동 생성한 값이라 환경마다 다르다(UK7b8qtgtp36hq6dk0a5g317493 같은 형태).
-- 이름을 하드코딩한 DROP INDEX 는 운영에서 실패하므로 컬럼 기준으로 찾아 이름만 바꾼다.
--
-- 제약이 아예 없는 환경도 있을 수 있어(수동으로 스키마를 손댄 경우) 그때는 새로 만든다.
-- 어느 경로로 오든 최종 상태가 같아진다.
DROP PROCEDURE IF EXISTS htd_v5_normalize_unique;
DELIMITER $$
CREATE PROCEDURE htd_v5_normalize_unique(IN col VARCHAR(64), IN target VARCHAR(64))
BEGIN
    DECLARE cur_name VARCHAR(64);

    SELECT MAX(INDEX_NAME) INTO cur_name
      FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'tokens'
       AND COLUMN_NAME = col
       AND NON_UNIQUE = 0
       AND INDEX_NAME <> 'PRIMARY';

    IF cur_name IS NULL THEN
        SET @sql = CONCAT('ALTER TABLE tokens ADD CONSTRAINT `', target, '` UNIQUE (`', col, '`)');
    ELSEIF cur_name <> target THEN
        SET @sql = CONCAT('ALTER TABLE tokens RENAME INDEX `', cur_name, '` TO `', target, '`');
    ELSE
        SET @sql = NULL;
    END IF;

    IF @sql IS NOT NULL THEN
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END$$
DELIMITER ;

CALL htd_v5_normalize_unique('TNK_access',  'uk_tokens_access');
CALL htd_v5_normalize_unique('TNK_refresh', 'uk_tokens_refresh');
CALL htd_v5_normalize_unique('USR_id',      'uk_tokens_usr');
DROP PROCEDURE htd_v5_normalize_unique;

-- ------------------------------------------------------------------
-- 5. FK 재생성
-- ------------------------------------------------------------------
-- 엔티티의 @ForeignKey(name = "fk_tokens_usr") 와 이름을 맞춘다.
-- USR_id 의 unique 인덱스가 이미 있으므로 MySQL 이 FK 용 인덱스를 따로 만들지 않는다.
ALTER TABLE tokens
    ADD CONSTRAINT fk_tokens_usr FOREIGN KEY (USR_id) REFERENCES users (USR_id);

-- 적용 확인:
--   SHOW TABLES LIKE '%oken%';   -- tokens 만 나와야 한다
--   SHOW INDEX FROM tokens;      -- uk_tokens_access / uk_tokens_refresh / uk_tokens_usr
--   SHOW CREATE TABLE tokens;    -- PK 가 TNK_id, FK 가 fk_tokens_usr
