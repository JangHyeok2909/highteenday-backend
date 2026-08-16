#!/usr/bin/env node
'use strict';
/**
 * snapshot — 검증이 끝난 데이터셋 상태를 불변 사본으로 떠 두고, 필요할 때 되돌린다.
 *
 * 왜 필요한가
 * ------------
 * 쓰기 시나리오는 자기가 측정하는 대상을 오염시킨다. write-heavy 를 200 VU 로 15분 돌리면
 * 게시글·댓글·반응이 수만 건 늘어난 채 끝난다. 다음 실행은 다른 DB 에서 출발하는데
 * 프로파일 이름도 `large`, 생성 지문도 그대로라 **비교 가능으로 판정된다.**
 *
 * 게다가 지금 데이터셋은 재현이 안 된다. 시더가 전역 난수를 비동기 완료 순서대로 소비하므로
 * 같은 seed 로 다시 돌려도 ID 연결과 분포가 달라진다(P0-1 의 남은 항목). 즉 이 데이터셋은
 * **재현 가능한 산출물이 아니라 일회성 자산**이고, 스냅샷이 그것을 보존하는 유일한 수단이다.
 *
 * 왜 mysqldump 가 아닌가 (버린 대안)
 * ------------------------------------
 * 논리 백업은 복원할 때 댓글 40만·반응 100만 건을 INSERT 로 재생한다. large 면 수십 분이라
 * 실행마다 돌릴 수 없다. 볼륨 tar 는 물리 복사라 파일 교체로 끝난다. 대신 **뜨는 동안
 * MySQL 이 정지해 있어야 한다** — 돌아가는 중 복사하면 InnoDB 가 일관되지 않은 상태로
 * 복사된다.
 *
 * 복원이 Redis 를 반드시 비우는 이유
 * ------------------------------------
 * Redis 에는 아직 DB 로 내려가지 않은 조회수 버퍼가 들어 있다. DB 만 과거로 되돌리고 Redis 를
 * 남기면 스케줄러가 **미래 상태의 버퍼를 과거 데이터 위에 얹는다.** 캐시된 목록도 복원 후
 * DB 에 없는 ID 를 가리킬 수 있다. 그 대가로 복원 직후 캐시는 항상 cold 다.
 *
 * 사용법
 *   node tools/snapshot.js create <profile> [--note "..."] [--no-compress]
 *   node tools/snapshot.js restore <profile>       # 해당 프로파일의 최신 스냅샷
 *   node tools/snapshot.js restore --id <snapshotId>
 *   node tools/snapshot.js list
 *   node tools/snapshot.js verify <profile>        # 현재 DB 가 스냅샷과 같은가
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const dbstate = require('./lib/dbstate');

const PERF_ROOT = path.resolve(__dirname, '..');
const SNAP_ROOT = path.join(PERF_ROOT, 'datasets', 'snapshots');
const APP_HEALTH = process.env.PERF_APP_HEALTH || 'http://127.0.0.1:18080/actuator/health';

const MYSQL_CT = dbstate.CONTAINER;
const REDIS_CT = process.env.PERF_REDIS_CONTAINER || 'perf-redis';
const APP_CT = process.env.PERF_APP_CONTAINER || 'perf-app';

/** Docker Desktop 은 `C:/x/y` 는 받지만 Git Bash 스타일 `/c/x/y` 는 못 받는다. */
const dockerPath = (p) => path.resolve(p).replace(/\\/g, '/');

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  if (r.error) throw new Error(`${cmd} 실행 실패: ${r.error.message}`);
  if (r.status !== 0 && !opts.allowFail) {
    throw new Error(`${cmd} ${args.slice(0, 3).join(' ')} … 실패 (exit ${r.status})\n${r.stderr || r.stdout || ''}`);
  }
  return (r.stdout || '').trim();
}

const volumeName = (profile) => `perf-mysql-data-${profile}`;

const volumeExists = (name) => spawnSync('docker', ['volume', 'inspect', name]).status === 0;

