#!/usr/bin/env node
/**
 * 부하 테스트 시드 데이터 생성기.
 *
 * API를 통해 데이터를 생성한다 (SQL 직접 삽입 대비 느리지만 스키마 변경에 안전하고,
 * 서비스 로직[카운터, 이벤트, 알림 팬아웃]까지 실제와 동일하게 만들어진다).
 *
 * 현실적인 분포:
 *  - 활동량: 사용자별 Zipf — 소수의 헤비 유저가 대부분의 글/댓글을 쓴다
 *  - 인기도: 게시글별 Zipf — 상위 ~10% 글에 반응/댓글의 ~80%가 몰린다 (Hot Data)
 *  - 친구: 같은 학교 위주로 클러스터링
 *  - 채팅: 친구 쌍 일부가 1:1 방 + 소수의 단체방
 *
 * 사용법:
 *   node datasets/seed.js --profile small [--base http://localhost:18080] [--concurrency 10]
 *   프로파일: smoke(20명) | small(100명) | medium(1,000명) | large(10,000명) | xlarge(100,000명)
 *
 * 산출물: datasets/generated/<profile>/{users,posts,boards,meta}.json  ← k6가 로드
 * 요구사항: Node 18+ (내장 fetch)
 *
 * ── 실패 정책 ────────────────────────────────────────────────────────────────
 * 서로 다른 두 축을 각각 설정한다. **무엇을 실패로 볼 것인가**(`--tolerance`)와
 * **실패했을 때 어디서 멈출 것인가**(`--on-failure`)는 다른 질문이다.
 *
 * `--tolerance <pct>`  단계별 허용 실패율. 기본 **0**.
 *
 *   기본값이 0인 이유: 데이터셋이 명세에 미달하면 그 위에서 잰 모든 성능 수치가 근거를
 *   잃는다. 그리고 미달을 허용하면 "그 1%가 어느 리소스인가"를 추적할 방법이 없어,
 *   결국 "대충 맞는 데이터셋"으로 돌아간다. 올릴 때는 그 대가를 알고 올려야 한다.
 *
 *   그래도 여는 이유: BTL-003 인기글 카운터 데드락처럼 **서버가 실제로 갖고 있는 병목**
 *   때문에 large 규모에서 소수의 손실이 반복적으로 발생한다. 그걸 0으로 강제하면
 *   재시도를 아무리 늘려도 생성이 끝나지 않는 상황이 생긴다. 병목을 고치기 전까지의
 *   현실적인 타협점을 사람이 명시적으로 고를 수 있어야 한다.
 *
 *   허용치는 **단계마다 따로** 적용된다. 전체 합으로 보면 "반응 단계만 100% 실패"가
 *   다른 단계의 성공에 묻힌다. 허용치가 실제로 단계를 살렸다면 그 사실을 로그와
 *   meta.json 양쪽에 남긴다 — 조용히 넘어가면 0%로 만든 데이터셋과 구별되지 않는다.
 *
 * `--on-failure <mode>`  허용치를 넘겼을 때 어디서 멈출지. 기본 `stage`.
 *
 *   stage      (기본) 진행 중인 단계는 끝까지 돌리고, 다음 단계로 넘어가기 전에 멈춘다.
 *              그 단계의 실패 건수를 전부 보고 나서 멈추므로 원인 파악에 가장 유리하다.
 *   immediate  허용치를 넘는 순간 그 단계도 중단한다. large 처럼 오래 걸리는 생성에서
 *              설정 오류를 빨리 잡을 때 쓴다. 실패 건수는 부분값이 된다.
 *   continue   멈추지 않고 끝까지 돌린 뒤 요약만 보고한다. "무엇이 얼마나 실패하는가"를
 *              한 번에 조사할 때 쓴다. 종료 코드는 여전히 1이고 산출물도 쓰지 않는다.
 *
 * 허용치를 **넘긴** 경우 어느 모드든 JSON 산출물을 쓰지 않는다. 반쪽짜리 데이터셋이
 * 파일로 남으면 다음 실행이 그걸 정상으로 착각한다.
 *
 * 예:
 *   node datasets/seed.js --profile large --tolerance 0.1 --on-failure immediate
 *
 * 종료 코드
 *   0  모든 단계가 허용치 안 (허용치를 썼다면 meta.json에 기록된다)
 *   1  단계 미달 (허용치 초과)
 *   2  실행 오류 / 잘못된 인자
 */
'use strict';
const fs = require('fs');
const path = require('path');
// buildMeta()의 데이터셋 지문 계산에 쓴다. 없으면 전 단계를 다 돌린 **마지막**에
// `crypto.createHash is not a function`으로 죽어, 생성한 데이터는 DB에 남았는데
// 산출물 JSON은 하나도 안 써진 상태가 된다(실측).
const crypto = require('crypto');

// Node 18 미만에는 전역 fetch가 없다. 가드가 없으면 수백 건의
// "fetch is not defined"가 개별 요청 실패로 찍히다가 마지막에 엉뚱한
// TypeError로 죽어, 원인이 노드 버전이라는 사실이 드러나지 않는다(실측 2회).
if (typeof fetch !== 'function') {
  console.error(
    `이 스크립트는 Node 18+ 가 필요하다 (전역 fetch 사용). 현재: ${process.version}\n` +
    `  nvm-windows 예: nvm use 22.23.1`
  );
  process.exit(1);
}

// ---------- 설정 ----------

const PROFILES = require('./profiles.json');

const args = process.argv.slice(2);
function arg(name, def) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
}
const PROFILE_NAME = arg('profile', 'small');
const BASE = arg('base', 'http://localhost:18080');
const CONCURRENCY = Number(arg('concurrency', 10));
const P = PROFILES[PROFILE_NAME];
if (!P) {
  console.error(`unknown profile: ${PROFILE_NAME} (available: ${Object.keys(PROFILES).join(', ')})`);
  process.exit(2);
}

/**
 * 실패 시 어디서 멈출지. 허용 실패율(0%)과는 다른 축이다 — 이 값이 무엇이든 미달이면
 * 종료 코드는 1이고 산출물도 쓰지 않는다. 오타를 조용히 기본값으로 흡수하면 fail-fast를
 * 켰다고 믿은 채 안 켜진 상태로 20분짜리 생성을 돌리게 되므로 즉시 멈춘다.
 */
/**
 * 중단된 생성을 이어서 한다 — 이미 목표를 채운 단계는 건너뛴다.
 *
 * 안전 장치 두 가지가 붙는다.
 *   1. 생성기 지문이 다르면 거부한다. 규칙이 바뀌었으면 앞 단계 데이터도 새 규칙이 아니다.
 *   2. 프로파일이 다르면 거부한다. 체크포인트 파일이 프로파일별로 갈려 있다.
 *
 * **재개한 데이터셋은 한 번에 만든 것과 난수 소비 순서가 다르다.** 건너뛴 단계가 쓰지 않은
 * 난수만큼 뒤 단계의 선택이 달라진다. 분포는 같은 규칙에서 나오므로 통계적으로는 같지만,
 * 바이트 단위 동일 재현은 애초에 보장하지 않는다(생성 문제 9). meta.json 에 재개 사실을
 * 기록해 두므로 나중에 "왜 이 데이터셋만 다른가"를 추적할 수 있다.
 */
const RESUME = args.includes('--resume');

const ON_FAILURE_MODES = ['stage', 'immediate', 'continue'];
const ON_FAILURE = arg('on-failure', 'stage');
if (!ON_FAILURE_MODES.includes(ON_FAILURE)) {
  console.error(`unknown --on-failure: ${ON_FAILURE} (available: ${ON_FAILURE_MODES.join(', ')})`);
  process.exit(2);
}

/**
 * 단계별 허용 실패율(%). `--tolerance 0.5` 또는 `--tolerance 0.5%` 둘 다 받는다.
 *
 * 잘못된 값을 0으로 흡수하지 않는 이유는 --on-failure 와 같다 — 다만 방향이 반대라 더
 * 위험하다. 오타가 0으로 떨어지면 "1% 허용"이라 믿고 돌린 large 생성이 첫 데드락에서
 * 멈춰 몇십 분을 버린다.
 */
const TOLERANCE_PCT = (() => {
  const raw = String(arg('tolerance', '0')).trim().replace(/%$/, '');
  const v = Number(raw);
  if (!Number.isFinite(v) || v < 0 || v > 100) {
    console.error(`invalid --tolerance: ${arg('tolerance', '0')} (0 이상 100 이하의 백분율)`);
    process.exit(2);
  }
  return v;
})();

/**
 * 이 단계에서 몇 건까지 실패를 눈감아 줄 것인가.
 *
 * 내림(floor)한다 — 목표 50건에 1% 면 0건이다. 반올림해서 1건을 허용하면 "1%를 줬는데
 * 2%가 통과"하는 상황이 생긴다. 사람이 준 수치보다 관대해지는 쪽으로 어긋나면 안 된다.
 */
function allowedFailures(target) {
  return Math.floor((target * TOLERANCE_PCT) / 100);
}

const PASSWORD = 'PerfTest123!'; // scripts/lib/config.js SEED_PASSWORD와 일치해야 함
const OUT_DIR = path.join(__dirname, 'generated', PROFILE_NAME);

/**
 * 체크포인트 — 중단된 생성을 **빈 단계부터** 이어서 하기 위한 내부 상태.
 *
 * large 생성은 20시간이 넘는데, 마지막 단계에서 데드락 1건으로 죽으면 그때까지 만든
 * 게시글 10만·댓글 40만·반응 100만이 DB에 그대로 있는데도 처음부터 다시 해야 했다.
 * 누적을 피하려면 볼륨을 지워야 하고, 그러면 멀쩡한 데이터까지 버린다.
 *
 * 산출물(`generated/<profile>/`)과는 다른 것이다. 산출물은 "완성된 데이터셋을 k6가 읽는
 * 색인"이라 실패 시 남기면 안 되지만, 체크포인트는 "어디까지 했는지"를 적은 작업 메모라
 * 실패해도 남아야 쓸모가 있다. 그래서 위치도 분리한다.
 */
const CHECKPOINT_FILE = path.join(__dirname, `.checkpoint-${PROFILE_NAME}.json`);

// ---------- 유틸 ----------

