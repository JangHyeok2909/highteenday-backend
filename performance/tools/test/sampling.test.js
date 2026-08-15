'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const url = require('url');

/**
 * scripts/lib/sampling.js 는 ES 모듈이다(k6가 이 문법만 받는다). thresholds.test.js 와 같은
 * 이유로 `await import()`로 동적 로드한다.
 *
 * 이 파일이 검증하는 것은 "부하가 어느 데이터로 흘러가는가"다. 샘플러가 틀리면 서버는
 * 멀쩡한데 측정 결과만 현실과 어긋나고, 그건 리포트 어디에도 오류로 드러나지 않는다.
 *
 * **알고리즘을 여기 복사하지 않는다.** 기대값은 구현과 독립적인 닫힌 식(headShare)이나
 * 손으로 계산 가능한 성질(합=1, 범위, 경계)에서 얻는다. 복사하면 구현과 테스트가
 * 사이좋게 같이 틀린다.
 */
const PERF_ROOT = path.join(__dirname, '..', '..');
const esm = (rel) => import(url.pathToFileURL(path.join(PERF_ROOT, 'scripts', 'lib', rel)).href);
const loadSampling = () => esm('sampling.js');

/** 고정 시드 LCG — 표본 검정이 실행할 때마다 다른 결과를 내면 회귀 테스트가 아니다. */
function lcg(seed) {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

const DATASET_SIZES = [500, 10000, 100000]; // small / medium / large 의 posts 수

// ---------------------------------------------------------------------------
// hotIndex — S-03 의 본체. index 0 을 뽑지 못하던 회귀를 여기서 막는다.
// ---------------------------------------------------------------------------

test('hotIndex: index 0(최고 인기글)이 실제로 선택된다 — S-03 회귀', async () => {
  const { hotIndex } = await loadSampling();
  for (const n of DATASET_SIZES) {
    const rng = lcg(20260813);
    let hits = 0;
    for (let i = 0; i < 100000; i++) if (hotIndex(n, undefined, rng) === 0) hits++;
    assert.ok(hits > 0, `n=${n}: index 0 이 한 번도 선택되지 않았다 — 옛 zipfIndex 버그의 재발이다`);
  }
});

test('hotIndex: 마지막 인덱스(n-1)도 선택된다 — "-1 보정"으로 고치면 여기서 걸린다', async () => {
  const { hotIndex } = await loadSampling();
  // 옛 식은 치역이 1..n-1 이었다. 거기에 1을 빼면 0..n-2 가 되어 꼴찌가 사라진다.
  // n 을 작게 잡아야 꼬리 확률이 관측 가능한 크기가 된다.
  const n = 50;
  const rng = lcg(4242);
  let sawLast = false;
  for (let i = 0; i < 200000; i++) if (hotIndex(n, undefined, rng) === n - 1) { sawLast = true; break; }
  assert.ok(sawLast, `n=${n}: 마지막 인덱스 ${n - 1} 이 선택되지 않았다 — 반대 방향 off-by-one 이다`);
});

test('hotIndex: 모든 표본이 0 <= index < n 범위 안에 있다', async () => {
  const { hotIndex } = await loadSampling();
  for (const n of DATASET_SIZES) {
    const rng = lcg(99);
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 200000; i++) {
      const idx = hotIndex(n, undefined, rng);
      if (idx < min) min = idx;
      if (idx > max) max = idx;
    }
    assert.ok(min >= 0, `n=${n}: 음수 인덱스 ${min} 이 나왔다`);
    assert.ok(max < n, `n=${n}: 범위를 넘는 인덱스 ${max} 가 나왔다`);
    assert.equal(min, 0, `n=${n}: 최소값이 0 이어야 한다`);
  }
});

test('hotIndex: n=1 이면 항상 0 을 준다 (경계)', async () => {
  const { hotIndex } = await loadSampling();
  const rng = lcg(7);
  for (let i = 0; i < 1000; i++) assert.equal(hotIndex(1, undefined, rng), 0);
});

test('hotIndex: 빈 데이터셋은 조용히 넘어가지 않고 즉시 실패한다', async () => {
  const { hotIndex } = await loadSampling();
  // posts.json 이 비어 있으면 예전에는 posts[-1] === undefined 가 흘러가 원인 불명의
  // 404/NPE 로 나타났다. 데이터 문제는 데이터 단계에서 드러나야 한다.
  assert.throws(() => hotIndex(0), /1 이상의 정수/);
  assert.throws(() => hotIndex(-3), /1 이상의 정수/);
});

// ---------------------------------------------------------------------------
// 분포 형태 — 표본이 이론값(headShare)에 수렴하는가.
// ---------------------------------------------------------------------------

