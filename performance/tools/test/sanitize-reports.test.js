'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

/**
 * 게시본 정화 검증(E-29).
 *
 * 이 도구가 조용히 실패하면 **정화하지 않은 것과 결과가 같은데 로그는 성공으로 보인다.**
 * 그래서 여기서 검증하는 것은 "지웠는가"만이 아니라 "못 지웠을 때 확실히 실패하는가"다.
 *
 * 비공개 저장소라도 GitHub Pages 사이트는 기본적으로 공개다(비공개 Pages 는 Enterprise
 * Cloud 기능). 실제로 이 저장소는 2026-08-04 에 Pages 배포 job 이 한 번 성공한 이력이 있다.
 */
const TOOL = path.join(__dirname, '..', 'sanitize-reports.js');

function run(args, opts = {}) {
  try {
    const stdout = execFileSync(process.execPath, [TOOL, ...args], { encoding: 'utf8', stdio: 'pipe' });
    return { code: 0, stdout, stderr: '' };
  } catch (e) {
    if (opts.allowFail) return { code: e.status, stdout: e.stdout || '', stderr: e.stderr || '' };
    throw e;
  }
}

/** 실제 게시본과 같은 모양의 임시 사이트를 만든다. */
function makeSite(runOverrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sanitize-test-'));
  const runDir = path.join(dir, 'runs', 'posts-2026-08-11T12-05-00');
  fs.mkdirSync(runDir, { recursive: true });

  const record = {
    run: {
      id: 'posts-2026-08-11T12-05-00',
      scenario: 'posts',
      environment: 'perf-s02-ab',
      executor: 'tester@BUILD-HOST-01',
      baseUrl: 'http://192.168.0.42:18080',
      branch: 'personal/localdocs-secret-work',
      commit: 'ec1234567890abcdef1234567890abcdef123456',
      commitShort: 'ec123456',
      note: 'S-02 이후 인증 태그 분리 확인',
      startedAt: '2026-08-11T12:03:52.382Z',
      ...runOverrides,
    },
    k6: { all: { p95: 123.4, errorRate: 0 } },
  };
  fs.writeFileSync(path.join(runDir, 'run.json'), JSON.stringify(record, null, 1));

  // HTML 과 텍스트에도 같은 값이 들어 있다 — JSON 만 지우면 여기로 샌다.
  fs.writeFileSync(
    path.join(runDir, 'report.html'),
    `<table><tr><td>실행자</td><td>${record.run.executor}</td></tr>` +
    `<tr><td>브랜치</td><td>${record.run.branch}</td></tr>` +
    `<tr><td>커밋</td><td>${record.run.commitShort}</td></tr></table>`,
  );
  fs.writeFileSync(
    path.join(runDir, 'summary.txt'),
    `실행자: ${record.run.executor}\n대상: ${record.run.baseUrl}\n메모: ${record.run.note}\n`,
  );
  return { dir, record };
}

test('정화하면 JSON·HTML·텍스트에서 내부 값이 모두 사라진다', () => {
  const { dir, record } = makeSite();
  run([dir]);

  const sensitive = [
    record.run.executor, record.run.baseUrl, record.run.branch,
    record.run.commit, record.run.commitShort, record.run.note,
  ];
  for (const f of ['run.json', 'report.html', 'summary.txt']) {
    const text = fs.readFileSync(path.join(dir, 'runs', 'posts-2026-08-11T12-05-00', f), 'utf8');
    for (const v of sensitive) {
      assert.ok(!text.includes(v), `${f} 에 "${v.slice(0, 18)}..." 가 남아 있다`);
    }
  }
});

test('측정 내용은 그대로 보존된다 — 정화가 보고서를 망가뜨리면 안 된다', () => {
  const { dir } = makeSite();
  run([dir]);

  const rec = JSON.parse(fs.readFileSync(path.join(dir, 'runs', 'posts-2026-08-11T12-05-00', 'run.json'), 'utf8'));
  assert.equal(rec.k6.all.p95, 123.4, '지표가 바뀌면 게시본이 쓸모없어진다');
  assert.equal(rec.run.scenario, 'posts');
  assert.equal(rec.run.startedAt, '2026-08-11T12:03:52.382Z');
  assert.equal(rec.run.executor, 'redacted');
});

