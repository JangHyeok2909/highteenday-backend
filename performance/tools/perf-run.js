#!/usr/bin/env node
/**
 * perf-run — 성능 테스트 실행의 단일 진입점.
 *
 * 왜 래퍼가 필요한가
 * ------------------
 * k6를 직접 치면 매번 세 가지를 사람이 챙겨야 한다.
 *   1) --summary-trend-stats 를 빼먹으면 P99가 아예 계산되지 않는다(조용히 누락된다).
 *   2) 브랜치/커밋/실행자 같은 메타데이터를 환경변수로 넘기는 걸 잊는다.
 *   3) 실행 후 수집기를 돌리는 걸 잊어서 운영 지표가 영영 연결되지 않는다.
 * 사람이 매번 기억해야 하는 절차는 결국 지켜지지 않는다. 그래서 한 명령으로 묶는다.
 *
 * 사용법
 *   node tools/perf-run.js scenarios/normal-day.js
 *   node tools/perf-run.js scripts/auth.js --vus 20 --duration 2m
 *   node tools/perf-run.js scenarios/spike.js --env staging --note "캐시 TTL 60s 실험"
 *
 * 옵션
 *   --vus <n>        VU 수 (스크립트가 __ENV.VUS 를 읽는 경우)
 *   --duration <d>   지속 시간
 *   --hold <d>       유지 구간 (ramping 시나리오)
 *   --env <name>     환경 이름 (기본 perf)
 *   --dataset <name> 데이터셋 프로파일 (기본 small)
 *   --note "<text>"  이 실행에 대한 메모 — 보고서 상단에 표시된다
 *   --warmup <sec>   k6 실행 계획의 ramp-up(warmup) 단계 자체를 이 길이로 만든다
 *                    (시나리오 기본값을 덮어씀 — -e WARMUP으로 전달, T-03/S-08).
 *                    수집기가 사후에 자르는 옵션이 아니다: k6 threshold와 Prometheus
 *                    조회 창이 둘 다 이 값을 기준으로 measure 구간을 판정한다.
 *                    미지정 시 시나리오 기본값 유지, 명시적 0은 "warmup 없음"으로 구분된다.
 *   --wait <sec>     스크레이프 대기 (기본 20)
 *   --no-collect     k6만 실행하고 수집은 건너뜀
 *   --no-gate        회귀가 있어도 exit 0
 *   -e KEY=VALUE     k6로 그대로 전달
 */
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const PERF_ROOT = path.resolve(__dirname, '..');
const RUNS_DIR = path.join(PERF_ROOT, 'reports', 'runs');

/** 스테이징(아직 수집 안 된) 결과 파일들의 runId 집합 */
function stagedRunIds() {
  if (!fs.existsSync(RUNS_DIR)) return new Set();
  return new Set(
    fs.readdirSync(RUNS_DIR)
      .filter((f) => f.endsWith('.k6.json'))
      .map((f) => f.slice(0, -'.k6.json'.length)),
  );
}

/**
 * k6 기본 요약은 p(99)를 계산하지 않는다. 이 플래그가 없으면 P99 칸이 영원히 비고,
 * 회귀 규칙의 P99 항목도 항상 건너뛰어진다. 요구사항에 P99가 있으므로 항상 강제한다.
 */
const TREND_STATS = 'avg,min,med,max,p(90),p(95),p(99)';

/**
 * k6 실행 파일. 기본은 PATH 의 `k6` 이고, `K6_BIN` 으로 특정 경로를 지정할 수 있다.
 *
 * 필요한 이유: Windows 에서 Chocolatey 로 설치하면 PATH 에 잡히는 건 실제 바이너리가 아니라
 * shim(.NET 어셈블리)이다. Application Control 정책이 이 shim 을 차단하면 k6 자체는 멀쩡한데
 * `spawnSync('k6')` 만 UNKNOWN 으로 실패한다 — 실제로 겪었고, 원인이 코드에 없어서 찾는 데
 * 시간이 걸렸다. 그때 실제 바이너리를 직접 가리킬 수단이 있어야 한다.
 *
 *   K6_BIN="C:/ProgramData/chocolatey/lib/k6/tools/k6-v2.1.0-windows-amd64/k6.exe" \
 *     node tools/perf-run.js scenarios/normal-day.js
 */
const K6_BIN = process.env.K6_BIN || 'k6';