test('hotIndex: 표본 분포가 이론 누적분포와 일치한다 (상위 1개·10개·200개)', async () => {
  const { hotIndex, headShare } = await loadSampling();
  const SAMPLES = 500000;
  const TOLERANCE = 0.005; // 표본 50만에서 이항 표준편차는 최대 0.07%p — 0.5%p 면 충분히 넉넉하다

  for (const n of DATASET_SIZES) {
    for (const m of [1, 10, 200]) {
      const rng = lcg(20260813);
      let hits = 0;
      for (let i = 0; i < SAMPLES; i++) if (hotIndex(n, undefined, rng) < m) hits++;
      const observed = hits / SAMPLES;
      const expected = headShare(n, m);
      assert.ok(
        Math.abs(observed - expected) < TOLERANCE,
        `n=${n} 상위 ${m}개: 실측 ${(observed * 100).toFixed(2)}% vs 이론 ${(expected * 100).toFixed(2)}% — 허용 오차 ${TOLERANCE * 100}%p 초과`,
      );
    }
  }
});

test('headShare: 데이터셋이 커지면 같은 절대 개수(상위 200개)가 덮는 비중이 줄어든다', async () => {
  const { headShare } = await loadSampling();
  // s 를 고정했을 때 기대되는 성질이자, 캐시·버퍼풀 실험이 보고 싶은 현상 그 자체다.
  // "N 이 달라도 상위 20% 비율이 유지되는가"는 s 고정 하에서는 성립할 수 없으므로
  // (그러려면 n 마다 s 를 다시 풀어야 한다) 검증 대상을 절대 개수 기준으로 바꿨다.
  const shares = DATASET_SIZES.map((n) => headShare(n, 200));
  for (let i = 1; i < shares.length; i++) {
    assert.ok(
      shares[i] < shares[i - 1],
      `n=${DATASET_SIZES[i]} 의 상위 200개 비중(${shares[i].toFixed(3)})이 ` +
      `n=${DATASET_SIZES[i - 1]}(${shares[i - 1].toFixed(3)}) 보다 작아야 한다`,
    );
  }
  // 경계 조건: 상위 n개는 전체(=1), 상위 0개는 0.
  for (const n of DATASET_SIZES) {
    assert.ok(Math.abs(headShare(n, n) - 1) < 1e-9, `n=${n}: 상위 n개는 100% 여야 한다`);
    assert.equal(headShare(n, 0), 0);
  }
});

// ---------------------------------------------------------------------------
// pageIndex — S-04. 0페이지가 한 번도 요청되지 않던 문제.
// ---------------------------------------------------------------------------

test('PAGE_WEIGHTS: 비율 합이 정확히 1 이고 0~4 다섯 페이지를 덮는다', async () => {
  const { PAGE_WEIGHTS } = await loadSampling();
  assert.equal(PAGE_WEIGHTS.length, 5, '게시판 목록은 0~4페이지를 다룬다');
  const sum = PAGE_WEIGHTS.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, `가중치 합이 ${sum} 이다 — 1 이어야 한다`);
  for (const w of PAGE_WEIGHTS) assert.ok(w > 0, '비중이 0인 페이지가 있으면 그 페이지는 영원히 측정되지 않는다');
});

test('pageIndex: 0페이지가 선택되고 실제 비율이 선언한 목표와 일치한다 — S-04 회귀', async () => {
  const { pageIndex, PAGE_WEIGHTS } = await loadSampling();
  const SAMPLES = 200000;
  const TOLERANCE = 0.005; // ±0.5%p. N=20만에서 p=0.55의 표준편차는 0.11%p 라 여유가 있다
  const rng = lcg(20260813);
  const counts = new Array(PAGE_WEIGHTS.length).fill(0);
  for (let i = 0; i < SAMPLES; i++) counts[pageIndex(rng)]++;

  assert.ok(counts[0] > 0, '0페이지가 한 번도 선택되지 않았다 — S-04 의 재발이다');
  counts.forEach((c, i) => {
    const observed = c / SAMPLES;
    assert.ok(
      Math.abs(observed - PAGE_WEIGHTS[i]) < TOLERANCE,
      `${i}페이지: 실측 ${(observed * 100).toFixed(2)}% vs 목표 ${(PAGE_WEIGHTS[i] * 100).toFixed(0)}% — 허용 오차 초과`,
    );
  });
});

test('weightedIndex: 범위를 벗어나지 않고 마지막 항목으로 안전하게 떨어진다', async () => {
  const { weightedIndex } = await loadSampling();
  const w = [0.5, 0.3, 0.2];
  // u=0 은 첫 항목, u→1 은 마지막 항목이어야 한다.
  assert.equal(weightedIndex(w, () => 0), 0);
  assert.equal(weightedIndex(w, () => 0.9999999), 2);
  // 부동소수 누적 오차로 합이 1에 아주 조금 못 미쳐도 범위를 넘지 않는다.
  assert.equal(weightedIndex([0.3333333, 0.3333333, 0.3333333], () => 0.99999999), 2);
});

