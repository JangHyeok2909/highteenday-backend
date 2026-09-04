'use strict';
/**
 * appimage — **부하를 받은 코드가 무엇인가**를 실행 기록에 남긴다.
 *
 * 왜 필요한가 — `commit` 은 그 답이 아니다
 * ----------------------------------------
 * 모든 실행 기록에 `run.commit` 이 붙어 있어서 그 커밋의 코드를 잰 것처럼 보인다.
 * 아니다. 그 값은 `perf-run.js` 가 실행 시점에 `git rev-parse HEAD` 로 읽은 **작업 트리의
 * HEAD** 이고, 부하를 받는 것은 컨테이너 안의 이미지다. 둘 사이에는 아무 연결이 없다.
 *
 * 이미지는 `docker compose up -d --build` 를 쳤을 때만 다시 만들어진다. 실험 절차가 매
 * 회차 쓰는 `docker restart perf-app` 도, `docker compose up -d app` 도 이미지를 건드리지
 * 않는다. 그래서 코드를 고치고 재빌드를 잊으면 **기록은 새 커밋을 가리키는데 잰 것은 옛
 * 코드**가 된다.
 *
 * 실측으로 확인했다(2026-08-31, T-42). `perf-app` 의 이미지는 2026-08-14 생성분이었고,
 * 그 jar 안에는 그 뒤에 추가된 `QueryCountFilter` 가 아예 없었다. 즉 8/14 이후에 저장된
 * 모든 실행이 8/14 코드를 잰 것인데, 기록에는 그때그때의 HEAD 가 박혀 있었다. 이게 두
 * 방향으로 틀리게 만든다.
 *
 *   없는 차이를 있다고 읽는다 — EXP-006 은 Before/After 의 커밋이 44개 다르다는 이유로
 *                              "지연 비교 무효"로 결론냈다. 실제로는 같은 바이너리였다.
 *   있는 차이를 없다고 읽는다 — 이쪽이 더 위험하다. 개선 실험이 "효과 없음"으로 나와도
 *                              정말 효과가 없는 것인지 코드가 안 들어간 것인지 구분할
 *                              근거가 기록에 없다.
 *
 * 무엇을 남기는가
 * ---------------
 * `imageId` 가 핵심이다. 이미지 내용이 바뀌면 반드시 바뀌는 값이라, 두 실행이 같은
 * 바이너리를 쟀는지를 이 값 하나로 판정할 수 있다. 나머지(이름·생성 시각·라벨)는 그
 * 해시를 사람이 읽을 수 있는 값으로 되돌리기 위한 것이다.
 *
 * 왜 stale 검사까지 하는가
 * ------------------------
 * 기록만 남기면 **사후에** 틀린 줄 알게 된다. 위 사례가 정확히 그랬다 — 실험 두 개를
 * 쓰고 나서 컨테이너를 열어 보고서야 알았다. 그래서 실행 **전에** 이미지 생성 시각과
 * 빌드 입력(소스·Dockerfile·build.gradle)의 최종 수정 시각을 비교해, 이미지가 더 오래
 * 됐으면 경고한다. 커밋 시각이 아니라 파일 mtime 을 쓰는 이유는 커밋하지 않은 수정도
 * 잡아야 하기 때문이다.
 *
 * 실행을 막지는 않는다. 소스를 건드렸지만 이번 실험과 무관한 경우(문서·성능 도구 수정)가
 * 흔하고, 그때마다 재빌드를 강제하면 절차가 무거워져 결국 검사를 꺼 버리게 된다.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CONTAINER = process.env.PERF_APP_CONTAINER || 'perf-app';

/** 저장소 루트 — 이 파일은 performance/tools/lib/ 아래에 있다. */
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

/**
 * 이미지 내용을 결정하는 입력들. Dockerfile 이 무엇을 COPY 하는지와 맞춰야 한다.
 * `performance/` 와 문서 디렉터리는 이미지에 들어가지 않으므로 일부러 뺀다 — 넣으면
 * 성능 도구를 고칠 때마다 "이미지가 낡았다"는 경고가 떠서 경고가 무의미해진다.
 */
const BUILD_INPUTS = ['src/main', 'build.gradle', 'settings.gradle', 'Dockerfile'];

function docker(args) {
  const r = spawnSync('docker', args, { encoding: 'utf8' });
  if (r.error) throw new Error(`docker 실행 실패: ${r.error.message}`);
  if (r.status !== 0) {
    const msg = (r.stderr || '').trim().split('\n')[0] || '(출력 없음)';
    throw new Error(`docker ${args[0]} 실패: ${msg}`);
  }
  return (r.stdout || '').trim();
}

/** 경로 하나(파일 또는 디렉터리) 아래의 가장 최근 수정 시각(ms). 없으면 0. */
function newestMtime(target) {
  let newest = 0;
  const walk = (p) => {
    let st;
    try {
      st = fs.statSync(p);
    } catch {
      return; // 없는 경로는 그냥 건너뛴다 — 검사 하나가 실행을 막으면 안 된다
    }
    if (st.isDirectory()) {
      for (const name of fs.readdirSync(p)) walk(path.join(p, name));
      return;
    }
    if (st.mtimeMs > newest) newest = st.mtimeMs;
  };
  walk(target);
  return newest;
}

