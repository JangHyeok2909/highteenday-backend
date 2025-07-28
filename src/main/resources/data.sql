-- CREATE TABLE comments (
--                           CMT_id BIGINT AUTO_INCREMENT PRIMARY KEY,
--                           USR_id BIGINT NOT NULL,
--                           PST_id BIGINT NOT NULL,
--                           CMT_parent_id BIGINT,
--                           CMT_is_anonymous BOOLEAN NOT NULL DEFAULT true,
--                           CMT_content VARCHAR(10000) NOT NULL,
--                           CMT_like_count INT DEFAULT 0,
--                           CMT_dislike_count INT DEFAULT 0,
--                           CMT_image_url LONGTEXT,
--                           created_at DATETIME NOT NULL,
--                           UPT_Date DATETIME,
--                           UPT_id BIGINT,
--                           is_valid BOOLEAN NOT NULL DEFAULT true,
--
--                           CONSTRAINT fk_comment_user FOREIGN KEY (usr_id) REFERENCES users(usr_id),
--                           CONSTRAINT fk_comment_post FOREIGN KEY (pst_id) REFERENCES posts(pst_id),
--                           CONSTRAINT fk_comment_parent FOREIGN KEY (cmt_parent_id) REFERENCES comments(cmt_id)
-- );

-- 유저 생성
INSERT INTO users (
    USR_email, USR_nickname, USR_name, created_at
) VALUES
      ('test@example.com', 'tester1', 'tester1', NOW()),
      ('tester@example.com', 'tester1', 'tester1', NOW()),
      ('bob@example.com', 'bobby', 'Bob', NOW()),
      ('carol@example.com', 'carolyn', 'Carol', NOW());
-- 게시판 생성
insert into boards (
    BRD_name,created_at
) values
      ("자유게시판",now()),
      ("수능게시판",now()),
      ("이과게시판",now()),
      ("문과게시판",now()),
      ("질문게시판",now());

