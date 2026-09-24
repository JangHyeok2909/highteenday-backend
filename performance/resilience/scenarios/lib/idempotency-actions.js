/**
 * 멱등 실험이 도는 액션 목록. 액션을 추가하거나 빼는 곳은 여기 한 군데다.
 *
 * 액션 모듈은 셋을 내보낸다.
 *   key    카운터 태그. `lib/invariants.js` 의 IDEMPOTENCY_ACTIONS 에 같은 값이 있어야 판정에
 *          들어간다. 둘이 어긋나면 오류 없이 그 액션만 빠지므로 test/idempotency-actions.test.js
 *          가 두 목록을 대조한다.
 *   kind   toggle · create · session. 판정식의 방향을 정한다(실제 판정은 카탈로그가 한다).
 *   run    의도 하나를 시도한다. 전제를 못 맞춰 건너뛰면 false.
 *
 * 새 액션을 넣는 순서: 모듈을 만들고 → 여기 한 줄 → invariants.js 의 IDEMPOTENCY_ACTIONS 에
 * 한 줄(판정할 열 포함) → 기준선 실행에서 그 액션이 정합으로 나오는지 확인.
 */
import * as postLike from './post-like.js';
import * as commentLike from './comment-like.js';
import * as scrap from './scrap.js';
import * as postCreate from './post-create.js';
import * as commentCreate from './comment-create.js';
import * as groupRoom from './group-room.js';
import * as tokenRefresh from './token-refresh.js';

export const ACTIONS = [
  postLike, commentLike, scrap,
  postCreate, commentCreate, groupRoom,
  tokenRefresh,
];

/** 액션 키 목록. 시나리오가 액션별 서브메트릭을 threshold 로 선언할 때 쓴다. */
export const ACTION_KEYS = ACTIONS.map((a) => a.key);
