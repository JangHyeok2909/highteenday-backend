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
// 리포트가 값을 싣는 방식과 **같은 규칙**으로 이스케이프본을 만들어야 한다(variantsOf).
const { escapeHtml } = require('./lib/format');

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
  // 중단된 실행을 복구할 때 기록되는 원래 명령줄. **로컬 절대 경로가 통째로 들어간다** —
  // 실측(2026-09-05): `C:\Users\<계정>\AppData\Local\nvm\v24.20.0\node.exe ...`.
  // 점(.)으로 중첩 경로를 쓴다.
  { key: 'recovery.sourceCommand', reason: '복구 명령(로컬 절대 경로 포함)' },
];

/** `a.b.c` 형태의 중첩 경로를 읽는다. 중간이 비면 undefined. */
function getPath(obj, dotted) {
  return dotted.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

/**
 * 정화 대상 확장자. 바이너리를 문자열로 다루면 파일이 깨진다.
 *
 * **여기에 없는 확장자는 지워지지도, 검사되지도 않는다.** `--verify` 도 같은 집합을 쓰므로
 * 빠진 확장자는 양쪽 모두의 맹점이 된다.
 *
 * 실측(2026-09-05): `.jsonl` 과 `.log` 가 빠져 있어 실제로 샜다. 게시 대상 1,312개 중
 * `hostprobe.jsonl` 49개와 `overnight/*.log` 46개가 통째로 검사 밖이었고, 그 안에
 * 호스트명과 `personal/localdocs` 브랜치명이 원문으로 남아 있었다. 그런데도
 * `--verify` 는 "잔존 없음"으로 통과시켰다. **새 산출물 형식을 추가하면 이 집합부터 본다.**
 */
const TEXT_EXT = new Set(['.json', '.jsonl', '.html', '.txt', '.csv', '.md', '.log']);

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
 * 한 값이 산출물에 나타날 수 있는 **모든 표기**를 만든다.
 *
 * 왜 필요한가 — 실제로 새고 있었다
 * ---------------------------------
 * 이 도구는 원시 문자열 치환으로 값을 지운다. 그런데 `report.html` 은 같은 값을
 * `escapeHtml()` 로 **이스케이프해서** 싣는다. 그래서 실행 메모가
 * `EXP-006 A: pool 10->20` 이면 HTML 에는 `pool 10-&gt;20` 으로 들어가고,
 * 원문 `pool 10->20` 을 찾는 치환은 **한 번도 매칭되지 않는다.**
 *
 * 실측(2026-09-01): 저장된 리포트 전체를 정화한 뒤에도 `->` 가 든 실행 메모 40건이
 * 그대로 남아 있었고, `--verify` 는 "잔존 없음"이라고 통과시켰다. `&`, `<`, `>`, `"`,
 * `'` 중 하나라도 든 값은 전부 같은 방식으로 샌다.
 *
 * 그래서 값마다 원문과 HTML 이스케이프본을 **둘 다** 지운다. `format.escapeHtml()` 과
 * 같은 규칙이어야 하므로 그 함수를 그대로 가져다 쓴다 — 규칙을 여기 복제하면 한쪽만
 * 바뀌었을 때 조용히 다시 새기 시작한다.
 */
function variantsOf(value) {
  const out = new Set([value]);
  const escaped = escapeHtml(value);
  if (escaped !== value) out.add(escaped);

  // JSON 이스케이프본도 넣는다 — HTML 과 같은 이유로 새는 두 번째 표기다.
  //
  // `run.json` 은 값을 JSON 문자열로 싣는다. 값에 역슬래시나 따옴표가 들어 있으면
  // 파일에는 이스케이프된 형태로 저장된다. 예를 들어 복구 명령의
  // `C:\Users\...\node.exe` 는 파일 안에서 `C:\\Users\\...\\node.exe` 다.
  // 파싱해서 얻은 원문(역슬래시 1개)으로 찾으면 **한 번도 매칭되지 않는다.**
  //
  // 실측(2026-09-05): `recovery.sourceCommand` 를 FIELDS 에 넣은 직후 회귀 테스트가
  // 이걸 잡았다. 필드를 추가해 값을 배웠는데도 파일에는 그대로 남아 있었다.
  const jsonEscaped = JSON.stringify(value).slice(1, -1);
  if (jsonEscaped !== value) out.add(jsonEscaped);

  return [...out];
}

/**
 * 한 필드 값에서 **따로 지워야 하는 조각**을 뽑는다.
 *
 * 왜 필요한가 — 필드를 지웠다고 값이 사라진 것이 아니다
 * -------------------------------------------------------
 * `executor` 는 `사용자명@호스트명` 형태다. 통짜로 치환하면 그 표기만 사라지는데,
 * Windows 성능 카운터는 같은 호스트명을 **호스트명만** 실어 나른다:
 * `\\HOSTNAME\Processor Information(_Total)\% Processor Time`.
 * 통짜 문자열은 여기에 한 번도 매칭되지 않는다.
 *
 * 실측(2026-09-05): 정화를 마친 게시본에서 호스트명이 파일 159개에 남아 있었다.
 * `run.json` 한 건 안에만 50회였고, 정작 그 파일의 `executor` 필드는 `redacted` 였다.
 * `hostProbe` 가 카운터 헤더를 배열로 싣기 때문이다.
 */
function fragmentsOf(key, value) {
  if (key !== 'executor') return [];
  const at = value.lastIndexOf('@');
  if (at < 0) return [];
  return [{ value: value.slice(at + 1), reason: '호스트명(단독 표기)' }];
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
      const v = getPath(run, key);
      if (typeof v !== 'string' || v.trim().length <= 4) continue;
      values.set(v, reason);
      // 조각도 같은 규칙(4자 초과)을 적용한다 — 짧은 호스트명까지 지우면 본문이 깨진다.
      for (const frag of fragmentsOf(key, v)) {
        if (frag.value.trim().length > 4 && !values.has(frag.value)) {
          values.set(frag.value, frag.reason);
        }
      }
    }
  }

  return { values, runFileCount: runFiles.length };
}

