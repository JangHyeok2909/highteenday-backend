#!/usr/bin/env node
'use strict';
/**
 * hostprobe 의 수집 워커 — 별도 프로세스여야만 하는 이유가 있다.
 *
 * `perf-run.js` 는 k6 를 `spawnSync` 로 돌린다. spawnSync 는 **Node 의 이벤트 루프를 통째로
 * 막는다.** 그래서 이 모듈이 부모 프로세스 안에서 typeperf 의 stdout 을 듣게 해 두면, k6 가
 * 도는 27분 내내 data 콜백이 한 번도 실행되지 않고 표본이 0개가 된다(실제로 그렇게 실패했다).
 *
 * typeperf 에게 파일로 쓰게 하는 것도 답이 아니었다. 버퍼를 들고 있다가 종료 시에 비우는데,
 * 우리는 k6 가 끝나면 프로세스를 죽이므로 그 버퍼가 통째로 사라진다 — 실측에서 7바이트짜리
 * 빈 파일이 남았다.
 *
 * 그래서 이 워커가 typeperf 를 소유한다. **자기 이벤트 루프는 비어 있으므로** 표본이 오는
 * 즉시 받아서 `appendFileSync` 로 디스크에 밀어 넣는다. 부모가 언제 죽여도 그때까지의
 * 표본은 이미 파일에 있다. 잃는 것은 최대 한 줄이다.
 *
 * **타임스탬프는 typeperf 것이 아니라 여기서 찍는다(T-37).** typeperf 의 첫 칼럼은
 * 로캘 형식(`08/20/2026 10:15:03.123`)이라 파싱이 로캘에 좌우된다. 구간별로 잘라 쓰려면
 * 기계 판독 가능한 시각이 필요하므로 ISO 8601 을 직접 붙인다.
 *
 * 사용: node hostprobe-worker.js <출력 JSONL 경로> <간격초> <카운터경로...>
 */

const { spawn } = require('child_process');
const fs = require('fs');

const [outFile, intervalSec, ...counters] = process.argv.slice(2);
if (!outFile || !intervalSec || !counters.length) {
  console.error('사용법: hostprobe-worker.js <out.jsonl> <intervalSec> <counter...>');
  process.exit(2);
}

const child = spawn('typeperf', ['-si', String(intervalSec), ...counters], { windowsHide: true });

child.on('error', (e) => {
  try { fs.appendFileSync(outFile, JSON.stringify({ error: e.message }) + '\n'); } catch (_) { /* 기록조차 못 하면 포기 */ }
  process.exit(1);
});

/**
 * 헤더 행에서 실제 칼럼 이름을 받아 둔다.
 *
 * 와일드카드 카운터(`\Processor Information(*)\...`)를 쓰면 요청한 경로 하나가 인스턴스
 * 수만큼 칼럼으로 펼쳐진다. 그래서 "요청한 카운터 개수 + 1" 로 칼럼 수를 검증하던 기존
 * 방식은 성립하지 않고, 어느 값이 어느 코어인지도 알 수 없다. 헤더를 저장해야 한다.
 */
let header = null;
let warnedMismatch = false;
let buf = '';
child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
  buf += chunk;
  const lines = buf.split(/\r?\n/);
  buf = lines.pop();
  for (const line of lines) {
    if (!line.startsWith('"')) continue;
    const cells = line.split('","').map((c) => c.replace(/^"|"$/g, ''));
    // 헤더는 `"(PDH-CSV 4.0) ..."` 로 시작한다. 첫 칼럼(타임스탬프 라벨)을 빼고 저장한다.
    if (line.startsWith('"(PDH-CSV')) {
      if (!header) {
        header = cells.slice(1);
        try { fs.appendFileSync(outFile, JSON.stringify({ header }) + '\n'); } catch (_) { /* 무시 */ }
      }
      continue;
    }
    // **길이로 행을 버리지 않는다.** 와일드카드(`Processor Information(*)`)의 인스턴스
    // 확장 개수가 실행마다 흔들려, 헤더와 행의 칼럼 수가 어긋나는 일이 실제로 있었다
    // (헤더 42셀 / 행 50셀). 예전 코드는 그 경우 **모든 행을 버려** 표본 0개가 됐고,
    // 프로브가 통째로 실패한 것처럼 보였다.
    //
    // typeperf 는 **요청한 순서대로** 칼럼을 낸다. 그래서 앞쪽 고정 카운터(_Total 계열)는
    // 언제나 같은 위치에 있고, 흔들리는 것은 뒤쪽 와일드카드뿐이다. 행은 그대로 남기고
    // 매핑은 읽는 쪽에서 정한다.
    if (!header || cells.length < 2) continue;
    if (cells.length - 1 !== header.length) {
      // 한 번만 알린다. 소비자가 코어별 매핑을 포기할지 판단할 근거가 된다.
      if (!warnedMismatch) {
        warnedMismatch = true;
        try {
          fs.appendFileSync(outFile, JSON.stringify({
            warn: 'column-mismatch', headerCols: header.length, rowCols: cells.length - 1,
          }) + '\n');
        } catch (_) { /* 무시 */ }
      }
    }
    // 값이 비거나 숫자가 아닌 칼럼은 null 로 둔다. 인스턴스가 사라지면(프로세스 종료)
    // 그 칼럼만 비므로, 행 전체를 버리면 나머지 코어 값까지 잃는다.
    const values = cells.slice(1).map((c) => {
      const n = Number(c);
      return Number.isFinite(n) ? n : null;
    });
    if (values.every((v) => v === null)) continue;
    try {
      fs.appendFileSync(outFile, JSON.stringify({ iso: new Date().toISOString(), v: values }) + '\n');
    } catch (_) { /* 디스크 문제로 한 줄 못 써도 수집을 멈추지 않는다 */ }
  }
});

// 부모가 죽으면 같이 끝난다. typeperf 가 고아로 남아 계속 도는 것을 막는다.
process.on('SIGTERM', () => { try { child.kill(); } catch (_) {} process.exit(0); });
process.on('SIGINT', () => { try { child.kill(); } catch (_) {} process.exit(0); });