/**
 * 결정론적 PRNG — 같은 프로파일이면 항상 같은 데이터 (재현성).
 *
 * 이전 구현은 `seed * 1103515245` 를 그대로 계산했는데, 이 곱이 2^53 을 넘어
 * JavaScript 의 안전 정수 범위를 벗어난다. 하위 비트가 뭉개지면서 **주기가 10,466** 밖에
 * 되지 않았고, 그 이상 뽑으면 같은 수열이 반복됐다.
 *
 * 지금까지는 중복이 그냥 중복 요청이 되어 조용히 넘어갔지만, (사용자, 게시글) 조합의
 * 유일성을 요구하자 드러났다 — large 시드에서 반응 100만 건 목표에 5,185 개,
 * 친구 3만 쌍 목표에 2,702 쌍만 확보됐다.
 *
 * Math.imul 은 32비트 곱셈을 정밀도 손실 없이 수행한다. 주기는 2^32 이고, 같은 시드는
 * 여전히 같은 수열을 준다. 다만 수열 자체가 바뀌므로 이 커밋 이후의 시드 데이터는
 * 이전과 다르다 — 프로파일별로 재생성해야 한다.
 */
let seed = 20260730;
function rand() {
  seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
  return (seed >>> 0) / 4294967296;
}
function randInt(n) { return Math.floor(rand() * n); }
function pick(arr) { return arr[randInt(arr.length)]; }

/**
 * 인기 편중 샘플러: 0..n-1, 낮은 인덱스일수록 자주 뽑힌다.
 *
 * 규칙 본체는 `scripts/lib/sampling.js`에 있다 — 부하 스크립트(`scripts/lib/data.js`)와
 * **같은 분포**를 써야 하기 때문이다. 예전에는 이 파일이 같은 식을 복사해 갖고 있었고,
 * 그 식이 index 0을 못 뽑아서(S-03) `posts.json`의 index 0에는 댓글·반응·스크랩이 하나도
 * 붙지 않았다. 그런데 `datasets/README.md`는 그 자리를 "최고 인기글"이라고 선언한다.
 * 규칙을 한 곳에 두지 않으면 이런 모순이 조용히 유지된다.
 *
 * 난수원으로 이 파일의 고정 시드 `rand()`를 넘긴다 — 시드 데이터의 재현성을 지키려면
 * 샘플러가 Math.random을 쓰면 안 된다.
 */
let hotIndex = null;    // main()이 동적 import로 채운다 (ESM ↔ CJS 경계)
let HOT_SKEW = null;
let AUTHOR_SKEW = null;

/**
 * 어느 **글**이 뽑히는가 — 읽기 트래픽의 인기 편중(`s=1.07`).
 * 댓글·반응·스크랩이 몰릴 대상을 고를 때 쓴다.
 */
function hotPost(n) {
  return hotIndex(n, HOT_SKEW, rand);
}

/**
 * 어느 **사람**이 쓰는가 — 쓰기 활동의 헤비 유저 편중(`AUTHOR_SKEW`, 현재 1.3).
 *
 * 게시글 인기도와 **다른 지수**를 쓴다. 두 분포는 답하는 질문이 다르고 같아야 할 근거가
 * 없다. 공용 샘플러로 규칙을 합치는 과정에서 한동안 둘 다 1.07을 썼는데, 쓰기 활동은
 * 읽기 인기보다 심하게 쏠리므로 그 상태로는 헤비 유저가 재현되지 않았다.
 *
 * 값을 여기 적지 않고 상수를 그대로 부르는 이유: 숫자를 주석에 복사하면 값이 바뀔 때
 * 한쪽만 남는다. 실제로 이 자리에 `s=1.7`이 적혀 있었는데, 그건 채택되지 **않은** 값이다
 * (옛 버그 수식 `floor(n^(u^1.7))`의 상수를 Zipf 지수로 잘못 읽은 것). 선택 근거와
 * 시뮬레이션 비교는 `scripts/lib/sampling.js`의 `AUTHOR_SKEW` 주석에 있다.
 */
function hotAuthor(n) {
  return hotIndex(n, AUTHOR_SKEW, rand);
}

const TITLES = ['오늘 급식 어땠음?', '수행평가 팁 공유', '내신 공부법', '동아리 추천좀', '모의고사 등급컷',
  '시험기간 공부 인증', '학교 축제 후기', '야자 탈출 방법', '급식 맛집 학교', '수학 문제 질문',
  '영어 단어 암기법', '체육대회 후기', '담임쌤 썰', '매점 신메뉴', '기숙사 생활 팁'];

/*
 * 본문 조각 — 길이가 **고르게 흩어져 있어야** 한다.
 *
 * 왜 조각을 모아 쓰는가. 예전에는 고정 문구를 그대로 넣었고, 그 결과 댓글 40,000건이
 * 서로 다른 본문 10종으로 채워졌다(평균 7.1자). 게시글도 10,078건에 본문 58종이었다.
 * 세 가지가 왜곡된다.
 *
 *   1. 응답 크기가 실제보다 작다. 실측에서 댓글 3,903건 응답이 1.41MB 였는데 본문은
 *      건당 7바이트뿐이고 나머지 354바이트가 JSON 필드 이름·타임스탬프였다. 실제 댓글
 *      길이라면 같은 응답이 2배 이상이 된다 — 페이지네이션 판단의 근거가 어긋난다.
 *   2. 검색 측정이 무의미하다. 서로 다른 본문이 58종뿐인 코퍼스에서 LIKE 검색은 거의
 *      전부 매치하거나 거의 전부 미스다. FULLTEXT 로 바꿔도 개선폭을 잴 수 없다.
 *   3. 같은 문자열이 수만 번 반복되면 InnoDB 페이지가 실제보다 조밀해져 버퍼풀 적중률이
 *      비현실적으로 좋아진다.
 *
 * 길이가 다양한 조각을 섞는 이유는 목표 길이를 **자르지 않고** 맞추기 위해서다. 조각이
 * 전부 길면 짧은 댓글을 만들 수 없고, 목표에서 잘라 내면 단어 중간이 끊긴 본문이 된다.
 */
const COMMENT_PARTS = [
  'ㅋㅋ', 'ㄹㅇ', '인정', '헐', '와 대박', '오 꿀팁 감사', 'ㄹㅇ 공감', '저장해둠',
  '우리 학교도 그럼', '자세히 좀 알려줘', '단톡에 공유함', '선생님께 여쭤봐',
  '나도 작년에 똑같이 했는데 생각보다 효과 있었음',
  '이거 그대로 따라하면 되는지 아니면 학교마다 다른지 궁금하다',
  '작년 선배들 말로는 그 방법이 제일 무난하다고 하던데 요즘도 그런가',
  '진짜 도움 많이 됐어요 혹시 더 자세한 자료 있으면 공유해주실 수 있나요',
  '나는 반대로 했다가 오히려 시간만 날렸어서 이 방법 추천한다 진심으로',
];
const POST_PARTS = [
  '다들 어떻게 생각함?', '공감하면 좋아요 눌러줘', '댓글로 알려주세요',
  '진짜 궁금해서 물어봄', '내일까지 해야 하는데 도와줘', '경험담 공유합니다',
  '이번 학기 들어서 계속 고민하던 건데 혼자 결론이 안 나서 올려봅니다.',
  '작년에 같은 상황이었던 사람 있으면 어떻게 넘겼는지 알려주면 좋겠어요.',
  '학교마다 사정이 다를 것 같아서 여러 경우를 들어보고 정하려고 합니다.',
  '선생님한테 물어보기엔 좀 애매한 내용이라 여기에 먼저 써봅니다 양해 부탁드려요.',
  '정리해보면 크게 세 가지 정도가 걸리는데 하나씩 적어볼게요 길어도 읽어주면 고맙겠습니다.',
  '비슷한 글이 이미 있었으면 알려주세요 검색해봤는데 딱 맞는 건 못 찾았습니다.',
];

/**
 * 로그정규 근사로 목표 글자 수를 뽑는다 — **짧은 것이 대부분이고 꼬리가 길다.**
 *
 * 실제 글 길이는 정규분포가 아니다. 한 줄짜리가 압도적으로 많고 가끔 아주 긴 글이 있다.
 * 균등분포로 만들면 "적당히 긴 글"만 잔뜩 생겨서, 꼬리에서만 드러나는 비용(응답 크기,
 * 직렬화 시간)을 재현하지 못한다.
 *
 * 난수원은 `rand()`(고정 시드 LCG)라 같은 생성기·같은 프로파일이면 분포가 재현된다.
 */
function targetLength(median, p90, max) {
  // ln(X) ~ N(ln median, sigma), sigma = (ln p90 - ln median) / z(0.90)
  const sigma = (Math.log(p90) - Math.log(median)) / 1.2816;
  // Box–Muller. u1 이 0 이면 log 가 발산하므로 하한을 둔다.
  const u1 = Math.max(rand(), 1e-9);
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * rand());
  return Math.min(max, Math.max(2, Math.round(median * Math.exp(sigma * z))));
}

/**
 * 목표 길이에 맞을 때까지 조각을 이어 붙인다.
 *
 * **자르지 않는다.** 목표를 넘기지 않는 조각만 고르므로 결과는 항상 목표 이하이고 단어가
 * 중간에서 끊기지 않는다. 맞는 조각이 하나도 없으면(목표가 최단 조각보다 짧으면) 최단
 * 조각 하나를 넣는다 — 빈 본문은 서버가 거절한다(@NotBlank).
 */
function buildText(parts, median, p90, max) {
  const target = targetLength(median, p90, max);
  const out = [];
  let len = 0;
  for (let guard = 0; guard < 100; guard++) {
    // 바로 앞과 같은 조각은 뺀다. 짧은 조각일수록 남은 자리에 자주 들어맞아
    // "헐 헐 헐 헐" 같은 본문이 나오는데, 그건 다양성을 늘리려는 목적과 어긋난다.
    const last = out[out.length - 1];
    let fits = parts.filter((p) => p !== last && len + p.length + (out.length ? 1 : 0) <= target);
    if (!fits.length) fits = parts.filter((p) => len + p.length + (out.length ? 1 : 0) <= target);
    if (!fits.length) break;
    const p = fits[randInt(fits.length)];
    len += p.length + (out.length ? 1 : 0);
    out.push(p);
  }
  if (!out.length) out.push(parts.reduce((a, b) => (b.length < a.length ? b : a)));
  return out.join(' ');
}

