#!/usr/bin/env bash
# 데이터셋 검증 — datasets/README.md "검증" 절의 쿼리를 한 번에 돌린다.
#
# 시더가 "성공"으로 끝나는 것과 데이터가 명세대로인 것은 다른 문제다. 시더는 자기가 보낸
# 요청만 알고 DB 안의 정합성은 모른다. 재생성할 때마다 이걸 돌려서 통과해야 쓸 수 있다.
#
# 사용법: bash datasets/verify.sh <profile>
set -u
PROFILE="${1:-large}"
CT=perf-mysql
DB=highteenday
PW="${MYSQL_ROOT_PASSWORD:-perfroot}"
q() { docker exec "$CT" mysql -uroot -p"$PW" "$DB" -t -e "$1" 2>&1 | grep -v "Warning"; }

echo "════════ 데이터셋 검증: $PROFILE ════════"

echo
echo "── ① 수량 (명세 대조) ──"
q "SELECT
     (SELECT COUNT(*) FROM users WHERE is_valid=1)  AS users,
     (SELECT COUNT(*) FROM posts WHERE is_valid=1)  AS posts,
     (SELECT COUNT(*) FROM comments WHERE is_valid=1) AS comments,
     (SELECT COUNT(*) FROM posts_reactions WHERE is_valid=1) AS reactions,
     (SELECT COUNT(*) FROM scraps WHERE is_valid=1) AS scraps,
     (SELECT COUNT(*) FROM friends WHERE is_valid=1) AS friend_rows,
     (SELECT COUNT(*) FROM chat_rooms WHERE is_valid=1) AS chat_rooms;"

echo
echo "── ①-b 워크로드가 읽는데 비어 있던 것들 (전부 0보다 커야 한다) ──"
# 왜 따로 두는가: ①은 "시더가 만들기로 한 것"만 셌다. 그 목록에 없는 테이블은 0행이어도
# "6개 항목 전부 통과"가 나왔고, 실제로 그 상태로 두 주를 측정했다.
#   comments_reactions 0 → 댓글 목록의 반응 조회가 늘 "없음"을 즉시 반환
#   대댓글            0 → 트리 조립 비용과 부모 프록시 초기화가 미측정
#   chat_messages     0 → 방 목록의 미읽음 집계가 빈 테이블 위에서 동작
#   단체방            0 → 브로드캐스트 팬아웃과 읽음 현황이 미측정
#   friends_requests  0 → 받은 신청함이 늘 빈 배열
q "SELECT
     (SELECT COUNT(*) FROM comments_reactions WHERE is_valid=1) AS cmt_reactions,
     (SELECT COUNT(*) FROM comments WHERE is_valid=1 AND CMT_parent_id IS NOT NULL) AS replies,
     (SELECT COUNT(*) FROM chat_messages WHERE is_valid=1) AS chat_msgs,
     (SELECT COUNT(*) FROM (SELECT CHT_RM_id FROM chat_participants WHERE is_valid=1
        GROUP BY CHT_RM_id HAVING COUNT(*) > 2) g) AS group_rooms,
     (SELECT COUNT(*) FROM friends_requests WHERE is_valid=1) AS friend_reqs;"

echo
echo "── ①-c 본문 다양성 (같은 문자열 반복은 검색·응답 크기를 왜곡한다) ──"
# 실측(2026-09-01): 댓글 40,000건의 서로 다른 본문이 10종, 평균 7.1자였다. 그 상태에서
# 댓글 3,903건 응답이 1.41MB 였고 본문은 건당 7바이트뿐이었다.
q "SELECT
     (SELECT COUNT(DISTINCT CMT_content) FROM comments WHERE is_valid=1) AS distinct_comments,
     (SELECT ROUND(AVG(CHAR_LENGTH(CMT_content)),1) FROM comments WHERE is_valid=1) AS avg_comment_len,
     (SELECT COUNT(DISTINCT PST_content) FROM posts WHERE is_valid=1) AS distinct_posts,
     (SELECT ROUND(AVG(CHAR_LENGTH(PST_content)),1) FROM posts WHERE is_valid=1) AS avg_post_len;"

echo
echo "── ①-d 이번 범위 밖이라 0이 정상인 것 (침묵이 아니라 선언) ──"
# 0이면 실패로 처리하지 않는다. 다만 "확인했고 의도적으로 0"임을 화면에 남긴다 —
# 아무 말도 안 하면 다음 사람이 같은 조사를 다시 한다.
q "SELECT
     (SELECT COUNT(*) FROM medias) AS medias,
     (SELECT COUNT(*) FROM users_timetables) AS user_timetables,
     (SELECT COUNT(*) FROM schools_meals) AS school_meals,
     (SELECT COUNT(*) FROM subjects) AS subjects;"
