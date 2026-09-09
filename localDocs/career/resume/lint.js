#!/usr/bin/env node
/**
 * lint.js — 이력서·포트폴리오 원고의 문체 계측기
 *
 * 무엇을 하나: 원고에서 "AI 티"와 한국 개발자 이력서 관례 위반을 세어 줄 번호와 함께 보고한다.
 * 기준: localDocs/career/references/rules-korean-prose.md
 *       (실물 이력서 4편에서 0건인 항목이 "강한 위반"이다. 실물 계측값은 그 문서 0절)
 *
 * 사용:
 *   node lint.js                          # resume-feed-infra.md portfolio-feed-infra.md 둘 다
 *   node lint.js resume-feed-infra.md     # 하나만
 *   node lint.js resume-feed-infra.md --strict     # 강한 위반이 하나라도 있으면 exit 1
 *   node lint.js resume-feed-infra.md --extract out/resume-screen.md   # PDF에 들어가는 본문만 뽑아 저장(맹검 심사용)
 *   node lint.js resume-feed-infra.md --json       # 기계용 출력
 *
 * 의존성 없음. python 이 없는 환경이라 node 로 쓴다.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const ex = argv.indexOf('--extract');
const opt = { strict: argv.includes('--strict'), json: argv.includes('--json'), extract: ex >= 0 ? argv[ex + 1] : null };
const files = argv.filter((a, i) => !a.startsWith('--') && !(ex >= 0 && i === ex + 1));
const targets = files.length ? files : ['resume-feed-infra.md', 'portfolio-feed-infra.md'];

// 불릿 길이 문턱. 실물 4편의 불릿 평균은 23~49자, p90 은 34~70자, 90자를 넘는 불릿은 편당 0~1개다.
const BULLET_MAX = 90;

// 작업 문서(GAPS·전략·장부)에서 원고로 새어 들어온 어휘. 원고에는 일반어를 쓴다.
const LEAK_HARD = ['장치', '자격을', '자격이', '서사', '미끼', '거짓말', '오보', '뼈아픈', '본문입니다', '전제입니다', '사건 하나', '사건 둘', '태운'];
const LEAK_SOFT = ['판정', '오진', '반박', '승격', '선언', '사건'];
// 메타 담화: 말에 대한 말. 지운다 (technical-writing.dev "필요한 정보만 남기기").
const META = ['먼저 밝', '숨기지 않', '여기서 한 판단', '이 장이 ', '이 기록이', '정직', '스스로 무효', '가장 뼈아픈', '고백', '솔직히', '결론적으로', '사실은'];
// 국내 백엔드 개발자가 일상적으로 쓰지 않는 용어. 풀어 쓰거나 통용어로 바꾼다 (rules-korean-prose 2.12, 2026-09-07).
const JARGON = ['명시적 신호', '암시적 신호', '정렬 집합', '패치 조인', '해석 조건', '게이팅', '운용점', '도착률', '방아쇠', '관문', '사슬', '장부', '무차원', '체크-후-실행', '선형보간', '앞의 것', '뒤의 것'];
// 전략 결정으로 이력서에서 쓰지 않기로 한 단어 (memory: toss-interview-prep, 2026-08-31).
const STRATEGY_BAN = ['대규모', '확장', '트래픽'];
// 사역·피동·번역투
const CAUSATIVE = ['게 만듦', '게 만들', '도록 만듦', '도록 만들', '되어지', '에 의해', '에 있어', '함으로써'];

function load(p) {
  let s = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  const i = s.indexOf('<!-- CUT -->');
  return i < 0 ? s : s.slice(0, i);
}

// 코드 펜스·html-raw·주석을 빈 줄로 바꿔 줄 번호를 유지한 채 산문만 남긴다.
// html-raw 블록(KPI 카드·그림 캡션)의 서술체 문장은 따로 센다 (rawHtmlSentences).
const rawHtmlSentences = [];
function maskBlocks(lines) {
  let inFence = false, inHtml = false;
  rawHtmlSentences.length = 0;
  return lines.map((l, i) => {
    if (/^```/.test(l)) { inFence = !inFence; inHtml = inFence && /^```html-raw/.test(l); return ''; }
    if (inFence) { if (inHtml && /(습니다|입니다|합니다)/.test(l)) rawHtmlSentences.push({ line: i + 1, n: (l.match(/(습니다|입니다|합니다)/g) || []).length, text: l.replace(/<[^>]+>/g, '').trim() }); return ''; }
    if (/^\s*<!--/.test(l)) return '';
    if (/^\s*\/\//.test(l)) return ''; // 원고 주석(사용자 코멘트·답)은 계측하지 않는다
    return l;
  });
}

const isHeading = (l) => /^#{1,6}\s/.test(l);
const isTable = (l) => /^\s*\|/.test(l);
const isBullet = (l) => /^\s*- \S/.test(l);
const isProse = (l) => !isHeading(l) && !isTable(l);
const notTable = (l) => !isTable(l); // 제목 줄도 어휘 검사 대상이다 ("거짓말", "걸러내게 만듦" 같은 제목이 있었다)
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 불릿을 이어진(들여쓴) 줄까지 합친다. 반환: [{line, text}]
function joinBullets(lines) {
  const out = [];
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (isBullet(l)) { out.push({ line: i + 1, text: l.replace(/^\s*- /, '').trim() }); cur = out.length - 1; continue; }
    if (cur !== null && /^\s{2,}\S/.test(l) && !isHeading(l) && !isTable(l) && !/^\s*>/.test(l)) { out[cur].text += ' ' + l.trim(); continue; }
    cur = null;
  }
  return out;
}

// 줄 단위 검색. 반환: [{line, n, text}]
function find(lines, re, filter) {
  const hits = [];
  lines.forEach((l, i) => {
    if (filter && !filter(l)) return;
    const m = l.match(re);
    if (m && m.length) hits.push({ line: i + 1, n: m.length, text: l.trim() });
  });
  return hits;
}
const findWords = (lines, words, filter) => words.flatMap((w) => find(lines, new RegExp(esc(w), 'g'), filter).map((h) => ({ ...h, word: w })));

function analyze(file) {
  const raw = load(file);
  const rawLines = raw.split('\n');
  const lines = maskBlocks(rawLines);
  const r = {};

  // 1. em dash — (날짜 범위 "2019.01 — 현재" 는 제외)
  r.emdash = lines.map((l, i) => {
    const t = l.replace(/\d\s*—\s*(\d|현재|진행|재직)/g, '');
    const n = (t.match(/—/g) || []).length;
    return n ? { line: i + 1, n, text: l.trim() } : null;
  }).filter(Boolean);
  // 2. 접속 화살표 → (수치 전후 "1,507 → 3.9" 는 허용)
  r.arrow = lines.map((l, i) => {
    if (isTable(l)) return null; // 표 안의 화살표(배포 경로 등)는 관례로 본다
    const t = l.replace(/[\d,.%a-zA-Z개건배초)]\s*→\s*[\d약]/g, '');
    const n = (t.match(/→/g) || []).length;
    return n ? { line: i + 1, n, text: l.trim() } : null;
  }).filter(Boolean);
  // 3. 문장 안 굵게 (한 줄 전체가 레이블인 경우와 표 안은 제외)
  r.boldInProse = lines.map((l, i) => {
    if (!isProse(l)) return null;
    if (/^\s*(- )?\*\*[^*]+\*\*\s*[:：]?\s*$/.test(l)) return null; // 한 줄 전체가 레이블
    const t = l.replace(/^\s*(- )?\*\*[^*.!?。]{1,24}\*\*\s*[:：—–-]\s+/, ''); // 맨 앞 레이블 굵게(**언어**: …)는 관례
    const n = (t.match(/\*\*[^*\n]+\*\*/g) || []).length;
    return n ? { line: i + 1, n, text: l.trim() } : null;
  }).filter(Boolean);
  // 4. "X가 아니라 Y" 대조
  r.contrast = find(lines, /(?:가|이) 아니(?:라|다|닙니다|ㄴ)|가 아닌 /g, isProse);
  // 5. 따옴표 강조
  r.scareQuote = find(lines, /[“"][^”"\n]{1,20}[”"](?:고|로|이라|라는|를|을|는|가|에)/g, isProse);
  // 6. 문장형·문학적 제목
  r.headingStyle = rawLines.map((l, i) => ({ line: i + 1, text: l.trim() }))
    .filter((h) => isHeading(h.text))
    .map((h) => ({ ...h, core: h.text.replace(/^#+\s*/, '').replace(/\s*\(포트폴리오[^)]*\)\s*$/, '').trim() }))
    .filter((h) => /(함|만듦|했다|한다|이다|하기|하나|않았나|는가|인가|였나|였다|있었나|했나|다)$/.test(h.core) || /^["“]/.test(h.core) || /[?？]$/.test(h.core));
  // 7. 어휘 누출
  r.leakHard = findWords(lines, LEAK_HARD, notTable);
  r.leakSoft = findWords(lines, LEAK_SOFT, notTable);
  // 8. 메타 담화
  r.meta = findWords(lines, META, notTable);
  // 9. 전략 금지어
  r.strategyBan = findWords(lines, STRATEGY_BAN, notTable);
  // 10. 사역·피동·번역투
  r.causative = findWords(lines, CAUSATIVE, notTable);
  // 10b. 통용되지 않는 용어
  r.jargon = findWords(lines, JARGON, notTable);
  // 11. 불릿 길이·종결
  const bullets = joinBullets(lines);
  r.bulletCount = bullets.length;
  r.bulletLong = bullets.filter((b) => b.text.length > BULLET_MAX);
  r.bulletAvg = bullets.length ? Math.round(bullets.reduce((a, b) => a + b.text.length, 0) / bullets.length) : 0;
  r.bulletSubject = bullets.filter((b) => /(습니다|입니다|합니다)[.]?$/.test(b.text));
  r.bulletPeriod = bullets.filter((b) => /[.]$/.test(b.text) && !/(습니다|입니다|합니다)[.]$/.test(b.text));
  r.bulletGerund = bullets.filter((b) => /(함|음|됨|임)$/.test(b.text)); // 동명사형 종결. 실물은 순수 명사(개선·구축) 위주
  r.rawHtmlSentences = rawHtmlSentences.slice();
  // 12. 이력서의 포트폴리오 자기 참조 "(포트폴리오 n장)"
  r.selfRef = find(rawLines, /\(포트폴리오[^)]*\)/g);
  // 13. 덜 채운 자리
  r.gaps = find(rawLines, /\[\[[^\]]*\]\]/g);
  // 14. 괄호 안 문장 (괄호 안에 서술 어미가 있는 경우)
  r.parenSentence = find(lines, /\([^)]*(습니다|합니다|입니다|했다|한다|이다|하고|하며)[^)]*\)/g, isProse);

  return { file, chars: raw.length, lines: rawLines.length, r, text: lines.join('\n') };
}

const sum = (arr) => arr.reduce((a, h) => a + (h.n || 1), 0);
const clip = (s, n = 110) => (s.length > n ? s.slice(0, n) + '…' : s);

function report(a) {
  const { file, chars, r } = a;
  const rows = [
    ['em dash — (날짜 범위 제외)', sum(r.emdash), 0, 'hard'],
    ['접속 화살표 → (수치 전후 제외)', sum(r.arrow), 0, 'hard'],
    ['문장 안 굵게', sum(r.boldInProse), 0, 'hard'],
    ['"X가 아니라 Y" 대조', sum(r.contrast), 0, 'hard'],
    ['따옴표 강조', sum(r.scareQuote), 0, 'hard'],
    ['문장형·문학적 제목', r.headingStyle.length, 0, 'hard'],
    ['작업 어휘 누출(강)', sum(r.leakHard), 0, 'hard'],
    ['작업 어휘(확인)', sum(r.leakSoft), '-', 'soft'],
    ['메타 담화', sum(r.meta), 0, 'hard'],
    ['전략 금지어(대규모·확장·트래픽)', sum(r.strategyBan), 0, 'hard'],
    ['사역·피동·번역투', sum(r.causative), '-', 'soft'],
    ['통용되지 않는 용어(확인)', sum(r.jargon), '-', 'soft'],
    [`불릿 ${BULLET_MAX}자 초과 (≈2줄 이상)`, r.bulletLong.length, '0~1', 'hard'],
    ['불릿 평균 길이(자)', r.bulletAvg, '23~49', 'info'],
    ['불릿 ~습니다 종결', r.bulletSubject.length, 0, 'soft'],
    ['불릿 마침표 종결', r.bulletPeriod.length, 0, 'soft'],
    ['자기 참조 (포트폴리오 n장)', sum(r.selfRef), 0, 'hard'],
    ['html-raw 안 서술체 문장(카드·캡션)', sum(r.rawHtmlSentences), 0, 'soft'],
    ['불릿 동명사형 종결(~함·~음)', r.bulletGerund.length, '소수', 'info'],
    ['괄호 안 문장', sum(r.parenSentence), 0, 'soft'],
    ['덜 채운 자리 [[ ]]', sum(r.gaps), 0, 'hard'],
  ];
  const hard = rows.filter((x) => x[3] === 'hard' && typeof x[1] === 'number' && x[1] > 0);
  const out = [];
  out.push(`\n===== ${file}  (${chars.toLocaleString()}자, 불릿 ${r.bulletCount}개) =====`);
  out.push('항목                                     건수   실물기준  판정');
  for (const [name, n, ref, kind] of rows) {
    const flag = kind === 'hard' && typeof n === 'number' && n > 0 ? '위반' : kind === 'soft' && typeof n === 'number' && n > 0 ? '확인' : '';
    out.push(`${name.padEnd(38, ' ')} ${String(n).padStart(4)}   ${String(ref).padStart(6)}   ${flag}`);
  }
  const detail = (title, hits, max = 6, fmt = (h) => h.text) => {
    if (!hits.length) return;
    out.push(`\n-- ${title} (${hits.length}곳, 앞 ${Math.min(max, hits.length)}곳) --`);
    hits.slice(0, max).forEach((h) => out.push(`  L${h.line}: ${clip(fmt(h))}`));
  };
  detail('em dash', r.emdash);
  detail('접속 화살표', r.arrow);
  detail('문장 안 굵게', r.boldInProse);
  detail('대조 구문', r.contrast);
  detail('따옴표 강조', r.scareQuote);
  detail('문장형·문학적 제목', r.headingStyle, 12);
  detail('작업 어휘 누출(강)', r.leakHard, 8, (h) => `[${h.word}] ${h.text}`);
  detail('작업 어휘(확인)', r.leakSoft, 4, (h) => `[${h.word}] ${h.text}`);
  detail('메타 담화', r.meta, 8, (h) => `[${h.word}] ${h.text}`);
  detail('전략 금지어', r.strategyBan, 6, (h) => `[${h.word}] ${h.text}`);
  detail('사역·피동·번역투', r.causative, 6, (h) => `[${h.word}] ${h.text}`);
  detail('통용되지 않는 용어', r.jargon, 8, (h) => `[${h.word}] ${h.text}`);
  detail(`불릿 ${BULLET_MAX}자 초과`, r.bulletLong, 6, (h) => `(${h.text.length}자) ${h.text}`);
  detail('불릿 ~습니다 종결', r.bulletSubject, 3);
  detail('자기 참조', r.selfRef, 4);
  detail('html-raw 안 서술체', r.rawHtmlSentences, 4);
  detail('불릿 동명사형 종결', r.bulletGerund, 4);
  detail('괄호 안 문장', r.parenSentence, 4);
  detail('덜 채운 자리', r.gaps, 6);
  out.push(`\n강한 위반 항목 ${hard.length}개${hard.length ? ': ' + hard.map((x) => x[0]).join(' · ') : ''}`);
  return { text: out.join('\n'), hardCount: hard.length, rows };
}

let exit = 0;
const results = [];
for (const t of targets) {
  const p = path.resolve(t);
  if (!fs.existsSync(p)) { console.error(`없음: ${t}`); exit = 2; continue; }
  const a = analyze(p);
  if (opt.extract) {
    // 맹검 심사용: 산문만 남긴 텍스트. 굵게 표시는 유지한다(심사자가 보는 PDF와 같게).
    const dest = path.resolve(opt.extract);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, a.text.replace(/\n{3,}/g, '\n\n'));
    console.log(`추출: ${opt.extract} (${a.text.length}자)`);
  }
  const rep = report(a);
  results.push({ file: t, hard: rep.hardCount, rows: rep.rows });
  if (!opt.json) console.log(rep.text);
  if (rep.hardCount > 0 && opt.strict) exit = 1;
}
if (opt.json) console.log(JSON.stringify(results, null, 2));
process.exit(exit);