/** 댓글 본문. 중앙값 15자 / p90 60자 / 상한 300자 (CMT_content 는 varchar(10000)). */
const commentText = () => buildText(COMMENT_PARTS, 15, 60, 300);
/** 게시글 본문. 중앙값 200자 / p90 800자 / 상한 3000자 (PST_content 는 TEXT). */
const postText = () => buildText(POST_PARTS, 200, 800, 3000);

// ---------- HTTP 세션 (쿠키 지원) ----------

class Session {
  constructor() { this.cookies = new Map(); }
  cookieHeader() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  async fetch(url, opts = {}) {
    opts.headers = Object.assign({}, opts.headers);
    const ck = this.cookieHeader();
    if (ck) opts.headers.Cookie = ck;
    const res = await fetch(BASE + url, opts);
    const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const sc of setCookies) {
      const [pair] = sc.split(';');
      const eq = pair.indexOf('=');
      this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
    return res;
  }
  /**
   * 액세스 토큰이 만료됐으면 재발급하고 한 번 다시 보낸다.
   *
   * 액세스 토큰 수명은 30분인데(TokenProvider.ACCESS_TOKEN_EXPIRE_TIME) large 시드는
   * 그보다 오래 걸린다. 실측에서 반응 단계가 길어지자 그 뒤의 스크랩 8만 건이 전부 401 로
   * 죽었다 — 세션은 살아 있는데 토큰만 만료된 상태였다. 리프레시 토큰은 7일이라 갱신으로
   * 충분히 덮인다. 갱신 요청 자체가 실패하면 원래 401 응답을 그대로 돌려 상위에서
   * 실패로 집계되게 둔다.
   */
  async json(method, url, body) {
    const send = () => this.fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    let res = await send();
    if (res.status === 401 && url !== '/api/token/refresh') {
      const ok = await this.refreshOnce();
      if (ok) res = await send();
    }

    let data = null;
    const text = await res.text();
    try { data = JSON.parse(text); } catch (_) { data = text; }
    // 글/댓글 생성은 201 + 빈 바디 + Location 헤더로 ID를 준다 (PostController/CommentController).
    return { status: res.status, data, location: res.headers.get('location') };
  }
  /**
   * 이 세션의 토큰을 한 번만 갱신한다 — **동시 요청이 각자 갱신하지 않게 합친다**.
   *
   * 인기 작성자 한 명이 여러 댓글 작업의 작성자로 동시에 뽑히면 같은 세션으로 여러 요청이
   * 병렬로 나간다. 토큰이 만료되는 순간 그 요청들이 **동시에 401을 받고 각자 refresh를
   * 호출**하는데, 서버가 refresh token 회전을 하므로 먼저 성공한 하나가 나머지의 토큰을
   * 무효화한다. 뒤늦은 갱신은 401로 실패하고, 그 작업은 그대로 손실된다.
   *
   * 실측(2026-08-14 large 생성): 댓글 400,000건 중 **23건이 401로 실패**해 시드가 중단됐다.
   * 앞선 단계(회원가입·로그인·학교·게시글 100,000)는 전부 성공한 뒤였다 — 액세스 토큰
   * 수명 30분을 넘긴 시점부터 나타난다.
   *
   * 진행 중인 갱신이 있으면 그 Promise 를 함께 기다린다. 갱신은 한 번만 일어나고, 기다린
   * 요청들은 새 토큰으로 재시도한다. 쿠키는 `this.cookies` 한 곳에 모이므로 누가 갱신했든
   * 결과는 공유된다.
   */
  async refreshOnce() {
    if (!this._refreshing) {
      this._refreshing = this.fetch('/api/token/refresh', { method: 'POST' })
        .then((r) => r.status >= 200 && r.status < 300)
        .catch(() => false)
        // 다음 만료 때 다시 갱신할 수 있어야 하므로 성공/실패와 무관하게 비운다.
        .finally(() => { this._refreshing = null; });
    }
    return this._refreshing;
  }

  /** Location 헤더(`/api/posts/{id}` 등)의 마지막 path segment를 숫자 ID로 뽑는다. */
  static idFromLocation(location) {
    if (!location) return null;
    const seg = location.split('/').filter(Boolean).pop();
    const id = Number(seg);
    return Number.isFinite(id) ? id : null;
  }
}

/** 워커가 이 값을 반환하면 "일을 하지 않고 건너뛰었다"로 집계된다 (성공으로 세지 않는다). */
const SKIP = Symbol('skip');

/**
 * 제한 동시성 실행기.
 *
 * 인기글(Zipf 편중) 댓글/반응/스크랩은 같은 post row를 동시에 UPDATE하다가
 * MySQL 데드락("Deadlock found when trying to get lock; try restarting transaction")을
 * 실제로 유발한다(BTL-003, 동시성 5의 낮은 부하에서도 재현됨). MySQL 공식 문서도
 * 데드락은 애플리케이션이 재시도하는 것을 전제로 설계됐다고 명시한다 — 여기서 1회
 * 재시도한다. reactions/scraps는 멱등(같은 반응 반복은 토글/무시)이라 재시도가 안전하다.
 */
/**
 * 재시도해도 되는 실패인가.
 *
 * 기준은 "그 요청이 일을 하지 않은 것이 확실한가"다. 아래 셋은 전부 트랜잭션이 시작되기
 * 전이거나 롤백된 뒤라, 글·댓글처럼 멱등하지 않은 생성도 중복 없이 다시 보낼 수 있다.
 *
 *  - 데드락      : MySQL이 롤백시킨다. 공식 문서도 애플리케이션 재시도를 전제로 한다.
 *  - 커넥션 고갈 : HikariCP가 커넥션을 못 줘서 트랜잭션 자체가 열리지 않는다.
 *                 이게 과거 시드가 명세에 미달한 실제 원인인데, 데드락만 재시도하던
 *                 이전 구현에서는 그대로 영구 손실이 됐다.
 *  - 전송 오류   : 연결이 끊겨 요청이 서버에 닿지 않았다.
 *
 * 반대로 일반 5xx는 재시도하지 않는다. 앱 결함으로 일부가 이미 적용됐을 수 있어 다시 보내면
 * 중복이 생긴다. 4xx도 재시도 대상이 아니다 — 같은 요청을 다시 보내도 결과가 같다.
 */
function isRetryable(err) {
  const m = String(err && err.message);
  return /[Dd]eadlock/.test(m)
    || /Could not open JPA EntityManager|Connection is not available|HikariPool|connection timeout/i.test(m)
    || /ECONNRESET|ECONNREFUSED|EPIPE|socket hang up|fetch failed|other side closed/i.test(m)
    // 401 — 인증 거절이므로 서버가 **일을 하지 않은 것이 확실하다**. 재시도해도 중복이
    // 생기지 않고, `refreshOnce()`가 그사이 토큰을 갱신해 두므로 다음 시도는 성공한다.
    // 세션이 영구히 죽은 경우라면 MAX_ATTEMPTS 만큼 시도한 뒤 정상적으로 실패로 잡힌다.
    // 근거: large 생성이 댓글 400,000건 중 401 23건으로 중단됐다(2026-08-14) — 앞의
    // 갱신 경쟁을 고쳐도 남을 수 있는 잔여 경로라 재시도로 한 겹 더 덮는다.
    || /\b401\b/.test(m);
}

/**
 * **적용 여부를 알 수 없는** 실패인가 (KI-54).
 *
 * isRetryable 이 참인 실패는 두 종류가 섞여 있고, 멱등하지 않은 API에서는 그 차이가
 * 데이터 손실을 가른다.
 *
 *   확실히 적용 안 됨  데드락(롤백됨)·커넥션 고갈(트랜잭션 미개시)·ECONNREFUSED(연결 실패)
 *                      → 응답을 **받았거나** 요청이 서버에 닿지 않았다. 다시 보내도 안전하다.
 *   알 수 없음         ECONNRESET·EPIPE·socket hang up·fetch failed·other side closed
 *                      → 응답만 못 받았을 뿐 서버는 처리를 끝냈을 수 있다.
 *
 * 반응·스크랩은 토글이라 두 번째 경우에 그냥 재시도하면 **서버가 이미 만든 상태를 되돌린다**.
 * 재시도할수록 데이터가 사라지는, 상식과 반대로 작동하는 구간이다.
 * 그래서 여기서 갈라내고 `ensureToggled()`가 상태를 조회해 판정한다.
 */
function isAmbiguous(err) {
  const m = String(err && err.message);
  // ECONNREFUSED 는 연결 자체가 거부된 것이라 요청이 닿지 않았다 — 모호하지 않다.
  return /ECONNRESET|EPIPE|socket hang up|fetch failed|other side closed/i.test(m);
}

/**
 * 토글 API를 "목표 상태로 만든다"는 의미로 호출한다 (KI-54 대응).
 *
 * 반응·스크랩 엔드포인트는 "현재 상태를 뒤집어라"로 동작해서 멱등하지 않다. 응답을 못 받은
 * 요청을 그냥 재시도하면 서버가 이미 적용한 것을 취소해 버린다.
 *
 * 그래서 응답이 없을 때 **다시 보내지 않고 현재 상태를 조회**한다. 조회 결과가:
 *   목표 상태다      → 첫 요청이 적용된 것이다. 성공으로 처리한다.
 *   목표 상태가 아니다 → 적용되지 않은 것이 확인됐다. 이제 재시도가 안전하므로
 *                       pooled 가 다시 부르도록 재시도 가능한 오류를 던진다.
 *   조회도 실패      → 아무것도 단정할 수 없다. 재시도하지 않고 실패로 남긴다.
 *
 * 상태는 게시글 상세(`GET /api/posts/{id}`)가 이미 내려준다 — PostDetailService 가
 * 요청자 기준으로 `likeState`·`scrapped` 를 채우므로 새 API가 필요 없다.
 *
 * @param {Session} s        요청 주체(= 상태를 확인할 사용자)의 세션
 * @param {number}  postId
 * @param {Function} send    토글 요청을 보내는 함수
 * @param {Function} read    상세 응답에서 현재 상태(boolean)를 꺼내는 함수
 * @param {string}  label    오류 메시지용
 */