echo "   (위 넷은 시더 범위 밖이다 — 해당 엔드포인트는 빈 결과를 재고 있다)"

echo
echo "── ② 비정규화 카운터 (댓글은 반드시 0건 불일치) ──"
q "SELECT
     (SELECT SUM(PST_comment_count) FROM posts WHERE is_valid=1) AS stored_comments,
     (SELECT COUNT(*) FROM comments c JOIN posts p ON c.PST_id=p.PST_id
      WHERE c.is_valid=1 AND p.is_valid=1) AS actual_comments,
     (SELECT COUNT(*) FROM (
        SELECT p.PST_id FROM posts p LEFT JOIN comments c ON c.PST_id=p.PST_id AND c.is_valid=1
        WHERE p.is_valid=1 GROUP BY p.PST_id, p.PST_comment_count
        HAVING p.PST_comment_count <> COUNT(c.CMT_id)) x) AS mismatched_posts;"

echo "   (반응·스크랩은 KI-55의 좁은 경쟁 창 때문에 몇 건이 1씩 어긋날 수 있다)"
q "SELECT 'scrap' AS cnt, COUNT(*) AS mismatched FROM (
     SELECT p.PST_scrap_count AS a, COUNT(s.SC_id) AS b FROM posts p
     LEFT JOIN scraps s ON s.PST_id=p.PST_id AND s.is_valid=1 WHERE p.is_valid=1
     GROUP BY p.PST_id, p.PST_scrap_count HAVING a<>b) y
   UNION ALL
   SELECT 'like', COUNT(*) FROM (
     SELECT p.PST_like_count AS a, SUM(CASE WHEN r.PST_RCT_kind='LIKE' AND r.is_valid=1 THEN 1 ELSE 0 END) AS b
     FROM posts p LEFT JOIN posts_reactions r ON r.PST_id=p.PST_id WHERE p.is_valid=1
     GROUP BY p.PST_id, p.PST_like_count HAVING a<>b) z;"

echo
echo "── ③ 참조 무결성·중복 (전부 0이어야 한다) ──"
q "SELECT 'orphan comments' AS chk, COUNT(*) AS cnt
     FROM comments c LEFT JOIN posts p ON c.PST_id=p.PST_id WHERE p.PST_id IS NULL
   UNION ALL SELECT 'orphan reactions', COUNT(*)
     FROM posts_reactions r LEFT JOIN posts p ON r.PST_id=p.PST_id WHERE p.PST_id IS NULL
   UNION ALL SELECT 'orphan scraps', COUNT(*)
     FROM scraps s LEFT JOIN posts p ON s.PST_id=p.PST_id WHERE p.PST_id IS NULL
   UNION ALL SELECT 'dup reaction pairs', (SELECT COUNT(*) FROM (
     SELECT USR_id,PST_id FROM posts_reactions WHERE is_valid=1
     GROUP BY USR_id,PST_id HAVING COUNT(*)>1) d)
   UNION ALL SELECT 'dup scrap pairs', (SELECT COUNT(*) FROM (
     SELECT USR_id,PST_id FROM scraps WHERE is_valid=1
     GROUP BY USR_id,PST_id HAVING COUNT(*)>1) d)
   UNION ALL SELECT 'users without school', COUNT(*) FROM users WHERE SCH_id IS NULL;"

echo
echo "── ④ S-03: index 0 이 실제 최고 인기글인가 ──"
# 눈으로 대조하지 않고 판정한다. 사람이 두 표를 비교하는 방식은 실제로 놓쳤다 —
# 2026-08-16 large 검증에서 posts.json[0]=1, 실제 1위=8 이었는데 표만 나란히 찍혀 있었다.
# 임시 파일은 상대 경로로 둔다 — Git Bash 의 `/tmp` 를 Node 는 `C:\tmp` 로 해석해서
# 파일을 못 찾는다. 그 실패가 `2>/dev/null` 에 먹혀 "posts.json 없음"으로 오인됐다(실측).
TOP5=".verify-top5.tmp"
docker exec "$CT" mysql -uroot -p"$PW" "$DB" -N -B -e \
  "SELECT PST_id FROM posts WHERE is_valid=1
   ORDER BY (PST_comment_count+PST_like_count+PST_dislike_count+PST_scrap_count) DESC, PST_id
   LIMIT 5;" 2>/dev/null | grep -v Warning > "$TOP5"
