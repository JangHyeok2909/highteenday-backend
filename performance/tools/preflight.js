#!/usr/bin/env node
/**
 * preflight — **지금 측정을 시작해도 되는가**를 한 번에 판정한다.
 *
 * 왜 필요한가
 * ------------
 * 이 저장소가 잃은 시간은 대부분 "측정이 틀렸다"가 아니라 **"측정할 수 없는 상태에서
 * 쟀다"** 에서 나왔다. 값 자체는 정확했고, 그 값이 무엇을 재고 있었는지가 달랐다.
 *
 *   E-46  포화 상태에서 잰 p95 를 애플리케이션 지연으로 읽었다. 닷새.
 *   E-52  `.env.perf` 는 large 인데 시더는 small 로 돌아 다른 프로파일 볼륨을 오염시켰다.
 *   T-42  8/14 이미지를 두 주 내내 재면서 기록에는 그때그때의 HEAD 를 남겼다.
 *
 * 셋 다 **실행 전에 명령 하나로 확인 가능한 사실**이었다. 확인하는 절차가 사람의 기억
 * 안에만 있었을 뿐이다. 이 파일은 그 기억을 명령으로 바꾼다.
 *
 * 무엇을 하지 않는가 — 오해를 막기 위해
 * --------------------------------------
 * 이 도구는 **이번 실행이 포화에 빠지지 않을 것임을 보장하지 않는다.** 포화는 부하를
 * 걸어 봐야 알 수 있고, 그 판정은 실행 후 `lib/saturation.js` 가 각 실행마다 내린다.
 * 여기서 하는 것은 그 전 단계다 — **알려진 안전 운용점 이하인가, 그리고 지금 시스템이
 * 유휴인가.** 남은 잔류 부하 위에 새 부하를 얹으면 첫 회차만 조용히 오염된다.
 *
 * 관문
 * ----
 *   G1 프로파일·볼륨 일치   `.env.perf` · `--dataset` · 실제 마운트된 볼륨이 모두 같은가
 *   G2 데이터셋 상태        DB 상태 지문이 스냅샷과 같은가 (이전 실행의 쓰기가 남았는가)
 *   G3 측정 스펙            시드용 완화 설정이 꺼져 있고 자원 상한이 측정값인가
 *   G4 관측 경로            Prometheus 와 모든 스크레이프 대상이 응답하는가
 *   G5 운용점·유휴          도착률이 안전 운용점 이하이고 지금 부하가 없는가
 *   G6 코드 신원            컨테이너 이미지가 소스보다 낡지 않았는가
 *
 * 사용법
 * ------
 *   node tools/preflight.js --dataset medium --rate 4
 *   node tools/preflight.js --dataset medium --rate 4 --json
 *
 * 종료 코드: 0 통과 · 1 하나 이상 실패 · 2 사용법 오류
 *
 * 우회 수단은 두지 않았다. 통과하지 못한 상태로 재야 할 이유가 있다면 측정 명령을 직접
 * 부르면 된다. 우회 플래그를 만들면 그 플래그가 기본 사용법이 되고, 그러면 이 파일은
 * 사람의 기억으로 되돌아간다.
 */
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { PromClient } = require('./lib/promql');
const dbstate = require('./lib/dbstate');
const snapshot = require('./snapshot');
const appimage = require('./lib/appimage');

const PERF_ROOT = path.resolve(__dirname, '..');
const ENV_FILE = path.join(PERF_ROOT, 'environment', '.env.perf');

const APP_CT = process.env.PERF_APP_CONTAINER || 'perf-app';
const DB_CT = process.env.PERF_MYSQL_CONTAINER || 'perf-mysql';
const APP_JOB = 'spring-app';
const PROM_URL = process.env.PERF_PROM_URL || 'http://localhost:9090';

