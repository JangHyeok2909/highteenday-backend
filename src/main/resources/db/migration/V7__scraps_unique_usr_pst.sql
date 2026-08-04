-- V7: scraps 에 (USR_id, PST_id) 유니크 제약을 건다 (BTL-012).
--
-- ScrapService.toggleScrap() 은 체크-후-실행(check-then-act)이다. 같은 사용자가 같은
-- 게시글을 짧은 간격으로 두 번 요청하면(더블클릭, 빠른 재시도, 부하 테스트의 동시 VU)
-- 두 요청이 모두 "없음"을 보고 둘 다 INSERT 한다. 지금까지는 DB 에 이를 막을 제약이 없었다.
--
-- 중복 행이 생기면 isScraped() 가 쓰는 findByPostAndUser 가 0 또는 1건을 기대하는데
-- 2건이 반환되어 예외가 난다:
--
--   Query did not return a unique result: 2 results were returned
--
-- 이 메서드는 게시글 상세 조회 경로에서 "내가 스크랩했는지" 표시용으로 호출되므로,
-- 스크랩 기능의 경쟁 상태 하나가 무관한 조회 기능까지 무너뜨린다. 게다가 한 번 중복이
-- 생기면 그 게시글은 데이터를 정리하기 전까지 영구히 상세 조회가 막힌다. 재시도로 낫지 않는다.
--
-- 실측: 부하 테스트 시드(datasets/seed.js, 동시성 5)만으로도 (USR_id=3, PST_id=3) 조합이
-- 2행 생성된 것을 확인했다.
--
-- Scrap 은 하드 삭제하지 않고 activeScrap()/cancelScrap() 으로 is_valid 만 토글하는
-- 구조라, (사용자, 게시글) 조합당 행이 영구히 하나면 충분하다. 유니크 제약이 설계와 정확히
-- 들어맞는다.
--
-- docs/MIGRATION.md 의 "기존 행 정리 -> 백필 -> 제약" 순서를 따른다. 순서를 바꾸면
-- 이미 있는 중복 때문에 제약 추가가 실패한다.

-- ------------------------------------------------------------------
-- 1. 기존 중복 행 정리
-- ------------------------------------------------------------------
-- 조합마다 한 행만 남긴다. is_valid = TRUE 인 행이 있으면 그 중 가장 오래된 것(최소 SC_id)을
-- 남겨 사용자의 현재 스크랩 상태를 보존하고, 전부 취소 상태면 그냥 최소 SC_id 를 남긴다.
-- 반대로 하면 스크랩해 둔 글이 조용히 취소된 것처럼 보인다.
DELETE s
  FROM scraps s
  JOIN (
        SELECT USR_id,
               PST_id,
               COALESCE(MIN(CASE WHEN is_valid THEN SC_id END), MIN(SC_id)) AS keep_id
          FROM scraps
         GROUP BY USR_id, PST_id
        HAVING COUNT(*) > 1
       ) dup
    ON dup.USR_id = s.USR_id
   AND dup.PST_id = s.PST_id
 WHERE s.SC_id <> dup.keep_id;

-- ------------------------------------------------------------------
-- 2. posts.PST_scrap_count 백필
-- ------------------------------------------------------------------
-- 중복 행이 카운트에 그대로 반영돼 있어 실제보다 부풀려진 값이 남아 있다.
-- toggleScrap 이 다음 호출 때 syncScrapCount 로 바로잡긴 하지만, 그때까지는 잘못된 수가
-- 그대로 노출된다. 인기글일수록 오염이 먼저 생기고 오래 남는다.
--
-- 값이 실제와 다른 행만 건드린다. posts 전체를 훑어 쓰면 큰 테이블에서 불필요하게 무겁다.
UPDATE posts p
  JOIN (
        SELECT PST_id, COUNT(*) AS valid_count
          FROM scraps
         WHERE is_valid = TRUE
         GROUP BY PST_id
       ) actual
    ON actual.PST_id = p.PST_id
   SET p.PST_scrap_count = actual.valid_count
 WHERE p.PST_scrap_count IS NULL
    OR p.PST_scrap_count <> actual.valid_count;

-- ------------------------------------------------------------------
-- 3. 유니크 제약
-- ------------------------------------------------------------------
-- 엔티티 domain/scraps/Scrap.java 의 @UniqueConstraint 와 이름을 맞춘다.
--
-- 이 제약의 선행 컬럼이 USR_id 라서, FK fk_scraps_usr 를 받쳐주던 단일 컬럼 인덱스는
-- MySQL 이 알아서 정리한다(FK 는 그대로 유지된다). 별도로 지울 필요가 없다 — 실측으로
-- 확인했다. fk_scraps_pst 쪽 인덱스는 선행 컬럼이 아니므로 그대로 남는다.
ALTER TABLE scraps
    ADD CONSTRAINT uk_scraps_usr_pst UNIQUE (USR_id, PST_id);

-- 적용 확인:
--   SELECT USR_id, PST_id, COUNT(*) c FROM scraps GROUP BY USR_id, PST_id HAVING c > 1;
--   -- 0행이어야 한다
--   SHOW INDEX FROM scraps;  -- uk_scraps_usr_pst