async function ensureToggled(s, postId, send, read, label) {
  let r;
  try {
    r = await send();
  } catch (e) {
    if (!isAmbiguous(e)) throw e;          // 확실히 적용 안 됨 → pooled 가 재시도한다
    return verifyToggle(s, postId, read, label, e.message);
  }
  if (r.status < 200 || r.status >= 300) {
    throw new Error(`${label} ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`);
  }
}

async function verifyToggle(s, postId, read, label, why) {
  let cur;
  try {
    cur = await s.json('GET', `/api/posts/${postId}`);
  } catch (e) {
    // 조회마저 실패하면 적용 여부를 모른 채로 남는다. 재시도하면 되돌릴 위험이 있으므로
    // 재시도 대상이 아닌 메시지로 던진다(isRetryable 패턴에 걸리지 않는 문구여야 한다).
    throw new Error(`${label} 상태 확인 불가 (post ${postId}) — 재요청하지 않는다. 원인: ${why}`);
  }
  if (cur.status === 200 && read(cur.data) === true) return;   // 첫 요청이 적용됐다
  if (cur.status === 200) {
    // 적용되지 않은 것이 확인됐다 — 이제 다시 보내도 되돌릴 것이 없다.
    // isRetryable 이 잡는 문구를 써서 pooled 의 재시도 경로를 태운다.
    throw new Error(`${label} 미적용 확인 — 재시도 가능 (fetch failed 계열: ${why})`);
  }
  throw new Error(`${label} 상태 확인 실패 ${cur.status} (post ${postId}) — 재요청하지 않는다`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 작업 목록을 동시에 처리하고 **결과를 돌려준다**.
 *
 * 예전에는 계수를 콘솔에만 찍고 버렸다. 그래서 호출자가 "이 단계가 목표를 채웠는가"를
 * 알 방법이 없었고, 1단계가 통째로 실패해도 2단계가 그대로 시작됐다. 실측 사례: 닉네임
 * 길이 제한 때문에 10,000명 중 100명만 가입했는데 이후 단계 전부가 그 100명 위에서 돌아
 * 데이터셋이 무너졌다. 판단에 필요한 값은 판단하는 쪽으로 돌려줘야 한다.
 *
 * @returns {{label,target,processed,ok,failed,skipped,retried,aborted,firstErrors}}
 */
async function pooled(items, worker, concurrency = CONCURRENCY, label = '', declaredTarget = null) {
  let processed = 0, ok = 0, failed = 0, skipped = 0, retried = 0;
  let aborted = false;
  const firstErrors = [];
  const queue = [...items.entries()];
  // 검문 기준은 **프로파일이 선언한 목표**다. 작업 목록이 목표보다 짧을 수 있는데
  // (uniquePairs 가 유일 조합을 다 못 찾은 경우), 그때 items.length 를 목표로 삼으면
  // "200개만 만들기로 했으니 200개 성공 = 완료"가 되어 미달이 검문을 통과한다.
  // 계획 단계의 부족과 실행 단계의 실패는 원인이 다르지만 결과는 같다 — 명세 미달이다.
  const target = declaredTarget == null ? items.length : declaredTarget;
  const allowed = allowedFailures(target);

  const tally = (r) => { if (r === SKIP) skipped++; else ok++; };

  // 인기글 카운터(BTL-003)의 데드락은 시드 내내 꾸준히 발생한다. 이건 앱에서 없앨 대상이
  // 아니라 EXP-003 이 측정할 병목이므로, 시더 쪽에서 재시도로 흡수해 데이터셋만 온전히 만든다.
  // 3회로는 부족했다(smoke 실측: 댓글 2.7%, 스크랩 5% 손실).
  //
  // 6회도 부족했다(large 실측 2026-08-16): 반응 100만 건에서 재시도 5,949회가 발생했고
  // **1건이 6회를 모두 소진해** 시드가 중단됐다. 그 1건 때문에 21시간이 날아갔다.
  // 백오프 상한이 800ms 라 12회로 늘려도 최악의 작업 하나에 몇 초가 더 붙을 뿐이고,
  // 정상 작업의 소요 시간에는 영향이 없다(재시도는 실패한 작업만 한다).
  const MAX_ATTEMPTS = 12;

  async function lane() {
    // aborted 를 매 반복 확인한다 — immediate 모드에서 한 레인이 실패를 만나면 나머지
    // 레인도 남은 큐를 버리고 빠져나와야 "즉시"라는 말이 성립한다.
    while (queue.length && !aborted) {
      const [i, item] = queue.shift();
      let lastErr = null;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          tally(await worker(item, i));
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          if (attempt === MAX_ATTEMPTS || !isRetryable(e)) break;
          retried++;
          // 지수 백오프 + 지터. 지터가 없으면 모든 레인이 같은 박자로 재시도해
          // 고갈 상태를 스스로 연장한다. 상한을 두는 이유는 재시도 대기가 길어지면
          // 레인이 놀아 전체 처리량이 떨어지기 때문이다.
          await sleep(Math.min(100 * 2 ** (attempt - 1), 800) + Math.floor(rand() * 50));
        }
      }
      if (lastErr) {
        failed++;
        // 콘솔에는 앞의 몇 건만 찍되(수천 건이면 로그가 쓸모없어진다) 요약 보고용으로는
        // 따로 모아 둔다 — 멈춘 이유를 마지막에 한 번 더 보여줘야 하기 때문이다.
        if (firstErrors.length < 5) firstErrors.push(`${label}[${i}]: ${lastErr.message}`);
        if (failed <= 5) console.error(`  ! ${label}[${i}]: ${lastErr.message}`);
        // 허용치 안이면 immediate 여도 멈추지 않는다 — "첫 실패에서 중단"이 아니라
        // "허용치를 넘는 순간 중단"이다. 이걸 구분하지 않으면 --tolerance 를 준 의미가
        // immediate 모드에서만 사라진다.
        if (ON_FAILURE === 'immediate' && failed > allowed) aborted = true;
      }
      if (++processed % 200 === 0) process.stdout.write(`  ${label}: ${processed}/${items.length}\r`);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, lane));

  // "처리 개수"가 아니라 "실제 생성 개수"를 보고한다. 이전에는 조용히 건너뛴 작업까지
  // 완료로 세어 "500/500 완료 (실패 0)"인데 실제로는 187건만 생성된 상태를 성공으로
  // 보고했다(실측). 데이터셋이 명세에 미달하면 그 위의 모든 실험이 무효가 되므로
  // 여기서 크게 드러내야 한다.
  const parts = [`성공 ${ok}`];
  if (failed) parts.push(`실패 ${failed}`);
  if (skipped) parts.push(`건너뜀 ${skipped}`);
  // 재시도 횟수는 경합의 크기를 보여준다. 성공했더라도 이 수가 크면 동시성이나 풀 크기가
  // 맞지 않는다는 신호이므로 다음 실행에서 조정할 근거가 된다.
  if (retried) parts.push(`재시도 ${retried}`);
  console.log(`  ${label}: ${processed}/${items.length} 처리 (${parts.join(', ')})`);
  if (aborted) {
    console.log(`    ⚠ 허용치(${allowed}건)를 넘겨 중단했다(--on-failure immediate) — 위 수치는 부분값이다.`);
  }
  const missing = target - ok;
  if (missing > 0) {
    const planShort = target - items.length;
    console.log(`    ⚠ 목표 ${target}건 중 ${missing}건 미생성 — 데이터셋이 명세에 미달한다.` +
      (planShort > 0 ? ` (그중 ${planShort}건은 작업 계획 단계에서 이미 부족했다)` : ''));
    // 허용치가 이 단계를 살렸다면 반드시 드러낸다. 조용히 통과시키면 0%로 만든
    // 데이터셋과 구별되지 않고, 나중에 "이 수치가 왜 이상하지"의 원인을 못 찾는다.
    if (missing <= allowed) {
      console.log(`    ↳ 허용치 ${TOLERANCE_PCT}%(${allowed}건) 안이라 통과시킨다 — 이 데이터셋은 명세보다 ${missing}건 적다.`);
    }
  }

  return {
    label, target, planned: items.length, processed, ok, failed, skipped, retried, aborted,
    firstErrors, allowed, missing, tolerated: missing > 0 && missing <= allowed,
  };
}

/**
 * 단계 결과를 검문한다 — 미달분이 허용치 안인가.
 *
 * `missing = target - ok`으로 판정하는 이유: `failed`만 보면 SKIP 이 빠져나간다. SKIP 은
 * "앞 단계가 못 만든 리소스라 이번 단계도 못 했다"는 뜻이라 그 자체로 미달의 증거다.
 * 목표 수량을 채웠는가 하나로 보는 편이 빠뜨림이 없다.
 *
 * `--on-failure continue` 에서는 기록만 하고 진행한다. 다만 종료 코드와 산출물 정책은
 * 동일하다 — 계속 돌린다고 결과가 유효해지지는 않는다.
 */
const stageFailures = [];
/** 허용치 덕분에 통과한 단계들 — meta.json 과 최종 보고에 남긴다. */
const toleratedStages = [];

function requireComplete(result) {
  if (result.tolerated) toleratedStages.push(result);
  if (result.missing <= result.allowed) return result;
  stageFailures.push(result);
  if (ON_FAILURE === 'continue') {
    console.error(`  ✗ ${result.label} 허용치 초과 — 계속 진행한다(--on-failure continue). 산출물은 쓰지 않는다.`);
    return result;
  }
  abortWithFailures();
}

/* ---------- 체크포인트 ---------- */

/** 이번 실행에서 확정된 단계와, 뒤 단계가 필요로 하는 상태. */
const checkpoint = { profile: PROFILE_NAME, generatorVersion: null, stages: {}, posts: null };

/**
 * 단계 하나가 목표를 채우면 즉시 기록한다.
 *
 * 매 단계마다 쓰는 이유: 다음 단계에서 죽어도 여기까지는 이어받을 수 있어야 한다.
 * 파일이 작아 쓰기 비용은 무시할 수 있다(posts 10만 건 기준 약 2MB, 한 번만 쓴다).
 */
function saveCheckpoint(stage, count, extra = {}) {
  checkpoint.stages[stage] = count;
  Object.assign(checkpoint, extra);
  try {
    fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint));
  } catch (e) {
    // 체크포인트 실패가 생성을 막지는 않는다 — 재개 편의를 잃을 뿐이다.
    console.warn(`  ⚠ 체크포인트 기록 실패(${e.message}) — 이 실행은 재개할 수 없다`);
  }
}