test('--verify: 정화 전에는 실패한다 (게시를 막는 것이 이 도구의 목적이다)', () => {
  const { dir } = makeSite();
  const r = run([dir, '--verify'], { allowFail: true });
  assert.equal(r.code, 1, '정화 전인데 검증이 통과하면 장치가 무의미하다');
});

test('--verify: 정화 후에는 통과한다', () => {
  const { dir } = makeSite();
  run([dir]);
  const r = run([dir, '--verify']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /잔존 없음/);
});

test('--verify 실패 메시지에 민감한 값 자체는 찍지 않는다', () => {
  // CI 로그는 게시본과 같은 수준으로 공개될 수 있다. 값을 찍으면 정화의 의미가 사라진다.
  const { dir, record } = makeSite();
  const r = run([dir, '--verify'], { allowFail: true });
  const all = r.stdout + r.stderr;
  assert.ok(!all.includes(record.run.executor), '실패 로그에 실행자 값이 그대로 찍혔다');
  assert.ok(!all.includes(record.run.note), '실패 로그에 실행 메모가 그대로 찍혔다');
  assert.match(all, /실행자|메모/, '무엇이 남았는지 종류는 알려 줘야 조치할 수 있다');
});

test('run.json 이 있는데 지울 값을 못 찾으면 실패한다 — 스키마 변경을 조용히 넘기지 않는다', () => {
  // 필드 이름이 바뀌면 정화기는 아무것도 못 찾는다. 그때 "0개 지움, 성공"으로 끝나면
  // 정화되지 않은 보고서가 그대로 게시된다. 그 실패 방식을 막는다.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sanitize-test-'));
  const runDir = path.join(dir, 'runs', 'x');
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, 'run.json'), JSON.stringify({ run: { scenario: 'posts' } }));

  const r = run([dir], { allowFail: true });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /FIELDS/);
});

test('짧은 값은 지우지 않는다 — 본문의 흔한 단어까지 치환해 보고서를 망가뜨리지 않기 위해', () => {
  const { dir } = makeSite({ branch: 'main' }); // 4자 이하
  run([dir]);
  const rec = JSON.parse(fs.readFileSync(path.join(dir, 'runs', 'posts-2026-08-11T12-05-00', 'run.json'), 'utf8'));
  assert.equal(rec.run.branch, 'main', '짧은 값까지 치환하면 문서 곳곳의 같은 단어가 함께 지워진다');
});

test('run.json 이 깨져 있으면 정화를 건너뛰지 않고 중단한다', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sanitize-test-'));
  const runDir = path.join(dir, 'runs', 'x');
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, 'run.json'), '{ 깨진 JSON');

  const r = run([dir], { allowFail: true });
  assert.notEqual(r.code, 0, '파싱 실패를 무시하면 그 실행의 값이 정화되지 않은 채 게시된다');
});

/**
 * HTML 이스케이프본 유출 — 실제로 새고 있던 경로다(2026-09-01 발견).
 *
 * 리포트는 값을 `escapeHtml()` 로 실으므로, 실행 메모가 `pool 10->20` 이면 HTML 에는
 * `pool 10-&gt;20` 으로 들어간다. 정화는 원문만 찾았고, `--verify` 도 같은 원문만 봐서
 * 둘이 같은 맹점을 공유했다 — 저장된 리포트 전체를 정화한 뒤에도 이런 메모 40건이
 * 그대로 남아 있었고 verify 는 "잔존 없음"으로 통과시켰다.
 */
function makeEscapedSite() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sanitize-esc-'));
  const runDir = path.join(dir, 'runs', 'normal-day-2026-08-29T10-30-28');
  fs.mkdirSync(runDir, { recursive: true });
  const note = 'EXP-006 A: pool 10->20 & "재시작" 조건';
  fs.writeFileSync(path.join(runDir, 'run.json'), JSON.stringify({
    run: {
      id: 'normal-day-2026-08-29T10-30-28',
      executor: 'tester@BUILD-HOST-01',
      note,
    },
  }, null, 1));
  // report.js 가 esc() 로 싣는 모양 그대로.
  const escaped = note.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
  fs.writeFileSync(path.join(runDir, 'report.html'),
    `<span class="pt" data-note="${escaped}" title="${escaped}"></span>`);
  return { dir, runDir, note, escaped };
}