/**
 * 게시 직전 최종 확인 — 결과물에 정화되지 않은 값이 남아 있으면 실패한다.
 *
 * **산출물을 직접 읽어서 판정한다.** 예전에는 `collectSecrets` 로 `run.json` 만 다시 읽고
 * "값이 전부 redacted 인가"를 봤다. 그러면 `run.json` 은 깨끗한데 `report.html` 에 값이
 * 남아 있는 상태를 통과시킨다 — 실제로 그렇게 통과했다. HTML 이스케이프본이 치환을
 * 빠져나갔고(`variantsOf` 주석 참고), 검사도 같은 원문만 봤기 때문에 양쪽이 사이좋게
 * 같은 맹점을 공유했다.
 *
 * 그래서 이제 검사는 정화와 **다른 자료**를 본다. 정화는 값을 지우고, 검사는 게시될
 * 파일 전체에서 그 값(원문·이스케이프본 모두)을 찾는다. 한쪽이 틀려도 다른 쪽이 잡는다.
 */
function verify(siteDir, sourceDir) {
  // **어디서 "지울 값"을 배우는지가 이 검사의 전부다.**
  //
  // 정화된 산출물에서 수집하면 값이 전부 `redacted` 로 바뀌어 있고, 아래 필터가 그걸
  // 걸러내므로 **찾을 대상이 하나도 남지 않는다.** 그 상태에서 파일을 아무리 뒤져도
  // "잔존 없음"이 나온다 — 검사가 항상 통과하는 것이지 깨끗한 것이 아니다.
  //
  // 실측(2026-09-05): 호스트명이 파일 159개에 남은 게시본을 이 검사가 통과시켰다.
  // 그래서 `--source` 로 **정화 전 원본**을 지목할 수 있게 했다. 원본에서 값을 배우고
  // 게시본에서 찾으면, 정화와 검사가 비로소 서로 다른 자료를 보게 된다.
  const { values, runFileCount } = collectSecrets(sourceDir || siteDir);
  const targets = [...values.entries()].filter(([v]) => v !== REDACTED);

  const files = walk(siteDir).filter((f) => TEXT_EXT.has(path.extname(f).toLowerCase()));
  const byReason = new Map();
  const filesWithLeak = new Set();
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    for (const [value, reason] of targets) {
      if (!variantsOf(value).some((v) => text.includes(v))) continue;
      byReason.set(reason, (byReason.get(reason) || 0) + 1);
      filesWithLeak.add(f);
    }
  }

  console.log(`검사한 run.json: ${runFileCount}건 · 텍스트 파일: ${files.length}개`);
  if (!byReason.size) {
    console.log('내부 메타데이터 잔존 없음');
    return 0;
  }
  console.error(`정화되지 않은 내부 메타데이터가 파일 ${filesWithLeak.size}개에 남아 있습니다 — 게시를 중단합니다.`);
  // 값 자체를 로그에 찍으면 공개 CI 로그로 그대로 새어 나간다. 종류와 개수만 알린다.
  for (const [reason, n] of byReason) console.error(`    - ${reason}: ${n}건`);
  return 1;
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const verifyOnly = args.includes('--verify');

  // `--source <원본>` 은 값을 뒤에 받으므로, 그 값을 위치 인자로 착각하지 않게 뺀다.
  const sourceIdx = args.indexOf('--source');
  const sourceDir = sourceIdx >= 0 ? args[sourceIdx + 1] : null;
  // `--source` 가 없으면 sourceIdx 는 -1 이고 sourceIdx+1 은 0 이다. 그 조건을 그대로
  // 쓰면 **첫 위치 인자(대개 사이트 디렉터리)를 건너뛴다.** 있을 때만 배제한다.
  const siteDir = args.find((a, i) => !a.startsWith('--') && (sourceIdx < 0 || i !== sourceIdx + 1));

  if (!siteDir) {
    console.error('사용법: node tools/sanitize-reports.js <사이트 디렉터리> [--dry-run] [--verify [--source <정화 전 원본>]]');
    process.exit(2);
  }
  for (const [label, d] of [['사이트', siteDir], ['원본', sourceDir]]) {
    if (!d) continue;
    if (!fs.existsSync(d) || !fs.statSync(d).isDirectory()) {
      console.error(`${label} 디렉터리가 아닙니다: ${d}`);
      process.exit(2);
    }
  }
  if (sourceIdx >= 0 && !verifyOnly) {
    console.error('--source 는 --verify 와만 함께 씁니다 — 정화는 산출물 자체에서 값을 읽습니다.');
    process.exit(2);
  }

  if (verifyOnly) process.exit(verify(siteDir, sourceDir));

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
  // 값마다 원문과 HTML 이스케이프본을 함께 넣는다 — HTML 은 후자로만 값을 싣는다.
  const ordered = [...new Set([...values.keys()].flatMap(variantsOf))]
    .sort((a, b) => b.length - a.length);
  const pattern = new RegExp(ordered.map(escapeRe).join('|'), 'g');

  const files = walk(siteDir).filter((f) => TEXT_EXT.has(path.extname(f).toLowerCase()));
  let changedFiles = 0;
  let totalHits = 0;

  // 치환하면서 **결과를 그 자리에서 검산한다.**
  //
  // `--verify` 는 이 검산을 대신하지 못한다. 정화가 끝나면 `run.json` 의 값이 전부
  // `redacted` 라 "원래 무엇을 지워야 했는지"를 복원할 수 없기 때문이다. 지울 값을 알고
  // 있는 시점은 여기뿐이므로, 쓰고 나서 같은 패턴으로 다시 훑는다.
  //
  // 이 검산이 없어서 실제로 새어 나갔다: HTML 이스케이프본이 치환을 빠져나갔는데
  // `--verify` 는 `run.json` 만 보고 통과시켰다(`variantsOf` 주석 참고).
  const leaked = [];
  for (const f of files) {
    const before = fs.readFileSync(f, 'utf8');
    let hits = 0;
    const after = before.replace(pattern, () => { hits++; return REDACTED; });
    if (hits) {
      changedFiles++;
      totalHits += hits;
      if (!dryRun) fs.writeFileSync(f, after, 'utf8');
    }
    // dry-run 은 파일을 안 쓰므로 방금 만든 `after` 를 검사한다. 실제 쓰기와 같은 결과다.
    pattern.lastIndex = 0;
    if (pattern.test(after)) leaked.push(path.relative(siteDir, f));
    pattern.lastIndex = 0;
  }

  if (leaked.length) {
    // 남은 값 자체는 찍지 않는다 — 공개 CI 로그로 그대로 새어 나간다. 파일 경로만 알린다.
    console.error(`치환 후에도 지울 값이 남은 파일이 ${leaked.length}개 있습니다 — 게시를 중단합니다.`);
    for (const f of leaked.slice(0, 10)) console.error(`    - ${f}`);
    if (leaked.length > 10) console.error(`    외 ${leaked.length - 10}개`);
    process.exit(1);
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
