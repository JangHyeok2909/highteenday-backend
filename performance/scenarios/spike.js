/**
 * SCN-11 Spike Test — 순간 폭증 (예: 인기글이 외부 SNS에 공유됨).
 *
 * 목적     : 평시 부하 → 10초 만에 6배 폭증 → 급락의 회복 탄력성 검증.
 *            큐잉(accept-count), 커넥션 풀 대기, 오류율 스파이크와
 *            "부하 해제 후 정상 회복까지 걸린 시간"을 측정한다.
 * 패턴     : 100 VU 3분(평시) → 10초 만에 600 VU → 2분 유지 → 10초 만에 100 → 5분(회복 관찰)
 * 비율     : PROFILE_NORMAL — 트래픽 성격은 같고 양만 폭증하는 상황
 * 종료조건 : 시간 만료. 스파이크 구간 오류율은 기록하되 중단하지 않는다 (회복 관찰이 목적)
 */
import { DEFAULT_THRESHOLDS } from '../scripts/lib/config.js';
import { makeHandleSummary } from '../scripts/lib/summary.js';
import { buildPhasePlan } from '../scripts/lib/phases.js';
import { mixedIteration, PROFILE_NORMAL } from './lib/workload.js';

// 평시→폭증→회복의 형태 자체가 관찰 대상이라 warmup/measure/rampdown 구분이 없다.
// phase 태깅은 켜지 않는다(진단 전용, gatePhase:null) — 기존 부하 형태·threshold 불변.
const PLAN = buildPhasePlan({
  mode: 'diagnostic',
  warmupSec: 0,
  measureSec: 650, // 1m+2m+10s+2m+10s+5m+30s
  rampdownSec: 0,
  gatePhase: null,
});

export const options = {
  scenarios: {
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 100 },   // 진입
        { duration: '2m', target: 100 },   // 평시
        { duration: '10s', target: Number(__ENV.SPIKE_VUS || 600) }, // 폭증
        { duration: '2m', target: Number(__ENV.SPIKE_VUS || 600) }, // 폭증 유지
        { duration: '10s', target: 100 },  // 급락
        { duration: '5m', target: 100 },   // 회복 관찰
        { duration: '30s', target: 0 },
      ],
    },
  },
  // 스파이크 테스트는 실패 관찰이 목적 — threshold는 기록용
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<2000'],
  },
};

export default function () {
  mixedIteration(PROFILE_NORMAL);
}

export const handleSummary = makeHandleSummary('spike', PLAN);
