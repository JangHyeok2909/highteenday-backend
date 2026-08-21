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
 *   --rate <n>       초당 iteration 도착률. 주면 시나리오가 **open model** 로 돈다.
 *                    closed model 은 시스템이 느려지면 부하도 함께 줄어(coordinated
 *                    omission) 판정용 값으로 쓸 수 없다. 판정에는 이 옵션을 쓴다.
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
 *   --guard <mode>   데이터셋 상태 강제 수준 off|warn|strict (tools/lib/guard.js)
 *                    미지정 시 PERF_DATASET_GUARD → perf.config.json → off 순으로 결정된다.
 *   --no-remote-write  k6 지표를 Prometheus 로 흘려보내지 않는다 (기본은 흘려보냄).
 *                    끄면 그 실행은 p95 시계열이 남지 않아 사후 재질의가 불가능하다.
 *   --no-bench       CPU 대조 벤치(실행 전 + 부하 중)를 둘 다 건너뛴다.
 *                    이 값이 없으면 나중에 "그때 환경이 느렸나"를 소급 확인할 수 없다.
 *   --loadbench-at <sec>  부하 중 벤치를 k6 시작 후 몇 초에 돌릴지 직접 지정한다.
 *                    미지정 시 --warmup 의 1/3 지점으로 정한다. warmup 이 짧거나
 *                    지정되지 않았으면 measure 창 침범을 피해 아예 재지 않는다.
 *   -e KEY=VALUE     k6로 그대로 전달
 */
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const dbstate = require('./lib/dbstate');
const guard = require('./lib/guard');
const snapshot = require('./snapshot');
const hostprobe = require('./lib/hostprobe');
const loadbench = require('./lib/loadbench');
const cpuBench = require('./cpu-bench');
const { acquireRunLock } = require('./lib/run-lock');

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

/**
 * 부하 발생기를 컨테이너로 돌리기 위한 설정(E-01).
 *
 * 왜 필요한가: k6 가 Windows 네이티브 프로세스면 **아무도 그것을 측정하지 못한다.**
 * cAdvisor 는 컨테이너만 보고, node-exporter 가 보는 "호스트"는 WSL2 VM 이라 그 밖에서 도는
 * k6.exe 가 잡히지 않는다. 그래서 "이 실행의 지연이 서버 탓인지 부하 발생기가 CPU 를
 * 뺏은 탓인지"를 사후에 판별할 수 없었다.
 *
 * 컨테이너로 돌리면 세 가지가 생긴다.
 *   1) cAdvisor 가 `perf-k6` 를 별도 컨테이너로 계측한다 (loadgen 지표 그룹)
 *   2) `--cpus` 로 상한을 걸 수 있어 발생기가 서버를 굶기는 정도를 통제할 수 있다
 *   3) throttled 비율이 0 이 아니면 **그 실행은 발생기가 먼저 한계에 걸린 것**임을 알 수 있다
 *
 * 물리적 분리(다른 머신)가 최선이지만 그건 장비 문제다. 이건 그 전 단계 —
 * "분리하지 못했다면 최소한 얼마나 먹었는지는 기록한다".
 */
/**
 * **로컬 k6 바이너리와 같은 버전이어야 한다.** k6 버전은 실행 조건이라, local 로 잰 실행과
 * docker 로 잰 실행의 버전이 다르면 두 결과를 나란히 놓을 수 없다. 게다가 낮은 버전은
 * JS 문법 자체를 못 읽는다 — 0.49.0 으로 돌려 보니 `scripts/lib/config.js` 의 객체 스프레드
 * (`...extra`)에서 SyntaxError 로 죽었다(실측).
 */
const K6_IMAGE = process.env.K6_IMAGE || 'grafana/k6:2.1.0';
const K6_NETWORK = process.env.K6_NETWORK || 'environment_default';
const LOADGEN_CT = process.env.PERF_LOADGEN_CONTAINER || 'perf-k6';
/** 컨테이너 안에서는 호스트 포트가 아니라 compose 서비스 이름으로 붙는다. */
const K6_DOCKER_BASE_URL = process.env.K6_DOCKER_BASE_URL || 'http://app:8080';
const K6_CPUS = process.env.K6_CPUS || '4';

