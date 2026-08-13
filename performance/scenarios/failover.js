/**
 * SCN-15 Failover Test — 의존성(Redis) 장애 중 서비스 연속성 검증.
 *
 * 목적     : 부하가 걸린 상태에서 Redis를 죽였다 살렸을 때
 *            - 어떤 기능이 어떻게 실패하는가 (전면 장애 vs 부분 성능 저하)
 *            - 캐시 미스 폴백이 DB를 압사시키는가 (cache avalanche)
 *            - Redis 복구 후 몇 초 만에 정상 P95로 돌아오는가
 *
 * 실행 절차 (2개 터미널):
 *   T1: k6 run scenarios/failover.js          ← 15분 정상 부하 유지
 *   T2: 5분 경과 시점에  docker stop highteenday-redis
 *       8분 경과 시점에  docker start highteenday-redis
 *   (tools/README.md 의 fault-injection 섹션에 스크립트 있음)
 *
 * 사용자   : 150 VU 고정 (장애 전/중/후를 같은 강도에서 비교하기 위해 상수 유지)
 * 비율     : PROFILE_NORMAL
 * 종료조건 : 시간 만료. 어떤 오류율에도 중단하지 않는다 — 장애 거동 관찰이 목적.
 * 판정     : 장애 구간 오류율과 복구 후 P95 회복 시간(RTO)을 리포트에 기록
 */
import { makeHandleSummary } from '../scripts/lib/summary.js';
import { buildPhasePlan, toSeconds } from '../scripts/lib/phases.js';
import { mixedIteration, PROFILE_NORMAL } from './lib/workload.js';

// 장애 타이밍(T2의 docker stop/start)은 실행하는 사람이 벽시계로 맞추는 수동 절차라
// k6 스크립트에 phase 경계가 없다. phase 태깅은 켜지 않는다(진단 전용, gatePhase:null)
// — 기존 부하 형태·threshold 불변.
const PLAN = buildPhasePlan({
  mode: 'diagnostic',
  warmupSec: 0,
  measureSec: toSeconds(__ENV.DURATION, 900),
  rampdownSec: 0,
  gatePhase: null,
});

export const options = {
  scenarios: {
    failover: {
      executor: 'constant-vus',
      vus: Number(__ENV.VUS || 150),
      duration: __ENV.DURATION || '15m',
    },
  },
  // 의도된 장애이므로 중단 조건 없음 — 전 구간을 끝까지 기록한다
  thresholds: {
    http_req_failed: ['rate<1'], // 기록용 (항상 통과)
  },
};

export default function () {
  mixedIteration(PROFILE_NORMAL);
}

export const handleSummary = makeHandleSummary('failover', PLAN);
