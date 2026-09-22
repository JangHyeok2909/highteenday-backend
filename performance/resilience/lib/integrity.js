/**
 * 불변식 표본 채취 — 실행 도중 정해진 네 시각에 MySQL·Redis 집계를 뜬다.
 *
 * 회복·탐지(`lib/recovery.js`)와 결정적으로 다르다. 회복은 끝난 뒤 저장된 시계열을 다시
 * 읽는 순수 계산이지만, 정확성은 **그 순간에 값을 떠 두지 않으면 나중에 복원할 수 없다.**
 * 그래서 이 모듈만 실행 수명주기에 끼어든다.
 *
 * <h2>표본 넷</h2>
 *
 *   S0  부하 시작 직전      기준선. `--restore` 와 Redis 초기화가 끝난 뒤여야 한다
 *   S1  장애 주입 직전      장애가 시작될 때의 확정 상태
 *   S2  장애 제거 직후      장애가 남긴 상태
 *   S3  부하 종료 + 드레인   비동기 반영이 끝난 뒤의 최종 상태
 *
 * S1 을 주입보다 몇 초 앞에 두는 이유는 이 질의 자체가 MySQL 에 부하를 주기 때문이다.
 * 주입 순간과 겹치면 실험이 재려던 것과 관측 도구가 만든 것이 섞인다.
 *
 * <h2>드레인 대기 — 무엇을 위한 것인가</h2>
 *
 * 조회수처럼 Redis 에 버퍼링됐다가 스케줄러가 나중에 DB 로 내리는 값은, 부하가 끝나자마자
 * 읽으면 마지막 주기가 아직 안 돌았다. 그 상태로 잰 값은 **유실을 과소 보고한다** — 아직
 * 버퍼에 남은 몫이 "사라진 것"이 아니라 "아직 안 간 것"으로 계산되기 때문이다
 * (`invariants.js` 의 보존 식은 버퍼 잔량을 양쪽에서 빼므로 과대 보고는 하지 않는다).
 *
 * 기다리는 진짜 이유는 그것이 아니라, **"결국 DB 까지 갔는가"** 가 이 실험의 질문이기
 * 때문이다. 마지막 주기가 돌아야 버퍼가 0 에 가까워지고, 그때 남은 차이가 곧 장애가
 * 삼킨 몫이다. 대기가 필요한 프로브만 `needs.drain` 을 켜고 그 경우에만 S3 를 미룬다.
 * `counter-drift` 는 반응 트랜잭션 안에서 카운터가 동기로 맞춰지므로 대기가 필요 없다.
 *
 * <h2>못 읽은 것을 0 으로 적지 않는다</h2>
 *
 * 장애 중에 채취가 실패하는 것은 정상이다(대상이 그 저장소인 장애, 컨테이너 정지). 그때
 * 값을 0 으로 두면 "변화 없음"으로 보여 결함을 덮는다. 실패한 항목은 값 없이 사유만 남고,
 * 그 항목을 쓰는 불변식의 해당 구간이 `unknown` 이 된다(`invariants.js reconcile`).
 *
 * 저장소별로 따로 읽고 따로 실패를 기록하는 이유가 여기 있다. Redis 를 죽인 실험에서
 * 표본 하나를 통째로 버리면, 같은 표본의 멀쩡한 MySQL 값을 쓰는 불변식까지 확인 불가가
 * 된다 — 정작 그 실험에서 확인하고 싶은 것이 그쪽일 수 있다.
 */
'use strict';

const dbstate = require('../../tools/lib/dbstate');
const dockerLib = require('./docker');
const invariants = require('./invariants');

const REDIS_CONTAINER = process.env.PERF_REDIS_CONTAINER || 'perf-redis';

/**
 * 패턴에 맞는 키들의 값 합계와 개수를 한 번에 읽는 Lua.
 *
 * `KEYS` 대신 `SCAN` 을 쓴다 — 앱의 조회수 드레인이 가진 CACHE-001을 관측
 * 도구가 그대로 반복하면, 재려던 장애 대신 도구가 만든 멈춤을 재게 된다.
 * 왕복 한 번으로 끝내는 이유는 합계와 개수가 **같은 순간**의 값이어야 하기 때문이다.
 */
const REDIS_SUM_LUA = "local s=0 local n=0 local c='0' repeat "
  + "local r=redis.call('SCAN',c,'MATCH',ARGV[1],'COUNT',1000) c=r[1] "
  + "for _,k in ipairs(r[2]) do local v=redis.call('GET',k) if v and tonumber(v) then s=s+tonumber(v) n=n+1 end end "
  + "until c=='0' return {s,n}";

