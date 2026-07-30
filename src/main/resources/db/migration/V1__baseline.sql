-- V1: Flyway 도입 이전 스키마의 baseline.
--
-- 이 파일은 "새로 만드는 빈 데이터베이스"에만 실행된다.
-- 이미 운영 중인 DB(dev/prod)는 spring.flyway.baseline-on-migrate 설정에 따라
-- V1을 실행하지 않고 "적용된 것으로 표시"만 하고 넘어간다. 그러므로 이 파일과
-- 기존 DB의 실제 스키마가 완전히 같지 않아도 마이그레이션은 정상 동작한다.
--
-- 생성 방법: 이 커밋 시점의 JPA 엔티티에서 Hibernate 메타데이터로 추출(MySQLDialect).
-- 따라서 "코드가 기대하는 스키마"이고, "운영 DB에 실제로 있는 스키마"가 아니다.
-- 아래 항목은 실제 DB와 다를 수 있음을 확인한 부분이다. 자세한 내용은 docs/MIGRATION.md 참고.
--
--   1) enum 컬럼: Hibernate 6은 @Enumerated(STRING)을 MySQL 네이티브 enum으로 만든다.
--      기존 수동 스크립트(ddl/V_group_chat.sql)는 같은 컬럼을 VARCHAR(20)으로 만들었다.
--   2) DailyHotPost: 엔티티에 @Table(name=...)이 없어 테이블명이 DailyHotPost가 된다.
--      수동 스크립트 ddl/V_daily_hot_post.sql은 daily_hot_post를 만든다. 서로 다른 테이블이다.
--   3) Token 테이블의 UNIQUE 제약 이름은 Hibernate가 자동 생성한 값이라 환경마다 다를 수 있다.
--
-- 운영 DB와 정확히 일치하는 baseline이 필요해지면 mysqldump --no-data 결과로 이 파일을
-- 교체하는 것이 맞다. docs/MIGRATION.md에 명령과 절차를 적어두었다.
create table boards (BRD_id bigint not null auto_increment, created_at datetime(6) not null, is_valid BOOLEAN DEFAULT true not null, UPT_id bigint, UPT_Date datetime(6), BRD_description TEXT, BRD_name varchar(30) not null, primary key (BRD_id)) engine=InnoDB;
create table chat_messages (CHT_MSG_id bigint not null auto_increment, created_at datetime(6) not null, is_valid BOOLEAN DEFAULT true not null, UPT_id bigint, UPT_Date datetime(6), CHT_MSG_client_id varchar(36), CHT_MSG_content TEXT, CHT_MSG_img_url TEXT, CHT_MSG_type enum ('IMAGE','SYSTEM','TEXT') not null, CHT_RM_id bigint not null, USR_id bigint not null, primary key (CHT_MSG_id)) engine=InnoDB;
create table chat_participants (CHT_PT_id bigint not null auto_increment, created_at datetime(6) not null, is_valid BOOLEAN DEFAULT true not null, UPT_id bigint, UPT_Date datetime(6), CHT_PT_joined_at datetime(6) not null, CHT_PT_joined_msg_id bigint, CHT_PT_last_read_date datetime(6), CHT_PT_last_read_msg_id bigint, CHT_PT_notify bit not null, CHT_PT_role enum ('ADMIN','MEMBER','OWNER') not null, CHT_RM_id bigint not null, USR_id bigint not null, primary key (CHT_PT_id)) engine=InnoDB;
create table chat_rooms (CHT_RM_id bigint not null auto_increment, created_at datetime(6) not null, is_valid BOOLEAN DEFAULT true not null, UPT_id bigint, UPT_Date datetime(6), CHT_RM_CAT enum ('GRADE','GROUP','PRIVATE','SCHOOL') not null, CHT_RM_last_msg varchar(255), CHT_RM_name varchar(255), CHT_RM_pair_key varchar(64), USR_owner_id bigint, primary key (CHT_RM_id)) engine=InnoDB;
create table comments (CMT_id bigint not null auto_increment, created_at datetime(6) not null, is_valid BOOLEAN DEFAULT true not null, UPT_id bigint, UPT_Date datetime(6), CMT_content varchar(10000) not null, CMT_dislike_count integer, CMT_is_anonymous bit not null, CMT_like_count integer, CMT_image_url LONGTEXT, CMT_parent_id bigint, PST_id bigint not null, USR_id bigint not null, primary key (CMT_id)) engine=InnoDB;
create table comments_reactions (CMT_RCT_id bigint not null auto_increment, created_at datetime(6) not null, is_valid BOOLEAN DEFAULT true not null, UPT_id bigint, UPT_Date datetime(6), CMT_RCT_kind enum ('DISLIKE','LIKE') not null, CMT_id bigint not null, USR_id bigint not null, primary key (CMT_RCT_id)) engine=InnoDB;
create table DailyHotPost (DHP_id bigint not null auto_increment, created_at datetime(6) not null, is_valid BOOLEAN DEFAULT true not null, UPT_id bigint, UPT_Date datetime(6), DHP_leaderboard_date date not null, DHP_score float(53) not null, PST_id bigint not null, primary key (DHP_id)) engine=InnoDB;
create table friends (FRD_id bigint not null auto_increment, created_at datetime(6) not null, is_valid BOOLEAN DEFAULT true not null, UPT_id bigint, UPT_Date datetime(6), FRD_status enum ('BLOCKED','FRIEND') not null, USR_frd_id bigint not null, USR_id bigint not null, primary key (FRD_id)) engine=InnoDB;
create table friends_requests (FRD_REQ_id bigint not null auto_increment, created_at datetime(6) not null, is_valid BOOLEAN DEFAULT true not null, UPT_id bigint, UPT_Date datetime(6), FRD_REQ_status enum ('ACCEPTED','BLOCKED','DECLINED','REQUESTED') not null, USR_rec_id bigint not null, USR_req_id bigint not null, primary key (FRD_REQ_id)) engine=InnoDB;
create table medias (MDA_id bigint not null auto_increment, MDA_content_type varchar(100) not null, MDA_CAT enum ('GIF','IMG','VIDEO'), MDA_origin_name varchar(255) not null, MDA_s3_key varchar(255) not null, MDA_size bigint not null, MDA_url varchar(1000) not null, CMT_id bigint, PST_id bigint, USR_profile_owner_id_ bigint, primary key (MDA_id)) engine=InnoDB;
create table notifications (NT_id bigint not null auto_increment, created_at datetime(6) not null, is_valid BOOLEAN DEFAULT true not null, UPT_id bigint, UPT_Date datetime(6), NT_CAT enum ('COMMENT_REPLY','FRIEND_ACCEPT','FRIEND_BIRTHDAY','FRIEND_REQUEST','POST_COMMENT','POST_LIKE_THRESHOLD','POST_TRENDING') not null, NT_content_msg varchar(255), entityId bigint, NT_entity_type enum ('COMMENT','POST','USER'), NT_is_read bit not null, NT_msg varchar(255), USR_rec_id bigint not null, USR_send_id bigint, primary key (NT_id)) engine=InnoDB;
create table personal_schedule (PS_SD_id bigint not null auto_increment, created_at datetime(6) not null, is_valid BOOLEAN DEFAULT true not null, UPT_id bigint, UPT_Date datetime(6), PS_SD_content TEXT not null, PS_SD_day date, PS_SD_is_finished bit not null, PS_SD_month date, PS_SD_week date, USR_id bigint not null, primary key (PS_SD_id)) engine=InnoDB;
create table posts (PST_id bigint not null auto_increment, created_at datetime(6) not null, is_valid BOOLEAN DEFAULT true not null, UPT_id bigint, UPT_Date datetime(6), PST_comment_count integer, PST_content TEXT not null, PST_dislike_count integer, PST_is_anonymous bit, PST_like_count integer, USR_nickname varchar(12) not null, PST_scrap_count integer, PST_title varchar(50) not null, PST_view_count integer, BRD_id bigint not null, USR_id bigint not null, primary key (PST_id)) engine=InnoDB;
create table posts_reactions (PST_RCT_id bigint not null auto_increment, created_at datetime(6) not null, is_valid BOOLEAN DEFAULT true not null, UPT_id bigint, UPT_Date datetime(6), PST_RCT_kind enum ('DISLIKE','LIKE') not null, PST_id bigint not null, USR_id bigint not null, primary key (PST_RCT_id)) engine=InnoDB;
create table RecentHotPost (RHP_id bigint not null auto_increment, created_at datetime(6) not null, is_valid BOOLEAN DEFAULT true not null, UPT_id bigint, UPT_Date datetime(6), RHP_score float(53) not null, PST_id bigint not null, USR_id bigint not null, primary key (RHP_id)) engine=InnoDB;
create table schools (SCH_id bigint not null auto_increment, SCH_CAT enum ('HIGH') not null, SCH_code integer not null, ATPT_OFCDC_SC_CODE varchar(255) not null, SCH_location varchar(255) not null, SCH_name varchar(255) not null, primary key (SCH_id)) engine=InnoDB;
create table schools_meals (SCH_ML_id bigint not null auto_increment, SCH_ML_calorie integer not null, SCH_ML_CAT enum ('BREAKFAST','DINNER','LUNCH') not null, date date not null, SCH_ML_day varchar(2) not null, SCH_ML_dish_name TEXT not null, SCH_ML_month varchar(2) not null, SCH_ML_week varchar(1) not null, SCH_id bigint not null, primary key (SCH_ML_id)) engine=InnoDB;
create table schools_schedule (SCH_SD_id bigint not null auto_increment, SCH_SD_class integer, SCH_SD_date date not null, SCH_SD_day varchar(2) not null, SCH_SD_grade integer, SCH_SD_major varchar(100), SCH_SD_period integer not null, SCH_SD_subject varchar(100) not null, SCH_SD_week varchar(1) not null, SCH_id bigint not null, primary key (SCH_SD_id)) engine=InnoDB;
create table scraps (SC_id bigint not null auto_increment, created_at datetime(6) not null, is_valid BOOLEAN DEFAULT true not null, UPT_id bigint, UPT_Date datetime(6), PST_id bigint not null, USR_id bigint not null, primary key (SC_id)) engine=InnoDB;
create table subjects (SBJ_id bigint not null auto_increment, SBJ_hours_per_Week integer, SBJ_name varchar(255) not null, TTT_id bigint not null, primary key (SBJ_id)) engine=InnoDB;
create table timetables_templates (TTT_id bigint not null auto_increment, TTT_grade enum ('JUNIOR','SENIOR','SOPHOMORE') not null, TTT_is_default bit not null, TTT_semester enum ('FIRST','SECOND') not null, TTT_template_name varchar(255), USR_id bigint not null, primary key (TTT_id)) engine=InnoDB;
create table Token (id bigint not null auto_increment, TNK_access varchar(500), TNK_expires_at datetime(6), TNK_refresh varchar(500), USR_id bigint, primary key (id)) engine=InnoDB;
create table users (USR_id bigint not null auto_increment, created_at datetime(6) not null, is_valid BOOLEAN DEFAULT true not null, UPT_id bigint, UPT_Date datetime(6), USR_allow_admsg bit, USR_birth_date date, USR_email varchar(48) not null, USR_gender enum ('FEMALE','MALE','OTHER'), USR_grade enum ('JUNIOR','SENIOR','SOPHOMORE'), USR_major varchar(30), USR_name varchar(10) not null, USR_nickname varchar(12) not null, USR_hashed_password varchar(60), USR_phone varchar(20), USR_profile_image_url TEXT, USR_provider enum ('DEFAULT','GOOGLE','KAKAO','NAVER'), USR_role enum ('ADMIN','GUEST','USER'), USR_semester enum ('FIRST','SECOND'), USR_class integer, SCH_id bigint, primary key (USR_id)) engine=InnoDB;
create table users_timetables (UTT_id bigint not null auto_increment, UTT_day enum ('FRIDAY','MONDAY','SATURDAY','SUNDAY','THURSDAY','TUESDAY','WEDNESDAY'), UTT_period varchar(255), SBJ_id bigint, TTT_id bigint not null, primary key (UTT_id)) engine=InnoDB;
create index idx_chat_messages_room_id on chat_messages (CHT_RM_id, CHT_MSG_id desc);
alter table chat_messages add constraint uk_chat_messages_room_client unique (CHT_RM_id, CHT_MSG_client_id);
create index idx_chat_participants_usr on chat_participants (USR_id, is_valid);
alter table chat_participants add constraint uk_chat_participants_room_usr unique (CHT_RM_id, USR_id);
alter table chat_rooms add constraint uk_chat_rooms_pair_key unique (CHT_RM_pair_key);
alter table comments_reactions add constraint uk_comments_reactions_cmt_usr unique (CMT_id, USR_id);
create index idx_daily_hot_post_date_created on DailyHotPost (DHP_leaderboard_date, created_at desc);
alter table DailyHotPost add constraint uk_daily_hot_post_date_post unique (DHP_leaderboard_date, PST_id);
create index idx_posts_brd_valid_id on posts (BRD_id, is_valid, PST_id desc);
create index idx_posts_brd_valid_like on posts (BRD_id, is_valid, PST_like_count desc);
create index idx_posts_brd_valid_view on posts (BRD_id, is_valid, PST_view_count desc);
alter table posts_reactions add constraint uk_posts_reactions_pst_usr unique (PST_id, USR_id);
alter table Token add constraint UK7b8qtgtp36hq6dk0a5g317493 unique (TNK_access);
alter table Token add constraint UKtlcpt0rjhqx3nd4mprlyo389v unique (TNK_refresh);
alter table Token add constraint UKjdpy3vdab3t7orwofb4yn7jyk unique (USR_id);
alter table users add constraint uk_users_email unique (USR_email);
alter table chat_messages add constraint fk_chat_messages_cht_rm foreign key (CHT_RM_id) references chat_rooms (CHT_RM_id);
alter table chat_messages add constraint fk_chat_messages_usr foreign key (USR_id) references users (USR_id);
alter table chat_participants add constraint fk_chat_participants_cht_rm foreign key (CHT_RM_id) references chat_rooms (CHT_RM_id);
alter table chat_participants add constraint fk_chat_participants_usr foreign key (USR_id) references users (USR_id);
alter table chat_rooms add constraint fk_chat_rooms_usr_owner foreign key (USR_owner_id) references users (USR_id);
alter table comments add constraint fk_comments_parent foreign key (CMT_parent_id) references comments (CMT_id);
alter table comments add constraint fk_comments_pst foreign key (PST_id) references posts (PST_id);
alter table comments add constraint fk_comments_usr foreign key (USR_id) references users (USR_id);
alter table comments_reactions add constraint fk_comments_reactions_cmt foreign key (CMT_id) references comments (CMT_id);
alter table comments_reactions add constraint fk_comments_reactions_usr foreign key (USR_id) references users (USR_id);
alter table DailyHotPost add constraint fk_daily_hot_post_pst foreign key (PST_id) references posts (PST_id);
alter table friends add constraint fk_friends_usr_frd foreign key (USR_frd_id) references users (USR_id);
alter table friends add constraint fk_friends_usr foreign key (USR_id) references users (USR_id);
alter table friends_requests add constraint fk_friends_requests_usr_rec foreign key (USR_rec_id) references users (USR_id);
alter table friends_requests add constraint fk_friends_requests_usr_req foreign key (USR_req_id) references users (USR_id);
alter table medias add constraint fk_medias_cmt foreign key (CMT_id) references comments (CMT_id);
alter table medias add constraint fk_medias_pst foreign key (PST_id) references posts (PST_id);
alter table medias add constraint fk_medias_usr_profile foreign key (USR_profile_owner_id_) references users (USR_id);
alter table notifications add constraint fk_notifications_usr_rec foreign key (USR_rec_id) references users (USR_id);
alter table notifications add constraint fk_notifications_usr_send foreign key (USR_send_id) references users (USR_id);
alter table personal_schedule add constraint fk_personal_schedule_usr foreign key (USR_id) references users (USR_id);
alter table posts add constraint fk_posts_brd foreign key (BRD_id) references boards (BRD_id);
alter table posts add constraint fk_posts_usr foreign key (USR_id) references users (USR_id);
alter table posts_reactions add constraint fk_posts_reactions_pst foreign key (PST_id) references posts (PST_id);
alter table posts_reactions add constraint fk_posts_reactions_usr foreign key (USR_id) references users (USR_id);
alter table RecentHotPost add constraint fk_recent_hot_post_pst foreign key (PST_id) references posts (PST_id);
alter table RecentHotPost add constraint fk_recent_hot_post_usr foreign key (USR_id) references users (USR_id);
alter table schools_meals add constraint fk_schools_meals_sch foreign key (SCH_id) references schools (SCH_id);
alter table schools_schedule add constraint fk_schools_schedule_sch foreign key (SCH_id) references schools (SCH_id);
alter table scraps add constraint fk_scraps_pst foreign key (PST_id) references posts (PST_id);
alter table scraps add constraint fk_scraps_usr foreign key (USR_id) references users (USR_id);
alter table subjects add constraint fk_subjects_ttt foreign key (TTT_id) references timetables_templates (TTT_id);
alter table timetables_templates add constraint fk_timetables_templates_usr foreign key (USR_id) references users (USR_id);
alter table Token add constraint fk_token_usr foreign key (USR_id) references users (USR_id);
alter table users add constraint fk_users_sch foreign key (SCH_id) references schools (SCH_id);
alter table users_timetables add constraint fk_users_timetables_sbj foreign key (SBJ_id) references subjects (SBJ_id);
alter table users_timetables add constraint fk_users_timetables_ttt foreign key (TTT_id) references timetables_templates (TTT_id);

