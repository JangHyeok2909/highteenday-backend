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
import { DEFAULT_THRESHOLDS } from '../scripts/lib/config.js';
import { makeHandleSummary } from '../scripts/lib/summary.js';
import { mixedIteration, PROFILE_NOTIFICATION_HEAVY } from './lib/workload.js';

export const options = {
  scenarios: {
    notification_heavy: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '3m', target: Number(__ENV.VUS || 300) },
        { duration: __ENV.HOLD || '12m', target: Number(__ENV.VUS || 300) },
        { duration: '2m', target: 0 },
      ],
    },
  },
  thresholds: Object.assign({}, DEFAULT_THRESHOLDS, {
    'http_req_duration{name:notif_unread_count}': ['p(95)<100', 'p(99)<300'],
    'http_req_duration{name:notif_read_all}': ['p(95)<800'],
  }),
};

export default function () {
  mixedIteration(PROFILE_NOTIFICATION_HEAVY);
}

export const handleSummary = makeHandleSummary('notification-heavy');