// ── 측정 스펙 — environment/docker-compose.perf.yml 이 선언한 값 ─────────────
//
// 왜 compose 파일을 파싱하지 않는가: 검사 대상은 "파일에 뭐라고 써 있나"가 아니라
// **"지금 돌고 있는 컨테이너가 어떤 상태인가"** 다. 파일을 읽어 비교하면
// `-f docker-compose.seed.yml` 을 붙여 띄운 경우를 잡지 못한다 — 오버라이드는 파일이
// 아니라 실행 시점에 적용되기 때문이다. 그래서 기대값만 여기 고정하고, 실제값은
// docker 와 Prometheus 에서 읽는다.
const MEASURE_SPEC = {
  mysql: {
    // 시드 오버라이드는 이 넷을 각각 2 / 0 / 0 / OFF 로 낮춘다. 하나라도 낮은 채로 재면
    // 커밋마다 fsync 가 사라져 모든 쓰기 지연이 낙관적으로 나온다.
    innodb_flush_log_at_trx_commit: 1,
    sync_binlog: 1,
    slow_query_log: 1,
    performance_schema: 1,
  },
  appNanoCpus: 2e9,                // cpus: "2.0"
  appMemBytes: 2560 * 1024 * 1024, // memory: 2560m
  mysqlNanoCpus: 2e9,              // cpus: "2.0"
};

/** HikariCP 최대 커넥션. 풀 크기는 EXP-006 의 실험 변수라 `.env.perf` 로 조절한다. */
const DEFAULT_HIKARI_MAX = 10;

/**
 * 판정용 측정의 안전 운용점. 2026-08-20 보정 곡선(S-27)에서 4/s 는 CPU 52%·대기 0·
 * 도달률 101%, 5/s 는 CPU 97%·대기 65·도달률 77% 였다. 절벽은 그 사이에 있다.
 */
const SAFE_RATE = 4;

/**
 * 유휴 판정 문턱. "부하가 완전히 0"을 요구하지는 않는다 — 스케줄러(조회수 flush, hot
 * score)가 주기적으로 도는 것이 정상 상태이기 때문이다. 잡아야 하는 것은 그 수준이
 * 아니라 **아직 안 끝난 부하 테스트**다.
 */
const IDLE = { appCores: 0.3, pending: 0, active: 3 };

/** Prometheus 가 응답해야 하는 스크레이프 대상. 하나라도 빠지면 인프라 지표가 결측된다. */
const REQUIRED_JOBS = ['containers', 'host', 'mysql', 'redis', APP_JOB];

// ── 사실 수집 ───────────────────────────────────────────────────────────────

function docker(args) {
  const r = spawnSync('docker', args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || '').trim() || `docker ${args[0]} 실패`);
  return (r.stdout || '').trim();
}

/** `.env.perf` 를 KEY=VALUE 로 읽는다. 값에 `=` 가 들어갈 수 있어 첫 `=` 에서만 자른다. */
function readEnvFile(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    return null; // 파일이 없다 — G1 이 그 사실을 보고한다
  }
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const i = s.indexOf('=');
    if (i < 0) continue;
    out[s.slice(0, i).trim()] = s.slice(i + 1).trim();
  }
  return out;
}

/** MySQL 서버가 실제로 들고 있는 변수값. compose 파일이 아니라 살아 있는 서버에 묻는다. */
function readMysqlVars() {
  const password = process.env.MYSQL_ROOT_PASSWORD || 'perfroot';
  const keys = Object.keys(MEASURE_SPEC.mysql);
  const sql = 'SELECT ' + keys.map((k) => '@@' + k).join(', ');
  const raw = docker(['exec', DB_CT, 'mysql', '-uroot', '-p' + password, '-N', '-B', '-e', sql]);
  const cols = raw.split(/\t/).map((v) => v.trim());
  const out = {};
  keys.forEach((k, i) => { out[k] = cols[i]; });
  return out;
}

/** 컨테이너에 실제로 걸린 자원 상한. `deploy.resources.limits` 가 여기로 내려온다. */
function readLimits(container) {
  const raw = docker(['inspect', container, '--format', '{{.HostConfig.NanoCpus}}\t{{.HostConfig.Memory}}']);
  const [cpus, mem] = raw.split(/\t/);
  return { nanoCpus: Number(cpus), memBytes: Number(mem) };
}

