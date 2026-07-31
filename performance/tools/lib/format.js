/**
 * 표시 포맷 유틸 — 리포트/콘솔이 공유한다.
 *
 * 왜 별도 파일인가: 같은 값이 HTML에서는 "1.4 GB", 콘솔에서는 "1.4GB"로 달라지면
 * 보고서를 신뢰하기 어려워진다. 포맷을 한 곳에 두고 양쪽이 같은 함수를 쓴다.
 */
'use strict';

const nz = (v) => v != null && Number.isFinite(Number(v));

function num(v, digits = 1) {
  if (!nz(v)) return '—';
  const n = Number(v);
  // 값의 크기에 따라 유효 자릿수를 조절한다. 0.0034를 "0.0"으로 보여주면 정보가 사라진다.
  if (n !== 0 && Math.abs(n) < 0.01) return n.toExponential(1);
  if (Math.abs(n) >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return n.toFixed(digits);
}

function bytes(v) {
  if (!nz(v)) return '—';
  const n = Number(v);
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let x = Math.abs(n);
  while (x >= 1024 && i < units.length - 1) { x /= 1024; i++; }
  return `${(n < 0 ? -x : x).toFixed(x >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function ms(v) {
  if (!nz(v)) return '—';
  const n = Number(v);
  if (n >= 60000) return `${(n / 60000).toFixed(1)}m`;
  if (n >= 1000) return `${(n / 1000).toFixed(2)}s`;
  return `${n.toFixed(n < 10 ? 1 : 0)}ms`;
}

function pct(v, digits = 1) {
  return nz(v) ? `${Number(v).toFixed(digits)}%` : '—';
}

function duration(sec) {
  if (!nz(sec)) return '—';
  const s = Math.round(Number(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}h ${m}m ${r}s`;
  if (m > 0) return `${m}m ${r}s`;
  return `${r}s`;
}

/** 카탈로그의 unit 값에 맞춰 자동 포맷 */
function byUnit(v, unit) {
  if (!nz(v)) return '—';
  switch (unit) {
    case 'bytes': return bytes(v);
    case 'bytes_per_sec': return `${bytes(v)}/s`;
    case 'ms': return ms(v);
    case 'seconds': return duration(v);
    case 'percent': return pct(v);
    case 'per_sec': return `${num(v)}/s`;
    case 'cores': return `${num(v, 2)} core`;
    case 'count': return num(v, 0);
    default: return num(v);
  }
}

/** 증감률 문자열. 부호를 항상 붙여 방향이 한눈에 보이게 한다. */
function delta(pctChange) {
  if (!nz(pctChange)) return '—';
  const n = Number(pctChange);
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/** ISO 문자열을 한국 시간대 표기로 (리포트 독자가 국내 팀이므로) */
function localTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  return kst.toISOString().replace('T', ' ').slice(0, 19) + ' KST';
}

module.exports = { num, bytes, ms, pct, duration, byUnit, delta, escapeHtml, localTime, nz };