-- 게시글 생성
INSERT INTO posts (
    USR_id, BRD_id, PST_title, PST_content, PST_view_count, PST_like_count,
    PST_dislike_count, PST_comment_count, PST_scrap_count, PST_is_anonymous, created_at
) VALUES
      (1, 1, '안녕하세요', '<p>처음 올리는 글입니다</p>', 0, 0, 0, 0, 0, true, '2025-07-20 14:30:00'),
      (1, 1, '첫 인사드립니다', '<p>안녕하세요. 잘 부탁드립니다!</p>', 0, 0, 0, 0, 0, true, '2025-07-20 13:25:00'),
      (1, 1, '점심 뭐 먹지?', '<p>오늘 점심 추천 좀 해주세요!</p>', 0, 0, 0, 0, 0, false, '2025-07-19 12:00:00'),
      (1, 1, '고민이 있어요', '<p>요즘 진로 고민이 많아요.</p>', 0, 0, 0, 0, 0, true, '2025-07-18 18:45:00'),
      (1, 1, '기말고사 후기', '<p>이번 시험 진짜 어려웠네요...</p>', 0, 0, 0, 0, 0, false, '2025-07-15 09:15:00'),
      (1, 1, '좋은 하루 되세요', '<p>모두 좋은 하루 보내세요~</p>', 0, 0, 0, 0, 0, true, '2025-07-14 08:00:00'),
      (1, 1, '공부 꿀팁 공유합니다', '<p>단기간 암기법 공유드려요.</p>', 0, 0, 0, 0, 0, false, '2025-07-13 20:20:00'),
      (1, 1, '오늘 날씨 어때요?', '<p>비 온다는데 맞나요?</p>', 0, 0, 0, 0, 0, true, '2025-07-12 14:10:00'),
      (1, 1, '내일 시험인데', '<p>하나도 준비 안 했어요ㅠㅠ</p>', 0, 0, 0, 0, 0, true, '2025-07-11 22:00:00'),
      (1, 1, '하이틴데이 최고!', '<p>이런 커뮤니티가 있어서 좋아요</p>', 0, 0, 0, 0, 0, false, '2025-07-10 10:30:00'),
      (1, 1, '방학 계획 세우셨나요?', '<p>전 알바하고 여행도 가고 싶어요.</p>', 0, 0, 0, 0, 0, true, '2025-07-09 15:45:00'),
      (1, 1, '좋아하는 노래 공유해요', '<p>요즘은 뉴진스 노래 듣고 있어요</p>', 0, 0, 0, 0, 0, false, '2025-07-08 11:00:00'),
      (1, 1, '오늘 컨디션 어때요?', '<p>전 좀 피곤하네요 😓</p>', 0, 0, 0, 0, 0, true, '2025-07-07 17:30:00'),
      (1, 1, '시험 망함ㅠ', '<p>진짜 망했어요... 재시험 있겠죠?</p>', 0, 0, 0, 0, 0, false, '2025-07-06 21:15:00'),
      (1, 1, '기억력 좋아지는 방법?', '<p>암기법 추천해주세요</p>', 0, 0, 0, 0, 0, true, '2025-07-05 07:45:00'),
      (1, 1, '이거 정상인가요?', '<p>요즘 너무 잠이 많아요</p>', 0, 0, 0, 0, 0, true, '2025-07-04 19:00:00'),
      (1, 1, '고3 응원해주세요!', '<p>수험생 여러분 모두 파이팅입니다!</p>', 0, 0, 0, 0, 0, false, '2025-07-03 13:15:00'),
      (1, 1, '드라마 추천 좀요', '<p>재밌는 거 없을까요?</p>', 0, 0, 0, 0, 0, true, '2025-07-02 16:50:00'),
      (1, 1, '좋은 책 추천해주세요', '<p>요즘 책 읽고 싶은데 뭐가 좋을까요?</p>', 0, 0, 0, 0, 0, false, '2025-07-01 09:00:00'),
      (1, 1, '하이틴데이 사용법 질문', '<p>게시판은 어떻게 나뉘어 있나요?</p>', 0, 0, 0, 0, 0, true, '2025-06-30 20:30:00'),
      (1, 1, '하이틴데이 로고 이뻐요', '<p>디자인 누가 하셨는지 궁금해요</p>', 0, 0, 0, 0, 0, false, '2025-06-29 11:40:00'),
      (1, 1, '실시간 소통방 있나요?', '<p>DM 말고 채팅은 없나요?</p>', 0, 0, 0, 0, 0, true, '2025-06-28 14:25:00'),
      (1, 1, '오늘도 화이팅', '<p>작은 응원이 필요할 때입니다!</p>', 0, 0, 0, 0, 0, false, '2025-06-27 09:50:00'),
      (1, 1, '스터디 구해요', '<p>같이 공부하실 분 댓글 주세요</p>', 0, 0, 0, 0, 0, true, '2025-06-26 18:05:00'),
      (1, 1, '감정기복이 심해요', '<p>요즘 감정기복이 너무 심해요</p>', 0, 0, 0, 0, 0, true, '2025-06-25 20:40:00'),
      (1, 1, '운동 시작했습니다', '<p>매일 30분 걷기 도전 중!</p>', 0, 0, 0, 0, 0, false, '2025-06-24 07:30:00'),
      (1, 1, '이런 기능 어때요?', '<p>익명 좋아요/싫어요 표시 기능?</p>', 0, 0, 0, 0, 0, true, '2025-06-23 15:20:00'),
      (1, 1, '비 오니까 분위기 좋네요', '<p>음악 들으며 글 적고 있어요</p>', 0, 0, 0, 0, 0, false, '2025-06-22 12:10:00'),
      (1, 1, '연애 고민 있습니다', '<p>여러분의 조언이 필요해요</p>', 0, 0, 0, 0, 0, true, '2025-06-21 19:45:00'),
      (1, 1, '이 앱 진짜 좋아요', '<p>광고 안 보고 쓸 수 있어서 좋아요</p>', 0, 0, 0, 0, 0, false, '2025-06-20 14:15:00'),
      (1, 1, '카페 추천해 주세요', '<p>서울 강남쪽 예쁜 카페 있을까요?</p>', 0, 0, 0, 0, 0, true, '2025-06-19 09:40:00'),
      (1, 1, '내일 발표 걱정돼요', '<p>준비는 했지만 떨리네요</p>', 0, 0, 0, 0, 0, true, '2025-06-18 18:30:00'),
      (1, 1, '다들 몇 시에 자요?', '<p>저는 보통 1시쯤 자요</p>', 0, 0, 0, 0, 0, false, '2025-06-17 01:15:00'),
      (1, 1, '좋아요 눌러주세요', '<p>혼자 쓰는 글 같지만 누가 읽어줬으면…</p>', 0, 0, 0, 0, 0, true, '2025-06-16 10:50:00'),
      (1, 1, '수정할 게시글 테스트', '<p>수정 전 내용의 게시글 입니다.</p>', 0, 0, 0, 0, 0, false, '2025-06-15 16:00:00'),
      (1, 4, '삭제된 게시글 테스트', '<p>삭제된 게시글 입니다.</p>', 0, 0, 0, 0, 0, false, '2025-06-14 13:00:00'),
      (2, 2, '질문 있어요', '<p>Spring Boot 관련 질문입니다.</p>', 0, 0, 0, 0, 0, false, now()),
      (3, 3, '공지사항 테스트', '<p>테스트용 공지입니다.</p>', 0, 0, 0, 0, 0, false, now());

INSERT INTO comments
(USR_id, PST_id, CMT_parent_id, CMT_is_anonymous, CMT_content, CMT_like_count, CMT_dislike_count, CMT_image_url, created_at, UPT_Date, UPT_id, is_valid)
VALUES
    (1, 1, NULL, true, '첫 번째 댓글입니다.', 0, 0, NULL, NOW(), NULL, NULL, true),
    (2, 1, 1, false, '첫 번째 댓글에 대한 답글입니다.', 0, 0, NULL, NOW(), NULL, NULL, true),
    (3, 2, NULL, false, '게시글 2에 단 댓글입니다.', 0, 0, 'https://example.com/image1.jpg', NOW(), NOW(), 2, true);

--PST_id=4 인 게시글은 삭제
-- UPDATE posts SET is_valid=false WHERE PST_id = 4;
--CMT_id=4 인 댓글은 삭제
-- UPDATE comments SET is_valid=false WHERE CMT_id = 4;
--좋아요 생성