test('HTML 이스케이프된 값도 지운다 — 원문만 찾으면 통째로 샌다', () => {
  const { dir, runDir, escaped } = makeEscapedSite();
  run([dir]);
  const html = fs.readFileSync(path.join(runDir, 'report.html'), 'utf8');
  assert.ok(!html.includes(escaped), 'data-note 에 이스케이프된 메모가 남아 있다');
  assert.ok(!html.includes('pool 10-&gt;20'), '부분 문자열이 남아 있다');
});

test('치환 후 자기 검산이 있다 — 남은 값이 있으면 성공으로 끝내지 않는다', () => {
  // `--verify` 는 이 검산을 대신하지 못한다. 정화가 끝나면 run.json 이 전부 redacted 라
  // "원래 무엇을 지워야 했는지"를 복원할 수 없기 때문이다. 지울 값을 아는 시점은
  // 치환하는 그 순간뿐이므로, 검산도 거기 있어야 한다.
  const { dir } = makeEscapedSite();
  const r = run([dir], { allowFail: true });
  assert.equal(r.code, 0, `정상 정화가 실패했다: ${r.stderr}`);
  assert.ok(!/게시를 중단합니다/.test(r.stderr));
});

test('--verify 는 원문이 남아 있는 산출물을 잡는다', () => {
  // 정화를 건너뛰고 바로 검사하는 경우 — 값이 run.json 에 원문으로 남아 있으므로
  // 파일 전체 스캔이 그 값을 찾아낸다.
  const { dir } = makeEscapedSite();
  const r = run([dir, '--verify'], { allowFail: true });
  assert.equal(r.code, 1, '정화 전인데 verify 가 통과했다');
  assert.match(r.stderr, /게시를 중단합니다/);
});

/**
 * 확장자 누락 유출 — 실제로 새고 있던 두 번째 경로다(2026-09-05 발견).
 *
 * `TEXT_EXT` 에 `.jsonl` 과 `.log` 가 없어서 `hostprobe.jsonl` 49개와
 * `overnight/*.log` 46개가 통째로 검사 밖이었다. 정화도 검사도 그 파일들을 열지 않았고,
 * `--verify` 는 "잔존 없음"으로 통과시켰다.
 */
test('.jsonl 과 .log 도 정화한다 — 확장자가 빠지면 통째로 샌다', () => {
  const { dir, record } = makeSite();
  const runDir = path.join(dir, 'runs', 'posts-2026-08-11T12-05-00');
  fs.writeFileSync(path.join(runDir, 'hostprobe.jsonl'),
    `{"t":1,"by":"${record.run.executor}"}\n{"t":2,"by":"${record.run.executor}"}\n`);
  fs.writeFileSync(path.join(runDir, 'runner.log'),
    `[00:00] branch=${record.run.branch} 시작\n`);

  run([dir]);

  const jsonl = fs.readFileSync(path.join(runDir, 'hostprobe.jsonl'), 'utf8');
  const log = fs.readFileSync(path.join(runDir, 'runner.log'), 'utf8');
  assert.ok(!jsonl.includes(record.run.executor), '.jsonl 에 실행자가 남아 있다');
  assert.ok(!log.includes(record.run.branch), '.log 에 브랜치명이 남아 있다');
});

/**
 * 호스트명 단독 표기 유출 — 세 번째 경로다(2026-09-05 발견).
 *
 * `executor` 는 `사용자명@호스트명` 인데 Windows 성능 카운터는 호스트명만 싣는다.
 * 통짜 문자열 치환은 여기에 한 번도 매칭되지 않아, `executor` 필드가 `redacted` 인
 * 바로 그 `run.json` 안에 호스트명이 50회 남아 있었다.
 */