function sh(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', cwd: PERF_ROOT });
  return r.status === 0 ? (r.stdout || '').trim() : null;
}

/**
 * Git 메타데이터 자동 수집.
 * CI가 넘겨준 값이 있으면 그걸 우선한다 — CI는 detached HEAD로 체크아웃하는 경우가 많아
 * `git rev-parse --abbrev-ref HEAD`가 "HEAD"를 뱉기 때문이다.
 */
function gitMeta() {
  const env = process.env;
  const branch =
    env.PERF_BRANCH || env.GITHUB_HEAD_REF || env.GITHUB_REF_NAME ||
    sh('git', ['rev-parse', '--abbrev-ref', 'HEAD']) || 'unknown';
  const commit = env.PERF_COMMIT || env.GITHUB_SHA || sh('git', ['rev-parse', 'HEAD']) || 'unknown';
  const dirty = sh('git', ['status', '--porcelain']);
  return {
    branch: branch === 'HEAD' ? 'detached' : branch,
    // 커밋되지 않은 변경이 있으면 표시한다. 나중에 "이 커밋으로 재현이 안 되는데?"를 막아준다.
    commit: commit + (dirty ? '+dirty' : ''),
    buildNumber: env.PERF_BUILD || env.GITHUB_RUN_NUMBER || 'local',
    executor:
      env.PERF_EXECUTOR || env.GITHUB_ACTOR ||
      `${env.USERNAME || env.USER || 'unknown'}@${env.COMPUTERNAME || env.HOSTNAME || 'local'}`,
  };
}

/** 스크립트 내용 해시 — "같은 스크립트로 잰 결과인가"를 나중에 판별하기 위한 지문. */
function scriptVersion(scriptPath) {
  try {
    const buf = fs.readFileSync(path.resolve(PERF_ROOT, scriptPath));
    return 'sha256:' + crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12);
  } catch (e) {
    return 'unknown';
  }
}

