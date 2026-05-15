/**
 * POST /api/posts 부하 테스트 (k6)
 *
 * 목적:
 * - 게시글 테이블 복합 인덱스가 INSERT 성능에 미치는 영향 측정
 * - 복합 인덱스 3개(brd_valid_id, brd_valid_like, brd_valid_view)가
 *   쓰기 처리량(TPS) 및 레이턴시에 얼마나 부담을 주는지 확인
 *
 * 측정 방법:
 * 1단계) 인덱스 있는 상태에서 이 스크립트 실행 후 결과 기록
 * 2단계) DB에서 인덱스 제거 후 재실행
 *   DROP INDEX idx_posts_brd_valid_id  ON posts;
 *   DROP INDEX idx_posts_brd_valid_like ON posts;
 *   DROP INDEX idx_posts_brd_valid_view ON posts;
 * 3단계) 두 결과 비교 → TPS, p95 latency 차이 확인
 *
 * 실행
 *   k6 run load-tests/k6-post-write-index.js
 *
 * 환경변수
 *   BASE_URL     (default: http://localhost:8080)
 *   ACCESS_TOKEN JWT accessToken 값 (로컬 서버에서 발급 후 복사)
 *   BOARD_IDS    comma-separated boardId 목록 (default: "1,2,3")
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

const BASE_URL    = __ENV.BASE_URL     || 'http://localhost:8080';
const TOKEN       = __ENV.ACCESS_TOKEN || '';
const RAW_BOARDS  = __ENV.BOARD_IDS    || '1,2,3';
const BOARD_IDS   = RAW_BOARDS.split(',').map((s) => s.trim());

// ── 커스텀 메트릭
const writeOk      = new Counter('post_write_success');
const writeFail    = new Counter('post_write_fail');
const writeLatency = new Trend('post_write_latency', true); // ms, percentile 출력
const failRate     = new Rate('post_write_fail_rate');

// ── 부하 시나리오
export const options = {
  stages: [
    { duration: '15s', target: 20  },  // 워밍업
    { duration: '30s', target: 100 },  // 기본 부하
    { duration: '1m',  target: 200 },  // 중간 부하
    { duration: '1m',  target: 400 },  // 피크 부하
    { duration: '30s', target: 0   },  // 쿨다운
  ],
  thresholds: {
    post_write_latency:   ['p(95)<3000'],  // 쓰기 p95 3초 이내
    post_write_fail_rate: ['rate<0.05'],   // 실패율 5% 미만
    http_req_failed:      ['rate<0.05'],
  },
};

// ── 공통 헤더 (JWT 쿠키)
function headers() {
  return {
    'Content-Type': 'application/json',
    ...(TOKEN ? { Cookie: `accessToken=${TOKEN}` } : {}),
  };
}

// ── 더미 게시글 본문 생성
const TITLES = [
  '오늘 급식 어때요?',
  '수행평가 팁 공유',
  '야자 면제 받는 법',
  '기말고사 공부법',
  '선생님 화나셨다',
  '점심시간 사건',
  '교복 교복 교복',
  '오늘 체육시간 진짜',
];

function randomPost() {
  const boardId = BOARD_IDS[randomIntBetween(0, BOARD_IDS.length - 1)];
  const title   = TITLES[randomIntBetween(0, TITLES.length - 1)]
                  + ' ' + randomIntBetween(1, 9999);
  const content = '테스트 게시글입니다. '.repeat(randomIntBetween(1, 5)).trim();
  return {
    boardId:     parseInt(boardId, 10),
    title:       title,
    content:     content,
    isAnonymous: Math.random() < 0.7,
  };
}

// ── 메인 VU 루프
export default function () {
  const payload = JSON.stringify(randomPost());
  const res     = http.post(`${BASE_URL}/api/posts`, payload, { headers: headers() });

  const ok = res.status === 201;
  writeLatency.add(res.timings.duration);
  failRate.add(!ok);

  if (ok) {
    writeOk.add(1);
  } else {
    writeFail.add(1);
  }

  check(res, {
    'status 201 Created': (r) => r.status === 201,
  });

  // 실제 사용자처럼 짧은 간격 두기 (쓰기 전용 테스트이므로 간격 최소화)
  sleep(Math.random() * 0.3 + 0.1);
}

/**
 * 부하 테스트 결과 기록
 *
 * [인덱스 있음]
 * - p95 latency:
 * - 평균 응답시간:
 * - 최대 처리량(TPS):
 * - 실패율:
 *
 * [인덱스 없음]
 * - p95 latency:
 * - 평균 응답시간:
 * - 최대 처리량(TPS):
 * - 실패율:
 *
 * 비교 분석:
 * - latency 증가율:
 * - TPS 감소율:
 */
