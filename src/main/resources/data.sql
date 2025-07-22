-- 유저 생성
INSERT INTO users (
    USR_email, USR_nickname, USR_name, created_at
) VALUES
      ('tester@example.com', 'tester1', 'tester1', NOW()),
      ('bob@example.com', 'bobby', 'Bob', NOW()),
      ('carol@example.com', 'carolyn', 'Carol', NOW());

-- 유저 생성
INSERT INTO users (
    USR_email, USR_nickname, USR_name, created_at, USR_hashed_password, USR_provider, USR_role
) VALUES
    ('test@test.com','테스트닉네임','테스트이름', NOW(), '$2a$10$1JDzV5xwEgU4YnztiMB6aOh0s6VlVn47cpf6sI/Cgy0zdyWJo3V1W', "DEFAULT", "USER");

-- 게시판 생성
insert into boards (
    BRD_name,created_at
) values
      ("자유게시판",now()),
      ("이과게시판",now()),
      ("문과게시판",now());

-- 게시글 생성
INSERT INTO posts (
    USR_id, BRD_id, PST_title, PST_content,PST_view_count, PST_like_count,PST_dislike_count, PST_comment_count, PST_is_anonymous,created_at
) VALUES
      (1, 1, '안녕하세요', '<p>처음 올리는 글입니다</p>', 0, 0,0, 0, true,now()),
      (2, 1, '질문 있어요', '<p>Spring Boot 관련 질문입니다.</p>', 0, 0,0, 0, false,now()),
      (3, 1, '공지사항 테스트', '<p>테스트용 공지입니다.</p>', 0, 0,0, 0, false,now()),
      (1, 1, '삭제된 게시글 테스트', '<p>삭제된 게시글 입니다.</p>', 0, 0,0, 0, false,now()),
      (1, 1, '수정할 게시글 테스트', '<p>수정 전 내용의 게시글 입니다.</p>', 0, 0,0, 0, false,now());

-- 일반 댓글 (부모 없음)
INSERT INTO comments (
    USR_id, PST_id, CMT_parent_id, CMT_is_anonymus, CMT_content, CMT_like_count,CMT_dislike_count,created_at,CMT_image_url
) VALUES
      (1, 1, NULL, false, '일반 댓글입니다.', 0,0,now(),''),
      (2,1,NULL,true,'id=2인 유저의 댓글입니다.',0,0,now(),''),
      (3,1,NULL,true,'id=3인 유저의 댓글입니다.',0,0,now(),''),
      (1,1,NULL,true,'삭제된 댓글 입니다.',0,0,now(),'');

--PST_id=4 인 게시글은 삭제
UPDATE posts SET is_valid=false WHERE PST_id = 4;
--CMT_id=4 인 게시글은 삭제
UPDATE comments SET is_valid=false WHERE CMT_id = 4;

--좋아요 생성


