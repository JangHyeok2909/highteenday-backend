/**
 * SCN-04 Write Heavy — 쓰기 편중 워크로드.
 *
 * 목적     : HikariCP 커넥션 풀 고갈, 비정규화 카운터(likeCount 등) row lock 경합,
 *            INSERT 처리량 한계를 드러낸다. reactions의 Zipf 편중과 결합해
 *            "인기글 단일 row"에 쓰기가 몰리는 최악 조건을 재현.
 * 사용자   : 200 VU  |  Ramp-up 3분 → 유지 15분 → down 2분
 * Think    : 1~4초
 * 비율     : PROFILE_WRITE_HEAVY (engage 30 / write 25)
 * 예상 TPS : ≈ 50~70 RPS (그중 쓰기 ≈ 60%)
 * 종료조건 : 시간 만료. 쓰기 P99 3초 초과 시 조기 중단 (풀 고갈 신호)
 */
import { DEFAULT_THRESHOLDS } from '../scripts/lib/config.js';
import { makeHandleSummary } from '../scripts/lib/summary.js';
import { mixedIteration, PROFILE_WRITE_HEAVY } from './lib/workload.js';

export const options = {
  scenarios: {
    write_heavy: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '3m', target: Number(__ENV.VUS || 200) },
        { duration: __ENV.HOLD || '15m', target: Number(__ENV.VUS || 200) },
        { duration: '2m', target: 0 },
      ],
    },
  },
  thresholds: Object.assign({}, DEFAULT_THRESHOLDS, {
    'http_req_duration{op:write}': [
      'p(95)<500',
      { threshold: 'p(99)<3000', abortOnFail: true, delayAbortEval: '3m' },
    ],
  }),
};

export default function () {
  mixedIteration(PROFILE_WRITE_HEAVY);
}

export const handleSummary = makeHandleSummary('write-heavy');