/**
 * k6 지표를 Prometheus 로 remote-write 한다.
 *
 * 무엇이 없었나: k6 는 실행이 끝난 뒤 `handleSummary()` 로 **요약본 하나**만 남긴다.
 * 20분을 돌려도 그 20분 동안 p95 가 어떻게 움직였는지는 어디에도 기록되지 않았다.
 * 인프라(앱·MySQL·Redis·호스트)만 5초 간격 시계열이고, 정작 **판정 지표인 k6 쪽이
 * 시계열이 아니었다.** 그래서 "측정 구간을 20분에서 5분으로 줄여도 되나"에 답하려다
 * 막혔다 — 저장된 실행에서 앞 5분만 잘라 p95 를 다시 계산할 데이터가 없었다.
 *
 * 왜 native histogram 인가: `K6_PROMETHEUS_RW_TREND_STATS` 방식은 5초마다 **이미
 * 계산된 p95 하나**를 보낸다. 그런데 분위수는 구간끼리 합산되지 않는다 — 5초 구간
 * p95 240개를 평균해도 20분 p95가 나오지 않는다. 원본 분포(버킷)를 보내야 임의
 * 구간의 분위수를 정확히 계산할 수 있다:
 *   histogram_quantile(0.95, sum(rate(k6_http_req_duration[5m])))
 * 이 방식은 Prometheus 쪽 `--enable-feature=native-histograms` 가 함께 켜져 있어야
 * 한다(docker-compose.perf.yml).
 *
 * 주소가 모드마다 다르다: `local` 은 Windows 프로세스라 퍼블리시된 127.0.0.1:9090 으로,
 * `docker` 는 컨테이너 네트워크 안이라 서비스 이름 `prometheus:9090` 으로 붙는다.
 */
const K6_RW_URL_LOCAL = process.env.K6_RW_URL_LOCAL || 'http://localhost:9090/api/v1/write';
const K6_RW_URL_DOCKER = process.env.K6_RW_URL_DOCKER || 'http://prometheus:9090/api/v1/write';
/** 인프라 스크레이프 간격(5s)과 맞춘다 — 두 계열을 같은 시간축에 겹쳐 보기 위함. */
const K6_RW_PUSH_INTERVAL = process.env.K6_RW_PUSH_INTERVAL || '5s';

/** k6 로 넘길 remote-write 환경변수. 컨테이너 모드면 `-e` 로 그대로 전달된다. */
const K6_RW_ENV_KEYS = [
  'K6_PROMETHEUS_RW_SERVER_URL',
  'K6_PROMETHEUS_RW_PUSH_INTERVAL',
  'K6_PROMETHEUS_RW_TREND_AS_NATIVE_HISTOGRAM',
  'K6_PROMETHEUS_RW_STALE_MARKERS',
];

function remoteWriteEnv(loadgenMode) {
  return {
    K6_PROMETHEUS_RW_SERVER_URL: loadgenMode === 'docker' ? K6_RW_URL_DOCKER : K6_RW_URL_LOCAL,
    K6_PROMETHEUS_RW_PUSH_INTERVAL: K6_RW_PUSH_INTERVAL,
    K6_PROMETHEUS_RW_TREND_AS_NATIVE_HISTOGRAM: 'true',
    // 테스트가 끝나면 계열에 stale 표식을 찍는다. 없으면 Prometheus 가 마지막 값을
    // 5분간 그대로 이어 그려서, 실행이 끝난 뒤에도 VU 가 200명인 것처럼 보인다.
    K6_PROMETHEUS_RW_STALE_MARKERS: 'true',
  };
}

/** Docker Desktop 은 `C:/x/y` 는 받지만 Git Bash 스타일 `/c/x/y` 는 못 받는다. */
const dockerPath = (p) => path.resolve(p).replace(/\\/g, '/');

/**
 * `docker run` 인자 조립. k6 이미지의 entrypoint 가 `k6` 라 인자는 `run …` 부터 시작한다.
 * 스크립트·데이터셋·결과 파일이 전부 performance/ 아래에 있으므로 그 디렉터리 하나만 붙인다.
 */