/**
 * 재개할 체크포인트를 읽는다. 조건이 맞지 않으면 null 을 돌려 처음부터 하게 한다.
 *
 * 생성기 지문을 대조하는 이유: 샘플러나 시더를 고친 뒤 재개하면 앞 단계는 옛 규칙,
 * 뒤 단계는 새 규칙으로 만들어진 **잡종 데이터셋**이 된다. 그건 어느 쪽 규칙으로도
 * 설명할 수 없어서 지문의 의미가 사라진다.
 */
function loadCheckpoint(generatorVersion) {
  if (!RESUME) return null;
  if (!fs.existsSync(CHECKPOINT_FILE)) {
    console.log('  --resume 을 줬지만 체크포인트가 없다 — 처음부터 생성한다.');
    return null;
  }
  let cp;
  try {
    cp = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
  } catch (e) {
    console.error(`체크포인트를 읽을 수 없다: ${e.message}`);
    process.exit(2);
  }
  if (cp.profile !== PROFILE_NAME) {
    console.error(`체크포인트 프로파일 불일치: ${cp.profile} ≠ ${PROFILE_NAME}`);
    process.exit(2);
  }
  if (cp.generatorVersion && cp.generatorVersion !== generatorVersion) {
    console.error(
      `생성기가 바뀌었다 (체크포인트 ${cp.generatorVersion} ≠ 현재 ${generatorVersion}).\n` +
      `  앞 단계는 옛 규칙, 뒤 단계는 새 규칙으로 만들어진 잡종 데이터셋이 된다.\n` +
      `  깨끗한 DB에서 처음부터 생성할 것.`
    );
    process.exit(2);
  }
  return cp;
}

/** 이 단계를 건너뛰어도 되는가 — 체크포인트가 이미 목표(허용치 감안)를 채웠는가. */
function alreadyDone(cp, stage, target) {
  if (!cp) return false;
  const done = cp.stages && cp.stages[stage];
  return typeof done === 'number' && target - done <= allowedFailures(target);
}

/** 건너뛴 단계를 결과 목록에 그대로 반영한다 — meta.json 의 stageCounts 가 이걸 쓴다. */
function skipped(stage, target, cp) {
  const ok = cp.stages[stage];
  console.log(`  ${stage}: 건너뜀 — 이미 ${ok}/${target} (--resume)`);
  return {
    label: stage, target, planned: 0, processed: 0, ok, failed: 0, skipped: 0, retried: 0,
    aborted: false, firstErrors: [], allowed: allowedFailures(target),
    missing: target - ok, tolerated: target - ok > 0, resumed: true,
  };
}

/** 미달 요약을 출력하고 종료 코드 1로 끝낸다. 산출물은 쓰지 않는다. */
function abortWithFailures() {
  console.error('');
  console.error('═'.repeat(70));
  console.error(`  데이터셋 생성 실패 — 허용치(${TOLERANCE_PCT}%)를 넘겨 미달한 단계가 있다`);
  console.error('═'.repeat(70));
  for (const f of stageFailures) {
    console.error(`  ${f.label}: 목표 ${f.target} / 성공 ${f.ok} / 부족 ${f.missing} (허용 ${f.allowed})` +
      `${f.failed ? ` / 실패 ${f.failed}` : ''}${f.skipped ? ` / 건너뜀 ${f.skipped}` : ''}` +
      `${f.aborted ? ' — 허용치 초과 시점에 중단' : ''}`);
    for (const e of f.firstErrors) console.error(`      ! ${e}`);
  }
  if (TOLERANCE_PCT === 0) {
    console.error('');
    console.error('  서버 병목(BTL-003 데드락 등)으로 소수 손실이 반복된다면');
    console.error('  --tolerance 0.1 처럼 허용치를 명시해 다시 시도할 수 있다.');
    console.error('  그 경우 만들어진 데이터셋은 명세보다 적고, meta.json에 그 사실이 남는다.');
  }
  console.error('');
  console.error('  산출물(JSON)을 쓰지 않았다 — 반쪽짜리 데이터셋이 파일로 남으면');
  console.error('  다음 실행이 그걸 정상으로 착각한다.');
  console.error('  원인을 고친 뒤 깨끗한 DB에서 다시 생성할 것.');
  console.error('═'.repeat(70));
  process.exit(1);
}

// ---------- 생성 단계 ----------

function buildUsers() {
  const users = [];
  for (let i = 0; i < P.users; i++) {
    users.push({
      email: `perf${String(i).padStart(6, '0')}@loadtest.local`,
      password: PASSWORD,
      name: `부하${i}`,
      // 닉네임은 2~12자 제한이 있다(Nickname 값 객체). `perf_user_${i}` 는 i>=100 부터
      // 13자가 되어 가입이 400 으로 거절된다 — large 실측에서 10,000명 중 정확히 100명만
      // 가입에 성공했고, 그 뒤 단계가 전부 그 100명 위에서 돌아 데이터셋이 무너졌다.
      // small(100명)이 지금까지 멀쩡했던 건 우연히 경계 안이었기 때문이다.
      // `u${i}` 는 xlarge(10만명)의 `u99999` 도 6자라 여유가 있다.
      nickname: `u${i}`,
      // PhoneNumber 값 객체가 "010-XXXX-XXXX" 형식만 허용한다 (하이픈 필수).
      phone: `010-${String(9000 + (i % 1000)).padStart(4, '0')}-${String(1000 + (i % 9000)).padStart(4, '0')}`,
      grade: pick(['SOPHOMORE', 'JUNIOR', 'SENIOR']), // enums.Grade 실제 값 (1/2/3학년)
      gender: pick(['MALE', 'FEMALE']),
      birthDate: `${pick(['2007', '2008', '2009'])}-0${1 + randInt(9)}-1${randInt(9)}`,
      schoolIdx: randInt(P.schools), // 같은 값 = 같은 학교 (친구 클러스터 기준)
    });
  }
  return users;
}

async function registerUsers(users) {
  console.log(`[1/6] 회원가입 ${users.length}명`);
  return pooled(users, async (u) => {
    const s = new Session();
    const r = await s.json('POST', '/api/user/register', {
      name: u.name, nickname: u.nickname, phone: u.phone, email: u.email,
      grade: u.grade, gender: u.gender, provider: 'DEFAULT',
      password: u.password, birthDate: u.birthDate,
    });
    // 재실행 시 중복 가입은 409(ALREADY_EXISTS_USER) — 그 외 4xx/5xx는 실제 실패이므로 던진다.
    if (r.status >= 400 && r.status !== 409) {
      throw new Error(`register ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`);
    }
  }, CONCURRENCY, 'register');
}

async function loginAll(users) {
  console.log(`[2/6] 로그인 세션 확보`);
  const sessions = new Array(users.length);
  const result = await pooled(users, async (u, i) => {
    const s = new Session();
    const r = await s.json('POST', '/api/user/login', { email: u.email, password: u.password });
    if (r.status !== 200) throw new Error(`login ${r.status}`);
    // 자기 userId를 여기서 한 번만 받아 세션에 붙인다.
    // 친구 신청 API가 닉네임이 아니라 대상 사용자 id를 받으므로(RequestFriendDto.targetUserId)
    // 어딘가에서는 id를 알아야 한다. 쌍마다 /friends/search 로 조회하면 요청이 쌍 수만큼
    // 늘어나지만(large 기준 3만 건), 로그인 직후 1회면 사용자 수만큼(1만 건)으로 끝난다.
    const info = await s.json('GET', '/api/user/userInfo');
    if (info.status !== 200 || !info.data || info.data.id == null) {
      throw new Error(`userInfo ${info.status}: id를 못 받음`);
    }
    s.userId = info.data.id;
    sessions[i] = s;
  }, CONCURRENCY, 'login');
  return { sessions, result };
}

/**
 * 사용자에게 학교/학년/반을 배정한다.
 *
 * users의 `schoolIdx`는 원래 친구 클러스터링 계산에만 쓰였고 실제 계정에는 반영되지
 * 않았다. 그 결과 급식처럼 학교 배정을 요구하는 경로가 전부 400(SCHOOL_NOT_ASSIGNED)이
 * 되어, `scripts/school.js`가 요청의 절반을 실패하면서도 checks는 100%로 통과하는
 * 상태였다(실측: 실패율 53.1%, checks 100% — 검증이 `status < 500`이라 400을 놓쳤다).
 *
 * schools 테이블은 마이그레이션으로 이미 채워져 있다(2401개, SCH_id 1~2401).
 * schoolIdx(0-based)를 SCH_id(1-based)에 그대로 대응시키면 "같은 schoolIdx = 같은 학교"가
 * 유지되므로 친구 클러스터 전제도 그대로다.
 */
async function assignSchools(users, sessions) {
  console.log('  학교/학년/반 배정');
  return pooled(users, async (u, i) => {
    const s = sessions[i];
    if (!s) return SKIP;                       // 세션 없는 계정은 배정 불가 — 건너뜀으로 집계
    const r = await s.json('PATCH', '/api/user/school', {
      schoolId: String(u.schoolIdx + 1),       // SchoolIdDto.schoolId 는 String 이다
      grade: u.grade,
      userClass: 1 + (i % 10),
    });
    if (r.status >= 400) {
      throw new Error(`school ${r.status}: ${JSON.stringify(r.data).slice(0, 150)}`);
    }
  }, CONCURRENCY, 'school');
}

/**
 * 세션이 확보된 사용자 인덱스만 추린다.
 *
 * 가입/로그인이 실패한 계정을 남겨둔 채 hotAuthor(users.length)로 작성자를 뽑으면, 그 계정이
 * 뽑힐 때마다 작업이 조용히 버려진다. 게다가 Zipf는 낮은 인덱스(헤비 유저)를 압도적으로
 * 자주 뽑으므로 상위 몇 명만 실패해도 손실이 증폭된다.
 *
 * 실측(small): 100명 중 8명이 로그인에 실패하자 글이 500건 중 187건만 생성됐는데도
 * "500/500 완료 (실패 0)"으로 보고됐고, 작성자 분포도 Zipf가 아니라 거의 균등해져
 * (최다 작성자 12건) datasets/README.md가 전제하는 Hot Data 편중이 사라졌다.
 * 편중을 전제로 한 병목(BTL-001/003/004)은 이런 데이터로는 재현되지 않는다.
 *
 * 살아있는 세션만 모아 그 위에서 Zipf를 돌리면 생성 개수와 분포 형태가 모두 보존된다.
 * (누가 헤비 유저가 되는지는 바뀌지만, 실험에 필요한 것은 특정 계정이 아니라 분포다.)
 */
