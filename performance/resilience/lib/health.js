/**
 * 헬스체크 폴러 — 실행 내내 /actuator/health 를 주기적으로 찍는다.
 *
 * 왜 따로 재는가: 관측 정직성 보장("장애를 어떻게 알아채나")의 직접 증거다. 앱이 폴백으로
 * 응답하고 있는데 헬스가 DOWN 이면 로드밸런서가 멀쩡한 인스턴스를 뺀다 — 부분 저하가
 * 전면 장애로 승격되는 경로다. k6 지표에는 이 정보가 없다.
 *
 * perf 프로파일은 show-details=always 라 components 별 상태가 본문에 온다.
 */
'use strict';

const { request } = require('./http');

function summarizeComponents(json) {
  const comps = json && json.components;
  if (!comps) return null;
  const out = {};
  for (const [name, c] of Object.entries(comps)) out[name] = c && c.status ? c.status : '?';
  return out;
}

class HealthPoller {
  constructor(url, { intervalMs = 5000, timeoutMs = 4000, t0 = null } = {}) {
    this.url = url;
    this.intervalMs = intervalMs;
    this.timeoutMs = timeoutMs;
    this.t0 = t0;
    this.samples = [];
    this.timer = null;
  }

  setT0(t0) { this.t0 = t0; }

  start() {
    if (this.timer) return;
    const tick = async () => {
      const at = new Date();
      const s = { at: at.toISOString(), tSec: this.t0 ? Math.round((at.getTime() - this.t0.getTime()) / 100) / 10 : null };
      const started = Date.now();
      try {
        const r = await request('GET', this.url, null, { timeoutMs: this.timeoutMs });
        s.httpStatus = r.status;
        s.status = (r.json && r.json.status) || null;
        s.components = summarizeComponents(r.json);
      } catch (e) {
        s.httpStatus = null;
        s.status = 'UNREACHABLE';
        s.error = e.message.slice(0, 120);
      }
      s.latencyMs = Date.now() - started;
      this.samples.push(s);
    };
    tick();
    this.timer = setInterval(tick, this.intervalMs);
  }

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  /** 상태가 바뀐 지점만 — 보고서의 "헬스 전이" 표. */
  transitions() {
    const out = [];
    let prev = null;
    for (const s of this.samples) {
      const key = `${s.status}/${s.httpStatus}`;
      if (key !== prev) { out.push(s); prev = key; }
    }
    return out;
  }
}

module.exports = { HealthPoller };
