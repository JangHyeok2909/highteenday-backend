-- =========================
-- 1. USERS
-- =========================
INSERT IGNORE INTO users (
    USR_email, USR_nickname, USR_name, created_at
) VALUES
      ('tester@example.com', 'tester1', 'tester1', NOW()),
      ('bob@example.com', 'bobby', 'Bob', NOW()),
      ('carol@example.com', 'carolyn', 'Carol', NOW());

INSERT IGNORE INTO users (
    USR_email, USR_nickname, USR_name, created_at,
    USR_hashed_password, USR_provider, USR_role
) VALUES
    ('test@test.com','테스트닉네임','테스트이름', NOW(),
     '$2a$10$1JDzV5xwEgU4YnztiMB6aOh0s6VlVn47cpf6sI/Cgy0zdyWJo3V1W',
     'DEFAULT', 'USER');


-- =========================
-- 2. BOARDS
-- =========================
INSERT IGNORE INTO boards (
    BRD_name, created_at
) VALUES
      ('자유게시판', NOW()),
      ('수능게시판', NOW()),
      ('이과게시판', NOW()),
      ('문과게시판', NOW()),
      ('질문게시판', NOW());


-- =========================
-- 3. POSTS (100000건 생성)
-- =========================
SET SESSION cte_max_recursion_depth = 100000;
INSERT IGNORE INTO posts (
    USR_id,
    BRD_id,
    PST_title,
    PST_content,
    PST_view_count,
    PST_like_count,
    PST_dislike_count,
    PST_comment_count,
    PST_scrap_count,
    PST_is_anonymous,
    USR_nickname,
    created_at
)
WITH RECURSIVE seq AS (
    SELECT 1 AS n
    UNION ALL
    SELECT n + 1
    FROM seq
    WHERE n < 100000
),
               topic AS (
                   SELECT
                       n,
                       1 + FLOOR(RAND(n) * 3) AS usr_id,
                       IF(RAND(n * 31) < 0.55, 1, 0) AS is_anon,
                       CASE (n % 12)
                           WHEN 0 THEN '시험/공부'
                           WHEN 1 THEN '급식/음식'
                           WHEN 2 THEN '진로/고민'
                           WHEN 3 THEN '친구/관계'
                           WHEN 4 THEN '취미/게임'
                           WHEN 5 THEN '연애'
                           WHEN 6 THEN '학교생활'
                           WHEN 7 THEN '질문'
                           WHEN 8 THEN '정보공유'
                           WHEN 9 THEN '하소연'
                           WHEN 10 THEN '유머'
                           ELSE '자유'
                           END AS topic_name
                   FROM seq
               )
SELECT
    t.usr_id,
    1 AS BRD_id,

    CONCAT(
            '[', t.topic_name, '] 테스트 게시글 #',
            LPAD(t.n, 4, '0')
    ) AS PST_title,

    CONCAT(
            '<p>부하 테스트용 더미 데이터입니다. 주제: ',
            t.topic_name, ', 번호: ', t.n,
            '</p><p>',
            ELT(
                    1 + (t.n % 10),
                    '오늘 뭐 먹지 고민중이에요.',
                    '공부 집중 잘 되는 방법 추천 부탁!',
                    '요즘 너무 피곤한데 다들 어떠세요?',
                    '이 기능 추가되면 좋겠어요.',
                    '시험 망한 것 같아요.',
                    '친구랑 싸웠는데 어떻게 풀죠?',
                    '요즘 재밌는 거 추천해줘요.',
                    '진로 선택이 어렵네요.',
                    '학교 생활 꿀팁 공유합니다.',
                    '그냥 아무 말'
            ),
            '</p>'
    ) AS PST_content,

    FLOOR(RAND(t.n * 17) * 5000) AS PST_view_count,
    FLOOR(RAND(t.n * 19) * 300) AS PST_like_count,
    FLOOR(RAND(t.n * 23) * 80) AS PST_dislike_count,
    0 AS PST_comment_count,
    FLOOR(RAND(t.n * 29) * 50) AS PST_scrap_count,

    t.is_anon AS PST_is_anonymous,

    IF(
            t.is_anon = 1,
            '익명',
            CASE t.usr_id
                WHEN 1 THEN 'tester1'
                WHEN 2 THEN 'bobby'
                WHEN 3 THEN 'carolyn'
                END
    ) AS USR_nickname,

    -- id가 클수록 최신: n=1이 가장 오래됨(약 4.6개월 전), n=100000이 가장 최신(약 2분 전)
    DATE_SUB(NOW(), INTERVAL (100001 - t.n) * 2 MINUTE) AS created_at

FROM topic t;


-- =========================
-- 4. COMMENTS
-- =========================
INSERT IGNORE INTO comments (
    USR_id, PST_id, CMT_parent_id, CMT_is_anonymous,
    CMT_content, CMT_like_count, CMT_dislike_count,
    CMT_image_url, created_at, UPT_Date, UPT_id, is_valid
) VALUES
      (1, 1, NULL, 1, '첫 번째 댓글입니다.', 0, 0, NULL, NOW(), NULL, NULL, 1),
      (2, 1, 1, 0, '첫 번째 댓글에 대한 답글입니다.', 0, 0, NULL, NOW(), NULL, NULL, 1),
      (3, 2, NULL, 0, '게시글 2에 단 댓글입니다.', 0, 0, 'https://example.com/image1.jpg', NOW(), NOW(), 2, 1);


-- =========================
-- 5. (선택) 삭제 테스트
-- =========================
-- UPDATE posts SET is_valid = 0 WHERE PST_id = 4;
-- UPDATE comments SET is_valid = 0 WHERE CMT_id = 4;


