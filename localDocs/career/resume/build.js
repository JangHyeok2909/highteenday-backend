#!/usr/bin/env node
/**
 * 이력서·포트폴리오 빌드 — <원본>.md → out/<이름>.html → out/<이름>.pdf
 *
 *   node build.js                              # resume.md → out/resume.pdf
 *   node build.js resume.md resume-daangn      # 원본과 출력 이름을 따로 지정
 *   node build.js portfolio.md portfolio-daangn
 *
 * 의존성 없음. 마크다운 변환기는 이 파일이 직접 갖고 있다(이력서에 필요한 문법만).
 * PDF 는 Chrome 헤드리스(--print-to-pdf)로 만든다. pandoc·wkhtmltopdf 불필요.
 *
 * 규칙 둘:
 *   1. `<!-- CUT -->` 아래 내용은 PDF 에 들어가지 않는다. 초안 메모를 거기 둔다.
 *   2. `[[...]]` 는 "아직 안 채운 자리"다. PDF 에서 빨간 배경으로 눈에 띄게 찍히고,
 *      빌드가 끝나면 몇 개 남았는지 세어 준다.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const SHORT = process.argv.includes('--short');
const ARGS = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const SRC_ARG = ARGS[0] || 'resume.md';
const SRC = path.isAbsolute(SRC_ARG) ? SRC_ARG : path.join(ROOT, SRC_ARG);
const NAME = ARGS[1] || path.basename(SRC, '.md');
const TPL = path.join(ROOT, 'template.html');
const OUT_DIR = process.env.CAREER_OUTPUT_DIR
  ? path.resolve(process.env.CAREER_OUTPUT_DIR)
  : path.join(ROOT, 'out');
const DOC_TITLE = process.env.CAREER_DOC_TITLE
  || (NAME.includes('portfolio') ? '장혁 - 포트폴리오' : '장혁 - 이력서');

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);

// ---------------------------------------------------------------- 마크다운 변환

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 한 줄 안의 서식. 처리 순서가 중요하다 — 코드 → 빈칸표시 → 링크 → 굵게 */
function inline(text) {
  let s = escapeHtml(text);
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => `\u0000C${codes.push(c) - 1}\u0000`);
  s = s.replace(/\[\[([^\]]+)\]\]/g, (_, g) => `<mark class="gap">${g}</mark>`);
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/\u0000C(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
  return s;
}

/** 구분줄(`|---:|`)의 콜론 위치로 정렬을 읽는다. 오른쪽 정렬은 r, 가운데는 c 클래스 */
function tableAligns(sepLine) {
  return sepLine.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => {
    const t = c.trim();
    if (/^:-+:$/.test(t)) return 'c';
    if (/^-+:$/.test(t)) return 'r';
    return '';
  });
}

function renderTableRow(line, tag, aligns = []) {
  const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|');
  return '<tr>' + cells.map((c, n) => {
    const cls = aligns[n] ? ` class="${aligns[n]}"` : '';
    return `<${tag}${cls}>${inline(c.trim())}</${tag}>`;
  }).join('') + '</tr>';
}

function markdownToHtml(md) {
  const lines = md.split(/\r?\n/);
  const out = [];
  let i = 0;
  let listDepth = 0;

  const closeLists = (depth) => {
    while (listDepth > depth) {
      out.push('</ul>');
      listDepth -= 1;
    }
  };

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.replace(/\s+$/, '');

    // 빈 줄
    if (!line.trim()) {
      closeLists(0);
      i += 1;
      continue;
    }

    // 원고 주석(`//` 로 시작하는 줄)은 PDF 에 넣지 않는다. 사용자 코멘트와 그 답을 원고 안에 두기 위한 규칙이다.
    if (/^\s*\/\//.test(line)) {
      i += 1;
      continue;
    }

    // 주석은 버린다 (CUT 마커는 호출 전에 이미 잘렸다)
    if (/^\s*<!--/.test(line)) {
      i += 1;
      while (i < lines.length && !/-->/.test(lines[i - 1])) i += 1;
      continue;
    }

    // 코드 울타리. ```html-raw 는 내용을 그대로 통과시킨다(그림·페이지 나눔용).
    const fence = line.match(/^```(\w[\w-]*)?\s*$/);
    if (fence) {
      closeLists(0);
      const lang = fence[1] || '';
      const buf = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        buf.push(lines[i]);
        i += 1;
      }
      i += 1; // 닫는 울타리
      if (lang === 'html-raw') out.push(buf.join('\n'));
      else out.push(`<pre><code>${escapeHtml(buf.join('\n'))}</code></pre>`);
      continue;
    }

    // 표
    if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|/.test(lines[i + 1])) {
      closeLists(0);
      const aligns = tableAligns(lines[i + 1]);
      const head = renderTableRow(line, 'th', aligns);
      const body = [];
      i += 2;
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        body.push(renderTableRow(lines[i], 'td', aligns));
        i += 1;
      }
      out.push(`<table><thead>${head}</thead><tbody>${body.join('')}</tbody></table>`);
      continue;
    }

    // 구분선
    if (/^---+$/.test(line.trim())) {
      closeLists(0);
      out.push('<hr>');
      i += 1;
      continue;
    }

    // 제목
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      closeLists(0);
      const level = h[1].length;
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      i += 1;
      continue;
    }

    // 인용
    if (/^>\s?/.test(line)) {
      closeLists(0);
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ''));
        i += 1;
      }
      out.push(`<blockquote>${inline(buf.join(' '))}</blockquote>`);
      continue;
    }

    // 목록 (들여쓰기 2칸 = 한 단계)
    const li = line.match(/^(\s*)[-*]\s+(.*)$/);
    if (li) {
      const depth = Math.floor(li[1].length / 2) + 1;
      while (listDepth < depth) {
        out.push('<ul>');
        listDepth += 1;
      }
      closeLists(depth);
      out.push(`<li>${inline(li[2])}</li>`);
      i += 1;
      continue;
    }

    // 문단 (연속된 일반 줄을 한 문단으로 합친다)
    closeLists(0);
    const para = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,4}\s|>|\s*[-*]\s|---+$|\s*\||\s*<!--|\s*\/\/|```)/.test(lines[i])
    ) {
      para.push(lines[i]);
      i += 1;
    }
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }

  closeLists(0);
  return out.join('\n');
}

