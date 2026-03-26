# posts_likes / posts_dislikes → posts_reactions 마이그레이션

기존 두 테이블을 제거하고 `posts_reactions` 단일 테이블로 통합했습니다.  
**운영 DB에 기존 데이터가 있으면** 배포 전에 아래를 검토·실행하세요.

## 새 테이블 요약

- 테이블: `posts_reactions`
- 유니크: `(PST_id, USR_id)` — 유저당 게시글당 **한 행**
- 컬럼: `PST_RCT_kind` = `LIKE` | `DISLIKE`, `is_valid` (soft cancel)

## 예시 SQL (MySQL)

> **백업 후 실행.** 좋아요·싫어요가 **동시에** 존재하던 비정상 데이터는 한쪽만 남기고 수동 검토가 필요합니다.

```sql
-- 1) 좋아요 → 반응
INSERT INTO posts_reactions (USR_id, PST_id, PST_RCT_kind, is_valid, created_at, UPT_Date, UPT_id)
SELECT USR_id, PST_id, 'LIKE', is_valid, created_at, UPT_Date, UPT_id
FROM posts_likes;

-- 2) 싫어요 (같은 유저+게시글이 좋아요에 없을 때만)
INSERT INTO posts_reactions (USR_id, PST_id, PST_RCT_kind, is_valid, created_at, UPT_Date, UPT_id)
SELECT d.USR_id, d.PST_id, 'DISLIKE', d.is_valid, d.created_at, d.UPT_Date, d.UPT_id
FROM posts_dislikes d
WHERE NOT EXISTS (
  SELECT 1 FROM posts_likes l
  WHERE l.PST_id = d.PST_id AND l.USR_id = d.USR_id
);

-- 3) 검증 후 구 테이블 삭제 (FK 확인 후)
-- DROP TABLE posts_likes;
-- DROP TABLE posts_dislikes;
```

## 신규 환경

- JPA `ddl-auto`로 스키마를 새로 만들면 `posts_reactions`만 생성됩니다.

---

# comments_likes / comments_dislikes → comments_reactions

댓글 반응도 동일하게 **`comments_reactions`** 한 테이블, `(CMT_id, USR_id)` 유니크, `CMT_RCT_kind` = `LIKE` | `DISLIKE` 입니다.

```sql
INSERT INTO comments_reactions (USR_id, CMT_id, CMT_RCT_kind, is_valid, created_at, UPT_Date, UPT_id)
SELECT USR_id, CMT_id, 'LIKE', is_valid, created_at, UPT_Date, UPT_id
FROM comments_likes;

INSERT INTO comments_reactions (USR_id, CMT_id, CMT_RCT_kind, is_valid, created_at, UPT_Date, UPT_id)
SELECT d.USR_id, d.CMT_id, 'DISLIKE', d.is_valid, d.created_at, d.UPT_Date, d.UPT_id
FROM comments_dislikes d
WHERE NOT EXISTS (
  SELECT 1 FROM comments_likes l
  WHERE l.CMT_id = d.CMT_id AND l.USR_id = d.USR_id
);
-- DROP TABLE comments_likes;
-- DROP TABLE comments_dislikes;
```