/**
 * 실행 전에 필요한 사실을 전부 모은다. 한 항목이 실패해도 나머지는 계속 모은다 —
 * 첫 실패에서 멈추면 사용자가 고치고 다시 돌릴 때마다 새 실패를 하나씩 보게 된다.
 */
async function collectFacts(opts) {
  const facts = { errors: [] };
  const capture = (key, fn) => {
    try {
      facts[key] = fn();
    } catch (e) {
      facts[key] = null;
      facts.errors.push(`${key}: ${e.message}`);
    }
  };

  const env = readEnvFile(ENV_FILE);
  facts.env = env;
  facts.profile = {
    arg: opts.dataset,
    env: env ? env.DATASET_PROFILE || null : null,
    expectedVolume: `perf-mysql-data-${opts.dataset}`,
  };
  capture('mountedVolume', () => docker(['inspect', DB_CT, '--format',
    '{{range .Mounts}}{{if eq .Destination "/var/lib/mysql"}}{{.Name}}{{end}}{{end}}']));

  capture('state', () => dbstate.computeState());
  // latestFor() 는 생성 지문이 다른 스냅샷을 만나면 던진다. 그건 "스냅샷 없음"과 다른
  // 상황이므로 사유를 남겨 G2 가 구분해 말하게 한다.
  capture('snapshot', () => snapshot.latestFor(opts.dataset));

  capture('mysqlVars', () => readMysqlVars());
  capture('appLimits', () => readLimits(APP_CT));
  capture('mysqlLimits', () => readLimits(DB_CT));

  facts.expectedHikariMax = Number((env && env.HIKARI_MAX) || DEFAULT_HIKARI_MAX);
  facts.image = appimage.probe();

  // Prometheus — 여기부터는 네트워크다. 실패해도 위에서 모은 사실은 그대로 쓴다.
  const prom = new PromClient({ baseUrl: PROM_URL, retries: 1, timeoutMs: 5000 });
  const now = new Date();
  facts.prom = { reachable: await prom.ping(), jobs: null, error: null };
  if (facts.prom.reachable) {
    try {
      const up = await prom.series('up', now);
      facts.prom.jobs = up.map((s) => ({ job: s.labels.job, up: s.value === 1 }));
    } catch (e) {
      facts.prom.error = e.message;
    }
  }

  facts.live = { hikariMax: null, pending: null, active: null, appCores: null };
  if (facts.prom.reachable) {
    const q = async (key, query) => {
      try {
        facts.live[key] = await prom.instant(query, now, 'max');
      } catch (e) {
        facts.live[key] = null;
      }
    };
    await q('hikariMax', `hikaricp_connections_max{job="${APP_JOB}"}`);
    await q('pending', `hikaricp_connections_pending{job="${APP_JOB}"}`);
    await q('active', `hikaricp_connections_active{job="${APP_JOB}"}`);
    await q('appCores', `max(rate(container_cpu_usage_seconds_total{name="${APP_CT}"}[1m]))`);
  }

  facts.rate = opts.rate;
  return facts;
}

// ── 관문 ────────────────────────────────────────────────────────────────────
//
// 각 관문은 순수 함수다(사실 → 판정). 그래야 실제 스택 없이 시험할 수 있다.
// 판정 불가는 실패로 다룬다 — 모르는 것을 통과로 적으면 이 파일을 만든 이유가 사라진다.

const num = (v) => (v == null ? '없음' : Number(v).toLocaleString());