// ---------------------------------------------------------------- 빌드

function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`원본이 없다: ${SRC}`);
    process.exit(1);
  }
  if (!fs.existsSync(TPL)) {
    console.error(`템플릿이 없다: ${TPL}`);
    process.exit(1);
  }

  const rawMd = fs.readFileSync(SRC, 'utf8');
  const cutAt = rawMd.indexOf('<!-- CUT -->');
  let md = cutAt >= 0 ? rawMd.slice(0, cutAt) : rawMd;
  const cutLines = cutAt >= 0 ? rawMd.slice(cutAt).split(/\r?\n/).length : 0;

  // 축약 빌드: <!-- FULL --> ... <!-- /FULL --> 구간을 통째로 뺀다.
  // 원고는 하나로 두고 제출본만 골라 뽑기 위한 장치다.
  let droppedBlocks = 0;
  let droppedLines = 0;
  if (SHORT) {
    md = md.replace(/[ \t]*<!--\s*FULL\s*-->[\s\S]*?<!--\s*\/FULL\s*-->[ \t]*\n?/g, (m) => {
      droppedBlocks += 1;
      droppedLines += m.split(/\r?\n/).length - 1;
      return '';
    });
    // 강제 페이지 나눔은 전체본의 절 배치에 맞춰 넣은 것이다. 절을 뺀 축약본에서는
    // 빈 여백만 만들어 쪽수를 늘리므로 함께 뺀다.
    md = md.replace(/```html-raw\n<div class="pagebreak"><\/div>\n```\n/g, '');
  }

  const body = markdownToHtml(md);
  const html = fs.readFileSync(TPL, 'utf8')
    .replace('<title>이력서</title>', `<title>${escapeHtml(DOC_TITLE)}</title>`)
    // 머리글(@top-right)에 찍히는 문서 이름. CSS 문자열 안에 들어가므로 따옴표만 벗긴다.
    .replace('__DOC_TITLE__', DOC_TITLE.replace(/["\\]/g, ''))
    .replace('<!--CONTENT-->', body);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const htmlPath = path.join(OUT_DIR, `${NAME}.html`);
  const pdfPath = path.join(OUT_DIR, `${NAME}.pdf`);
  fs.writeFileSync(htmlPath, html, 'utf8');

  const chrome = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
  if (!chrome) {
    console.error('Chrome 을 찾지 못했다. CHROME_PATH 환경변수로 경로를 지정할 것.');
    console.error(`HTML 은 만들어졌다: ${htmlPath}`);
    process.exit(2);
  }

  const fileUrl = 'file:///' + htmlPath.replace(/\\/g, '/');
  const res = spawnSync(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--no-pdf-header-footer',
      '--run-all-compositor-stages-before-draw',
      '--virtual-time-budget=4000',
      `--print-to-pdf=${pdfPath}`,
      fileUrl,
    ],
    { encoding: 'utf8', timeout: 120000 }
  );

  if (res.error || !fs.existsSync(pdfPath)) {
    console.error('PDF 생성 실패:', res.error || res.stderr);
    process.exit(3);
  }

  const gaps = (md.match(/\[\[[^\]]+\]\]/g) || []);
  const kb = (fs.statSync(pdfPath).size / 1024).toFixed(1);

  console.log(`모드  ${SHORT ? '축약 (--short)' : '전체'}`);
  console.log(`HTML  ${htmlPath}`);
  console.log(`PDF   ${pdfPath}  (${kb} KB)`);
  console.log(`덜 채운 자리 [[...]]  ${gaps.length}개`);
  gaps.forEach((g, n) => console.log(`  ${String(n + 1).padStart(2)}. ${g}`));
  if (cutLines) console.log(`CUT 아래 ${cutLines}줄은 PDF 에 넣지 않았다.`);
  if (SHORT) console.log(`FULL 구간 ${droppedBlocks}개(${droppedLines}줄)를 뺐다.`);
  else {
    const marked = (md.match(/<!--\s*FULL\s*-->/g) || []).length;
    if (marked) console.log(`FULL 표시 구간 ${marked}개 — --short 로 빌드하면 빠진다.`);
  }
}

main();
