-- 유저 생성
INSERT INTO users (
    USR_email, USR_nickname, USR_name, created_at
) VALUES
      ('alice@example.com', 'alice01', 'Alice', NOW()),
      ('bob@example.com', 'bobby', 'Bob', NOW()),
      ('carol@example.com', 'carolyn', 'Carol', NOW());
-- 게시판 생성
insert into boards (
    BRD_name,created_at
) values
      ("자유게시판",now()),
      ("이과게시판",now()),
      ("문과게시판",now());

-- 게시글 생성
INSERT INTO posts (
    USR_id, BRD_id, PST_title, PST_content,
    PST_view_count, PST_like_count, PST_comment_count, PST_is_anonymous,created_at
) VALUES
      (1, 1, '안녕하세요', '<p>처음 올리는 글입니다</p>', 0, 0, 0, true,now()),
      (2, 1, '질문 있어요', '<p>Spring Boot 관련 질문입니다.</p>', 0, 0, 0, false,now()),
      (3, 1, '공지사항 테스트', '<p>테스트용 공지입니다.</p>', 0, 0, 0, false,now());