const GATES = [
  {
    id: 'G1',
    title: '프로파일·볼륨 일치',
    why: '세 이름이 어긋나면 다른 데이터셋에 부하를 걸고 그 사실이 기록에 남지 않는다 (E-52)',
    check(f) {
      const p = f.profile;
      const lines = [
        `--dataset ${p.arg}`,
        `.env.perf DATASET_PROFILE=${p.env || '없음'}`,
        `마운트된 볼륨 ${f.mountedVolume || '확인 불가'}`,
      ];
      if (!p.env) {
        return { ok: false, lines, fix: `environment/.env.perf 에 DATASET_PROFILE=${p.arg} 를 설정하세요.` };
      }
      if (p.env !== p.arg) {
        return {
          ok: false,
          lines,
          fix: `둘을 맞추세요 — .env.perf 를 ${p.arg} 로 바꾸거나 --dataset ${p.env} 로 실행하세요.`,
        };
      }
      if (f.mountedVolume !== p.expectedVolume) {
        return {
          ok: false,
          lines,
          fix: `기대 볼륨은 ${p.expectedVolume} 입니다. 전환: DATASET_PROFILE=${p.arg} docker compose `
            + '-f environment/docker-compose.perf.yml --env-file environment/.env.perf up -d',
        };
      }
      return { ok: true, lines };
    },
  },
  {
    id: 'G2',
    title: '데이터셋 상태',
    why: '이전 실행의 쓰기가 남아 있으면 "같은 데이터셋에서 쟀다"는 전제가 깨진다',
    check(f) {
      if (!f.state) {
        return { ok: false, lines: ['상태 지문을 읽지 못했습니다'], fix: 'MySQL 컨테이너가 떠 있는지 확인하세요.' };
      }
      if (!f.snapshot) {
        return {
          ok: false,
          lines: [`현재 상태 ${f.state.fingerprint}`, '비교할 스냅샷이 없습니다'],
          fix: `스냅샷 생성: node tools/snapshot.js create ${f.profile.arg}`,
        };
      }
      const lines = [
        `현재 상태 ${f.state.fingerprint}`,
        `스냅샷 ${f.snapshot.snapshotId} 상태 ${f.snapshot.state}`,
      ];
      if (f.state.fingerprint !== f.snapshot.state) {
        const d = dbstate.diff({ core: f.snapshot.core, volatile: f.snapshot.volatileAtCapture }, f.state);
        lines.push(`차이: ${dbstate.describeDiff(d, 5)}`);
        return { ok: false, lines, fix: `복원: node tools/snapshot.js restore --id ${f.snapshot.snapshotId}` };
      }
      return { ok: true, lines };
    },
  },
  {
    id: 'G3',
    title: '측정 스펙',
    why: '시드용 완화 설정이 하나라도 켜져 있으면 쓰기 지연이 낙관적으로 나온다',
    check(f) {
      const lines = [];
      const bad = [];
      if (!f.mysqlVars) {
        bad.push('MySQL 변수를 읽지 못했습니다');
      } else {
        for (const [k, want] of Object.entries(MEASURE_SPEC.mysql)) {
          const got = f.mysqlVars[k];
          lines.push(`${k}=${got}`);
          if (String(got) !== String(want)) bad.push(`${k} 기대 ${want} · 실제 ${got}`);
        }
      }
      const cores = (n) => `${(n / 1e9).toFixed(1)}코어`;
      const mib = (n) => `${Math.round(n / 1024 / 1024)}MiB`;
      const limit = (label, got, want, fmt) => {
        if (!got) { bad.push(`${label} 상한을 읽지 못했습니다`); return; }
        lines.push(`${label} ${fmt(got)}`);
        if (got !== want) bad.push(`${label} 기대 ${fmt(want)} · 실제 ${fmt(got)}`);
      };
      limit('앱 CPU', f.appLimits && f.appLimits.nanoCpus, MEASURE_SPEC.appNanoCpus, cores);
      limit('앱 메모리', f.appLimits && f.appLimits.memBytes, MEASURE_SPEC.appMemBytes, mib);
      limit('MySQL CPU', f.mysqlLimits && f.mysqlLimits.nanoCpus, MEASURE_SPEC.mysqlNanoCpus, cores);

      const pool = f.live.hikariMax;
      lines.push(`HikariCP 최대 ${num(pool)}`);
      if (pool == null) bad.push('HikariCP 최대 커넥션을 읽지 못했습니다');
      else if (pool !== f.expectedHikariMax) bad.push(`HikariCP 기대 ${f.expectedHikariMax} · 실제 ${pool}`);

      if (bad.length) {
        return {
          ok: false,
          lines: lines.concat(bad.map((b) => `⚠ ${b}`)),
          fix: '측정 스펙으로 복귀: docker compose -f environment/docker-compose.perf.yml '
            + '--env-file environment/.env.perf up -d   (시드 오버라이드를 -f 로 붙이지 마세요)',
        };
      }
      return { ok: true, lines };
    },
  },
  {
    id: 'G4',
    title: '관측 경로',
    why: '스크레이프 대상이 빠지면 인프라 지표가 결측되어 실행이 UNMEASURED 로 끝난다',
    check(f) {
      if (!f.prom.reachable) {
        return { ok: false, lines: [`Prometheus 무응답 (${PROM_URL})`], fix: 'docker start perf-prometheus' };
      }
      if (!f.prom.jobs) {
        return {
          ok: false,
          lines: [`대상 목록 조회 실패: ${f.prom.error || '사유 불명'}`],
          fix: 'Prometheus 로그를 확인하세요.',
        };
      }
      const byJob = new Map(f.prom.jobs.map((j) => [j.job, j.up]));
      const lines = REQUIRED_JOBS.map((j) => {
        const state = byJob.get(j) === true ? 'up' : byJob.has(j) ? 'down' : '없음';
        return `${j}: ${state}`;
      });
      const missing = REQUIRED_JOBS.filter((j) => byJob.get(j) !== true);
      if (missing.length) {
        return {
          ok: false,
          lines,
          fix: `응답하지 않는 대상: ${missing.join(', ')} — 해당 exporter 컨테이너를 확인하세요.`,
        };
      }
      return { ok: true, lines };
    },
  },
  {
    id: 'G5',
    title: '운용점·유휴',
    why: '포화 이하 운용점이어야 p95 가 애플리케이션 지연이고, 잔류 부하가 있으면 첫 회차가 오염된다 (E-46)',
    check(f) {
      const lines = [];
      const bad = [];
      if (f.rate == null) {
        lines.push('도착률 미지정 — 운용점 검사를 건너뜁니다');
      } else {
        lines.push(`도착률 ${f.rate}/s (안전 운용점 ${SAFE_RATE}/s 이하)`);
        if (f.rate > SAFE_RATE) bad.push(`도착률 ${f.rate}/s 는 검증된 안전 운용점 ${SAFE_RATE}/s 를 넘습니다`);
      }
      const { pending, active, appCores } = f.live;
      lines.push(`커넥션 대기 ${num(pending)} · 사용 중 ${num(active)} · `
        + `앱 CPU ${appCores == null ? '없음' : appCores.toFixed(2) + '코어'}`);
      if (pending == null || active == null || appCores == null) {
        bad.push('유휴 판정에 필요한 지표를 읽지 못했습니다');
      } else {
        if (pending > IDLE.pending) bad.push(`커넥션 대기 ${pending} — 아직 부하가 걸려 있습니다`);
        if (active > IDLE.active) bad.push(`커넥션 사용 ${active} — 아직 부하가 걸려 있습니다`);
        if (appCores > IDLE.appCores) bad.push(`앱 CPU ${appCores.toFixed(2)}코어 — 아직 부하가 걸려 있습니다`);
      }
      if (bad.length) {
        return {
          ok: false,
          lines: lines.concat(bad.map((b) => `⚠ ${b}`)),
          fix: '실행 중인 부하가 끝나기를 기다리거나(docker ps 로 perf-k6 확인) 도착률을 낮추세요.',
        };
      }
      return { ok: true, lines };
    },
  },
  {
    id: 'G6',
    title: '코드 신원',
    why: '이미지가 소스보다 낡으면 새 커밋을 기록하면서 옛 코드를 잰다 (T-42)',
    check(f) {
      const img = f.image;
      if (!img || !img.available) {
        return {
          ok: false,
          lines: [`이미지 확인 실패 — ${img ? img.reason : '미조회'}`],
          fix: 'perf-app 컨테이너가 떠 있는지 확인하세요.',
        };
      }
      const short = String(img.imageId).replace(/^sha256:/, '').slice(0, 12);
      const lines = [
        `이미지 ${img.imageRef || '?'} (${short})`,
        `빌드 ${img.imageCreated ? new Date(img.imageCreated).toISOString() : '시각 불명'}`,
      ];
      const rebuild = 'docker compose -f environment/docker-compose.perf.yml '
        + '--env-file environment/.env.perf up -d --build app';
      if (img.stale === null) {
        // Before/After 비교는 "같은 바이너리인가"에 전적으로 의존한다. 여기서 모르는 것은
        // 통과가 아니다 — perf-run 은 경고만 하지만 이 관문은 막는다.
        return { ok: false, lines: lines.concat(['최신 여부 판정 불가']), fix: `재빌드로 확실히 하세요: ${rebuild}` };
      }
      if (img.stale) {
        const days = (img.staleBySec / 86400).toFixed(1);
        return {
          ok: false,
          lines: lines.concat([`소스가 이미지보다 ${days}일 새것입니다 (최근 수정 ${img.newestInput})`]),
          fix: `재빌드: ${rebuild}`,
        };
      }
      return { ok: true, lines: lines.concat(['소스와 일치']) };
    },
  },
];