const DEFAULTS = {
  // 주입 직전 표본을 몇 초 앞에서 뜰 것인가. 질의가 장애 구간과 겹치지 않을 만큼만.
  leadSec: 5,
  // 장애 제거 뒤 몇 초 지나 뜰 것인가. 제거 명령이 끝나고 상태가 반영될 여유.
  lagSec: 5,
  // 비동기 반영을 기다리는 시간. ViewCountScheduler 의 fixedDelay 가 60초라 한 주기 +
  // 여유를 잡은 값이다. 대기가 필요한 프로브를 고른 계획에서만 쓰인다.
  drainWaitSec: 90,
};

/** 선택된 프로브들이 요구하는 집계 항목을 중복 없이 모은다. */
function columnsFor(probeIds) {
  const seen = new Set();
  const out = [];
  for (const id of probeIds || []) {
    const probe = invariants.get(id);
    if (!probe) continue;
    for (const col of probe.columns) {
      if (seen.has(col.key)) continue;
      seen.add(col.key);
      out.push(col);
    }
  }
  return out;
}

/**
 * 항목들을 UNION ALL 한 문장으로 만든다. 왕복 한 번이면 표본 전체가 **같은 순간**에 가깝다 —
 * 항목마다 따로 읽으면 그 사이에 부하가 값을 바꿔 등식이 이유 없이 깨진다.
 */
function buildSql(columns) {
  return columns
    .filter((c) => (c.source || 'db') === 'db')
    .map((c) => `SELECT '${c.key}' AS k, CAST(${c.expr} AS CHAR) AS v FROM ${c.from}${c.where ? ` WHERE ${c.where}` : ''}`)
    .join(' UNION ALL ');
}

/** Redis 항목을 패턴별로 묶는다. 같은 패턴을 두 번 훑을 이유가 없다. */
function redisGroups(columns) {
  const byPattern = new Map();
  for (const c of columns) {
    if (c.source !== 'redis') continue;
    if (!byPattern.has(c.pattern)) byPattern.set(c.pattern, []);
    byPattern.get(c.pattern).push(c);
  }
  return byPattern;
}

/**
 * Redis 에서 패턴별 합계·개수를 읽는다.
 *
 * 컨테이너가 막 살아난 직후(장애 제거 5초 뒤)에는 아직 접속을 못 받을 수 있어 한 번 더
 * 시도한다. 여기서 포기하면 이 실험의 핵심 수치인 "장애가 삼킨 버퍼"를 통째로 잃는다.
 */
function readRedis(columns) {
  const values = {};
  for (const [pattern, cols] of redisGroups(columns)) {
    let out = null;
    let lastError = null;
    for (let attempt = 0; attempt < 2 && out == null; attempt += 1) {
      const r = dockerLib.docker(['exec', REDIS_CONTAINER, 'redis-cli', 'EVAL', REDIS_SUM_LUA, '0', pattern], { allowFail: true });
      if (r.status === 0) out = r.stdout;
      else lastError = `${r.stderr || r.stdout || `exit ${r.status}`}`;
    }
    if (out == null) throw new Error(`Redis 패턴 ${pattern} 을 못 읽었다: ${String(lastError).slice(0, 120)}`);
    const [sum, keys] = out.split('\n').map((x) => Number(x.trim()));
    if (!Number.isFinite(sum) || !Number.isFinite(keys)) throw new Error(`Redis 응답을 해석하지 못했다: ${out.slice(0, 80)}`);
    for (const c of cols) values[c.key] = c.pick === 'keys' ? keys : sum;
  }
  return values;
}

/** MySQL 에서 집계 항목을 한 문장으로 읽는다. */
function readDb(columns) {
  const dbCols = columns.filter((c) => (c.source || 'db') === 'db');
  if (!dbCols.length) return {};
  const rows = dbstate.query(buildSql(dbCols));
  const values = {};
  for (const c of dbCols) {
    const raw = rows[c.key];
    if (raw == null) throw new Error(`항목 ${c.key} 를 못 읽었다`);
    values[c.key] = Number(raw);
  }
  return values;
}

/**
 * S1·S2 를 뜰 시각(실행 시작 기준 초). S0·S3 은 시각이 아니라 실행 단계에 붙으므로 없다.
 *
 * @param {object} plan 장애 계획.
 * @param {object} [opts] `leadSec`·`lagSec` 덮어쓰기.
 * @returns {{label:string, atSec:number}[]} 시각 오름차순.
 */
function sampleSchedule(plan, opts) {
  const o = { ...DEFAULTS, ...(opts || {}) };
  const { preSec, faultSec } = plan.phases;
  return [
    { label: 'S1', atSec: Math.max(0, preSec - o.leadSec) },
    { label: 'S2', atSec: preSec + faultSec + o.lagSec },
  ].sort((a, b) => a.atSec - b.atSec);
}

/** 이 계획이 실제로 기다려야 하는 드레인 초. 대기가 필요한 프로브가 없으면 0. */
function drainWaitFor(plan, opts) {
  const probes = probesOf(plan);
  if (!invariants.needsDrain(probes)) return 0;
  const o = { ...DEFAULTS, ...(opts || {}) };
  const declared = plan.integrity && plan.integrity.drainWaitSec;
  return Number.isFinite(declared) ? declared : o.drainWaitSec;
}

