#!/usr/bin/env node
'use strict';

/**
 * 저장된 `run.json` 으로 `report.html` 만 다시 만든다.
 *
 * 왜 필요한가: 보고서 렌더러(`lib/report.js`)를 고치면 이미 저장된 실행의 HTML 은 낡은
 * 모양으로 남는다. 그렇다고 장애를 다시 주입하면 **다른 실행**이 되어 예전 관측이 사라진다.
 * 원자료인 `run.json` 은 그대로 두고 표현만 갱신하는 경로가 따로 있어야 한다.
 *
 * 이 스크립트는 관측값을 만들지도 고치지도 않는다. `run.json` 을 읽어 렌더러에 그대로
 * 넘길 뿐이므로, 같은 원자료에서 같은 수치가 나온다.
 *
 * 보고서 4번 절(회복·탐지)은 저장된 시계열·헬스 표본에서 **렌더링할 때** 계산한다. 판단
 * 규칙을 `lib/recovery.js` 에서 고치고 이 스크립트를 돌리면 지난 실행까지 같은 규칙으로
 * 다시 읽힌다 — 규칙이 실행마다 다르면 두 실행의 회복 시간을 비교할 수 없기 때문이다.
 *
 * 사용법
 *   node resilience/render-report.js                 저장된 실행 전부 다시 렌더링
 *   node resilience/render-report.js <runId> [...]   지정한 실행만
 */

const fs = require('fs');
const path = require('path');
const { renderReport } = require('./lib/report');
const { siblingsOf } = require('./fault-run');

const REPORTS = path.join(__dirname, 'reports');

/** `run.json` 이 들어 있는 실행 디렉터리 이름만 고른다. staging 은 실행 중 임시 공간이다. */
function runIds() {
  if (!fs.existsSync(REPORTS)) return [];
  return fs.readdirSync(REPORTS)
    .filter((d) => d !== 'staging' && fs.existsSync(path.join(REPORTS, d, 'run.json')))
    .sort();
}

function main() {
  const wanted = process.argv.slice(2);
  const ids = wanted.length ? wanted : runIds();
  if (!ids.length) {
    console.error(`다시 만들 실행이 없다: ${REPORTS}`);
    process.exit(1);
  }
  let done = 0;
  for (const id of ids) {
    const dir = path.join(REPORTS, id);
    const src = path.join(dir, 'run.json');
    // 실행 하나가 깨져도 나머지는 갱신한다. 어느 것이 왜 실패했는지는 그 자리에서 알린다.
    try {
      const rec = JSON.parse(fs.readFileSync(src, 'utf8'));
      const html = renderReport(rec, { siblings: siblingsOf(rec.plan && rec.plan.id, id) });
      fs.writeFileSync(path.join(dir, 'report.html'), html);
      console.log(`${id}  ${(html.length / 1024).toFixed(0)}KB`);
      done += 1;
    } catch (e) {
      console.error(`${id}  건너뜀 — ${e.message}`);
    }
  }
  console.log(`\n${done}/${ids.length} 개 실행의 report.html 을 다시 만들었다. run.json 은 건드리지 않았다.`);
}

if (require.main === module) main();

module.exports = { runIds };
