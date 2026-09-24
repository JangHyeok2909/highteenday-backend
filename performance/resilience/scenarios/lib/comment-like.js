/**
 * 댓글 좋아요 — 토글. 게시글 좋아요와 같은 모양이다(CommentReactionService.java:33).
 *
 * 전제: 댓글 목록 응답의 `liked` 가 false 인 댓글만, 이 VU 가 처음 건드리는 댓글만 의도에
 * 넣는다. 글을 무작위로 뽑으므로 댓글이 없는 글이 걸리면 건너뛴다. medium 은 댓글 40,000건이
 * 글 10,000건에 흩어져 글당 평균 4개라, 일곱 액션 중 건너뜀 비율이 가장 높다.
 */
import http from 'k6/http';
import { BASE_URL } from '../../../scripts/lib/config.js';
import { randomPost } from '../../../scripts/lib/data.js';
import { listComments } from '../../../scripts/comments.js';
import { attempt, opts } from './attempt.js';

export const key = 'comment_like';
export const kind = 'toggle';

const attempted = {};

/** 목록에서 아직 안 건드렸고 좋아요도 안 눌린 댓글 하나. 없으면 null. */
function pickUnliked(res) {
  if (!res || res.status !== 200) return null;
  let list;
  try {
    list = JSON.parse(res.body);
  } catch (e) {
    return null;
  }
  if (!Array.isArray(list) || list.length === 0) return null;
  // 시작 위치를 무작위로 둔다. 항상 첫 댓글부터 보면 목록 앞쪽 댓글에만 반응이 몰려,
  // 같은 VU 가 다음 iteration 에 같은 글을 뽑았을 때 고를 대상이 빨리 바닥난다.
  const from = Math.floor(Math.random() * list.length);
  for (let i = 0; i < list.length; i++) {
    const c = list[(from + i) % list.length];
    if (c && Number.isFinite(c.id) && c.liked === false && !attempted[c.id]) return c;
  }
  return null;
}

export function run() {
  const c = pickUnliked(listComments(randomPost().id));
  if (!c) return false;
  attempted[c.id] = true;
  const url = `${BASE_URL}/api/comments/${c.id}/reaction?type=LIKE`;
  attempt(key, () => http.post(url, null, opts('reaction', 'write', 'comment_reaction')));
  return true;
}
