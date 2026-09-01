/**
 * Comparability 조건 정의 — "이 실행의 대조군으로 유효한 실행은?"을 답하는 선언적 표.
 *
 * comparability.js 의 비교 알고리즘이 이 표를 읽어 기준선 선택·리포트·추세 계열 분리를
 * 전부 이 표 하나로부터 이끌어낸다. 새 조건을 추가하려면 CONDITIONS 에 한 줄을 더하면 된다.
 *
 * 조건 값은 전부 "선언된 의도"여야 한다 — 측정 결과는 하나도 들어가면 안 된다
 * ---------------------------------------------------------------------------
 * 처음 떠오르는 해법은 k6 요약의 vusMax 를 조건에 넣는 것인데, 이건 설정값이 아니라
 * **관측값**이다(vus_max 메트릭의 최대치). ramping-vus 시나리오에서는 설정 피크와
 * 같아서 문제가 안 보이지만, ramping-arrival-rate(scenarios/breakpoint.js)는 목표
 * 도착률을 유지하려고 VU 를 동적으로 할당하므로 **서버가 느려질수록 vusMax 가 올라간다**.
 * 조건으로 쓰면: 진짜 회귀 발생 → vusMax 변화 → 기준선 부적격 → 비교 생략 → 게이트 통과.
 * 회귀가 심할수록 면제되는, 스스로를 무력화하는 필터가 된다. 그것도 한계 탐색이 목적인
 * 유일한 시나리오에서.
 *
 * 그래서 부하는 exec.test.options.scenarios(k6 가 해석을 끝낸 선언 값)로 식별한다.
 * 같은 이유로 durationSec(관측된 수행 시간)도 조건이 아니다 — 선언된 stages 가 조건이고,
 * 실제로 얼마나 걸렸는지는 결과다.
 *
 * 등급(materiality) — 불일치의 성격이 필드마다 다르다
 * ---------------------------------------------------
 *   blocking  : 수치가 **무의미**해진다. 기준선 자격을 박탈하고 상대 비교를 생략한다.
 *               (절대 게이트는 계속 돈다 — regression.js 의 안전 바닥)
 *   degrading : 수치가 **의심스럽다**. 비교는 하되 경고를 띄우고 FAIL 을 WARN 으로 낮춘다.
 *
 * 데이터셋이 다른 두 실행의 P95 를 나란히 놓는 것은 "믿을 수 없는 비교"가 아니라
 * 애초에 비교가 아니다. 반면 스크립트 지문 변화는 대개 주석 한 줄이고 수치는 대체로
 * 유효하다. 그래서 전자는 blocking, 후자는 degrading 이다.
 */
'use strict';

/** 조건 스키마 버전 — 필드 구성이 바뀌면 올린다. seriesHash()가 해시에 섞어 과거
 *  계열과 섞이지 않게 한다(comparability.js). */
// v2 (2026-08-13): dataset 조건이 프로파일 이름 문자열에서 {profile, fingerprint} 객체가
//   됐다. 이 조건은 blocking 이라 seriesHash 에 들어가므로 값 형태가 바뀌면 과거 계열과
//   섞이면 안 된다 — 추세 그래프에서 데이터셋 지문 도입 시점이 성능 변화로 보이게 된다.
// v3 (2026-08-16): dataset 조건에 **실행 시작 시점의 DB 상태 지문**이 들어갔다.
//   생성 지문(generation)은 "어떻게 만들었나"에만 답하므로, 쓰기 시나리오가 데이터를
//   바꿔 놓아도 이름과 생성 지문이 같아 비교 가능으로 판정되던 구멍이 있었다.
// v4 (2026-08-16): 부하 발생기 실행 방식(loadgen)이 조건이 됐다. k6 를 컨테이너로 돌리면
//   네트워크 경로가 바뀐다 — local 은 Windows 에서 포트 포워딩으로 localhost:18080 에,
//   docker 는 VM 안에서 컨테이너 네트워크로 app:8080 에 붙는다. 왕복 경로가 다른 두 값을
//   나란히 놓으면 경로 차이가 성능 변화로 보인다.
const SCHEMA_VERSION = 4;

/**
 * 비교 가능성을 이루는 조건들.
 *
 * `read`는 run 레코드에서 값을 꺼낸다. 인덱스 엔트리는 이미 평탄화된 conditions 를
 * 들고 있으므로 conditionsOf() 가 그쪽을 우선한다(수백 개 run.json 을 열지 않기 위함).
 */