// ---------------------------------------------------------------------------
// 두 축의 분리 — 게시글 인기도와 작성 활동량은 다른 분포다.
// ---------------------------------------------------------------------------

test('AUTHOR_SKEW 와 HOT_SKEW 는 서로 다른 값이다', async () => {
  const { HOT_SKEW, AUTHOR_SKEW } = await loadSampling();
  // 한동안 둘 다 1.07 이었고, 그건 datasets/README.md 가 선언한 작성자 s≈1.7 과 어긋난
  // 상태였다. 두 값을 다시 하나로 합치면 이 테스트가 막는다.
  assert.notEqual(AUTHOR_SKEW, HOT_SKEW, '작성 활동과 게시글 인기가 같은 지수를 쓰면 안 된다');
  assert.equal(HOT_SKEW, 1.07);
  // 1.3은 옛 DB의 실제 작성 분포에 맞춘 값이다. 문서에 오래 적혀 있던 1.7은 옛 버그
  // 수식의 상수를 잘못 읽은 것이라 채택하지 않았다 — sampling.js 주석의 표 참고.
  assert.equal(AUTHOR_SKEW, 1.3);
});

test('작성자 편중이 극단으로 가지 않는다 — 소수가 전부를 쓰면 작성자 조회를 못 잰다', async () => {
  const { headShare, AUTHOR_SKEW } = await loadSampling();
  // s=1.7 이면 상위 1%가 96%를 가져가 10,000명 중 8,600여 명의 글이 0건이 된다.
  // 그러면 마이페이지·작성글 목록이 사실상 몇백 명만 대상이 되어 측정 대상이 달라진다.
  const top1Pct = headShare(10000, 100, AUTHOR_SKEW);
  assert.ok(top1Pct < 0.9,
    `상위 1% 작성 비중이 ${(top1Pct * 100).toFixed(1)}% — 90% 이상이면 작성자 다양성이 사라진다`);
  assert.ok(top1Pct > 0.5,
    `상위 1% 작성 비중이 ${(top1Pct * 100).toFixed(1)}% — 헤비 유저 편중이 너무 약하다`);
});

test('작성 활동이 게시글 인기보다 더 강하게 쏠린다 — 1% 법칙', async () => {
  const { headShare, HOT_SKEW, AUTHOR_SKEW } = await loadSampling();
  // 같은 모집단에서 상위 1% 가 가져가는 비중을 비교한다. 지수가 클수록 집중도가 높다.
  for (const n of [10000, 100000]) {
    const top = Math.floor(n / 100);
    const author = headShare(n, top, AUTHOR_SKEW);
    const hot = headShare(n, top, HOT_SKEW);
    assert.ok(author > hot,
      `n=${n}: 작성 활동(${(author * 100).toFixed(1)}%)이 게시글 인기(${(hot * 100).toFixed(1)}%)보다 쏠려야 한다`);
  }
});

test('seed.js 가 작성자와 게시글에 서로 다른 샘플러를 쓴다', () => {
  // 호출부가 하나로 합쳐지면(예전의 zipf() 하나) 상수를 분리해 둔 의미가 사라진다.
  const src = fs.readFileSync(path.join(PERF_ROOT, 'datasets', 'seed.js'), 'utf8');
  assert.ok(/function hotAuthor\(/.test(src), 'seed.js 에 hotAuthor() 가 없다');
  assert.ok(/function hotPost\(/.test(src), 'seed.js 에 hotPost() 가 없다');
  assert.ok(!/\bzipf\s*\(/.test(src.replace(/\/\/.*$/gm, '')),
    'seed.js 에 합쳐진 zipf() 호출이 남아 있다 — 작성자와 게시글은 다른 분포다');
});

// ---------------------------------------------------------------------------
// 구조 — 같은 버그가 다시 복제되지 않게 막는다.
// ---------------------------------------------------------------------------

test('샘플링 규칙이 한 곳에만 존재한다 — data.js 와 seed.js 가 공용 모듈을 쓴다', () => {
  // S-03 의 본질은 "수식이 틀렸다"가 아니라 "같은 수식이 두 곳에 복사돼 있었다"였다.
  // 부하 쪽만 고치면 시드 데이터의 index 0 은 여전히 참여 데이터가 없는 글로 남는다.
  const targets = [
    path.join(PERF_ROOT, 'scripts', 'lib', 'data.js'),
    path.join(PERF_ROOT, 'datasets', 'seed.js'),
  ];
  for (const file of targets) {
    const src = fs.readFileSync(file, 'utf8');
    assert.ok(
      /sampling\.js/.test(src),
      `${path.basename(file)} 가 공용 샘플러(sampling.js)를 쓰지 않는다`,
    );
    assert.ok(
      !/Math\.pow\(\s*n\s*,\s*Math\.pow\(/.test(src),
      `${path.basename(file)} 에 옛 Zipf 근사식이 남아 있다 — 규칙은 sampling.js 에만 있어야 한다`,
    );
  }
});