/** 동기 sleep. 이 스크립트는 순서가 곧 안전성이라 전부 동기로 쓴다. */
function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** 생성 지문 — `meta.json` 이 답하는 "어떤 규칙으로 만들었나". 상태 지문과는 다른 축이다. */
function generationOf(profile) {
  try {
    const m = JSON.parse(fs.readFileSync(
      path.join(PERF_ROOT, 'datasets', 'generated', profile, 'meta.json'), 'utf8'));
    return { fingerprint: m.fingerprint || null, generatorVersion: m.generatorVersion || null };
  } catch (e) {
    return { fingerprint: null, generatorVersion: null };
  }
}

// ── 컨테이너 제어 ──────────────────────────────────────────────────────────

function waitHealthy(container, timeoutSec = 180) {
  const deadline = Date.now() + timeoutSec * 1000;
  while (Date.now() < deadline) {
    const s = run('docker', ['inspect', '--format', '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}', container], { allowFail: true });
    if (s === 'healthy' || s === 'none') return;
    sleep(2000);
  }
  throw new Error(`${container} 가 ${timeoutSec}초 안에 healthy 가 되지 않았습니다.`);
}

/**
 * 앱은 healthcheck 가 없어서 컨테이너가 `running` 이어도 Spring 부팅 중일 수 있다.
 * 그 상태로 지문을 재면 스케줄러가 아직 안 돌아 값이 흔들린다 — actuator 로 확인한다.
 */
function waitAppReady(timeoutSec = 180) {
  const deadline = Date.now() + timeoutSec * 1000;
  while (Date.now() < deadline) {
    const r = spawnSync('curl', ['-s', '-o', process.platform === 'win32' ? 'NUL' : '/dev/null',
      '-w', '%{http_code}', APP_HEALTH], { encoding: 'utf8' });
    if ((r.stdout || '').trim() === '200') return;
    sleep(2000);
  }
  throw new Error(`앱이 ${timeoutSec}초 안에 준비되지 않았습니다 (${APP_HEALTH}).`);
}

const stopStack = () => run('docker', ['stop', APP_CT, MYSQL_CT]);

function startStack() {
  run('docker', ['start', MYSQL_CT]);
  waitHealthy(MYSQL_CT);
  run('docker', ['start', APP_CT]);
  waitAppReady();
}

// ── create ─────────────────────────────────────────────────────────────────

function create(profile, opts) {
  const vol = volumeName(profile);
  if (!volumeExists(vol)) throw new Error(`볼륨이 없습니다: ${vol}`);

  const gen = generationOf(profile);
  console.log(`▶ 스냅샷 생성 — 프로파일 ${profile} · 볼륨 ${vol}`);
  console.log(`  생성 지문 ${gen.fingerprint || '(없음)'}`);

  // 지문은 **멈추기 전에** 잰다. 멈춘 뒤에는 MySQL 이 없어 못 잰다.
  const state = dbstate.computeState();
  console.log(`  상태 지문 ${state.fingerprint} (${state.elapsedMs}ms)`);

  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
  const id = `${profile}-${stamp}`;
  const dir = path.join(SNAP_ROOT, id);
  fs.mkdirSync(dir, { recursive: true });

  const archive = opts.compress ? 'mysql.tar.gz' : 'mysql.tar';
  // gzip -1 을 쓴다. DB 페이지는 압축이 잘 되지만 -9 는 시간이 몇 배로 늘고 그만큼
  // MySQL 정지 시간이 길어진다. 스냅샷은 자주 뜨는 물건이라 시간이 더 비싸다.
  const tarCmd = opts.compress
    ? 'tar -cf - -C /from . | gzip -1 > /to/mysql.tar.gz'
    : 'tar -cf /to/mysql.tar -C /from .';

  console.log('  앱·MySQL 정지 (일관된 복사를 위해 필수)');
  stopStack();
  const t0 = Date.now();
  try {
    run('docker', ['run', '--rm',
      '-v', `${vol}:/from:ro`,
      '-v', `${dockerPath(dir)}:/to`,
      'alpine', 'sh', '-c', tarCmd], { stdio: 'inherit' });
  } finally {
    console.log('  앱·MySQL 재기동');
    startStack();
  }
  const tarMs = Date.now() - t0;
  const bytes = fs.statSync(path.join(dir, archive)).size;

  // 재기동 후 상태가 그대로인지 확인한다. 달라졌다면 정지·복사 절차 자체가 데이터를
  // 건드렸다는 뜻이고, 그 스냅샷은 무엇의 사본인지 알 수 없다.
  const after = dbstate.computeState();
  if (after.fingerprint !== state.fingerprint) {
    throw new Error(
      `재기동 후 상태 지문이 달라졌습니다: ${state.fingerprint} → ${after.fingerprint}\n` +
      `  ${dbstate.describeDiff(dbstate.diff(state, after))}`);
  }

  const meta = {
    snapshotId: id,
    profile,
    volume: vol,
    archive,
    compressed: !!opts.compress,
    generation: gen.fingerprint,
    generatorVersion: gen.generatorVersion,
    state: state.fingerprint,
    core: state.core,
    volatileAtCapture: state.volatile,
    archiveBytes: bytes,
    tarMs,
    note: opts.note || '',
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(dir, 'snapshot.json'), JSON.stringify(meta, null, 1));

  console.log(`\n✅ ${id}`);
  console.log(`   아카이브 ${(bytes / 1e9).toFixed(2)} GB · 소요 ${(tarMs / 1000).toFixed(1)}초`);
  console.log(`   상태 지문 ${state.fingerprint}`);
  return meta;
}

