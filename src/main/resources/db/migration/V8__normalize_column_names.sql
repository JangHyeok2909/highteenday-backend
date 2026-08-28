-- V8: 명명 규칙(`{DOMAIN_PREFIX}_{lower_snake}`)을 벗어난 컬럼 3개를 맞춘다 (KI-29).
--
--   medias.USR_profile_owner_id_  -> USR_profile_owner_id   (끝 언더스코어 제거)
--   subjects.SBJ_hours_per_Week   -> SBJ_hours_per_week     (대문자 W)
--   schools_meals.date            -> SCH_ML_date            (접두어 없음)
--
-- BaseEntity 의 created_at / is_valid / UPT_Date / UPT_id 는 의도적으로 건드리지 않는다.
-- 그 넷은 20개 이상 테이블에 걸쳐 있고 performance/ 의 데이터셋 생성·검증 스크립트가
-- raw SQL 로 참조한다. 개명하면 데이터셋을 다시 만들어야 하고 기존 Before 기준선이
-- 무효가 된다.

-- medias: FK 가 이 컬럼을 잡고 있어 먼저 떼어낸다.
ALTER TABLE medias DROP FOREIGN KEY fk_medias_usr_profile;
ALTER TABLE medias CHANGE COLUMN `USR_profile_owner_id_` `USR_profile_owner_id` BIGINT NULL;
ALTER TABLE medias
    ADD CONSTRAINT fk_medias_usr_profile FOREIGN KEY (USR_profile_owner_id) REFERENCES users (USR_id);

-- subjects: 인덱스·제약이 걸려 있지 않아 컬럼만 바꾸면 된다.
ALTER TABLE subjects CHANGE COLUMN `SBJ_hours_per_Week` `SBJ_hours_per_week` INTEGER NULL;

-- schools_meals: `date` 는 예약어에 가까운 이름이라 접두어를 붙여 두는 편이 안전하기도 하다.
ALTER TABLE schools_meals CHANGE COLUMN `date` `SCH_ML_date` DATE NOT NULL;

-- 적용 확인:
--   SHOW CREATE TABLE medias;         -- USR_profile_owner_id + fk_medias_usr_profile
--   SHOW COLUMNS FROM subjects;       -- SBJ_hours_per_week
--   SHOW COLUMNS FROM schools_meals;  -- SCH_ML_date
