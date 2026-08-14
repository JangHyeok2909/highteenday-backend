#!/usr/bin/env node
/**
 * 공개 게시용 성능 보고서 정화 — 내부 실행 메타데이터를 지운다(E-29).
 *
 * 왜 필요한가
 * -----------
 * `performance/reports/` 는 로컬 분석을 위해 실행 맥락을 그대로 담는다. 실행자
 * (`사용자명@호스트명`), 접속 URL, 커밋 해시, 실행 메모 같은 것들이다. 로컬에서는 전부
 * 유용하지만, GitHub Pages 로 올리는 순간 이야기가 달라진다. **비공개 저장소라도 Pages
 * 사이트는 기본적으로 공개**이기 때문이다(비공개 Pages 는 Enterprise Cloud 기능이다).
 *
 * 실제로 이 저장소의 Pages 배포 job 은 2026-08-04 에 한 번 성공한 이력이 있다. 즉
 * "설정 안 했으니 괜찮다"가 아니라 이미 한 번 나갔던 경로다.
 *
 * 어떻게 지우는가 — 파싱하지 않고 문자열로 지운다
 * ----------------------------------------------
 * 먼저 `run.json` 들을 읽어 **지워야 할 실제 값의 목록**을 모은 뒤, 사이트 디렉터리의 모든
 * 텍스트 파일에서 그 문자열을 통째로 치환한다. JSON 만 정화하고 HTML 을 놓치는 실수를
 * 구조적으로 막기 위해서다 — 같은 값이 `run.json`, `report.html`, `summary.txt`,
 * `history.html` 에 중복해서 들어 있고, 각각을 따로 파싱하면 하나를 빠뜨렸을 때 조용히 샌다.
 *
 * 그리고 값 수집에 실패하면 **정화를 건너뛰지 않고 실패한다**. 게시 파이프라인에서
 * "정화가 조용히 아무것도 안 함"은 정화하지 않은 것과 같은 결과인데, 로그만 보면 성공으로
 * 보인다. 그런 실패 방식은 보안 장치로서 최악이다.
 *
 * 사용법
 *   node tools/sanitize-reports.js <사이트 디렉터리>
 *   node tools/sanitize-reports.js _site --dry-run
 *   node tools/sanitize-reports.js _site --verify   # 게시 직전 최종 확인
 *
 * `--verify` 는 정화 여부를 **결과물만 보고** 판정한다. 정화 단계가 성공했는지와 별개로
 * 산출물을 다시 검사하므로, 도구가 바뀌거나 단계 순서가 어긋나도 잡힌다.
 * (셸 grep 으로 같은 검사를 하려다 `"note": ""` 같은 빈 값에 오탐이 나서 이쪽으로 옮겼다 —
 * "무엇이 민감한 값인가"의 정의가 두 곳에 갈라지는 것도 피한다.)
 *
 * 원본(`performance/reports/`)은 건드리지 않는다. 게시용 복사본만 대상이다.
 */
'use strict';

const fs = require('fs');
const path = require('path');

/** 지울 필드와 대체 문자열. 값 자체를 목록으로 모아 전체 파일에서 치환한다. */
const REDACTED = 'redacted';
const FIELDS = [
  // 사용자명@호스트명 — 개인 식별 정보이자 내부 장비 이름이다.
  { key: 'executor', reason: '실행자(사용자·호스트명)' },
  // 내부 접속 주소. 지금은 localhost 뿐이지만 사설 IP 로 바뀌면 내부 토폴로지가 드러난다.
  { key: 'baseUrl', reason: '내부 접속 주소' },
  // 커밋 해시와 브랜치 이름은 아직 공개하지 않은 작업 내용을 드러낼 수 있다.
  { key: 'commit', reason: '커밋 해시' },
  { key: 'commitShort', reason: '커밋 해시(축약)' },
  { key: 'branch', reason: '브랜치 이름' },
  // 실행 메모는 내부 논의 맥락이 그대로 들어간다("S-02 이후 인증 태그 분리 확인" 등).
  { key: 'note', reason: '실행 메모' },
];

/** 정화 대상 확장자. 바이너리를 문자열로 다루면 파일이 깨진다. */
const TEXT_EXT = new Set(['.json', '.html', '.txt', '.csv', '.md']);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** 정규식 메타문자를 이스케이프한다 — 값에 `.`이나 `+`가 들어 있어도 리터럴로 찾는다. */
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 지울 값 목록을 모은다.
 *
 * 짧은 값은 제외한다. 예를 들어 branch 가 `main` 이면 문서 본문의 "main"까지 전부 치환해
 * 보고서를 망가뜨린다. 4자 이하는 식별 정보로서의 가치도 낮으므로 버린다.
 */