/** 계획이 고른 프로브 이름. 없으면 빈 배열이고, 그 경우 이 기능 전체가 꺼진다. */
function probesOf(plan) {
  const list = plan && plan.integrity && plan.integrity.probes;
  return Array.isArray(list) ? list : [];
}

/**
 * 지금 값을 읽는다. 유일한 부수효과 지점이다.
 *
 * @param {{key:string}[]} columns 읽을 항목.
 * @param {string} label 표본 이름(S0~S3).
 * @param {Date} [t0] 부하 시작 시각. 있으면 상대 초를 함께 남긴다.
 * @returns {{label:string, at:string, tSec:number|null, ok:boolean, values:object, elapsedMs:number, error:string|null}}
 */
function sampleNow(columns, label, t0) {
  const at = new Date();
  const startedAt = Date.now();
  const values = {};
  const sources = {};
  // 저장소별로 따로 읽고 따로 실패를 기록한다. 한쪽이 죽었다고 다른 쪽 값까지 버리면,
  // Redis 를 죽인 실험에서 DB 만 보는 불변식까지 확인 불가가 된다.
  for (const [name, read] of [['db', readDb], ['redis', readRedis]]) {
    const need = columns.some((c) => (c.source || 'db') === name);
    if (!need) continue;
    const t = Date.now();
    try {
      Object.assign(values, read(columns));
      sources[name] = { ok: true, elapsedMs: Date.now() - t, error: null };
    } catch (e) {
      sources[name] = { ok: false, elapsedMs: Date.now() - t, error: e.message.slice(0, 200) };
    }
  }
  const failed = Object.entries(sources).filter(([, s]) => !s.ok).map(([n]) => n);
  return {
    label,
    at: at.toISOString(),
    tSec: t0 ? Math.round((at.getTime() - t0.getTime()) / 100) / 10 : null,
    ok: failed.length === 0,
    values,
    sources,
    elapsedMs: Date.now() - startedAt,
    error: failed.length ? failed.map((n) => `${n}: ${sources[n].error}`).join(' · ') : null,
  };
}

/**
 * 표본 채취기 — 타이머를 걸고 결과를 모은다.
 *
 * 타이머는 어떤 종료 경로에서도 반드시 걷어야 한다. 남으면 실행이 끝난 뒤에 질의가 날아가
 * 다음 실행의 pre 구간에 부하를 준다(`stop()`).
 */
class Sampler {
  constructor(plan, { log = () => {}, opts = {} } = {}) {
    this.plan = plan;
    this.log = log;
    this.opts = { ...DEFAULTS, ...opts };
    this.probes = probesOf(plan);
    this.columns = columnsFor(this.probes);
    this.samples = [];
    this.timers = [];
    this.t0 = null;
  }

  get enabled() {
    return this.probes.length > 0 && this.columns.length > 0;
  }

  /** 지금 즉시 한 표본을 뜬다. S0·S3 처럼 시각이 아니라 단계에 붙는 표본에 쓴다. */
  take(label) {
    if (!this.enabled) return null;
    const s = sampleNow(this.columns, label, this.t0);
    this.samples.push(s);
    const read = `${Object.keys(s.values).length}/${this.columns.length}개 항목 · ${s.elapsedMs}ms`;
    this.log(`  불변식 표본 ${label}: ${s.ok ? read : `${read} · 실패 — ${s.error}`}`);
    return s;
  }

  /** t0 이 정해진 뒤 S1·S2 타이머를 건다. 이미 지난 시각은 건너뛴다. */
  arm(t0) {
    this.t0 = t0;
    if (!this.enabled) return;
    // S0 은 t0 이 정해지기 전에 떠서 상대 시각이 비어 있다. 지금 채우면 음수가 되는데,
    // 그 음수가 곧 "기준선을 부하보다 몇 초 앞에서 떴다"는 정보다.
    for (const s of this.samples) {
      if (s.tSec == null) s.tSec = Math.round((Date.parse(s.at) - t0.getTime()) / 100) / 10;
    }
    for (const step of sampleSchedule(this.plan, this.opts)) {
      const delay = t0.getTime() + step.atSec * 1000 - Date.now();
      if (delay < 0) {
        this.log(`  ⚠ 불변식 표본 ${step.label} 예정 시각(${step.atSec}s)이 이미 지났다 — 건너뛴다`);
        continue;
      }
      this.timers.push(setTimeout(() => this.take(step.label), delay));
    }
  }

  stop() {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }
}

module.exports = { Sampler, sampleNow, sampleSchedule, columnsFor, buildSql, redisGroups, probesOf, drainWaitFor, DEFAULTS };