function liveAuthors(sessions) {
  const live = [];
  for (let i = 0; i < sessions.length; i++) if (sessions[i]) live.push(i);
  if (live.length === 0) {
    throw new Error('사용 가능한 세션이 없다 — 회원가입/로그인 단계를 먼저 확인할 것');
  }
  if (live.length < sessions.length) {
    console.log(`  ⚠ 세션 확보 ${live.length}/${sessions.length}명 — 작성자 풀을 이 범위로 제한한다`);
  }
  return live;
}

async function fetchBoards(sessions) {
  const s = sessions.find(Boolean);
  // 세션이 하나도 없으면 `s`가 undefined다. 가드가 없으면 다음 줄이
  // "Cannot read properties of undefined (reading 'json')"으로 터져서, 실제 원인(로그인
  // 단계가 통째로 실패했다는 것)이 스택 트레이스에 묻힌다. liveAuthors()가 같은 상황에서
  // 이미 이렇게 하고 있다 — 여기만 빠져 있었다.
  if (!s) throw new Error('사용 가능한 세션이 없다 — 회원가입/로그인 단계를 먼저 확인할 것');
  const r = await s.json('GET', '/api/boards');
  const boards = (Array.isArray(r.data) ? r.data : []).map((b) => ({
    id: b.id ?? b.boardId, name: b.name ?? b.boardName ?? '',
  })).filter((b) => b.id != null);
  if (boards.length === 0) throw new Error('게시판이 없습니다 — 서버 data.sql 초기화 확인');
  console.log(`  게시판 ${boards.length}개 확인`);
  return boards;
}

async function createPosts(users, sessions, boards) {
  console.log(`[3/6] 게시글 ${P.posts}건 (작성자 Zipf 편중)`);
  const live = liveAuthors(sessions);
  const posts = [];
  const jobs = Array.from({ length: P.posts }, (_, i) => i);
  const result = await pooled(jobs, async (i) => {
    const authorIdx = live[hotAuthor(live.length)];   // 살아있는 세션 위에서 헤비 유저 편중
    const s = sessions[authorIdx];
    const board = boards[randInt(boards.length)];
    const r = await s.json('POST', '/api/posts', {
      boardId: board.id,
      title: `${pick(TITLES)} #${i}`,
      content: postText(),
      // RequestPostDto의 boolean 필드는 Lombok이 setAnonymous(...)를 생성하므로
      // Jackson이 기대하는 JSON 키는 "isAnonymous"가 아니라 "anonymous"다 (실측 확인됨).
      anonymous: rand() < 0.5,
    });
    // 4xx도 실패다. 예전에는 `else if (r.status >= 500)`이라 4xx가 어느 분기도 타지 않아
    // posts 배열에는 안 담기는데 성공으로 집계됐다 — 배열이 비어가는데 "성공 100,000"으로
    // 보고되는 상태였다. 미달을 드러내려면 여기서 던져야 한다.
    if (r.status < 200 || r.status >= 300) {
      throw new Error(`post ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`);
    }
    // 201 Created는 바디가 비어 있고 Location: /api/posts/{id} 헤더로만 ID를 준다.
    const id = Session.idFromLocation(r.location);
    if (!id) throw new Error(`post 2xx이지만 Location 헤더에서 id를 못 뽑음: ${r.location}`);
    posts.push({ id, boardId: board.id, rank: i });
  }, CONCURRENCY, 'posts');
  // rank 낮은 글 = 먼저 생성된 글 = 인기글로 사용 (posts.json은 인기순 정렬 상태)
  posts.sort((a, b) => a.rank - b.rank);
  return { posts, result };
}