/** 사실을 받아 모든 관문을 돌린다. 관문 내부에서 던져도 그 관문만 실패로 만든다. */
function evaluate(facts, gates = GATES) {
  return gates.map((g) => {
    let r;
    try {
      r = g.check(facts);
    } catch (e) {
      r = { ok: false, lines: [`검사 중 오류: ${e.message}`], fix: null };
    }
    return { id: g.id, title: g.title, why: g.why, ok: r.ok === true, lines: r.lines || [], fix: r.fix || null };
  });
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const o = { dataset: null, rate: null, json: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dataset') o.dataset = argv[++i];
    else if (a === '--rate') o.rate = Number(argv[++i]);
    else if (a === '--json') o.json = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else {
      console.error(`알 수 없는 인자: ${a}`);
      return null;
    }
  }
  return o;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (!o || o.help || !o.dataset) {
    console.error('사용법: node tools/preflight.js --dataset <프로파일> [--rate 4] [--json]');
    process.exit(2);
  }
  if (o.rate != null && !Number.isFinite(o.rate)) {
    console.error('--rate 는 숫자여야 합니다.');
    process.exit(2);
  }

  const facts = await collectFacts(o);
  const results = evaluate(facts);
  const failed = results.filter((r) => !r.ok);

  if (o.json) {
    console.log(JSON.stringify({ pass: failed.length === 0, results, errors: facts.errors }, null, 2));
    process.exit(failed.length ? 1 : 0);
  }

  console.log(`\n측정 개시 점검 — 데이터셋 ${o.dataset}${o.rate != null ? ` · 도착률 ${o.rate}/s` : ''}\n`);
  for (const r of results) {
    console.log(`${r.ok ? '✅' : '❌'} ${r.id} ${r.title}`);
    for (const line of r.lines) console.log(`     ${line}`);
    if (!r.ok) {
      console.log(`     └ 왜 막는가: ${r.why}`);
      if (r.fix) console.log(`     └ 조치: ${r.fix}`);
    }
    console.log('');
  }

  if (failed.length) {
    console.log(`판정: 실패 — ${failed.map((r) => r.id).join(', ')} 관문을 통과하지 못했습니다.`);
    console.log('이 상태로 잰 값은 무엇을 재고 있는지 설명할 수 없습니다. 위 조치를 먼저 하세요.\n');
    process.exit(1);
  }
  console.log('판정: 통과 — 측정을 시작해도 됩니다.');
  console.log('다만 포화 여부는 부하를 걸어야 알 수 있습니다. 실행 후 각 회차의 포화 판정을 확인하세요.\n');
}

if (require.main === module) {
  main().catch((e) => {
    console.error(`preflight 실패: ${e.stack || e.message}`);
    process.exit(1);
  });
}

module.exports = { evaluate, GATES, MEASURE_SPEC, SAFE_RATE, IDLE, REQUIRED_JOBS, readEnvFile };
