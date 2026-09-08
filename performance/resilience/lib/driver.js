/**
 * 주입 드라이버 — 계획대로 정해진 시각에 toxiproxy·docker·pumba·shell 을 실행하고,
 * 실제 실행 시각과 결과를 events 에 남긴다. 어떤 일이 있어도 끝에는 원상복구한다.
 *
 * 시각의 기준(t0)
 *   k6 스크립트의 setup() 이 이 드라이버의 로컬 HTTP 서버로 `/started` 를 부른다. 그 수신
 *   시각이 t0 다. 신호가 일정 시간 안에 안 오면(스크립트 오류 등) spawn 시각으로 폴백하고
 *   그 사실을 events 에 남긴다 — 어느 쪽 기준이었는지 보고서가 말할 수 있어야 한다.
 *
 * 정리(cleanup)
 *   - toxiproxy: 계획에 등장한 프록시의 toxic 을 전부 제거하고 enable
 *   - docker: 계획에 등장한 컨테이너를 running 으로 (paused → unpause, exited → start)
 *   - pumba: 아직 살아 있는 프로세스를 kill
 *   여러 번 불려도 안전하다. SIGINT·예외·정상 종료 모두 이 경로를 지난다.
 */
'use strict';

const http = require('http');
const { spawnSync } = require('child_process');
const { Toxiproxy } = require('./toxiproxy');
const dockerLib = require('./docker');
const { schedule } = require('./plan');

class Driver {
  constructor(plan, { log = console.log, toxiproxyUrl } = {}) {
    this.plan = plan;
    this.log = log;
    this.tox = new Toxiproxy(toxiproxyUrl);
    this.events = [];
    this.timers = [];
    this.pumbaChildren = [];
    this.t0 = null;
    this.t0Source = null;
    this.server = null;
    this.cleaned = false;
    this.startedResolve = null;
    this.finishedAt = null;
  }

  /** 계획에 등장하는 자원 — 정리 대상. */
  resources() {
    const proxies = new Set();
    const containers = new Set();
    for (const s of this.plan.inject) {
      if (s.tool === 'toxiproxy' && s.proxy) proxies.add(s.proxy);
      if (s.tool === 'docker' && s.container) containers.add(s.container);
    }
    return { proxies: [...proxies], containers: [...containers] };
  }