async function createEngagement(users, sessions, posts, cp) {
  console.log(`[4/6] 댓글 ${P.comments} + 반응 ${P.reactions} + 스크랩 ${P.scraps} (게시글 Zipf 편중)`);
  const live = liveAuthors(sessions);
  if (posts.length === 0) throw new Error('게시글이 없다 — 3단계(게시글 생성)를 먼저 확인할 것');

  // 세 하위 단계(댓글·반응·스크랩)를 각각 검문한다. 하나로 합쳐 보고하면 "반응만
  // 전부 실패"가 "대체로 성공"에 묻힌다.
  const results = [];

  if (alreadyDone(cp, 'comments', P.comments)) {
    results.push(skipped('comments', P.comments, cp));
  } else {
  const commentJobs = Array.from({ length: P.comments }, () => ({
    post: posts[hotPost(posts.length)],
    author: live[hotAuthor(live.length)],
  }));
  results.push(requireComplete(await pooled(commentJobs, async (j) => {
    const s = sessions[j.author];
    const r = await s.json('POST', `/api/posts/${j.post.id}/comments`, {
      parentId: null, content: commentText(), anonymous: rand() < 0.6, url: null,
    });
    // 4xx도 실패로 본다 — 아래 반응/스크랩도 같다. 5xx만 보면 조용히 미달한다.
    if (r.status < 200 || r.status >= 300) {
      throw new Error(`comment ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`);
    }
  }, CONCURRENCY, 'comments')));
  saveCheckpoint('comments', results[results.length - 1].ok);
  }

  // 반응과 스크랩은 (사용자, 게시글) 조합이 유일해야 한다 — DB에도 유니크 제약이 있다
  // (uk_posts_reactions_pst_usr / uk_scraps_usr_pst). 예전처럼 무작위로 뽑으면 같은 조합이
  // 반복되는데, 서버가 upsert 로 바뀐 뒤로는 그게 오류가 아니라 "기존 행 갱신"이 되어
  // 조용히 목표 개수에 미달한다. 실패로 드러나지 않으므로 생성 단계에서 걸러야 한다.
  //
  // 한 게시글이 받을 수 있는 반응의 상한은 사용자 수다. Zipf 로 인기글에 몰리므로 상위
  // 게시글은 금방 포화되고, 그때부터는 뽑기가 계속 중복에 걸린다. guard 로 시도 횟수를
  // 제한하고, 목표에 못 미치면 그대로 보고한다(조용히 줄이지 않는다).
  const uniquePairs = (count, label) => {
    const jobs = [];
    const seen = new Set();
    let guard = count * 20;
    while (jobs.length < count && guard-- > 0) {
      const post = posts[hotPost(posts.length)];
      const user = live[randInt(live.length)];
      const key = `${user}:${post.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      jobs.push({ post, user });
    }
    if (jobs.length < count) {
      console.log(`  ⚠ ${label}: 유일한 (사용자, 게시글) 조합을 ${jobs.length}/${count}개만 확보했다 ` +
        `— 사용자 ${live.length}명 / 게시글 ${posts.length}건으로는 이 목표를 채울 수 없다.`);
    }
    return jobs;
  };

  // 반응·스크랩은 토글이라 응답 유실 시 그냥 재시도하면 서버가 이미 만든 상태를
  // 되돌린다(KI-54). ensureToggled 가 그 경우에만 상태를 조회해 판정한다.
  // 데드락·커넥션 고갈은 확실히 롤백된 것이므로 예전처럼 pooled 가 재시도한다.
  if (alreadyDone(cp, 'reactions', P.reactions)) {
    results.push(skipped('reactions', P.reactions, cp));
  } else {
    const reactionJobs = uniquePairs(P.reactions, '반응');
    results.push(requireComplete(await pooled(reactionJobs, async (j) => {
      const s = sessions[j.user];
      const type = rand() < 0.85 ? 'LIKE' : 'DISLIKE';
      await ensureToggled(
        s, j.post.id,
        () => s.json('POST', `/api/posts/${j.post.id}/reaction?type=${type}`),
        // 상세 응답은 요청자 기준의 `liked`/`disliked`/`scrapped` 를 평면으로 내려준다
        // (PostDetailService.applyUserContext, 실제 응답으로 키 확인함 — `likeState` 로
        // 중첩돼 있지 않다). 어느 쪽 반응이든 "이 사용자가 이 글에 반응을 남겼다"가 목표다.
        (d) => !!(d && (d.liked || d.disliked)),
        'reaction',
      );
    }, CONCURRENCY, 'reactions', P.reactions)));
    saveCheckpoint('reactions', results[results.length - 1].ok);
  }

  if (alreadyDone(cp, 'scraps', P.scraps)) {
    results.push(skipped('scraps', P.scraps, cp));
  } else {
    const scrapJobs = uniquePairs(P.scraps, '스크랩');
    results.push(requireComplete(await pooled(scrapJobs, async (j) => {
      const s = sessions[j.user];
      await ensureToggled(
        s, j.post.id,
        () => s.json('POST', `/api/posts/${j.post.id}/scraps`),
        (d) => !!(d && d.scrapped),
        'scrap',
      );
    }, CONCURRENCY, 'scraps', P.scraps)));
    saveCheckpoint('scraps', results[results.length - 1].ok);
  }

  return results;
}

async function createFriendships(users, sessions) {
  console.log(`[5/6] 친구 관계 ~${P.friendships}쌍 (같은 학교 클러스터)`);
  const bySchool = new Map();
  users.forEach((u, i) => {
    if (!bySchool.has(u.schoolIdx)) bySchool.set(u.schoolIdx, []);
    bySchool.get(u.schoolIdx).push(i);
  });
  const pairs = [];
  const seen = new Set();
  let guard = P.friendships * 20;
  while (pairs.length < P.friendships && guard-- > 0) {
    // 80%는 같은 학교, 20%는 무작위
    let a, b;
    if (rand() < 0.8) {
      const group = bySchool.get(randInt(P.schools)) || [];
      if (group.length < 2) continue;
      a = pick(group); b = pick(group);
    } else {
      a = randInt(users.length); b = randInt(users.length);
    }
    if (a === b) continue;
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push([a, b]);
  }

  const accepted = [];
  const result = await pooled(pairs, async ([a, b]) => {
    const sa = sessions[a], sb = sessions[b];
    if (!sa || !sb) return SKIP;   // 세션 없는 계정 — 성공으로 세지 않는다
    // 닉네임이 아니라 대상 사용자 id로 보낸다. 닉네임에는 유니크 제약이 없고 변경도
    // 가능해서 API가 id 기반으로 바뀌었다(RequestFriendDto.targetUserId).
    const r1 = await sa.json('POST', '/api/friends/request', { targetUserId: sb.userId });
    // 409 ALREADY_FRIENDS 는 "목표 상태가 이미 성립한다"는 뜻이라 실패가 아니다 —
    // 1단계가 중복 가입(409)을 성공으로 세는 것과 같은 판단이다. 시더가 만들려는 것은
    // "요청을 한 번 보냈다"가 아니라 "두 사람이 친구다"라는 상태이기 때문이다.
    // 이 처리가 없으면 같은 DB에 시더를 두 번 돌릴 때 이 단계가 통째로 실패한다(실측).
    // 이미 친구인 쌍도 "친구다"라는 목표 상태를 만족하므로 채팅 대상에 포함한다.
    if (r1.status === 409) { accepted.push([a, b]); return; }
    if (r1.status < 200 || r1.status >= 300) {
      throw new Error(`friend request ${r1.status}: ${JSON.stringify(r1.data).slice(0, 150)}`);
    }
    // 받은 신청 목록에서 이 신청을 찾아 수락.
    // 응답은 FriendInfoDto 라 신청 식별자가 requestId 다 — id 로 읽으면 undefined 가 되어
    // JSON 에서 통째로 빠지고 서버가 400 으로 끊는다.
    const r2 = await sb.json('GET', '/api/friends/requests/received');
    if (r2.status !== 200 || !Array.isArray(r2.data)) {
      throw new Error(`received ${r2.status}`);
    }
    // **폴백 없이** 방금 보낸 신청만 수락한다. 예전에는 못 찾으면 목록의 마지막 항목을
    // 수락했는데(`|| r2.data[r2.data.length - 1]`), 신청이 몰린 사용자는 그 순간 **엉뚱한
    // 사람의 신청**을 수락한다. 그렇게 생긴 친구 관계 위에 채팅방이 만들어지므로,
    // 데이터셋이 "같은 학교 클러스터"라는 전제와 어긋난 채로 완성된다.
    // 못 찾으면 조용히 다른 것을 고르지 말고 실패로 남긴다.
    const req = r2.data.find((q) => q.userId === sa.userId);
    if (!req || req.requestId == null) {
      throw new Error(`받은 신청 목록에서 보낸 신청(userId=${sa.userId})을 못 찾음 — 폴백하지 않는다`);
    }
    const r3 = await sb.json('POST', '/api/friends/respond', { id: req.requestId, status: 'ACCEPTED' });
    if (r3.status < 200 || r3.status >= 300) {
      throw new Error(`friend respond ${r3.status}: ${JSON.stringify(r3.data).slice(0, 150)}`);
    }
    accepted.push([a, b]);   // 실제로 친구가 된 쌍만 채팅 단계로 넘긴다
  }, Math.min(CONCURRENCY, 5), 'friendships');

  // 채팅방은 **성공한 친구 쌍** 위에만 만든다. 예전에는 시도 대상인 `pairs` 전체를
  // 넘겨서, 친구 생성이 실패한 쌍으로 방 생성을 시도했다 — 서버가 거절하므로 수 시간짜리
  // large 실행이 마지막 단계에서 무너진다.
  return { pairs: accepted, result };
}

async function createChat(users, sessions, pairs) {
  console.log(`[6/6] 채팅방 + 메시지`);
  const roomPairs = pairs.slice(0, Math.floor(pairs.length * P.chatRoomRatio));
  const rooms = [];
  const result = await pooled(roomPairs, async ([a, b]) => {
    const sa = sessions[a], sb = sessions[b];
    if (!sa || !sb) return SKIP;
    // 상대 userId 는 세션이 이미 들고 있다. 예전에는 쌍마다 /friends/list 를 조회해
    // 닉네임으로 찾았는데, large 기준 9천 건의 목록 조회가 더해지고 닉네임이 바뀌면
    // 조용히 못 찾는 구조였다.
    const r = await sa.json('POST', '/api/chat/rooms', { friendId: sb.userId });
    if (r.status < 200 || r.status >= 300) {
      throw new Error(`chat room ${r.status}: ${JSON.stringify(r.data).slice(0, 150)}`);
    }
    const roomId = r.data && (r.data.roomId ?? r.data.id);
    if (roomId == null) throw new Error(`chat room 2xx 이지만 roomId 를 못 받음`);
    rooms.push({ roomId, a, b });
  }, Math.min(CONCURRENCY, 5), 'chat-rooms');

  // 방마다 히스토리 메시지 (REST가 아닌 WS 전용이므로 여기서는 read 상태만 갱신)
  // 메시지 히스토리는 chat-ws.js 첫 실행이 자연스럽게 쌓는다.
  console.log(`  1:1 채팅방 ${rooms.length}개 생성`);
  return { rooms, result };
}

// ---------- 데이터셋 지문 ----------

/**
 * 이 데이터셋이 "어떤 규칙으로 만들어진 무엇인가"를 요약한 지문을 만든다.
 *
 * 왜 필요한가: 비교 조건에서 데이터셋은 그동안 프로파일 이름(`large`)뿐이었다. 그런데
 * 인기 편중 샘플러를 고쳐 데이터를 다시 만들어도 이름은 그대로 `large`다. 그러면 인기
 * 분포가 완전히 달라진 데이터셋으로 잰 결과가 옛 실행과 같은 조건으로 비교된다.
 * 실제로 S-03(index 0을 못 뽑던 버그) 수정 때 그 상황이 발생할 뻔했다.
 *
 * **`generatedAt`은 지문에 넣지 않는다.** 같은 생성기·같은 프로파일로 다시 시드하면 통계적
 * 성질이 동일한 데이터셋이 나온다(LCG 시드가 고정이다). 그걸 매번 다른 데이터셋으로 취급하면
 * 재시드할 때마다 기준선이 전부 무효가 되어, 정작 막으려던 것과 무관하게 비교가 끊긴다.
 * 지문이 답해야 하는 질문은 "언제 만들었나"가 아니라 **"같은 규칙과 같은 규모인가"**다.
 *
 * 실제 생성 개수를 넣는 이유: 시드가 부분 실패하면(과거 실측: 500건 목표에 187건) 규칙이
 * 같아도 데이터가 다르다. 그 실행을 정상 데이터셋과 비교하면 안 된다.
 */
/**
 * 생성 규칙의 지문 — 이 생성기 자체 + 공용 샘플러(인기 편중 분포).
 *
 * `buildMeta()` 안에 있던 것을 꺼냈다. 체크포인트를 읽기 **전에** 이 값이 필요하다 —
 * 규칙이 바뀐 뒤 재개하면 앞 단계는 옛 규칙, 뒤 단계는 새 규칙인 잡종이 되기 때문이다.
 */
function computeGeneratorVersion() {
  const hashOf = (rel) => {
    const buf = fs.readFileSync(path.join(__dirname, rel));
    return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12);
  };
  return crypto.createHash('sha256')
    .update(hashOf('seed.js'))
    .update(hashOf('../scripts/lib/sampling.js'))
    .digest('hex').slice(0, 12);
}

function buildMeta(users, posts, boards, stageResults) {
  const generatorVersion = computeGeneratorVersion();

  // 단계별 실제 생성 수. **허용치를 열면 이 값이 지문의 핵심이 된다** — 댓글이 5% 모자란
  // 데이터셋과 온전한 데이터셋은 성능이 다른데, 예전 identity 에는 users·posts·boards 만
  // 들어가 있어 두 지문이 같았다. 그러면 회귀 판정이 두 실행을 같은 조건으로 비교한다.
  const stageCounts = {};
  for (const r of stageResults) stageCounts[r.label] = r.ok;

  const identity = {
    schemaVersion: 2,   // stageCounts 추가로 구성이 바뀌었다 — 옛 지문과 섞이면 안 된다
    profile: PROFILE_NAME,
    generatorVersion,
    params: P,
    counts: { users: users.length, posts: posts.length, boards: boards.length },
    stageCounts,
  };
  const fingerprint = 'sha256:' + crypto.createHash('sha256')
    .update(JSON.stringify(identity))
    .digest('hex').slice(0, 12);

  // 허용 정책 자체는 identity 에 넣지 않는다. 지문이 답해야 하는 질문은 "이 데이터가
  // 무엇인가"이지 "어떤 설정으로 만들었나"가 아니다 — 허용치 1%로 돌려서 손실이 0이었다면
  // 0%로 돌린 것과 같은 데이터이므로 같은 지문이어야 한다. 사람이 읽을 기록으로는 남긴다.
  const tolerance = {
    pct: TOLERANCE_PCT,
    toleratedStages: toleratedStages.map((t) => ({
      stage: t.label, target: t.target, created: t.ok, missing: t.missing, allowed: t.allowed,
    })),
  };

  // 재개해서 만든 데이터셋인지 남긴다. 지문에는 넣지 않는다 — 결과 데이터가 같으면 한 번에
  // 만들었든 이어서 만들었든 같은 데이터셋이다. 다만 난수 소비 순서가 달라 "왜 이것만
  // 분포가 미묘하게 다른가"를 나중에 추적할 수 있어야 하므로 기록은 남긴다.
  const resumedStages = stageResults.filter((r) => r.resumed).map((r) => r.label);

  return {
    ...identity, tolerance, fingerprint,
    resumed: resumedStages.length ? resumedStages : undefined,
    generatedAt: new Date().toISOString(),
  };
}

// ---------- 메인 ----------

async function main() {
  console.log(`프로파일: ${PROFILE_NAME}`, P, `→ ${BASE}`);
  console.log(`실패 정책: 단계별 허용 ${TOLERANCE_PCT}% · 중단 시점 ${ON_FAILURE}`);
  if (TOLERANCE_PCT > 0) {
    console.log('  ⚠ 허용치가 0이 아니다 — 만들어진 데이터셋은 명세보다 적을 수 있고,');
    console.log('    그 경우 지문이 달라져 온전한 데이터셋으로 잰 실행과 비교되지 않는다.');
  }
  const t0 = Date.now();

  // sampling.js는 k6가 요구하는 ESM이라 require()로 못 읽는다. 데이터를 만들기 전에
  // 받아 둔다 — hotPost()·hotAuthor()를 쓰는 단계보다 반드시 먼저 실행되는 자리다.
  ({ hotIndex, HOT_SKEW, AUTHOR_SKEW } = await import(
    require('url').pathToFileURL(path.join(__dirname, '..', 'scripts', 'lib', 'sampling.js')).href
  ));
  console.log(`분포: 게시글 인기 s=${HOT_SKEW} · 작성 활동 s=${AUTHOR_SKEW}`);

  // 생성기 지문을 먼저 구해 체크포인트와 대조한다 — 규칙이 바뀌었으면 재개하면 안 된다.
  const generatorVersion = computeGeneratorVersion();
  checkpoint.generatorVersion = generatorVersion;
  const cp = loadCheckpoint(generatorVersion);
  if (cp) {
    const done = Object.entries(cp.stages || {}).map(([k, v]) => `${k}=${v}`).join(' · ');
    console.log(`  재개: 완료된 단계를 건너뛴다 — ${done || '(없음)'}`);
    checkpoint.stages = { ...cp.stages };
    checkpoint.posts = cp.posts;
  }

  // 각 단계 뒤에 검문을 건다. 예전에는 1단계가 통째로 실패해도 2단계가 그대로 시작돼
  // 오류가 단계마다 증폭됐다 — 존재하지 않는 계정으로 로그인하고, 그 실패가 또 로그에만
  // 남는 식이다. 미달을 발견한 자리에서 멈추는 것이 가장 싸다.
  // 단계 결과를 모은다 — meta.json 의 stageCounts 가 여기서 나온다. 실제 생성 수가
  // 지문에 들어가야 "댓글이 조금 모자란 데이터셋"이 온전한 것과 구별된다.
  const stageResults = [];
  const check = (r) => { stageResults.push(requireComplete(r)); return r; };

  /*
   * 기존 산출물을 **먼저 지운다.**
   *
   * 이 시점부터 디스크의 JSON은 지금 만들고 있는 DB와 맞지 않는다. 성공하면 새로 쓰고,
   * 실패하면 남지 않는다 — 어느 쪽이든 "파일이 있으면 현재 DB를 설명한다"가 유지된다.
   *
   * 안 지우면 이렇게 된다(2026-08-14 실측): 볼륨을 폐기하고 재생성했는데 댓글 단계에서
   * 중단됐다. 산출물은 정책대로 쓰지 않았지만, **폐기 이전 세대의 users/posts/boards.json이
   * 그대로 남아** 있었다. 그 파일의 게시글 ID는 새 DB에 존재하지 않는다. meta.json이 없어
   * 지문 비교는 막히지만, k6는 posts.json을 직접 읽으므로 없는 ID로 요청을 보내게 된다.
   */
  if (fs.existsSync(OUT_DIR)) {
    fs.rmSync(OUT_DIR, { recursive: true, force: true });
    console.log(`  이전 산출물 제거: ${OUT_DIR} (지금 만드는 DB와 맞지 않는다)`);
  }

  const plan = buildUsers();

  // 회원가입·로그인·학교 배정은 재개해도 다시 한다 — 세션이 있어야 뒤 단계가 돌아가고,
  // 중복 가입은 409 로 성공 처리되므로 비용은 로그인 시간뿐이다(large 기준 수 분).
  check(await registerUsers(plan));

  const { sessions, result: loginResult } = await loginAll(plan);
  check(loginResult);
  check(await assignSchools(plan, sessions));

  const boards = await fetchBoards(sessions);          // 실패 시 자체적으로 throw

  let posts;
  if (alreadyDone(cp, 'posts', P.posts)) {
    // 게시글 목록은 체크포인트가 들고 있다. auto-increment ID 라 생성 순서 = ID 순서이고,
    // posts.json 의 "인기순 정렬" 전제가 그대로 유지된다.
    posts = cp.posts;
    stageResults.push(skipped('posts', P.posts, cp));
  } else {
    const r = await createPosts(plan, sessions, boards);
    posts = r.posts;
    check(r.result);
    saveCheckpoint('posts', r.result.ok, { posts });
  }

  // 하위 3단계(댓글·반응·스크랩)를 내부에서 검문하고 결과를 돌려준다
  stageResults.push(...await createEngagement(plan, sessions, posts, cp));

  if (alreadyDone(cp, 'friendships', P.friendships)) {
    stageResults.push(skipped('friendships', P.friendships, cp));
    // 채팅은 친구 쌍이 필요하다. 건너뛰면 그 목록이 없으므로 채팅도 함께 건너뛴다 —
    // 둘은 한 덩어리다.
    if (alreadyDone(cp, 'chat-rooms', Math.floor(P.friendships * P.chatRoomRatio))) {
      stageResults.push(skipped('chat-rooms', Math.floor(P.friendships * P.chatRoomRatio), cp));
    } else {
      console.log('  ⚠ 친구는 완료됐는데 채팅방이 미완이다 — 친구 단계를 다시 돌려 쌍을 얻는다.');
      const f = await createFriendships(plan, sessions);
      check(f.result);
      const c = await createChat(plan, sessions, f.pairs);
      check(c.result);
      saveCheckpoint('chat-rooms', c.result.ok);
    }
  } else {
    const f = await createFriendships(plan, sessions);
    check(f.result);
    saveCheckpoint('friendships', f.result.ok);
    const c = await createChat(plan, sessions, f.pairs);
    check(c.result);
    saveCheckpoint('chat-rooms', c.result.ok);
  }

  // --on-failure continue 로 여기까지 왔더라도 미달이면 산출물을 쓰지 않는다.
  // 반쪽짜리 JSON 이 파일로 남으면 다음 실행이 그걸 정상 데이터셋으로 착각한다.
  if (stageFailures.length) abortWithFailures();

  // 산출물에는 **실제로 존재가 확인된 사용자만** 담는다. 예전에는 계획 목록(buildUsers의
  // 반환값)을 그대로 썼기 때문에, 가입에 실패한 계정이 users.json 에 남아 k6가 존재하지
  // 않는 계정으로 로그인을 시도했다. 세션이 잡힌 계정만이 "가입 + 로그인 + 학교 배정"을
  // 전부 통과했다는 증거다.
  const confirmedUsers = plan.filter((_, i) => sessions[i]);
  const userShortfall = plan.length - confirmedUsers.length;
  if (userShortfall > allowedFailures(plan.length)) {
    // 위 검문을 통과했다면 도달할 수 없다. 도달했다면 검문에 구멍이 있다는 뜻이므로
    // 조용히 줄어든 파일을 쓰지 않고 멈춘다.
    console.error(`  ✗ 확인된 사용자 ${confirmedUsers.length}/${plan.length} — 검문을 통과했는데 수가 맞지 않는다.`);
    process.exit(1);
  }
  if (userShortfall > 0) {
    console.log(`  ↳ users.json 에는 세션이 확인된 ${confirmedUsers.length}명만 담는다 (계획 ${plan.length}명).`);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'users.json'),
    JSON.stringify(confirmedUsers.map((u) => ({ email: u.email, nickname: u.nickname })), null, 1));
  fs.writeFileSync(path.join(OUT_DIR, 'posts.json'),
    JSON.stringify(posts.map((p) => ({ id: p.id, boardId: p.boardId })), null, 1));
  fs.writeFileSync(path.join(OUT_DIR, 'boards.json'), JSON.stringify(boards, null, 1));

  const meta = buildMeta(confirmedUsers, posts, boards, stageResults);
  fs.writeFileSync(path.join(OUT_DIR, 'meta.json'), JSON.stringify(meta, null, 1));

  const verdict = toleratedStages.length
    ? `허용치 ${TOLERANCE_PCT}% 안에서 완료 — ${toleratedStages.length}개 단계가 명세 미달`
    : '전 단계 목표 수량 달성';
  console.log(`\n완료: ${((Date.now() - t0) / 1000 / 60).toFixed(1)}분 — ${verdict}`);
  if (toleratedStages.length) {
    // 마지막에 한 번 더 모아 보여준다. 단계별 로그는 긴 생성에서 스크롤 위로 사라진다.
    for (const t of toleratedStages) {
      console.log(`  · ${t.label}: 목표 ${t.target} / 생성 ${t.ok} (부족 ${t.missing}, 허용 ${t.allowed})`);
    }
    console.log('  이 데이터셋은 명세보다 적다. meta.json 의 tolerance 항목에 기록돼 있고,');
    console.log('  stageCounts 가 지문에 반영되므로 온전한 데이터셋과 비교되지 않는다.');
  }
  console.log(`산출물: ${OUT_DIR}/{users,posts,boards,meta}.json`);
  console.log(`데이터셋 지문: ${meta.fingerprint} (생성기 ${meta.generatorVersion})`);
  console.log(`k6 실행 시 -e DATASET=${PROFILE_NAME} 로 사용`);
  console.log('지문이 다른 데이터셋으로 잰 과거 실행과는 비교되지 않습니다 — 새 기준선이 필요합니다.');
}

/**
 * 직접 실행할 때만 돈다.
 *
 * require 로 불러도 서버에 접속하지 않아야 테스트가 본문 생성기 같은 순수 함수를 그대로
 * 검증할 수 있다. 예전에는 파일을 읽는 것만으로 시딩이 시작돼, 규칙을 테스트에 복사하는
 * 수밖에 없었다 — 그러면 구현과 테스트가 사이좋게 같이 틀린다.
 */
if (require.main === module) main().catch((e) => {
  // 이미 미달한 단계가 쌓여 있다면, 뒤에서 터진 오류는 **결과이지 원인이 아니다.**
  // `--on-failure continue`는 미달을 안고 끝까지 진행하므로, 뒤 단계가 앞 단계의 산출물을
  // 못 찾아 실패하는 것이 정상 경로다. 그때 스택 트레이스를 뱉고 종료 코드 2로 끝나면
  // "실행 오류"로 오독되고, 정작 사람이 봐야 할 단계별 미달 요약이 나오지 않는다.
  // 선언한 정책대로 요약을 내고 종료 코드 1로 끝낸다.
  if (stageFailures.length) {
    console.error(`\n  ↳ 이후 단계를 진행할 수 없어 중단: ${e.message}`);
    abortWithFailures();
  }
  console.error(e);
  process.exit(2);
});

module.exports = { commentText, postText, targetLength, buildText, COMMENT_PARTS, POST_PARTS };
