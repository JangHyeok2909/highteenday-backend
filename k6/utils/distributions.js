/**
 * 현실적 트래픽 분포 생성기
 * - Zipf 분포: 인기 게시글/게시판 쏠림
 * - 가중 랜덤: 게시판 선택
 */

/**
 * Zipf 분포 인덱스 생성기
 * n개 항목 중 상위 항목에 집중된 분포 반환
 * s=1.07: 상위 1%가 ~30% 점유
 *
 * @param {number} n - 총 항목 수
 * @param {number} s - Zipf 지수 (클수록 쏠림 심화)
 * @returns {function} 호출 시 0..n-1 범위 인덱스 반환
 */
export function zipfGenerator(n, s) {
  // Harmonic number 사전 계산
  const harmonics = new Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += 1.0 / Math.pow(i + 1, s);
    harmonics[i] = sum;
  }
  const total = sum;

  return function () {
    const r = Math.random() * total;
    // 이진 탐색으로 CDF 역변환
    let lo = 0, hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (harmonics[mid] < r) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    return lo;
  };
}

/**
 * 가중 랜덤 선택기
 * @param {Array<{id: number, weight: number}>} items - [{id, weight}, ...]
 * @returns {function} 호출 시 선택된 item의 id 반환
 */
export function weightedPicker(items) {
  const cumulative = [];
  let sum = 0;
  for (const item of items) {
    sum += item.weight;
    cumulative.push({ id: item.id, threshold: sum });
  }

  return function () {
    const r = Math.random() * sum;
    for (const entry of cumulative) {
      if (r <= entry.threshold) return entry.id;
    }
    return cumulative[cumulative.length - 1].id;
  };
}

/**
 * 트래픽 행동 선택기 (가중 분포)
 * @param {Object} weights - {action: weight, ...} e.g. {browse: 35, read: 20, ...}
 * @returns {function} 호출 시 선택된 action 문자열 반환
 */
export function actionPicker(weights) {
  const entries = Object.entries(weights);
  const cumulative = [];
  let sum = 0;
  for (const [action, weight] of entries) {
    sum += weight;
    cumulative.push({ action, threshold: sum });
  }

  return function () {
    const r = Math.random() * sum;
    for (const entry of cumulative) {
      if (r <= entry.threshold) return entry.action;
    }
    return cumulative[cumulative.length - 1].action;
  };
}

/**
 * Zipf 기반 게시글 ID 선택기
 * hotPostIds 배열에서 Zipf 분포로 선택
 * @param {number[]} hotPostIds - 인기 게시글 ID 배열 (인기순)
 * @param {number} totalPosts - 전체 게시글 수
 * @param {number} s - Zipf 지수
 * @returns {function} 호출 시 postId 반환
 */
export function postIdPicker(hotPostIds, totalPosts, s) {
  const zipf = zipfGenerator(totalPosts, s || 1.07);

  return function () {
    const rank = zipf();
    // 상위 순위는 hotPostIds에서 선택, 나머지는 랜덤
    if (rank < hotPostIds.length) {
      return hotPostIds[rank];
    }
    // 나머지: hotPostIds 내에서 균등 랜덤 (안전 범위)
    return hotPostIds[Math.floor(Math.random() * hotPostIds.length)];
  };
}

/**
 * 랜덤 페이지 번호 (대부분 0-2, 가끔 deep page)
 * @param {number} maxDeep - deep page 최대값
 * @returns {number} 페이지 번호
 */
export function randomPage(maxDeep) {
  const r = Math.random();
  if (r < 0.60) return 0;     // 60% 첫 페이지
  if (r < 0.82) return 1;     // 22% 두 번째
  if (r < 0.92) return 2;     // 10% 세 번째
  if (r < 0.97) return Math.floor(Math.random() * 5) + 3; // 5% 3-7페이지
  return Math.floor(Math.random() * (maxDeep || 50)) + 8;  // 3% deep page
}