function collectSecrets(siteDir) {
  const values = new Map(); // value -> reason
  const runFiles = walk(siteDir).filter((f) => path.basename(f) === 'run.json');

  for (const f of runFiles) {
    let rec;
    try {
      rec = JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch (e) {
      throw new Error(`run.json 파싱 실패: ${f} (${e.message}) — 정화할 값을 확정할 수 없어 중단한다`);
    }
    const run = rec && rec.run;
    if (!run) continue;
    for (const { key, reason } of FIELDS) {
      const v = run[key];
      if (typeof v === 'string' && v.trim().length > 4) values.set(v, reason);
    }
  }

  return { values, runFileCount: runFiles.length };
}

/**
 * 게시 직전 최종 확인 — 결과물에 정화되지 않은 값이 남아 있으면 실패한다.
 *
 * `collectSecrets` 를 그대로 재사용한다. 정화 후라면 대상 필드의 값이 전부 `redacted`
 * (5자, 임계값 4자 초과)이므로 수집되긴 하지만, 그건 정화된 값이므로 제외하고 센다.
 */
function verify(siteDir) {
  const { values, runFileCount } = collectSecrets(siteDir);
  const remaining = [...values.entries()].filter(([v]) => v !== REDACTED);

  console.log(`검사한 run.json: ${runFileCount}건`);
  if (!remaining.length) {
    console.log('내부 메타데이터 잔존 없음');
    return 0;
  }
  console.error(`정화되지 않은 내부 메타데이터 ${remaining.length}개가 남아 있습니다 — 게시를 중단합니다.`);
  // 값 자체를 로그에 찍으면 공개 CI 로그로 그대로 새어 나간다. 종류와 개수만 알린다.
  const byReason = new Map();
  for (const [, reason] of remaining) byReason.set(reason, (byReason.get(reason) || 0) + 1);
  for (const [reason, n] of byReason) console.error(`    - ${reason}: ${n}개`);
  return 1;
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const verifyOnly = args.includes('--verify');
  const siteDir = args.find((a) => !a.startsWith('--'));

  if (!siteDir) {
    console.error('사용법: node tools/sanitize-reports.js <사이트 디렉터리> [--dry-run|--verify]');
    process.exit(2);
  }
  if (!fs.existsSync(siteDir) || !fs.statSync(siteDir).isDirectory()) {
    console.error(`디렉터리가 아닙니다: ${siteDir}`);
    process.exit(2);
  }

  if (verifyOnly) process.exit(verify(siteDir));

  const { values, runFileCount } = collectSecrets(siteDir);

  // 실행 기록이 하나도 없으면 정화할 것도 없다 — 첫 게시 등 정상 상황이다.
  // 반면 실행 기록은 있는데 지울 값을 하나도 못 찾았다면 run.json 스키마가 바뀐 것이다.
  // 그 상태로 게시하면 정화되지 않은 내용이 그대로 나가므로 실패시킨다.
  if (runFileCount > 0 && values.size === 0) {
    console.error(
      `run.json ${runFileCount}건을 읽었지만 정화할 값을 하나도 찾지 못했습니다.\n` +
      '  run.json 스키마가 바뀌었을 가능성이 큽니다 — sanitize-reports.js 의 FIELDS 를 확인하세요.\n' +
      '  정화되지 않은 내용을 게시하지 않기 위해 중단합니다.',
    );
    process.exit(1);
  }

  // 긴 값부터 치환한다. 짧은 값이 긴 값의 일부일 때(커밋 축약형이 전체 해시의 앞부분)
  // 짧은 쪽을 먼저 지우면 긴 쪽이 조각나 매칭되지 않는다.
  const ordered = [...values.keys()].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(ordered.map(escapeRe).join('|'), 'g');

  const files = walk(siteDir).filter((f) => TEXT_EXT.has(path.extname(f).toLowerCase()));
  let changedFiles = 0;
  let totalHits = 0;

  for (const f of files) {
    const before = fs.readFileSync(f, 'utf8');
    let hits = 0;
    const after = before.replace(pattern, () => { hits++; return REDACTED; });
    if (!hits) continue;
    changedFiles++;
    totalHits += hits;
    if (!dryRun) fs.writeFileSync(f, after, 'utf8');
  }

  const byReason = new Map();
  for (const reason of values.values()) byReason.set(reason, (byReason.get(reason) || 0) + 1);

  console.log(`정화 대상 디렉터리 : ${siteDir}`);
  console.log(`읽은 run.json      : ${runFileCount}건`);
  console.log(`지운 고유 값       : ${values.size}개`);
  for (const [reason, n] of byReason) console.log(`    - ${reason}: ${n}개`);
  console.log(`검사한 텍스트 파일 : ${files.length}개`);
  console.log(`치환한 파일        : ${changedFiles}개 (총 ${totalHits}회)${dryRun ? '  ※ --dry-run, 실제로 쓰지 않음' : ''}`);
}

if (require.main === module) main();

module.exports = { collectSecrets, verify, FIELDS, REDACTED };
