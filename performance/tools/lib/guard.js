'use strict';
/**
 * datasetGuard — "데이터셋 상태를 어디까지 강제할 것인가"를 정하는 하나의 스위치.
 *
 * 세 가지 모드
 * -------------
 *   off      상태 지문을 계산해 **기록만** 한다. 판정에는 쓰지 않는다. 현행 동작.
 *   warn     판정에 쓴다. 스냅샷과 다르면 경고하고 기준선 자격을 뺏는다. 복원은 안 한다.
 *   strict   다르면 **볼륨을 복원**하고 재확인한다. 그래도 다르면 실행을 거부한다.
 *
 * `warn` 이 왜 따로 있나
 * -----------------------
 * 처음부터 `strict` 로 켜면 매 실행마다 복원이 걸려 무엇이 정상인지 모르는 채 몇 분씩
 * 낭비할 수 있다. `warn` 으로 며칠 돌려 "읽기 시나리오가 정말 core 를 안 바꾸는가"를 확인한
 * 뒤 올리는 편이 안전하다. 도입 단계용 모드다.
 *
 * 측정은 항상, 판정만 스위치 — 이 설계의 핵심
 * ---------------------------------------------
 * `off` 여도 상태 지문은 계산해서 `run.json` 에 남긴다. 계산 비용이 실측 0.4초라 아낄 이유가
 * 없고, **안 재 두면 나중에 켰을 때 과거 실행 전부가 비교 불가가 된다.** 항상 재 두면 모드를
 * 바꿔도 `history.js --rebuild` 로 조건을 다시 유도할 수 있다. 즉 모드 변경이 **재실행이 아니라
 * 재계산으로 복구된다** — 이게 "간편하게 끄고 켠다"의 실질이다.
 *
 * 우선순위
 * ---------
 *   CLI(--guard) > 환경변수(PERF_DATASET_GUARD) > perf.config.json > 기본값 off
 *
 * 기본값을 `off` 로 두는 이유: 이 도구를 다른 저장소로 가져갔을 때 스냅샷도 없는 상태에서
 * 갑자기 실행이 거부되면 안 된다. 이 저장소는 `perf.config.json` 으로 `strict` 를 켠다.
 */

const fs = require('fs');
const path = require('path');

const MODES = ['off', 'warn', 'strict'];
const DEFAULT_MODE = 'off';
const CONFIG_FILE = path.join(__dirname, '..', '..', 'perf.config.json');

function readConfig(file = CONFIG_FILE) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    // 파일이 없는 것은 정상(기본값 사용)이지만, 있는데 깨진 것은 다르다. 조용히 기본값으로
    // 떨어지면 `strict` 를 켜 뒀다고 믿는 채로 아무 보호 없이 돌게 된다.
    if (e.code === 'ENOENT') return {};
    throw new Error(`perf.config.json 파싱 실패: ${e.message}`);
  }
}

/**
 * 모드와 그 출처를 함께 돌려준다. 출처를 같이 주는 이유: 리포트가 "왜 복원을 안 했지"에
 * 답하려면 값뿐 아니라 어디서 온 값인지 말할 수 있어야 한다.
 *
 * @returns {{mode:'off'|'warn'|'strict', source:string}}
 */
function resolveMode(cliValue, env = process.env, config = null) {
  const cfg = config || readConfig();
  const candidates = [
    [cliValue, '--guard'],
    [env.PERF_DATASET_GUARD, 'PERF_DATASET_GUARD'],
    [cfg.datasetGuard, 'perf.config.json'],
    [DEFAULT_MODE, '기본값'],
  ];
  for (const [value, source] of candidates) {
    if (value == null || value === '') continue;
    const v = String(value).toLowerCase();
    if (!MODES.includes(v)) {
      // 오타를 조용히 off 로 떨어뜨리면 보호가 꺼진 줄 모른다. 소리 내고 멈춘다.
      throw new Error(
        `datasetGuard 값이 올바르지 않습니다: '${value}' (${source})\n` +
        `  사용 가능: ${MODES.join(' | ')}`);
    }
    return { mode: v, source };
  }
  return { mode: DEFAULT_MODE, source: '기본값' };
}

/** 사람이 읽는 한 줄 — 실행 시작 배너에 그대로 쓴다. */
function describeMode(mode) {
  return {
    off: '상태 지문 기록만 (판정·복원 안 함)',
    warn: '상태 불일치 시 경고 + 기준선 제외 (복원 안 함)',
    strict: '상태 불일치 시 스냅샷 복원 후 재확인',
  }[mode];
}

module.exports = { MODES, DEFAULT_MODE, CONFIG_FILE, readConfig, resolveMode, describeMode };