const CONDITIONS = [
  {
    key: 'scenario',
    label: '시나리오',
    materiality: 'blocking',
    read: (r) => r.run && r.run.scenario,
  },
  {
    key: 'environment',
    label: '환경',
    materiality: 'blocking',
    read: (r) => r.run && r.run.environment,
  },
  {
    key: 'dataset',
    label: '데이터셋',
    materiality: 'blocking',
    // 프로파일 이름만으로는 부족하다. 생성기의 인기 편중 샘플러를 고쳐 데이터를 다시
    // 만들어도 이름은 그대로 `large`라서, 인기 분포가 완전히 달라진 데이터셋이 옛 실행과
    // 같은 조건으로 비교된다. 실제로 S-03 수정 때 그 상황이 발생할 뻔했다.
    //
    // 지문은 datasets/seed.js 가 생성 시점에 meta.json 으로 남기고, perf-run.js 가 읽어
    // 레코드에 싣는다. 지문이 없는 값(이 변경 이전에 만든 데이터셋)은 null 로 남겨 둔다 —
    // 임의의 기본값을 채우면 지문이 있는 실행과 조용히 같아져서 장치가 무력화된다.
    // blocking 이므로 `null vs 지문` 은 불일치로 잡혀 상대 비교가 생략된다.
    //
    // v3: 생성 지문 위에 **상태 지문**을 얹는다. 생성 지문은 "어떻게 만들었나"에만 답하므로
    // write-heavy 가 게시글 3만 건을 더 만들어 놓아도 값이 그대로다. 상태 지문은 실행 직전에
    // DB 를 직접 세어 "지금 무엇이 들어 있나"에 답한다(tools/lib/dbstate.js).
    //
    // guard 가 `off` 인 실행은 상태를 판정에 넣지 않는다. 값 자체는 항상 기록되므로
    // 나중에 켜고 `history.js --rebuild` 를 돌리면 소급 적용된다 — 모드를 바꿔도
    // 재실행이 아니라 재계산으로 복구된다.
    read: (r) => {
      if (!r.run || !r.run.dataset) return null;
      const base = { profile: r.run.dataset, fingerprint: r.run.datasetFingerprint || null };
      if (!r.run.datasetGuard || r.run.datasetGuard === 'off') return base;
      return { ...base, state: r.run.stateBefore || null, snapshot: r.run.snapshotId || null };
    },
    format: formatDataset,
  },
  {
    key: 'loadProfile',
    label: '부하 프로파일',
    materiality: 'blocking',
    read: (r) => r.run && r.run.loadProfile,
    format: formatLoadProfile,
  },
  {
    key: 'loadgen',
    label: '부하 발생기',
    materiality: 'blocking',
    // k6 를 어디서 돌렸는가. `local` 은 Windows 네이티브 프로세스가 포트 포워딩을 거쳐
    // localhost:18080 에 붙고, `docker` 는 WSL2 VM 안의 컨테이너가 컨테이너 네트워크로
    // app:8080 에 붙는다. **왕복 경로가 다르다.** 실측된 경로 오버헤드가 179ms(전체 평균
    // 200ms 중 서버측은 21ms)나 되므로, 경로가 바뀐 두 실행을 비교하면 그 차이가 성능
    // 변화로 읽힌다.
    //
    // 값이 없는 과거 실행은 `local` 로 본다. 추측이 아니라 **사실**이다 — 컨테이너 실행
    // 옵션이 생기기 전이라 다른 방식이 존재하지 않았다. null 로 두면 오늘 만든 기준선
    // 계열까지 통째로 비교 불가가 되는데, 그건 알 수 없어서가 아니라 기록을 안 했을 뿐이다.
    read: (r) => (r.run ? (r.run.loadgen || 'local') : null),
  },
  {
    key: 'loadBench',
    label: '측정 중 대조 벤치',
    // degrading 으로 둔다. warmup 안에서 도는 40초짜리 2코어 작업이라 measure 구간을
    // 직접 침범하지는 않지만, **호스트 상태와 예열 정도를 바꾼다.**
    //
    // 왜 조건으로 올리는가 — 이걸 기록하지 않아서 실제로 틀린 결론을 냈다. 2026-08-19
    // 저녁에 loadbench 를 도입했는데, 그 전후 실행을 한 계열로 놓고 상관을 냈더니
    // 주파수와 p95 가 −0.43 으로 움직였다. 절차가 같은 구간만 보면 +0.40 으로 부호가
    // 뒤집힌다 — 전체 상관은 **두 절차 집단의 평균 차이**가 만든 것이었다(심슨의 역설,
    // perf-session-drift.md 8-e). 조건 축에 없으면 이런 절차 변경이 조용히 섞인다.
    //
    // 값이 없는 과거 실행은 `off` 로 본다. 기능이 존재하기 전이므로 추측이 아니라 사실이다.
    materiality: 'degrading',
    read: (r) => {
      if (!r.run) return null;
      const lb = r.run.loadBench;
      return lb && lb.available ? `on@${lb.delaySec}s x${lb.repeat}` : 'off';
    },
  },
  {
    key: 'remoteWrite',
    label: 'k6 지표 전송',
    // **degrading 이지 blocking 이 아니다.** 이유: 측정 대상(앱·DB·Redis·데이터셋·
    // 부하 프로파일)은 하나도 바뀌지 않는다. 바뀌는 건 부하 발생기가 5초마다 지표를
    // 한 번 더 밀어 보낸다는 것뿐이고, 그 비용은 loadgen 지표로 직접 측정된다
    // (전환 시점 실측: 발생기 CPU 0.108 / 상한 4 코어 — 여유 97%).
    //
    // blocking 으로 두면 SCHEMA_VERSION 을 올려야 하고, 그러면 seriesHash 가 바뀌어
    // **기존 기준선 계열 전체가 통째로 비교 불가**가 된다. 미해결 상태인 E-46(세션 간
    // 편차) 조사가 그 계열 위에서 돌고 있으므로 그 대가가 이득보다 크다.
    // 대신 degrading 으로 잡아 두 실행이 다르면 리포트에 경고를 남기고 FAIL 을 WARN 으로
    // 낮춘다 — "비교는 하되 이 차이를 알고 보라"는 뜻이다.
    materiality: 'degrading',
    // 값이 없는 과거 실행은 `false` 로 읽는다. 추측이 아니라 사실이다 — 전송 기능이
    // 없던 시절이라 켜져 있었을 수가 없다. null(=unknown)로 두면 degrading 판정이
    // 통째로 건너뛰어져(comparability.js) 전환 시점이 리포트에 아예 안 나타난다.
    read: (r) => (r.run ? !!r.run.remoteWrite : null),
    format: (v) => (v ? '켜짐(Prometheus)' : '꺼짐'),
  },
  {
    key: 'appImage',
    label: '앱 이미지',
    // **degrading 이다.** blocking 으로 두면 이미지를 다시 만들 때마다 seriesHash 가 갈려
    // 추세선이 상시 리셋된다 — 코드를 고치는 것은 정상적인 일이고, 고칠 때마다 이력이
    // 끊기면 이력의 쓸모가 사라진다. `scriptVersion` 을 degrading 에 둔 것과 같은 이유다.
    //
    // 왜 조건에 넣는가 — 없어서 실제로 틀린 결론을 냈다(T-42). 조건 목록에 앱 바이너리가
    // 없어서, 8/14 이미지를 8/26 과 8/29 에 각각 잰 두 실행이 "커밋이 44개 다른 별개의
    // 바이너리"로 읽혔다. 실제로는 같은 것이었다. 반대 방향이 더 위험하다 — 코드를 고치고
    // 재빌드를 잊으면 새 커밋 기록에 옛 코드 측정치가 붙고, 개선 실험이 "효과 없음"으로
    // 나와도 코드가 안 들어간 것인지 구분할 근거가 없다.
    //
    // `run.commit` 은 이 역할을 못 한다. 그건 실행 시점 작업 트리의 HEAD 이지
    // 컨테이너 안에서 도는 바이너리가 아니다.
    materiality: 'degrading',
    // 값이 없는 과거 실행은 null(unknown)로 둔다. `loadgen`·`remoteWrite` 처럼 기본값을
    // 소급 적용하지 않는 이유는, 저 둘은 "기능이 없었으니 꺼져 있었다"가 **사실**인 반면
    // 이건 무엇을 쟀는지 정말로 모르기 때문이다. 모르는 것에 값을 채우면 서로 다른
    // 바이너리를 잰 과거 실행들이 조용히 같은 것으로 묶인다.
    read: (r) => {
      const img = r.run && r.run.appImage;
      return img && img.available ? img.imageId : null;
    },
    isUnknown: (v) => !v,
    format: (v) => (v ? String(v).replace(/^sha256:/, '').slice(0, 12) : '미기록'),
  },
  {
    key: 'scriptVersion',
    label: '부하 스크립트',
    materiality: 'degrading',
    read: (r) => r.run && r.run.scriptVersion,
    // 이관된 과거 실행은 지문이 없다. 한쪽이라도 unknown 이면 판정하지 않는다 —
    // 전부 불일치로 잡히면 이 장치 자체가 무의미해진다.
    isUnknown: (v) => !v || v === 'unknown',
  },
  {
    key: 'measurementProfile',
    label: '측정 구간 설계',
    materiality: 'blocking',
    // loadProfile 이 "어떤 부하를 발생시켰는가"라면 이건 "어느 시간대를 판정했는가"다.
    // 둘은 책임이 다르다 — stagesFor()가 phase-plan 초 수로 stages를 생성하므로 보통
    // 같이 바뀌지만(그때는 report.js가 두 mismatch를 한 줄로 합쳐 표시한다),
    // 이론적으로는 부하 크기는 그대로 두고 측정 창(warmup/rampdown 길이)만 바꿀 수도
    // 있다 — 그 경우를 잡아내려면 별도 조건이어야 한다.
    //
    // 값 전체(equal()의 stableStringify 딥비교)를 비교하므로 mode/warmupSec/measureSec/
    // rampdownSec/gatePhase 중 하나라도 다르면 blocking이다. phasePlan이 기록되지 않은
    // 과거 실행(T-02 이전, S-17 이전)은 read()가 null을 반환해 기존 "미기록이면 비교
    // 안 함" 규칙을 그대로 탄다 — 임의의 기본값을 소급 적용하지 않는다.
    read: (r) => {
      const p = r.run && r.run.phasePlan;
      if (!p) return null;
      return {
        mode: p.mode,
        warmupSec: p.warmupSec,
        measureSec: p.measureSec,
        rampdownSec: p.rampdownSec,
        gatePhase: p.gatePhase,
      };
    },
    format: formatMeasurementProfile,
  },
];

