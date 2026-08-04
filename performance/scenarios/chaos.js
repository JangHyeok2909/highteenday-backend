/**
 * SCN-16 Chaos Test — 복합 장애 주입 하의 생존성 검증.
 *
 * 목적     : 단일 장애(failover)를 넘어, 현실적 복합 상황에서의 거동 관찰:
 *            - 네트워크 지연 주입 (DB 왕복 +50ms) → 커넥션 풀 대기 증폭 확인
 *            - Redis 순단 반복 (10초 stop/start 3회) → 캐시 폴백 안정성
 *            - 앱 컨테이너 CPU 제한 (docker update --cpus) → GC 압박 재현
 *            부하 자체는 평시 수준을 유지하고, 장애만 변수로 둔다.
 *
 * 장애 주입은 tools/README.md 의 chaos 스크립트로 수동/자동 수행:
 *   tools/chaos-redis-flap.sh   Redis 10초 순단 × 3회
 *   tools/chaos-net-delay.sh    tc netem으로 DB 지연 주입 (Linux 전용)
 *   tools/chaos-cpu-squeeze.sh  앱 컨테이너 CPU 1코어로 제한 5분
 *
 * 사용자   : 100 VU 고정, 30분
 * 비율     : PROFILE_NORMAL
 * 종료조건 : 시간 만료. 중단 없음 (전 구간 기록).
 * 판정     : 각 주입 구간을 Grafana 타임라인에 주석(annotation)으로 남기고
 *            구간별 오류율/P95/회복 시간을 실험 문서에 정리
 */
import { makeHandleSummary } from '../scripts/lib/summary.js';
import { mixedIteration, PROFILE_NORMAL } from './lib/workload.js';

export const options = {
  scenarios: {
    chaos: {
      executor: 'constant-vus',
      vus: Number(__ENV.VUS || 100),
      duration: __ENV.DURATION || '30m',
    },
  },
  thresholds: {
    http_req_failed: ['rate<1'], // 기록용
  },
};

export default function () {
  mixedIteration(PROFILE_NORMAL);
}

export const handleSummary = makeHandleSummary('chaos');
