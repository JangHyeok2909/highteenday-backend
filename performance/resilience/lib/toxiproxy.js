/**
 * toxiproxy HTTP API 클라이언트 — 필요한 다섯 가지만.
 *
 *   list()                        프록시 목록 (사전 점검·정리)
 *   addToxic(proxy, toxic)        toxic 추가  {name, type, stream, toxicity, attributes}
 *   removeToxic(proxy, name)      toxic 제거
 *   setEnabled(proxy, bool)       프록시 자체를 끊거나(false) 잇는다(true) — crash 의 프록시 판
 *   reset()                       모든 프록시의 toxic 제거 + enabled — pre 구간은 이 상태여야 한다
 *
 * API 문서: https://github.com/Shopify/toxiproxy#http-api
 */
'use strict';

const { request } = require('./http');

class Toxiproxy {
  constructor(baseUrl = process.env.TOXIPROXY_URL || 'http://127.0.0.1:18474') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async list() {
    const r = await request('GET', `${this.baseUrl}/proxies`);
    if (r.status !== 200) throw new Error(`toxiproxy list 실패: HTTP ${r.status} ${r.text.slice(0, 200)}`);
    return r.json || {};
  }

  async addToxic(proxy, toxic) {
    const r = await request('POST', `${this.baseUrl}/proxies/${proxy}/toxics`, toxic);
    if (r.status !== 200) throw new Error(`toxic 추가 실패 (${proxy}/${toxic.name}): HTTP ${r.status} ${r.text.slice(0, 200)}`);
    return r.json;
  }

  async removeToxic(proxy, name) {
    const r = await request('DELETE', `${this.baseUrl}/proxies/${proxy}/toxics/${name}`);
    // 404 = 이미 없음. 정리 경로에서 두 번 불려도 실패로 치지 않는다.
    if (r.status !== 204 && r.status !== 404) throw new Error(`toxic 제거 실패 (${proxy}/${name}): HTTP ${r.status} ${r.text.slice(0, 200)}`);
    return r.status === 204;
  }

  async setEnabled(proxy, enabled) {
    const r = await request('POST', `${this.baseUrl}/proxies/${proxy}`, { enabled: !!enabled });
    if (r.status !== 200) throw new Error(`proxy ${enabled ? 'enable' : 'disable'} 실패 (${proxy}): HTTP ${r.status} ${r.text.slice(0, 200)}`);
    return r.json;
  }

  /** 모든 프록시를 깨끗한 상태로 — toxic 0개, enabled. 반환: 걷어낸 toxic 이름들. */
  async reset() {
    const r = await request('POST', `${this.baseUrl}/reset`);
    if (r.status !== 204) throw new Error(`toxiproxy reset 실패: HTTP ${r.status}`);
    return true;
  }

  /** 사전 점검 — 접속되는가, 요구한 프록시가 있는가, toxic 이 남아 있지 않은가. */
  async preflight(requiredProxies = []) {
    const proxies = await this.list();
    const missing = requiredProxies.filter((p) => !proxies[p]);
    const dirty = Object.entries(proxies)
      .filter(([, p]) => (p.toxics && p.toxics.length) || p.enabled === false)
      .map(([name, p]) => `${name}(${p.enabled === false ? 'disabled' : (p.toxics || []).map((t) => t.name).join(',')})`);
    return { proxies: Object.keys(proxies), missing, dirty };
  }
}

module.exports = { Toxiproxy };