/** 빌드 입력 전체에서 가장 최근 수정 시각(ms). 하나도 못 읽으면 0. */
function newestBuildInputMtime() {
  let newest = 0;
  for (const rel of BUILD_INPUTS) {
    const m = newestMtime(path.join(REPO_ROOT, rel));
    if (m > newest) newest = m;
  }
  return newest;
}

/**
 * 부하를 받는 앱 컨테이너의 이미지 신원을 읽는다.
 *
 * @returns {{
 *   available: boolean, reason?: string,
 *   imageId?: string,          이미지 내용 해시. 코드가 바뀌면 반드시 바뀐다
 *   imageRef?: string,         컨테이너가 선언한 이미지 이름(environment-app 등)
 *   imageCreated?: string,     이미지 빌드 시각(ISO)
 *   containerStarted?: string, 컨테이너 기동 시각(ISO)
 *   labelCommit?: string|null, 빌드 시 구운 커밋 라벨. 없으면 null
 *   stale?: boolean,           빌드 입력이 이미지보다 새것인가
 *   staleBySec?: number,       얼마나 새것인가(초)
 *   newestInput?: string       가장 최근에 수정된 빌드 입력 시각(ISO)
 * }}
 */
function probe() {
  let raw;
  try {
    // 한 번의 inspect 로 다 읽는다. 필드마다 docker 를 부르면 컨테이너가 그 사이에
    // 재생성될 때 서로 다른 대상의 값이 섞인다.
    raw = docker(['inspect', CONTAINER, '--format',
      '{{.Image}}\t{{.Config.Image}}\t{{.State.StartedAt}}']);
  } catch (e) {
    return { available: false, reason: e.message };
  }
  const [imageId, imageRef, containerStarted] = raw.split('\t');
  if (!imageId) return { available: false, reason: `inspect 출력이 비어 있음 (${CONTAINER})` };

  const out = {
    available: true,
    imageId,
    imageRef: imageRef || null,
    containerStarted: containerStarted || null,
    labelCommit: null,
  };

  // 이미지 자체의 생성 시각과 라벨. 이미지가 이미 지워진 상태(컨테이너만 살아 있음)도
  // 있을 수 있으므로 실패해도 위의 값들은 살린다.
  try {
    const meta = docker(['image', 'inspect', imageId, '--format',
      '{{.Created}}\t{{index .Config.Labels "org.opencontainers.image.revision"}}']);
    const [created, label] = meta.split('\t');
    out.imageCreated = created || null;
    // Go 템플릿은 없는 라벨을 "<no value>" 로 찍는다. 그걸 커밋으로 저장하면 안 된다.
    out.labelCommit = label && label !== '<no value>' ? label : null;
  } catch {
    out.imageCreated = null;
  }

  // 이미지가 소스보다 오래됐는가. 둘 중 하나라도 시각을 모르면 판정하지 않는다 —
  // 모르는 것을 "정상"으로 적으면 이 장치를 만든 이유가 사라진다.
  const inputMs = newestBuildInputMtime();
  const imageMs = out.imageCreated ? Date.parse(out.imageCreated) : NaN;
  if (inputMs > 0 && Number.isFinite(imageMs)) {
    out.newestInput = new Date(inputMs).toISOString();
    out.stale = inputMs > imageMs;
    out.staleBySec = out.stale ? Math.round((inputMs - imageMs) / 1000) : 0;
  } else {
    out.stale = null;
  }
  return out;
}

/** 콘솔 한 줄 요약. 실행 로그만 봐도 "무엇을 쟀는지"가 남아야 한다. */
function describe(img) {
  if (!img || !img.available) {
    return `⚠ 앱 이미지 확인 실패 — ${img ? img.reason : '미조회'} · 이 실행은 "무엇을 쟀는지" 모르는 기록으로 남는다`;
  }
  const short = img.imageId.replace(/^sha256:/, '').slice(0, 12);
  const created = img.imageCreated ? new Date(img.imageCreated).toLocaleString('ko-KR') : '생성 시각 불명';
  const base = `앱 이미지 ${img.imageRef || '?'} (${short}) · 빌드 ${created}`;
  if (img.stale) {
    const days = (img.staleBySec / 86400).toFixed(1);
    return `${base}\n  ⚠ 소스가 이미지보다 ${days}일 새것이다 — 지금 실행하면 옛 코드를 잰다.\n`
      + '    반영하려면: docker compose -f environment/docker-compose.perf.yml --env-file environment/.env.perf up -d --build app';
  }
  if (img.stale === null) return `${base} · 최신 여부 판정 불가`;
  return `${base} · 소스와 일치`;
}

module.exports = { probe, describe, CONTAINER, BUILD_INPUTS };
