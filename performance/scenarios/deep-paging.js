/**
 * SCN-17 Deep Paging — OFFSET 깊이에 따른 목록 조회 비용 곡선 측정 (진단 전용).
 *
 * 목적     : "페이지가 깊어질수록 DB 비용이 어떻게 증가하는가"에 수치로 답한다.
 *            `PostRepositoryCustomImpl`은 `isRandomPage=true`(컨트롤러 기본값)일 때
 *            offset = page × size 기반 페이징을 탄다. MySQL은 OFFSET N을 건너뛰기 위해
 *            앞의 N행을 실제로 읽으므로, 비용은 페이지 깊이에 비례해 늘어난다.
 * 패턴     : 0 / 10 / 50 / 100 / 500 페이지를 **정확히 같은 횟수씩** 순환 요청
 * 종료조건 : 시간 만료
 * 산출물   : 리포트 Breakdown의 "목록 페이지별" 표 = 깊이별 P95 비용 곡선
 *
 * ── 왜 일반 부하 시나리오와 분리했는가 ───────────────────────────────────────
 * `normal-day` 등의 일반 트래픽은 0~4페이지만 요청한다(`sampling.js`의 `PAGE_WEIGHTS`).
 * 거기에 깊은 페이지를 몇 % 섞으면, 올라간 p95가 깊은 페이지 때문인지 서버가 느려져서인지
 * **분리할 수 없다.** 두 측정은 답하려는 질문이 다르므로 실행을 나눈다.
 *
 * ── 왜 게이트가 없는가 ───────────────────────────────────────────────────────
 * 이 시나리오의 산출물은 합격/불합격이 아니라 **곡선**이다. "500페이지가 300ms 안에
 * 들어와야 한다"는 SLO는 존재하지 않는다(그 경로를 쓰는 실사용자가 거의 없다).
 * 그래서 응답시간 threshold를 걸지 않고, 측정이 성립했는지만 검사한다.
 *
 * 사전조건: 페이지 사다리가 데이터셋 범위 안이어야 한다. 500페이지 × size 10 = 11번째
 *   글부터 5,010번째 글까지 존재해야 한다는 뜻이다. `small`(전체 500건)로 돌리면 깊은
 *   페이지가 빈 배열을 돌려주고, 빈 응답은 **빠르다** — 비용 곡선이 평평하게 나와
 *   "깊은 페이지도 싸다"는 정반대 결론이 만들어진다. 그래서 범위를 벗어난 요청을
 *   check 실패로 잡아 실행 자체를 FAIL시킨다. `medium` 이상에서 실행할 것.
 */
import { sleep } from 'k6';
import exec from 'k6/execution';
import { BREAKDOWN_THRESHOLDS, check, tags, BASE_URL } from '../scripts/lib/config.js';
import { buildPhasePlan, buildSelector, toSeconds } from '../scripts/lib/phases.js';
import { makeHandleSummary } from '../scripts/lib/summary.js';
import { ensureSession } from '../scripts/lib/session.js';
import { myUser, boards } from '../scripts/lib/data.js';
import http from 'k6/http';

/**
 * 측정할 OFFSET 깊이. size=10이므로 각각 OFFSET 0 / 100 / 500 / 1,000 / 5,000이다.
 * 로그에 가까운 간격으로 잡아, 비용이 선형인지 그보다 나쁜지 눈으로 구분할 수 있게 한다.
 */
const PAGE_LADDER = [0, 10, 50, 100, 500];
const PAGE_SIZE = 10;

/**
 * VU를 낮게 잡는다(기본 5). 이 시나리오가 재는 것은 **처리량이 아니라 요청 1건의 비용**이다.
 * VU를 올리면 커넥션 풀 대기와 큐잉이 응답시간에 섞여, 정작 보고 싶은 OFFSET 비용이
 * 다른 요인에 묻힌다.
 */
const VUS = Number(__ENV.VUS || 5);
const DURATION_SEC = toSeconds(__ENV.DURATION, 180);

// 한계 탐색·진단 계열과 같이 phase 구분이 없다 — 전 구간이 관찰 대상이다.
// gatePhase:null 이므로 Node 회귀 게이트도 이 시나리오를 건너뛴다.
const PLAN = buildPhasePlan({
  mode: 'diagnostic',
  warmupSec: 0,
  measureSec: DURATION_SEC,
  rampdownSec: 0,
  gatePhase: null,
});

export const options = {
  scenarios: {
    deepPaging: {
      executor: 'constant-vus',
      vus: VUS,
      duration: `${DURATION_SEC}s`,
    },
  },
  thresholds: {
    // 이 사다리의 페이지 축을 선언해야 k6가 `http_req_duration{page:500}` 서브메트릭을
    // 만든다. 판정이 아니라 집계가 목적이므로 어떤 값에도 통과하는 상한을 쓴다
    // (BREAKDOWN_THRESHOLDS와 같은 이유·같은 값).
    ...BREAKDOWN_THRESHOLDS,
    ...PAGE_LADDER.reduce((acc, p) => {
      acc[buildSelector('http_req_duration', { page: p })] = ['p(99)<600000'];
      return acc;
    }, {}),
    // 측정이 성립했는지만 판정한다. 깊은 페이지가 데이터셋 범위를 벗어나면 여기서 걸린다.
    checks: ['rate>0.99'],
    http_req_failed: ['rate<0.01'],
  },
};

/**
 * 게시판을 하나로 고정한다.
 *
 * `randomBoard()`를 쓰면 게시판마다 글 수가 달라, 같은 500페이지라도 어떤 게시판에서는
 * 유효하고 어떤 게시판에서는 범위 밖이 된다. 그 편차가 곡선에 섞이면 "깊이 때문에 느려진
 * 것"과 "게시판이 달라서 다른 것"을 구분할 수 없다. 비용 곡선을 재는 실험이므로 깊이
 * 외의 변수는 고정한다.
 */
const BOARD = boards[0];

export default function () {
  ensureSession(myUser());

  // 순환 선택 — 무작위로 뽑으면 깊이별 표본 수가 들쭉날쭉해져 비교의 정밀도가 달라진다.
  // 사다리를 순서대로 돌면 모든 깊이가 정확히 같은 횟수만큼 측정된다.
  const page = PAGE_LADDER[exec.scenario.iterationInTest % PAGE_LADDER.length];

  const res = http.get(
    `${BASE_URL}/api/boards/${BOARD.id}/posts?page=${page}&sortType=RECENT&size=${PAGE_SIZE}`,
    tags('post', 'read', 'post_list_deep', { page: String(page) }),
  );

  check(res, {
    'deep page 200': (r) => r.status === 200,
    // 응답의 `total`은 그 게시판의 전체 글 수다(PageResponse.total). 요청한 페이지가
    // 실제 데이터 범위 안이었는지 추측하지 않고 그 값으로 확인한다 — 빈 페이지의 빠른
    // 응답이 "깊은 페이지도 싸다"로 오독되는 것을 막는다.
    'page within dataset range': (r) => {
      if (r.status !== 200) return false;
      const body = r.json();
      return body && body.total > page * PAGE_SIZE;
    },
  });

  sleep(0.2);
}

export const handleSummary = makeHandleSummary('deep-paging', PLAN);