function dockerK6Args(k6Args, env) {
  const passthrough = [
    'PERF_ENV', 'PERF_BRANCH', 'PERF_COMMIT', 'PERF_BUILD', 'PERF_EXECUTOR',
    'PERF_SCRIPT_VERSION', 'PERF_NOTE', 'PERF_DATASET_FINGERPRINT', 'DATASET',
    // remote-write 설정. 컨테이너 안의 k6 는 호스트 환경변수를 물려받지 않으므로
    // 여기서 명시적으로 넣지 않으면 `-o experimental-prometheus-rw` 가 기본 주소
    // (http://localhost:9090)로 붙었다가 조용히 전송에 실패한다.
    ...K6_RW_ENV_KEYS,
  ];
  const args = [
    'run', '--rm', '--name', LOADGEN_CT,
    '--network', K6_NETWORK,
    '--cpus', K6_CPUS,
    '-v', `${dockerPath(PERF_ROOT)}:/perf`,
    '-w', '/perf',
    '-e', `BASE_URL=${K6_DOCKER_BASE_URL}`,
  ];
  for (const k of passthrough) {
    if (env[k] != null && env[k] !== '') args.push('-e', `${k}=${env[k]}`);
  }
  args.push(K6_IMAGE, ...k6Args);
  return args;
}

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

/**
 * 부하의 **성격**을 결정하는 공용 모듈들.
 *
 * 예전에는 진입 스크립트 파일 하나만 해싱했다. 그런데 실제로 "어느 데이터에 얼마나 요청을
 * 보내는가"를 정하는 코드는 진입 파일이 아니라 여기 있는 공용 모듈들이다. 그래서
 * `sampling.js`의 분포를 바꿔도 `scenarios/normal-day.js`의 해시는 그대로였고, 트래픽
 * 형태가 완전히 달라진 실행이 옛 실행과 `exact` 비교 가능으로 판정됐다.
 *
 * **`scripts/lib/` 전체를 넣지 않는 이유:** 그 디렉터리에는 `config.js`, `session.js`,
 * `summary.js`, `thresholds.js`처럼 부하 형태와 무관한 이유로 자주 바뀌는 파일이 섞여 있다.
 * 전부 넣으면 거의 모든 실행이 `degraded`로 표시되어 경고가 상시 켜지고, 결국 아무도 안 본다.
 * 지문이 답해야 하는 질문은 "코드가 바뀌었나"가 아니라 **"부하의 성격이 바뀌었나"**다.
 *
 * 목록을 손으로 관리하는 대신 얻는 것: 경고가 뜨면 그건 진짜로 봐야 하는 경고다.
 * 목록이 실제 파일과 어긋나면 `tools/test/script-fingerprint.test.js`가 실패한다.
 */
const TRAFFIC_SHAPING_FILES = [
  'scenarios/lib/workload.js',  // 여정 구성과 여정별 가중치
  'scripts/lib/data.js',        // 시드 데이터 로딩과 대상 선택
  'scripts/lib/sampling.js',    // 인기 편중·페이지 분포 규칙
];

/**
 * 스크립트 지문 — "같은 성격의 부하로 잰 결과인가"를 나중에 판별하기 위한 값.
 *
 * 진입 스크립트 + 위 공용 모듈들을 경로와 함께 해싱한다. 경로를 같이 넣는 이유는 파일이
 * 이름만 바뀌어 내용이 그대로일 때도 지문이 달라지게 하기 위함이다.
 *
 * 목록의 파일이 사라졌으면 `<missing>` 표식을 해시에 넣는다. 조용히 건너뛰면 목록이
 * 낡았을 때 **지문이 그대로 유지되어** 원래 막으려던 상황이 그대로 재현된다.
 */
function scriptVersion(scriptPath) {
  const parts = [];
  let entryOk = true;

  for (const rel of [scriptPath, ...TRAFFIC_SHAPING_FILES]) {
    let content;
    try {
      content = fs.readFileSync(path.resolve(PERF_ROOT, rel));
    } catch (e) {
      if (rel === scriptPath) entryOk = false;
      else console.warn(`⚠ 지문 대상 파일을 읽지 못했습니다: ${rel} — TRAFFIC_SHAPING_FILES 목록이 낡았는지 확인하세요.`);
      content = '<missing>';
    }
    // 구분자를 넣어 "파일 A의 끝 + 파일 B의 시작"이 다른 조합과 같은 바이트열이 되는
    // 경계 모호성을 없앤다.
    parts.push(`${rel}\0`, content, '\0');
  }

  // 진입 스크립트 자체를 못 읽으면 예전처럼 'unknown'을 준다 — conditions.js 의
  // isUnknown()이 이 값을 "판정하지 않음"으로 다루는 계약을 깨지 않기 위해서다.
  if (!entryOk) return 'unknown';

  const h = crypto.createHash('sha256');
  for (const p of parts) h.update(p);
  return 'sha256:' + h.digest('hex').slice(0, 12);
}

