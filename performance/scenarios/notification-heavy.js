/**
 * SCN-06 Notification Heavy — 알림 편중 워크로드.
 *
 * 목적     : unread-count 고빈도 폴링 + read-all 범위 UPDATE가 겹칠 때
 *            알림 테이블의 COUNT 성능·락 경합을 측정한다.
 *            (인기글에 댓글이 달리면 알림 INSERT가 팬아웃되는 경로도 engage로 동반 발생)
 * 사용자   : 300 VU  |  Ramp-up 3분 → 유지 12분 → down 2분
 * 비율     : PROFILE_NOTIFICATION_HEAVY (notification 40 / engage 15)
 * 예상 TPS : ≈ 80~100 RPS
 * 종료조건 : 시간 만료
 */
import { PHASED_THRESHOLDS, setActivePhasePlan } from '../scripts/lib/config.js';
import { buildPhasePlan, stagesFor, startVusFor, toSeconds } from '../scripts/lib/phases.js';
import { makeHandleSummary } from '../scripts/lib/summary.js';
import { mixedIteration, PROFILE_NOTIFICATION_HEAVY } from './lib/workload.js';

const VUS = Number(__ENV.VUS || 300);

const PLAN = buildPhasePlan({
  mode: 'steady-state',
  warmupSec: toSeconds(__ENV.WARMUP, 180),
  measureSec: toSeconds(__ENV.HOLD, 720),
  rampdownSec: 120,
});
setActivePhasePlan(PLAN);

export const options = {
  scenarios: {
    notification_heavy: {
      executor: 'ramping-vus',
      startVUs: startVusFor(PLAN, VUS),
      stages: stagesFor(PLAN, VUS),
    },
  },
  thresholds: Object.assign({}, PHASED_THRESHOLDS, {
    'http_req_duration{name:notif_unread_count}': ['p(95)<100', 'p(99)<300'],
    'http_req_duration{name:notif_read_all}': ['p(95)<800'],
  }),
};

export default function () {
  mixedIteration(PROFILE_NOTIFICATION_HEAVY);
}

export const handleSummary = makeHandleSummary('notification-heavy', PLAN);