/**
 * 데이터셋 조건 표시. 지문이 없으면 그 사실을 그대로 말한다 — 리포트가 `large → large`
 * 라고만 쓰면 사람은 "같은데 왜 비교를 안 하지?"라고 읽는다.
 */
function formatDataset(v) {
  if (!v) return '—';
  if (typeof v === 'string') return `${v} (지문 없음)`; // 이 변경 이전 형식의 저장값
  const gen = v.fingerprint ? `생성 ${v.fingerprint}` : '생성 지문 없음';
  // 상태 축이 없으면 guard 가 꺼진 실행이다. "상태 미판정"이라고 명시한다 — 아무 말도
  // 안 하면 사람은 상태까지 확인된 실행으로 읽는다.
  const state = 'state' in v
    ? (v.state ? `상태 ${v.state}` : '상태 미기록')
    : '상태 미판정(guard off)';
  return `${v.profile} (${gen} · ${state})`;
}

/** 사람이 읽는 한 줄 요약 — 리포트가 "해시가 다릅니다"밖에 못 말하면 쓸모가 없다. */
function formatLoadProfile(profile) {
  if (!profile || typeof profile !== 'object') return '—';
  const parts = Object.entries(profile).map(([name, s]) => {
    const bits = [s.executor || '?'];
    if (Array.isArray(s.stages) && s.stages.length) {
      const from = s.startVUs != null ? s.startVUs : s.startRate != null ? s.startRate : 0;
      bits.push(`${from}→${s.stages.map((st) => `${st.target}@${st.duration}`).join('→')}`);
    }
    if (s.vus != null) bits.push(`${s.vus}VU`);
    if (s.rate != null) bits.push(`${s.rate}/${s.timeUnit || '1s'}`);
    if (s.iterations != null) bits.push(`${s.iterations}iter`);
    if (s.duration != null) bits.push(String(s.duration));
    if (s.maxVUs != null) bits.push(`maxVU ${s.maxVUs}`);
    const keys = Object.keys(profile);
    return keys.length > 1 ? `${name}: ${bits.join(' ')}` : bits.join(' ');
  });
  return parts.join(' | ');
}

/** 사람이 읽는 한 줄 요약 — measurementProfile 조건 값을 리포트 표에 올릴 때 쓴다. */
function formatMeasurementProfile(p) {
  if (!p) return '—';
  const bits = [p.mode || '?'];
  bits.push(`warmup ${p.warmupSec}s`);
  bits.push(`measure ${p.measureSec}s`);
  bits.push(`rampdown ${p.rampdownSec}s`);
  bits.push(`gate:${p.gatePhase == null ? '없음' : p.gatePhase}`);
  return bits.join(' · ');
}

module.exports = { CONDITIONS, SCHEMA_VERSION, formatLoadProfile, formatMeasurementProfile };