/**
 * 데이터셋 지문 — 시드 데이터가 "같은 규칙으로 만들어진 같은 데이터"인지 판별한다(B).
 *
 * 프로파일 이름(`large`)만으로는 부족하다. 생성기의 샘플러를 고쳐 데이터를 다시 만들어도
 * 이름은 그대로 `large`라서, 인기 분포가 완전히 달라진 데이터셋이 옛 실행과 같은 조건으로
 * 비교된다. `datasets/seed.js`가 생성 시점에 남기는 `meta.json`의 지문을 읽어 조건에 싣는다.
 *
 * 파일이 없으면 null — 이 변경 이전에 만든 데이터셋이다. 그 경우 conditions.js 가
 * "지문 없음"으로 표시하고, 지문이 있는 실행과는 비교하지 않는다(blocking).
 */
function datasetFingerprint(name) {
  if (!name) return null;
  const file = path.join(PERF_ROOT, 'datasets', 'generated', name, 'meta.json');
  try {
    const meta = JSON.parse(fs.readFileSync(file, 'utf8'));
    return meta.fingerprint || null;
  } catch (e) {
    return null;
  }
}

/**
 * 실행 전 데이터셋 상태 확인 — guard 모드에 따라 기록만 하거나, 경고하거나, 복원한다.
 *
 * 상태 지문은 **모드와 무관하게 항상 계산한다**(실측 0.4초). 안 재 두면 나중에 guard 를
 * 켰을 때 과거 실행 전부가 비교 불가가 된다. 항상 재 두면 모드를 바꿔도
 * `history.js --rebuild` 로 소급 적용된다.
 *
 * @returns {object} run 레코드에 실릴 데이터셋 상태 블록
 */
function preflight(profile, g) {
  const before = dbstate.computeState();
  // 캐시 상태는 복원 여부와 **무관하게** 잰다. 복원할 때만 남기면 복원이 없었던 실행은
  // warm 이었는지 cold 였는지 알 수 없고, 그러면 두 실행을 나란히 놓을 때 캐시 효과가
  // 성능 변화로 보인다. EXP-001 이 "warm 에서 잰다"를 전제하므로 그 전제를 검증할
  // 근거가 실행 기록에 있어야 한다.
  const cacheBefore = dbstate.computeCacheState();
  const block = {
    datasetGuard: g.mode,
    datasetGuardSource: g.source,
    stateBefore: before.fingerprint,
    stateCoreBefore: before.core,
    stateVolatileBefore: before.volatile,
    stateFingerprintMs: before.elapsedMs,
    cacheState: cacheBefore.state,
    cacheKeysBefore: cacheBefore.cacheKeys,
    snapshotId: null,
    stateMatchedSnapshot: null,
    restored: false,
  };
  console.log(`  데이터셋 ${profile} · 상태 ${before.fingerprint} (${before.elapsedMs}ms)`);
  console.log(`  캐시 ${cacheBefore.state}${cacheBefore.cacheKeys != null ? ` (키 ${cacheBefore.cacheKeys.toLocaleString()}개)` : ''}`);
  console.log(`  guard ${g.mode} — ${guard.describeMode(g.mode)} [${g.source}]`);

  if (g.mode === 'off') return block;

  const snap = snapshot.latestFor(profile); // 생성 지문이 다른 스냅샷이면 여기서 던진다
  if (!snap) {
    const msg = `프로파일 '${profile}'의 스냅샷이 없습니다 — 만들기: node tools/snapshot.js create ${profile}`;
    // strict 의 존재 이유가 "시작 상태를 보장한다"인데 보장할 기준이 없으면 의미가 없다.
    // warn 은 도입 단계 모드라 기준이 없어도 실행 자체는 계속한다.
    if (g.mode === 'strict') throw new Error(msg);
    console.warn(`  ⚠ ${msg}\n    guard=warn 이라 상태 판정 없이 계속합니다.`);
    return block;
  }
  block.snapshotId = snap.snapshotId;

  if (before.fingerprint === snap.state) {
    block.stateMatchedSnapshot = true;
    console.log(`  ✅ 스냅샷 ${snap.snapshotId} 와 상태 일치`);
    return block;
  }

  const d = dbstate.diff({ core: snap.core, volatile: snap.volatileAtCapture }, before);
  console.warn(`  ⚠ 스냅샷과 상태가 다릅니다 — ${dbstate.describeDiff(d, 5)}`);

  if (g.mode === 'warn') {
    block.stateMatchedSnapshot = false;
    console.warn('    guard=warn — 그대로 실행하되 이 실행은 기준선으로 쓰지 않습니다.');
    return block;
  }

  // strict — 복원한다. restore() 가 복원 후 지문을 재확인하고 다르면 던진다.
  console.log('    guard=strict — 스냅샷으로 복원합니다.');
  const r = snapshot.restore(snap);
  block.restored = true;
  block.restoreMs = r.untarMs;
  block.stateBefore = r.state.fingerprint;
  block.stateCoreBefore = r.state.core;
  block.stateVolatileBefore = r.state.volatile;
  block.stateMatchedSnapshot = true;
  // 복원은 FLUSHALL 을 포함하므로 여기서부터는 반드시 cold 다. 위에서 잰 값을 덮어쓴다.
  const cacheAfterRestore = dbstate.computeCacheState();
  block.cacheState = cacheAfterRestore.state;
  block.cacheKeysBefore = cacheAfterRestore.cacheKeys;
  return block;
}