node -e "
const fs=require('fs');
const p=require('./datasets/generated/$PROFILE/posts.json');
const top=fs.readFileSync('.verify-top5.tmp','utf8').trim().split(/\s+/).map(Number);
const head=p.slice(0,5).map(x=>x.id);
console.log('   posts.json 앞 5건 :', head.join(', '));
console.log('   실제 참여도 상위 5:', top.join(', '));
if (head[0] === top[0]) {
  const same = head.every((v,i)=>v===top[i]);
  console.log(same ? '   ✅ 통과 — 순서까지 일치' : '   ✅ 통과 — index 0 일치 (뒤쪽 동률은 무해)');
} else {
  console.log('   ❌ 실패 — index 0 이 최고 참여글이 아니다.');
  console.log('      k6 가 \"인기글\"이라며 더 가벼운 글을 친다 (S-03 과 같은 사고).');
  console.log('      복구: node datasets/resort-by-engagement.js $PROFILE');
  process.exitCode = 1;
}" || echo "   ⚠ 판정 실패 — posts.json 이 없거나 읽을 수 없다"
rm -f "$TOP5"
q "SELECT p.PST_id, p.PST_comment_count AS comments,
       (p.PST_like_count + p.PST_dislike_count) AS reactions,
       p.PST_scrap_count AS scraps,
       (p.PST_comment_count + p.PST_like_count + p.PST_dislike_count + p.PST_scrap_count) AS engagement
   FROM posts p WHERE p.is_valid=1 ORDER BY engagement DESC LIMIT 5;"

echo
echo "── ⑤ 작성 활동 분포 (AUTHOR_SKEW=1.3 기준: 작성자 약 4,900명 / 최다 약 20%) ──"
q "SELECT COUNT(*) AS authors_with_posts FROM (
     SELECT USR_id FROM posts WHERE is_valid=1 GROUP BY USR_id) a;"
q "SELECT USR_id, COUNT(*) AS posts_written FROM posts WHERE is_valid=1
   GROUP BY USR_id ORDER BY posts_written DESC LIMIT 5;"

echo
echo "── ⑥ 데이터셋 지문 ──"
cat "datasets/generated/$PROFILE/meta.json" 2>/dev/null | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
  if(!s.trim()){console.log('   meta.json 없음 — 시드가 완료되지 않았다');return;}
  const m=JSON.parse(s);
  console.log('   지문      :', m.fingerprint);
  console.log('   생성기    :', m.generatorVersion);
  console.log('   stageCounts:', JSON.stringify(m.stageCounts));
  console.log('   허용치    :', m.tolerance.pct + '%,', '미달 단계', m.tolerance.toleratedStages.length + '건');
  if(m.tolerance.toleratedStages.length) console.log('             ', JSON.stringify(m.tolerance.toleratedStages));
  if(m.resumed) console.log('   재개      :', m.resumed.join(', '));
});" 2>/dev/null || echo "   meta.json 읽기 실패"

echo
echo "── ⑦ 판정 ──"
#
# 여기까지는 값을 **찍기만** 했다. 사람이 표를 읽고 판단하는 방식은 실제로 실패했다 —
# comments_reactions 가 0인 채로 두 주 동안 "verify.sh 전 항목 통과"로 기록됐다.
# 워크로드가 실제로 읽는 테이블이 비어 있으면 종료 코드로 막는다.
FAILED=0
need_positive() { # <표시 이름> <SQL>
  local n
  n=$(docker exec "$CT" mysql -uroot -p"$PW" "$DB" -N -B -e "$2" 2>/dev/null | grep -v Warning | tr -d '[:space:]')
  if [ -z "$n" ] || [ "$n" -le 0 ] 2>/dev/null; then
    echo "   ❌ $1 = ${n:-?} — 워크로드가 읽는데 비어 있다"
    FAILED=1
  else
    echo "   ✅ $1 = $n"
  fi
}
need_positive "댓글 반응"   "SELECT COUNT(*) FROM comments_reactions WHERE is_valid=1;"
need_positive "대댓글"     "SELECT COUNT(*) FROM comments WHERE is_valid=1 AND CMT_parent_id IS NOT NULL;"
need_positive "채팅 메시지" "SELECT COUNT(*) FROM chat_messages WHERE is_valid=1;"
need_positive "단체방"     "SELECT COUNT(*) FROM (SELECT CHT_RM_id FROM chat_participants WHERE is_valid=1 GROUP BY CHT_RM_id HAVING COUNT(*) > 2) g;"
# 본문 다양성 — 조각을 이어 붙이므로 서로 다른 본문이 수천 종 나와야 한다.
need_positive "댓글 본문 100종 초과" \
  "SELECT CASE WHEN COUNT(DISTINCT CMT_content) > 100 THEN 1 ELSE 0 END FROM comments WHERE is_valid=1;"

echo
if [ "$FAILED" -ne 0 ]; then
  echo "════════ 검증 실패 — 이 데이터셋으로 측정하면 빈 경로를 재게 된다 ════════"
  exit 1
fi
echo "════════ 검증 끝 (필수 항목 전부 통과) ════════"