test('호스트명이 단독으로 박힌 곳도 지운다 — executor 를 지운 것과 다른 문제다', () => {
  const { dir, record } = makeSite();
  const runDir = path.join(dir, 'runs', 'posts-2026-08-11T12-05-00');
  const host = record.run.executor.split('@')[1]; // BUILD-HOST-01
  fs.writeFileSync(path.join(runDir, 'hostprobe.jsonl'),
    JSON.stringify({ header: [`\\${host}\Processor Information(_Total)\% Processor Time`] }) + '\n');

  run([dir]);

  const probe = fs.readFileSync(path.join(runDir, 'hostprobe.jsonl'), 'utf8');
  assert.ok(!probe.includes(host), `성능 카운터 헤더에 호스트명 "${host}" 가 남아 있다`);
});

/**
 * `--verify` 가 무엇을 기준으로 판정하는가 — 이 도구에서 가장 잘못되기 쉬운 지점이다.
 *
 * 정화된 산출물에서 지울 값을 배우면 값이 전부 `redacted` 라 **찾을 대상이 0개**가 되고,
 * 무엇이 남아 있든 통과한다. 실측(2026-09-05): 호스트명이 159개 파일에 남은 게시본을
 * 그대로 통과시켰다. 그래서 `--source` 로 정화 전 원본을 지목한다.
 */
test('--verify --source: 정화 후 남은 유출을 잡는다', () => {
  const { dir, record } = makeSite();
  const source = fs.mkdtempSync(path.join(os.tmpdir(), 'sanitize-src-'));
  fs.cpSync(dir, source, { recursive: true }); // 정화 전 원본을 따로 보관

  run([dir]);
  // 정화가 놓친 파일이 하나 있는 상태를 만든다 — 확장자 누락·새 산출물 등으로 실제로 생긴다.
  fs.writeFileSync(path.join(dir, 'runs', 'posts-2026-08-11T12-05-00', 'missed.txt'),
    `실행자: ${record.run.executor}\n`);

  const withSource = run([dir, '--verify', '--source', source], { allowFail: true });
  assert.equal(withSource.code, 1, '원본을 기준으로 삼았는데도 유출을 놓쳤다');
  assert.match(withSource.stderr, /게시를 중단합니다/);

  // 대조 — 원본 없이 검사하면 통과한다. `--source` 가 왜 필요한지가 이 줄이다.
  const withoutSource = run([dir, '--verify'], { allowFail: true });
  assert.equal(withoutSource.code, 0,
    '이 검사가 실패하도록 바뀌었다면 --source 없이도 안전해진 것이니 이 테스트를 갱신할 것');
});

test('--source 는 --verify 없이 쓰면 거부한다 — 정화는 산출물에서 값을 읽어야 한다', () => {
  const { dir } = makeSite();
  const r = run([dir, '--source', dir], { allowFail: true });
  assert.equal(r.code, 2);
  assert.match(r.stderr, /--verify/);
});

/**
 * 중첩 필드 유출 — 네 번째 경로다(2026-09-05 발견).
 *
 * 중단된 실행을 복구하면 `run.recovery.sourceCommand` 에 원래 명령줄이 통째로 남는데,
 * 여기에 로컬 절대 경로(`C:\Users\<계정>\AppData\Local\nvm\...\node.exe`)가 들어 있다.
 * `FIELDS` 가 최상위 키만 읽던 시절에는 이 값을 아예 배우지 못했다.
 */
test('중첩 필드(recovery.sourceCommand)도 지운다 — 최상위 키만 보면 놓친다', () => {
  const cmd = 'C:\Users\tester\AppData\Local\nvm\v24.20.0\node.exe tools/perf-run.js --dataset medium';
  const { dir } = makeSite({ recovery: { recoveredAt: '2026-09-01T08:25:35.844Z', sourceCommand: cmd } });
  const runDir = path.join(dir, 'runs', 'posts-2026-08-11T12-05-00');
  // dbstate.json 은 같은 값을 최상위 recovery 에 싣는다 — 값만 알면 파일 전체 치환이 처리한다.
  fs.writeFileSync(path.join(runDir, 'dbstate.json'), JSON.stringify({ recovery: { sourceCommand: cmd } }));

  run([dir]);

  for (const f of ['run.json', 'dbstate.json']) {
    const text = fs.readFileSync(path.join(runDir, f), 'utf8');
    assert.ok(!text.includes('AppData'), `${f} 에 로컬 절대 경로가 남아 있다`);
  }
});