/** 실행 후 상태 재계산 — 무엇이 얼마나 변했는지 남긴다. */
function postflight(block) {
  const after = dbstate.computeState();
  const d = dbstate.diff(
    { core: block.stateCoreBefore, volatile: block.stateVolatileBefore }, after);
  console.log(`\n  실행 후 상태 ${after.fingerprint} — ${dbstate.describeDiff(d, 5)}`);
  if (d.volatileChanged.length) {
    console.log(`    (지문 제외 항목: ${d.volatileChanged.map((v) => `${v.key} ${v.delta > 0 ? '+' : ''}${v.delta}`).join(', ')})`);
  }
  return {
    ...block,
    stateAfter: after.fingerprint,
    stateCoreAfter: after.core,
    stateVolatileAfter: after.volatile,
    stateChanged: d.coreChanged,
    stateDelta: d.changed,
  };
}

function parseArgs(argv) {
  const o = {
    script: null, vus: null, rate: null, duration: null, hold: null, env: 'perf', dataset: null,
    // warmup은 undefined가 기본값이다(0이 아니다) — "지정 안 함"과 "명시적으로 0"을
    // 구분해야 한다(T-03). 0으로 두면 --warmup 0을 준 것과 아예 안 준 것을 구별할 수
    // 없어, k6로 WARMUP을 전달해야 하는지 판단이 틀어진다.
    note: '', warmup: undefined, loadbenchAt: undefined, wait: 20, collect: true, gate: true, passthrough: [], k6Extra: [],
    // null = 지정 안 함. guard.js 가 환경변수 → perf.config.json → 기본값 순으로 이어받는다.
    guard: null,
    // local | docker. 기본은 local(현행) — docker 는 부하 발생기를 계측 가능하게 만든다.
    loadgen: null,
    // 기본 on. 끄는 쪽을 명시적으로 만든 이유: 켜는 걸 잊으면 그 실행의 p95 시계열은
    // **영원히 존재하지 않는다**(사후 복구 불가). 반대로 켜서 생기는 비용은 발생기
    // CPU 소폭 증가뿐이고 그건 loadgen 지표로 측정된다.
    remoteWrite: true,
    // 기본 on. 회당 13초를 쓰지만, **없으면 사후에 만들 수 없는 값**이다. 세션 간 편차를
    // 쫓을 때 "그 시점의 환경 속도"를 절대 비교하지 못한 것이 실제로 발목을 잡았다.
    bench: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--guard') o.guard = argv[++i];
    else if (a === '--loadgen') o.loadgen = argv[++i];
    else if (a === '--vus') o.vus = argv[++i];
    else if (a === '--rate') o.rate = argv[++i];
    else if (a === '--duration') o.duration = argv[++i];
    else if (a === '--hold') o.hold = argv[++i];
    else if (a === '--env') o.env = argv[++i];
    else if (a === '--dataset') o.dataset = argv[++i];
    else if (a === '--note') o.note = argv[++i];
    else if (a === '--warmup') o.warmup = Number(argv[++i]);
    else if (a === '--loadbench-at') o.loadbenchAt = Number(argv[++i]);
    else if (a === '--wait') o.wait = Number(argv[++i]);
    else if (a === '--no-collect') o.collect = false;
    else if (a === '--no-gate') o.gate = false;
    else if (a === '--no-remote-write') o.remoteWrite = false;
    else if (a === '--no-bench') o.bench = false;
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

  // 데이터셋 복원과 앱 재시작을 포함하는 실행 둘이 겹치면 서로의 측정이 망가진다.
  // 프로세스 단위 잠금으로 같은 성능 스택에서는 perf-run 하나만 허용한다.
  let runLock;
  try {
    runLock = acquireRunLock();
  } catch (e) {
    console.error(`성능 실행 시작 거부: ${e.message}`);
    process.exit(2);
  }
  process.once('exit', () => runLock.release());
  process.once('SIGINT', () => process.exit(130));
  process.once('SIGTERM', () => process.exit(143));

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

  // 데이터셋 지문은 k6가 아니라 여기서 읽는다 — k6의 open()은 파일이 없으면 예외를 던져
  // init 컨텍스트 전체를 죽인다. 이 변경 이전에 만든 데이터셋(meta.json 없음)으로도
  // 실행은 되어야 하므로, 존재 여부를 확인할 수 있는 Node 쪽에서 처리한다.
  const dsFingerprint = datasetFingerprint(env.DATASET || 'small');
  if (dsFingerprint) env.PERF_DATASET_FINGERPRINT = dsFingerprint;
  else {
    console.warn(
      `⚠ 데이터셋 '${env.DATASET || 'small'}'에 meta.json이 없습니다 — 이 변경 이전에 생성된 데이터셋입니다.\n` +
      '  지문이 있는 실행과는 비교되지 않습니다. 재생성: node datasets/seed.js --profile <name>',
    );
  }

  const args = ['run', o.script, '--summary-trend-stats', TREND_STATS];
  if (o.vus) args.push('-e', `VUS=${o.vus}`);
  // open model 전환. 시나리오가 RATE 를 받으면 ramping-arrival-rate 로 돈다 — 도착률을
  // 고정해 closed model 의 되먹임(coordinated omission)을 끊는다.
  if (o.rate) args.push('-e', `RATE=${o.rate}`);
  if (o.duration) args.push('-e', `DURATION=${o.duration}`);
  if (o.hold) args.push('-e', `HOLD=${o.hold}`);
  // warmup은 이제 k6 실행 계획 자체를 바꾼다(T-03/S-08) — collect.js에 별도로 넘기지
  // 않는다. undefined(미지정)면 시나리오의 phasePlan 기본값이 그대로 쓰인다.
  if (o.warmup !== undefined) args.push('-e', `WARMUP=${o.warmup}`);
  args.push(...o.passthrough, ...o.k6Extra);

  console.log(`\n▶ k6 run ${o.script}`);
  console.log(`  브랜치 ${git.branch} · 커밋 ${git.commit.slice(0, 12)} · 실행자 ${git.executor}`);
  console.log(`  환경 ${o.env}${o.note ? ` · "${o.note}"` : ''}`);

  // 데이터셋 상태 확인·복원은 k6 를 띄우기 **전에** 끝낸다. 실행 중에 복원하면 무엇을
  // 잰 것인지 알 수 없다. 여기서 던지면 실행 자체가 시작되지 않는다.
  let stateBlock;
  try {
    stateBlock = preflight(env.DATASET || 'small', guard.resolveMode(o.guard));
  } catch (e) {
    console.error(`\n❌ 데이터셋 상태 확인 실패: ${e.message}`);
    process.exit(2);
  }
  console.log();

  // 이번 실행이 남긴 결과 파일을 식별하기 위해 실행 전 스테이징 상태를 찍어 둔다.
  // 수집기에 runId 를 넘기지 않으면 "가장 최근 pending"을 고르는데, 다른 시나리오의
  // 수집 실패 잔여물이 남아 있으면 엉뚱한 실행을 수집하게 된다.
  const stagedBefore = stagedRunIds();

  // 부하 발생기를 컨테이너로 돌리면 cAdvisor 가 그것을 별도로 계측한다. 그래야 "지연이
  // 서버 탓인가 발생기 탓인가"를 사후에 가를 수 있다(E-01). 기본은 기존 방식이다.
  const loadgenMode = (o.loadgen || process.env.PERF_LOADGEN || 'local').toLowerCase();
  if (!['local', 'docker'].includes(loadgenMode)) {
    console.error(`--loadgen 은 local | docker 중 하나여야 합니다 (받은 값: ${loadgenMode})`);
    process.exit(2);
  }
  stateBlock.loadgen = loadgenMode;
  if (loadgenMode === 'docker') {
    stateBlock.loadgenCpus = K6_CPUS;
    stateBlock.loadgenImage = K6_IMAGE;
    console.log(`  부하 발생기: 컨테이너 ${LOADGEN_CT} (${K6_IMAGE}, CPU 상한 ${K6_CPUS})`);
  } else {
    // 이 사실을 실행 기록에 남겨야 나중에 "왜 loadgen 지표가 비어 있지"에 답할 수 있다.
    console.log('  부하 발생기: 로컬 프로세스 — CPU 사용량이 측정되지 않습니다 (--loadgen docker 로 계측 가능)');
  }

  // remote-write 는 부하 발생기 모드가 정해진 뒤에 붙인다 — 주소가 모드에 따라 다르다.
  stateBlock.remoteWrite = o.remoteWrite;
  if (o.remoteWrite) {
    const rw = remoteWriteEnv(loadgenMode);
    Object.assign(env, rw);
    args.push('-o', 'experimental-prometheus-rw');
    console.log(`  k6 지표 전송: ${rw.K6_PROMETHEUS_RW_SERVER_URL} (native histogram, ${K6_RW_PUSH_INTERVAL} 간격)`);
  } else {
    console.log('  k6 지표 전송: 꺼짐 — 이 실행은 p95 시계열이 남지 않습니다 (사후 재질의 불가)');
  }

  // 유휴 벤치는 **k6 를 띄우기 전에** 끝낸다. 측정 중에 돌리면 앱과 같은 2코어를
  // 놓고 다투게 되어 그 실행 자체를 오염시킨다 — 환경을 확인하려다 환경을 바꾸는 셈이다.
  // warmup 구간이 뒤따르므로 벤치가 남긴 캐시·주파수 상태는 측정 창에 닿지 않는다.
  if (o.bench) {
    process.stdout.write(`  환경 대조 벤치 실행 중(3축 ${loadbench.REPEAT}회, 약 ${loadbench.APPROX_DURATION_SEC}초)... `);
    const b = cpuBench.bench({ repeat: loadbench.REPEAT });
    stateBlock.cpuBench = b;
    const ax = b.axes;
    console.log(ax.single
      ? 'single ' + ax.single.ms + 'ms · parallel ' + (ax.parallel ? ax.parallel.ms : '—')
        + 'ms · ctxswitch ' + (ax.ctxswitch ? ax.ctxswitch.ms : '—') + 'ms'
      : '실패 (' + ((b.errors[0] || {}).error || '원인 미상') + ')');
  }

  // 부하 중 벤치는 warmup 구간에서 돈다 — 부하는 이미 걸려 있는데 통계에는 잡히지 않는
  // 유일한 구간이다. 이 값이 있어야 "처리량이 떨어졌을 때 기계 자체도 느렸는가"를 가를 수
  // 있다. 요청당 자원 지표는 앱이 CPU 상한에 붙어 있어 전부 처리량의 역수로 붕괴하므로
  // 그 질문에 답하지 못한다(자세한 근거는 lib/loadbench.js 머리말).
  const loadBenchAt = o.loadbenchAt !== undefined
    ? o.loadbenchAt
    : loadbench.deriveDelaySec(o.warmup);
  const lbench = o.bench ? loadbench.start({ delaySec: loadBenchAt }) : { enabled: false, reason: '--no-bench' };
  if (lbench.enabled) {
    console.log(`  부하 중 벤치 예약: k6 시작 +${lbench.delaySec}초 (warmup 구간, ${lbench.repeat}회)`);
  } else {
    console.log(`  ⚠ 부하 중 벤치 생략 — ${lbench.reason}`);
  }

  // 호스트 프로브는 벤치 **뒤에** 시작한다. 벤치가 CPU 를 2코어 태우므로, 겹치면
  // 호스트 통계에 벤치 부하가 섞여 "측정 중 호스트 상태"라는 의미가 흐려진다.
  const probe = hostprobe.start();
  if (!probe.enabled) console.log('  ⚠ ' + probe.reason);
  // k6 실행 시작 시각을 붙잡는다. 호스트 표본을 구간별로 자르려면 기준 시각이 필요하고,
  // 이 값이 없으면 요약이 warmup+measure+rampdown 을 뭉갠 평균이 된다(T-37).
  stateBlock.k6StartedAt = new Date().toISOString();
  const k6 = loadgenMode === 'docker'
    ? spawnSync('docker', dockerK6Args(args, env), { stdio: 'inherit', cwd: PERF_ROOT })
    : spawnSync(K6_BIN, args, { stdio: 'inherit', env, cwd: PERF_ROOT });
  // k6 가 끝나자마자 멈춘다. 이 뒤로는 수집기가 도는 시간이라 측정 구간이 아니다.
  stateBlock.loadBench = loadbench.stop(lbench);
  // loadbench 는 2코어를 40초 태운다. 그 구간을 표시해 두지 않으면 "환경이 바빴다"와
  // "우리가 바쁘게 만들었다"가 섞인다 — 실제로 그 혼동이 잘못된 결론을 만들었다(8-e).
  if (stateBlock.loadBench && stateBlock.loadBench.available) {
    hostprobe.mark(probe, 'loadbench', stateBlock.loadBench.startedAt, stateBlock.loadBench.endedAt);
  }
  stateBlock.hostProbe = hostprobe.stop(probe);
  console.log('  ' + hostprobe.describe(stateBlock.hostProbe));
  console.log('  ' + loadbench.describe(stateBlock.loadBench, stateBlock.cpuBench));

  if (k6.error) {
    console.error(`k6 실행 실패: ${k6.error.message} (실행 파일: ${loadgenMode === 'docker' ? 'docker' : K6_BIN})`);
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

  // 호스트 프로브 원시 표본을 실행별 사이드카로 옮긴다. 요약만 남기면 사후에 measure
  // 구간만 다시 잘라 볼 수 없다 — 실제로 그 필요가 생겼고 데이터가 이미 없었다(T-37).
  const hp = stateBlock.hostProbe;
  if (hp && hp.available && hp.rawFile) {
    try {
      fs.renameSync(hp.rawFile, path.join(RUNS_DIR, `${runId}.hostprobe.jsonl`));
    } catch (e) {
      console.warn(`⚠ 호스트 프로브 원시 표본 보존 실패: ${e.message}`);
    }
    // 요약에서 원시 배열을 뺀다. 안 빼면 dbstate 사이드카가 수 MB 로 불어난다.
    delete hp.rows;
    delete hp.rawFile;
  }

  // 상태 블록은 사이드카 파일로 남긴다. k6 는 자기가 끝난 뒤의 DB 를 알 수 없으므로
  // 환경변수로는 실행 후 상태를 전달할 방법이 없다. collect.js 가 이 파일을 읽어
  // run.json 에 합친다(repository.js 가 나머지 스테이징 파일과 함께 승격한다).
  try {
    fs.writeFileSync(
      path.join(RUNS_DIR, `${runId}.dbstate.json`),
      JSON.stringify(postflight(stateBlock), null, 1),
    );
  } catch (e) {
    console.warn(`⚠ 데이터셋 상태 기록 실패: ${e.message} — 이 실행은 상태 미기록으로 남습니다.`);
  }

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

// 지문 계산은 테스트가 직접 호출해 검증한다 — "sampling.js를 바꿨는데 지문이 그대로"인
// 회귀는 실행해 봐야만 드러나는 종류라, 단위 테스트로 고정해 둔다.
module.exports = { scriptVersion, datasetFingerprint, TRAFFIC_SHAPING_FILES };

if (require.main === module) main();