function parseArgs(argv) {
  const o = {
    script: null, vus: null, duration: null, hold: null, env: 'perf', dataset: null,
    // warmup은 undefined가 기본값이다(0이 아니다) — "지정 안 함"과 "명시적으로 0"을
    // 구분해야 한다(T-03). 0으로 두면 --warmup 0을 준 것과 아예 안 준 것을 구별할 수
    // 없어, k6로 WARMUP을 전달해야 하는지 판단이 틀어진다.
    note: '', warmup: undefined, wait: 20, collect: true, gate: true, passthrough: [], k6Extra: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--vus') o.vus = argv[++i];
    else if (a === '--duration') o.duration = argv[++i];
    else if (a === '--hold') o.hold = argv[++i];
    else if (a === '--env') o.env = argv[++i];
    else if (a === '--dataset') o.dataset = argv[++i];
    else if (a === '--note') o.note = argv[++i];
    else if (a === '--warmup') o.warmup = Number(argv[++i]);
    else if (a === '--wait') o.wait = Number(argv[++i]);
    else if (a === '--no-collect') o.collect = false;
    else if (a === '--no-gate') o.gate = false;
    else if (a === '-e') o.passthrough.push('-e', argv[++i]);
    else if (a.startsWith('--k6:')) o.k6Extra.push('--' + a.slice(5), argv[++i]);
    else if (!o.script && !a.startsWith('-')) o.script = a;
    else o.k6Extra.push(a);
  }
  if ((o.warmup !== undefined && !Number.isFinite(o.warmup)) || !Number.isFinite(o.wait)) {
    console.error('--warmup / --wait 값이 숫자가 아닙니다.');
    process.exit(2);
  }
  return o;
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  if (!o.script) {
    console.error('사용법: node tools/perf-run.js <script.js> [옵션]');
    console.error('예시  : node tools/perf-run.js scenarios/normal-day.js --note "인덱스 추가 후"');
    process.exit(2);
  }
  if (!fs.existsSync(path.resolve(PERF_ROOT, o.script))) {
    console.error(`스크립트를 찾을 수 없습니다: ${o.script}`);
    process.exit(2);
  }

  const git = gitMeta();
  const env = {
    ...process.env,
    PERF_ENV: o.env,
    PERF_BRANCH: git.branch,
    PERF_COMMIT: git.commit,
    PERF_BUILD: git.buildNumber,
    PERF_EXECUTOR: git.executor,
    PERF_SCRIPT_VERSION: scriptVersion(o.script),
    PERF_NOTE: o.note,
  };
  if (o.dataset) env.DATASET = o.dataset;

  const args = ['run', o.script, '--summary-trend-stats', TREND_STATS];
  if (o.vus) args.push('-e', `VUS=${o.vus}`);
  if (o.duration) args.push('-e', `DURATION=${o.duration}`);
  if (o.hold) args.push('-e', `HOLD=${o.hold}`);
  // warmup은 이제 k6 실행 계획 자체를 바꾼다(T-03/S-08) — collect.js에 별도로 넘기지
  // 않는다. undefined(미지정)면 시나리오의 phasePlan 기본값이 그대로 쓰인다.
  if (o.warmup !== undefined) args.push('-e', `WARMUP=${o.warmup}`);
  args.push(...o.passthrough, ...o.k6Extra);

  console.log(`\n▶ k6 run ${o.script}`);
  console.log(`  브랜치 ${git.branch} · 커밋 ${git.commit.slice(0, 12)} · 실행자 ${git.executor}`);
  console.log(`  환경 ${o.env}${o.note ? ` · "${o.note}"` : ''}\n`);

  // 이번 실행이 남긴 결과 파일을 식별하기 위해 실행 전 스테이징 상태를 찍어 둔다.
  // 수집기에 runId 를 넘기지 않으면 "가장 최근 pending"을 고르는데, 다른 시나리오의
  // 수집 실패 잔여물이 남아 있으면 엉뚱한 실행을 수집하게 된다.
  const stagedBefore = stagedRunIds();

  const k6 = spawnSync(K6_BIN, args, { stdio: 'inherit', env, cwd: PERF_ROOT });

  if (k6.error) {
    console.error(`k6 실행 실패: ${k6.error.message} (실행 파일: ${K6_BIN})`);
    console.error('k6가 PATH에 있는지 확인하세요. PATH의 k6가 실행 차단된 경우(Windows의');
    console.error('Chocolatey shim 등) K6_BIN 으로 실제 바이너리 경로를 지정할 수 있습니다.');
    process.exit(2);
  }

  // k6는 threshold 미달 시 exit 99로 끝난다. 그래도 결과는 수집해야 한다 —
  // 오히려 실패한 실행일수록 운영 지표를 보고 원인을 찾아야 하기 때문이다.
  const k6Failed = k6.status !== 0;
  if (k6Failed) console.warn(`\n⚠ k6 종료 코드 ${k6.status} (threshold 미달 가능) — 수집은 계속합니다.\n`);

  // k6 가 handleSummary 전에 죽으면(패닉/OOM/시그널) 결과 파일이 없다.
  // 그 상태로 수집기를 돌리면 무관한 과거 실행을 이번 결과처럼 보고하게 된다.
  const newIds = [...stagedRunIds()].filter((id) => !stagedBefore.has(id));
  if (newIds.length === 0) {
    console.error('k6가 결과 파일(reports/runs/<runId>.k6.json)을 남기지 않았습니다 — 수집을 건너뜁니다.');
    process.exit(k6.status == null ? 1 : k6.status || 1);
  }
  const runId = newIds.length === 1
    ? newIds[0]
    : newIds
        .sort((a, b) =>
          fs.statSync(path.join(RUNS_DIR, `${a}.k6.json`)).mtimeMs -
          fs.statSync(path.join(RUNS_DIR, `${b}.k6.json`)).mtimeMs)
        .pop();

  if (!o.collect) process.exit(k6.status == null ? 1 : k6.status);

  const collectArgs = [path.join(__dirname, 'collect.js'), runId, '--wait', String(o.wait)];
  if (!o.gate) collectArgs.push('--no-gate');

  const col = spawnSync(process.execPath, collectArgs, { stdio: 'inherit', cwd: PERF_ROOT });

  if (col.error) {
    console.error(`수집기 실행 실패: ${col.error.message}`);
    process.exit(2);
  }
  // 최종 종료 코드: k6 threshold 실패와 회귀 게이트 실패 둘 다 실패로 본다.
  // col.status 가 null(시그널 종료)인 경우도 성공(0)으로 새면 안 된다.
  const colStatus = col.status == null ? 2 : col.status;
  process.exit(colStatus !== 0 ? colStatus : k6Failed ? 1 : 0);
}

if (require.main === module) main();