  /** 로컬 HTTP 서버를 연다. k6 setup()/teardown() 이 여기로 신호를 보낸다. 반환: URL. */
  listen() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        if (req.url === '/started') {
          if (!this.t0) {
            this.t0 = new Date();
            this.t0Source = 'k6-setup';
            this.log(`  t0 = ${this.t0.toISOString()} (k6 setup 신호)`);
            if (this.startedResolve) this.startedResolve();
          }
          res.writeHead(204); res.end(); return;
        }
        if (req.url === '/finished') {
          this.finishedAt = new Date();
          res.writeHead(204); res.end(); return;
        }
        res.writeHead(404); res.end();
      });
      this.server.on('error', reject);
      this.server.listen(0, '127.0.0.1', () => {
        const { port } = this.server.address();
        resolve(`http://127.0.0.1:${port}`);
      });
    });
  }

  /** t0 를 기다린다. 시한 안에 신호가 없으면 fallback 시각을 t0 로 쓴다. */
  waitForStart(fallbackDate, timeoutMs = 60000) {
    if (this.t0) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (!this.t0) {
          this.t0 = fallbackDate;
          this.t0Source = 'spawn-fallback';
          this.events.push({ kind: 'warning', at: new Date().toISOString(),
            message: `k6 setup 신호가 ${timeoutMs / 1000}초 안에 오지 않아 spawn 시각을 t0 로 쓴다 — 주입 시각이 몇 초 어긋날 수 있다` });
          this.log('  ⚠ k6 setup 신호 없음 — spawn 시각으로 폴백');
        }
        resolve();
      }, timeoutMs);
      this.startedResolve = () => { clearTimeout(timer); resolve(); };
    });
  }

  /** t0 기준으로 모든 step 의 타이머를 건다. */
  arm() {
    if (!this.t0) throw new Error('arm(): t0 가 없다 — waitForStart() 먼저');
    const steps = schedule(this.plan);
    const now = Date.now();
    for (const step of steps) {
      const fireAt = this.t0.getTime() + step.plannedAtSec * 1000;
      const delay = Math.max(0, fireAt - now);
      const timer = setTimeout(() => { this.execute(step).catch(() => {}); }, delay);
      this.timers.push(timer);
    }
    this.log(`  주입 ${steps.length}건 예약: ${steps.map((s) => `${s.tool}:${s.action || (s.args || s.argv || []).join(' ')}@${s.plannedAtSec}s`).join(', ')}`);
    return steps;
  }

  async execute(step) {
    const started = new Date();
    const actualAtSec = (started.getTime() - this.t0.getTime()) / 1000;
    const ev = {
      kind: 'inject', index: step.index, tool: step.tool, action: step.action || null,
      target: step.proxy || step.container || null,
      plannedAtSec: step.plannedAtSec, actualAtSec: Math.round(actualAtSec * 10) / 10,
      at: started.toISOString(), ok: false, detail: null, error: null,
    };
    try {
      ev.detail = await this.run(step);
      ev.ok = true;
      this.log(`  [${ev.actualAtSec}s] ${step.tool} ${step.action || ''} ${ev.target || ''} ✓`);
    } catch (e) {
      ev.error = e.message;
      this.log(`  [${ev.actualAtSec}s] ${step.tool} ${step.action || ''} ${ev.target || ''} ✗ ${e.message}`);
    }
    ev.durationMs = Date.now() - started.getTime();
    this.events.push(ev);
    return ev;
  }

  async run(step) {
    switch (step.tool) {
      case 'toxiproxy': {
        if (step.action === 'add') return this.tox.addToxic(step.proxy, step.toxic);
        if (step.action === 'remove') return { removed: await this.tox.removeToxic(step.proxy, step.toxicName) };
        if (step.action === 'enable') return this.tox.setEnabled(step.proxy, true);
        if (step.action === 'disable') return this.tox.setEnabled(step.proxy, false);
        throw new Error(`toxiproxy action 을 모른다: ${step.action}`);
      }
      case 'docker':
        return dockerLib.act(step);
      case 'pumba': {
        const child = dockerLib.pumba(step.args, this.log);
        this.pumbaChildren.push(child);
        return { pid: child.pid, args: step.args };
      }
      case 'shell': {
        const r = spawnSync(step.argv[0], step.argv.slice(1), { encoding: 'utf8' });
        if (r.error) throw r.error;
        if (r.status !== 0) throw new Error(`exit ${r.status}: ${(r.stderr || '').slice(0, 300)}`);
        return { stdout: (r.stdout || '').slice(0, 500) };
      }
      default:
        throw new Error(`tool 을 모른다: ${step.tool}`);
    }
  }

  /** 원상복구. 여러 번 불려도 한 번만 실제로 동작한다. 반환: 취한 조치 목록. */
  async cleanup(reason = 'end') {
    if (this.cleaned) return [];
    this.cleaned = true;
    for (const t of this.timers) clearTimeout(t);
    const actions = [];
    const { proxies, containers } = this.resources();

    for (const child of this.pumbaChildren) {
      if (child.exitCode == null) { try { child.kill(); actions.push(`pumba pid ${child.pid} kill`); } catch (_) { /* 이미 죽음 */ } }
    }
    if (proxies.length) {
      try {
        const list = await this.tox.list();
        for (const p of proxies) {
          const entry = list[p];
          if (!entry) continue;
          for (const t of entry.toxics || []) { await this.tox.removeToxic(p, t.name); actions.push(`toxic ${p}/${t.name} 제거`); }
          if (entry.enabled === false) { await this.tox.setEnabled(p, true); actions.push(`proxy ${p} enable`); }
        }
      } catch (e) {
        actions.push(`toxiproxy 정리 실패: ${e.message}`);
      }
    }
    for (const c of containers) {
      try {
        const did = dockerLib.ensureRunning(c);
        if (did) actions.push(`docker ${did} ${c}`);
      } catch (e) {
        actions.push(`docker ${c} 복구 실패: ${e.message}`);
      }
    }
    if (this.server) { try { this.server.close(); } catch (_) { /* 무시 */ } }
    this.events.push({ kind: 'cleanup', at: new Date().toISOString(), reason, actions });
    if (actions.length) this.log(`  정리(${reason}): ${actions.join(', ')}`);
    return actions;
  }
}

module.exports = { Driver };