// ── 조회 ────────────────────────────────────────────────────────────────────

function listSnapshots() {
  if (!fs.existsSync(SNAP_ROOT)) return [];
  return fs.readdirSync(SNAP_ROOT)
    .map((d) => path.join(SNAP_ROOT, d, 'snapshot.json'))
    .filter((f) => fs.existsSync(f))
    .map((f) => JSON.parse(fs.readFileSync(f, 'utf8')))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

/**
 * 프로파일의 기준 스냅샷. **생성 지문이 현재 `meta.json` 과 같은 것만** 고른다 —
 * 데이터셋을 다시 만들었는데 옛 스냅샷으로 복원하면 `posts.json` 이 가리키는 ID 가
 * DB 에 없는 사태가 된다(이미 한 번 겪은 실패다).
 */
function latestFor(profile) {
  const gen = generationOf(profile).fingerprint;
  const all = listSnapshots().filter((s) => s.profile === profile);
  const matching = all.filter((s) => s.generation === gen);
  if (matching.length) return matching[0];
  if (all.length) {
    throw new Error(
      `프로파일 '${profile}' 스냅샷은 있지만 생성 지문이 다릅니다.\n` +
      `  현재 meta.json: ${gen}\n  최신 스냅샷    : ${all[0].generation} (${all[0].snapshotId})\n` +
      '  데이터셋을 다시 만들었다면 스냅샷도 다시 떠야 합니다: node tools/snapshot.js create ' + profile);
  }
  return null;
}

// ── restore ────────────────────────────────────────────────────────────────

function restore(snap) {
  const dir = path.join(SNAP_ROOT, snap.snapshotId);
  const archivePath = path.join(dir, snap.archive);
  if (!fs.existsSync(archivePath)) throw new Error(`아카이브가 없습니다: ${archivePath}`);

  console.log(`▶ 복원 — ${snap.snapshotId} → ${snap.volume}`);
  const untar = snap.compressed
    ? 'find /to -mindepth 1 -delete && gzip -dc /from/mysql.tar.gz | tar -xf - -C /to'
    : 'find /to -mindepth 1 -delete && tar -xf /from/mysql.tar -C /to';

  console.log('  앱·MySQL 정지');
  stopStack();
  const t0 = Date.now();
  run('docker', ['run', '--rm',
    '-v', `${snap.volume}:/to`,
    '-v', `${dockerPath(dir)}:/from:ro`,
    'alpine', 'sh', '-c', untar], { stdio: 'inherit' });
  const untarMs = Date.now() - t0;

  console.log('  MySQL 기동');
  run('docker', ['start', MYSQL_CT]);
  waitHealthy(MYSQL_CT);

  // DB 를 과거로 되돌렸으면 캐시도 반드시 버려야 한다. 남기면 스케줄러가 미래 상태의
  // 조회수 버퍼를 과거 데이터 위에 얹고, 캐시된 목록이 없는 ID 를 가리킨다.
  console.log('  Redis FLUSHALL (복원 후 캐시는 cold 다)');
  run('docker', ['exec', REDIS_CT, 'redis-cli', 'FLUSHALL']);

  console.log('  앱 기동');
  run('docker', ['start', APP_CT]);
  waitAppReady();

  const after = dbstate.computeState();
  const ok = after.fingerprint === snap.state;
  console.log(`  복원 후 상태 지문 ${after.fingerprint} ${ok ? '= 스냅샷 일치' : '≠ 스냅샷(' + snap.state + ')'}`);
  if (!ok) {
    // 여기서 통과시키면 "무엇을 잰 것인지 알 수 없는 실행"이 만들어진다. 복원이 목적을
    // 달성하지 못했으면 조용히 진행하는 것보다 멈추는 편이 낫다.
    throw new Error('복원했는데 상태 지문이 스냅샷과 다릅니다 — 아카이브 손상 또는 복원 절차 문제.');
  }
  console.log(`\n✅ 복원 완료 · 소요 ${(untarMs / 1000).toFixed(1)}초 (압축 해제 구간)`);
  return { untarMs, state: after };
}

// ── verify ─────────────────────────────────────────────────────────────────

function verify(profile) {
  const snap = latestFor(profile);
  if (!snap) throw new Error(`프로파일 '${profile}'의 스냅샷이 없습니다.`);
  const now = dbstate.computeState();
  const same = now.fingerprint === snap.state;
  console.log(`스냅샷 ${snap.snapshotId}`);
  console.log(`  스냅샷 상태 ${snap.state}`);
  console.log(`  현재   상태 ${now.fingerprint}  (${now.elapsedMs}ms)`);
  if (same) {
    console.log('  ✅ 일치 — 데이터가 스냅샷 시점 그대로다');
  } else {
    const d = dbstate.diff({ core: snap.core, volatile: snap.volatileAtCapture }, now);
    console.log('  ❌ 불일치 — ' + dbstate.describeDiff(d, 5));
    process.exitCode = 1;
  }
  const vd = dbstate.diff({ core: snap.core, volatile: snap.volatileAtCapture }, now).volatileChanged;
  if (vd.length) {
    console.log('  (지문 제외 항목의 변화 — 정상)');
    for (const v of vd) console.log(`     ${v.key} ${v.delta > 0 ? '+' : ''}${v.delta.toLocaleString()}`);
  }
  return same;
}

// ── CLI ────────────────────────────────────────────────────────────────────

function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const opts = { compress: true, note: '', id: null };
  const rest = [];
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--no-compress') opts.compress = false;
    else if (argv[i] === '--note') opts.note = argv[++i];
    else if (argv[i] === '--id') opts.id = argv[++i];
    else rest.push(argv[i]);
  }

  try {
    if (cmd === 'create') {
      if (!rest[0]) throw new Error('프로파일을 지정하세요: node tools/snapshot.js create large');
      create(rest[0], opts);
    } else if (cmd === 'restore') {
      const snap = opts.id
        ? listSnapshots().find((s) => s.snapshotId === opts.id)
        : latestFor(rest[0]);
      if (!snap) throw new Error(`스냅샷을 찾을 수 없습니다: ${opts.id || rest[0]}`);
      restore(snap);
    } else if (cmd === 'list') {
      const all = listSnapshots();
      if (!all.length) return console.log('스냅샷이 없습니다.');
      for (const s of all) {
        console.log(`${s.snapshotId}`);
        console.log(`   프로파일 ${s.profile} · ${(s.archiveBytes / 1e9).toFixed(2)} GB` +
          `${s.compressed ? ' (gzip)' : ''} · ${s.createdAt}`);
        console.log(`   생성 ${s.generation} · 상태 ${s.state}${s.note ? ` · "${s.note}"` : ''}`);
      }
    } else if (cmd === 'verify') {
      verify(rest[0] || 'large');
    } else {
      console.error('사용법: node tools/snapshot.js <create|restore|list|verify> [profile] [옵션]');
      process.exit(2);
    }
  } catch (e) {
    console.error(`\n❌ ${e.message}`);
    process.exit(1);
  }
}

module.exports = { create, restore, verify, listSnapshots, latestFor, volumeName, generationOf };

if (require.main === module) main();
