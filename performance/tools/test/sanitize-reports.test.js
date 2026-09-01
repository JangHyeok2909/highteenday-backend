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
      executor: 'janghyeok@LOCALDESKTOP-DJ12345',
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
      executor: 'janghyeok@LOCALDESKTOP-DJ12345',
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
