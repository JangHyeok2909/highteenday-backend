#!/usr/bin/env node
/**
 * JSON 장애 계획을 실행하고 서비스의 반응을 수집하는 장애 관측 실험 실행기.
 *
 * 하나의 실행을 장애 전(pre), 장애 중(fault), 복구 후(post)로 나누고 세 구간에 같은
 * 도착률의 k6 부하를 보낸다. 별도의 로컬 드라이버가 계획된 시각에 Toxiproxy, Docker,
 * Pumba 또는 외부 명령으로 계획에 적힌 장애·복구 단계를 실행한다. 동시에 앱 헬스 상태와
 * Prometheus 지표를 모아 장애의 영향 범위, 실패 응답의 지연, 복구 여부를 확인한다.
 *
 * 전체 실행 순서
 *   1. 명령행 인수를 읽고 계획 파일을 검증한다.
 *   2. 성능 측정 도구와 공유하는 실행 잠금을 얻어 동시 실행을 막는다.
 *   3. 앱, Prometheus, 프록시 연결 경로, 장애 주입 대상 컨테이너를 사전 점검한다.
 *   4. 요청된 경우 데이터 스냅샷을 복원하거나 Redis를 비운다.
 *   5. 주입 드라이버와 헬스 폴러를 시작한 뒤 k6를 자식 프로세스로 실행한다.
 *   6. k6 setup 신호를 기준 시각(t0)으로 삼아 장애 주입 타이머를 예약한다.
 *   7. k6가 끝나면 예약을 취소하고 프록시·컨테이너·Pumba를 정상 상태로 정리한 뒤
 *      마지막 Prometheus 스크레이프를 기다린다. shell 단계의 부작용은 자동 복구하지 않는다.
 *   8. 세 구간의 인프라 집계와 전체 시간축을 수집해 JSON과 HTML 보고서를 만든다.
 *   9. 정상 종료, Ctrl+C, 예외 어느 경로에서도 드라이버 정리와 잠금 해제를 시도한다.
 *
 * 실행 결과
 *   resilience/reports/<계획-id>-<t0>/
 *     run.json        계획, 환경, 주입 이력, 헬스, k6 집계, 인프라 지표, 시간축을 합친 기록
 *     k6.json         k6가 생성한 원본 요약
 *     k6.summary.txt  k6 텍스트 요약이 있을 때 함께 보존하는 파일
 *     report.html     run.json을 사람이 읽을 수 있게 렌더링한 관측 보고서
 *
 * 이 도구는 기준선을 고르거나 PASS/WARN/FAIL을 판정하지 않는다. 같은 실행의 세 구간을
 * 관측 자료로 제시할 뿐이다. 따라서 k6 종료 코드는 run.json에 기록하지만 그 자체로 이
 * 실행기의 성공·실패를 정하지 않는다. 0이 아닌 프로세스 종료 코드는 계획 실행이나 자료
 * 수집 과정이 완료되지 못했다는 뜻이다.
 *
 * 사용법
 *   performance/ 디렉터리에서:
 *   node resilience/fault-run.js resilience/faults/<계획>.json [옵션]
 *
 * 계획 파일의 핵심 필드
 *   id                            실행과 산출물 이름에 쓰는 고유 ID
 *   question                      이번 실험이 답하려는 질문
 *   requires.proxy                true이면 앱의 DB·Redis 프록시 경유를 필수로 검사
 *   dataset                       k6 데이터셋 이름
 *   load.rate                     초당 시작할 반복(iteration) 수
 *   load.preVus / load.maxVus     k6가 미리 준비할 가상 사용자 수와 최대 가상 사용자 수
 *   phases.preSec                 장애가 없는 기준 구간 길이
 *   phases.faultSec               장애를 유지하며 영향을 관측할 구간 길이
 *   phases.postSec                장애를 제거한 뒤 회복을 관측할 구간 길이
 *   inject[]                      언제 어떤 도구로 무엇을 실행할지 적은 주입 단계
 *   expect[]                      실행 전에 세운 가설. 하나 이상 없으면 계획 검증 실패
 *   watch[]                       보고서에서 우선 확인할 지표 이름
 *
 * inject[].at은 실행 시작 기준 초 또는 run.start, fault.start, fault.end, run.end에
 * +N/-N초를 붙인 표현이다. 지원 도구는 다음과 같다.
 *   toxiproxy                     add/remove toxic, proxy enable/disable
 *   docker                        stop/start/pause/unpause/kill/restart 컨테이너
 *   pumba                         args 배열로 전달한 컨테이너 장애 명령
 *   shell                         argv 배열의 첫 값을 실행 파일로 삼는 동기 외부 명령
 *
 * 이 파일에서 사용하는 주요 용어
 *   도착률                        매초 새로 시작하는 k6 반복 수. 응답이 느려져도 목표값은 유지
 *   반복(iteration)               가상 사용자 한 명이 한 번 수행하는 사용자 행동 묶음
 *   가상 사용자(VU)              k6가 동시에 진행 중인 반복을 실행하는 작업 단위
 *   Toxiproxy                    네트워크 연결에 지연·단절·타임아웃을 삽입하는 프록시
 *   toxic                         Toxiproxy에 추가하는 지연·타임아웃 같은 네트워크 장애 규칙
 *   Pumba                         실행 중인 컨테이너에 CPU·네트워크 장애 등을 주는 도구
 *   t0                            k6 부하가 실제로 시작됐다고 보는 모든 상대 시각의 기준점
 *   스크레이프                    Prometheus가 대상 서비스에서 지표를 주기적으로 가져오는 작업
 *   p95                           전체 요청의 95%가 이 값 이하에 끝났음을 뜻하는 지연 백분위수
 *
 * 명령행 옵션
 *   --note "<문자열>"             보고서에 실행 메모를 남긴다.
 *   --rate <횟수>                 계획의 초당 도착률(load.rate)을 덮어쓴다.
 *   --pre <초>                    장애 전 구간 길이를 덮어쓴다.
 *   --fault <초>                  장애 구간 길이를 덮어쓴다.
 *   --post <초>                   복구 후 구간 길이를 덮어쓴다.
 *   --restore <스냅샷-id>         부하 실행 전에 데이터 스냅샷을 복원한다.
 *   --no-flush-redis              Redis 초기화를 건너뛴다. 기본은 부하 실행 전에 FLUSHALL 이다
 *                                 — 남은 캐시와 조회 중복 마커가 pre 기준과 조회수 계산을
 *                                 흔들기 때문이다. 끄면 그 실행의 조회수 유실은 상한이 된다.
 *   --wait <초>                   k6 종료 후 마지막 지표 수집까지 기다린다. 기본값은 20초다.
 *   --dry-run                     사전 점검까지만 수행한다. k6 실행과 보고서 생성은 생략하지만,
 *                                 사전 점검에서 발견한 기존 Toxiproxy 장애 설정은 초기화한다.
 *   --no-remote-write             k6 시계열을 Prometheus에 전송하지 않는다. 이 경우 k6 기반
 *                                 시간축 그래프는 비어 있을 수 있다.
 *
 * 환경 변수
 *   K6_BIN                        실행할 k6 파일. 기본값: k6
 *   BASE_URL                      관측할 애플리케이션 주소. 기본값: http://localhost:18080
 *   PROM_URL                      조회할 Prometheus 주소. 기본값: http://localhost:9090
 *   K6_RW_URL_LOCAL               k6 remote write 주소. 기본값: http://localhost:9090/api/v1/write
 *   PERF_APP_CONTAINER            앱 컨테이너 이름. 기본값: perf-app
 *   PERF_REDIS_CONTAINER          Redis 컨테이너 이름. 기본값: perf-redis
 *   TOXIPROXY_URL                 Toxiproxy API 주소. 기본값: http://127.0.0.1:18474
 *   DATASET                       k6가 사용할 데이터셋. 미지정 시 계획 값, 그마저 없으면 medium
 *
 * 계획 파일 형식과 보고서 각 항목의 해석은 `resilience/README.md`에 정리되어 있다.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

// 보고서·k6 스크립트 등 내부 경로는 실행 위치가 아니라 이 파일의 위치를 기준으로 계산한다.
const PERF_ROOT = path.resolve(__dirname, '..'); // performance/
const RES_ROOT = __dirname; // performance/resilience/
const REPORTS = path.join(RES_ROOT, 'reports'); // 최종 실행별 보고서 디렉터리
const STAGING = path.join(REPORTS, 'staging'); // k6가 먼저 요약을 쓰는 임시 디렉터리

/*
 * 실행 단계별 협력 모듈
 *   run-lock       성능 스택을 공유하는 다른 측정 실행과의 동시 실행 방지
 *   PromClient     Prometheus 즉시·범위 쿼리
 *   collectInfra   지표 카탈로그 전체를 주어진 구간으로 집계
 *   grafana        관측 시간 범위가 적용된 Grafana 링크 생성
 *   APP_JOB        앱 지표만 고르는 Prometheus job 라벨 값
 *   appimage       부하를 받은 컨테이너 이미지의 신원과 소스 대비 최신 여부
 *   gitMeta        브랜치·커밋·작업 트리 오염 여부(성능 측정기와 같은 규칙)
 *   scriptVersion  부하의 성격을 결정하는 스크립트 묶음의 지문
 *   datasetFingerprint  같은 이름의 데이터셋이 실제로 같은 내용인지 가리는 지문
 *   appconfig      실패 지연을 만드는 타임아웃·풀 설정값과 그 출처
 *   collectFaultMetrics  앱이 던진 예외를 클래스별로, JVM 스레드 상태를 구간별로
 *   request        앱 헬스 확인에 쓰는 작은 HTTP 클라이언트
 *   Toxiproxy      프록시 존재·잔여 장애 상태 점검과 초기화
 *   dockerLib      컨테이너 상태·환경 조회와 Redis 명령 실행
 *   plans          계획 검증, 주입 시각, 구간 창, k6 집계 이름 변환
 *   Driver         k6와 시작 시각을 맞추고 장애 주입·원상복구 실행
 *   HealthPoller   실험 중 /actuator/health를 주기적으로 표본화
 *   renderReport   합쳐진 실행 레코드를 독립 실행형 HTML로 렌더링
 */
const { acquireRunLock } = require('../tools/lib/run-lock');
const { PromClient } = require('../tools/lib/promql');
const { collectInfra } = require('../tools/collect');
const grafana = require('../tools/lib/grafana');
const { APP_JOB } = require('../tools/lib/metrics-catalog');
const appimage = require('../tools/lib/appimage');
const { gitMeta, scriptVersion, datasetFingerprint } = require('../tools/perf-run');
const appconfig = require('./lib/appconfig');
const { collectFaultMetrics } = require('./lib/faultmetrics');
const { request } = require('./lib/http');
const { Toxiproxy } = require('./lib/toxiproxy');
const dockerLib = require('./lib/docker');
const plans = require('./lib/plan');
const { Driver } = require('./lib/driver');
const { HealthPoller } = require('./lib/health');
const { renderReport } = require('./lib/report');
const recovery = require('./lib/recovery');
const dbstate = require('../tools/lib/dbstate');
const integrity = require('./lib/integrity');
const invariants = require('./lib/invariants');

const K6_BIN = process.env.K6_BIN || 'k6';
const BASE_URL = process.env.BASE_URL || 'http://localhost:18080';
const PROM_URL = process.env.PROM_URL || 'http://localhost:9090';
const K6_RW_URL = process.env.K6_RW_URL_LOCAL || 'http://localhost:9090/api/v1/write';
const APP_CONTAINER = process.env.PERF_APP_CONTAINER || 'perf-app';
const REDIS_CONTAINER = process.env.PERF_REDIS_CONTAINER || 'perf-redis';

// 헬스 폴러의 주기와 응답 상한. 폴러와 설정 표가 같은 값을 봐야 "무응답 4초"의 근거가
// 보고서에 남는다 — 값이 두 곳에 갈라져 있으면 표가 실제로 쓰인 상한과 달라질 수 있다.
const HEALTH_POLL = { intervalMs: 5000, timeoutMs: 4000 };

/**
 * 구간별로 세는 HTTP 상태 코드. resilience/scenarios/fault-window.js 의 WATCH_STATUS 와
 * 같아야 한다 — k6 는 threshold 가 걸린 축만 요약에 싣기 때문에, 여기에만 있는 코드는
 * 언제나 0 으로 보이고 그쪽에만 있는 코드는 표에서 사라진다.
 */
const WATCH_STATUS = ['0', '401', '429', '500', '502', '503', '504'];

// k6 원본 메트릭을 기능별로 다시 묶어 장애의 폭발 반경을 계산할 때 사용하는 고정 축이다.
const FEATURES = ['auth', 'post', 'comment', 'board', 'reaction', 'scrap', 'notification', 'friend', 'mypage', 'school', 'timetable', 'chat', 'hot'];

/**
 * 지정한 시간 뒤 이행하는 Promise를 만든다. 마지막 Prometheus 스크레이프 대기에 쓴다.
 *
 * @param {number} ms 기다릴 시간(밀리초).
 * @returns {Promise<void>} 지정 시간이 지난 뒤 이행하는 Promise.
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 실행 진행 상황을 표준 출력에 기록한다.
 *
 * @param {string} s 출력할 문자열.
 * @returns {void}
 */
const log = (s) => console.log(s);

/**
 * 명령행 토큰을 실행 옵션 객체로 변환한다.
 *
 * 첫 번째 위치 인수는 필수 계획 파일 경로다. 값이 필요한 옵션은 바로 다음 토큰을
 * 소비하고, 숫자 옵션은 Number로 변환한다. 여기서는 변환 결과가 유효한 숫자인지 별도로
 * 검사하지 않는다. 구간 길이는 loadPlan()의 계획 검증을 거친다. --rate가 0이나 NaN이면
 * 덮어쓰기 조건을 통과하지 않아 계획의 기존 도착률이 유지되고, --wait 값은 별도 검증 없이
 * 이후 대기 계산에 그대로 사용된다.
 *
 * @param {string[]} argv process.argv에서 node와 스크립트 경로를 제외한 토큰 배열.
 * @returns {object} 계획 경로, 덮어쓰기 값, 초기화 옵션, 대기 시간, 실행 모드를 담은 객체.
 * @throws {Error} 계획 경로가 없거나, 알 수 없는 옵션이 있거나, 위치 인수가 둘 이상일 때.
 */
function parseArgs(argv) {
  const o = { plan: null, note: '', rate: null, pre: null, fault: null, post: null, restore: null, flushRedis: true, wait: 20, dryRun: false, remoteWrite: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--note') o.note = argv[++i];
    else if (a === '--rate') o.rate = Number(argv[++i]);
    else if (a === '--pre') o.pre = Number(argv[++i]);
    else if (a === '--fault') o.fault = Number(argv[++i]);
    else if (a === '--post') o.post = Number(argv[++i]);
    else if (a === '--restore') o.restore = argv[++i];
    else if (a === '--no-flush-redis') o.flushRedis = false;
    else if (a === '--wait') o.wait = Number(argv[++i]);
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--no-remote-write') o.remoteWrite = false;
    else if (a.startsWith('--')) throw new Error(`모르는 옵션: ${a}`);
    else if (!o.plan) o.plan = a;
    else throw new Error(`인자가 너무 많다: ${a}`);
  }
  if (!o.plan) throw new Error('사용법: node resilience/fault-run.js resilience/faults/<plan>.json [--note "..."] [--dry-run]');
  return o;
}

/**
 * JSON 계획 파일을 읽고 명령행 덮어쓰기를 적용한 뒤 전체 계획을 검증한다.
 *
 * 0이나 NaN이 아닌 --rate는 load.rate를, --pre/--fault/--post는 phases의 각 구간 길이를
 * 바꾼다. 이후 plans.validatePlan()으로 계획 ID, 질문, 구간 길이, 도착률, 주입
 * 도구·시각·대상, 가설의 존재 여부를 한꺼번에 검사한다. 파일에서 읽은 객체만 수정하며
 * 원본 파일은 바꾸지 않는다.
 *
 * @param {string} file 읽을 JSON 계획 파일의 절대 또는 상대 경로.
 * @param {object} o parseArgs()가 반환한 명령행 옵션.
 * @returns {object} 덮어쓰기와 검증이 끝나 실행에 사용할 장애 계획.
 * @throws {Error} 파일을 읽거나 JSON을 파싱하지 못한 경우, 또는 검증 오류가 하나라도 있는 경우.
 */
function loadPlan(file, o) {
  const plan = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (o.rate) plan.load = { ...plan.load, rate: o.rate };
  if (o.pre != null) plan.phases = { ...plan.phases, preSec: o.pre };
  if (o.fault != null) plan.phases = { ...plan.phases, faultSec: o.fault };
  if (o.post != null) plan.phases = { ...plan.phases, postSec: o.post };
  const errors = plans.validatePlan(plan);
  if (errors.length) throw new Error(`계획이 잘못됐다 (${file}):\n  - ${errors.join('\n  - ')}`);
  return plan;
}

/**
 * Date를 실행 ID와 디렉터리 이름에 안전한 UTC 시각 문자열로 바꾼다.
 * 콜론과 소수점 이하를 제거하며 초 단위까지만 남긴다.
 *
 * @param {Date} d 변환할 시각.
 * @returns {string} 예: 2026-09-09T12-34-56
 * @throws {RangeError} 유효하지 않은 Date를 받은 경우.
 */
function ts(d) { return d.toISOString().replace(/[:.]/g, '-').slice(0, 19); }

/**
 * 실행 중인 앱 컨테이너의 환경 변수로 데이터베이스와 Redis의 실제 연결 경로를 확인한다.
 * Compose 파일만 보면 컨테이너가 이전 설정으로 실행 중인 경우를 놓칠 수 있다.
 * DB_URL에 "toxiproxy"가 포함되고 REDIS_HOST가 정확히 "toxiproxy"일 때만 두 의존성이
 * 모두 프록시를 경유한다고 판정한다.
 *
 * @returns {{dbUrl: string|null, redisHost: string|null, viaProxy: boolean}}
 *   현재 컨테이너의 연결 설정과 두 연결이 모두 프록시를 경유하는지 여부.
 * @throws {Error} Docker CLI 자체를 실행할 수 없는 경우.
 */
function proxyRouting() {
  const dbUrl = dockerLib.envOf(APP_CONTAINER, 'DB_URL');
  const redisHost = dockerLib.envOf(APP_CONTAINER, 'REDIS_HOST');
  return {
    dbUrl, redisHost,
    viaProxy: !!(dbUrl && /toxiproxy/.test(dbUrl)) && redisHost === 'toxiproxy',
  };
}

/**
 * 장애를 주입해도 관측 결과가 성립하는 환경인지 사전 점검한다.
 *
 * 점검 순서와 처리 방식은 다음과 같다.
 *   1. 앱의 /actuator/health를 5초 제한으로 호출한다. HTTP 응답과 헬스 상태를 메모에
 *      남기며, 상태가 DOWN이어도 구조화된 헬스 응답이 오면 현재 시작 상태로 받아들인다.
 *   2. Prometheus에 ping한다. 닿지 않으면 시간축과 인프라 지표를 만들 수 없어 중단한다.
 *   3. 실행 중인 앱 컨테이너의 DB_URL과 REDIS_HOST를 읽어 실제 프록시 경로를 기록한다.
 *   4. 계획이 프록시를 요구하거나 Toxiproxy 주입을 포함하면 두 의존성의 프록시 경유를
 *      강제하고, 필요한 프록시의 존재를 확인한다. 이전 실행에서 toxic 또는 disabled
 *      상태가 남았다면 모든 프록시를 정상 상태로 초기화해 pre 구간을 깨끗하게 만든다.
 *   5. Docker 주입 대상 컨테이너가 실제로 존재하는지 확인한다. 없으면 중단하고,
 *      존재하지만 실행 중이 아니면 시작 조건을 보존한 채 경고만 남긴다.
 *   6. 재현에 필요한 앱 이미지, HikariCP 최대 연결 수, 연결 경로와 실행 옵션을 기록한다.
 *
 * @param {object} plan 검증이 끝난 장애 계획.
 * @param {object} o parseArgs()가 반환한 실행 옵션.
 * @returns {Promise<object>} 콘솔에 표시할 notes, 연결 경로 routing, 이후 쿼리에 재사용할
 *   PromClient 인스턴스, 보고서에 저장할 env 정보를 반환한다.
 * @throws {Error} 앱 또는 Prometheus에 닿지 않거나, 필요한 프록시·컨테이너가 없거나,
 *   Toxiproxy 상태를 확인·초기화하지 못한 경우.
 * 부작용: 기존 Toxiproxy 설정이 남아 있으면 reset한다. --dry-run에서도 이 점검은 실행된다.
 */
async function preflight(plan, o) {
  const notes = [];
  // 요청 가능 여부를 확인한다. 헬스 상태가 DOWN이어도 응답 내용을 시작 상태로 기록한다.
  try {
    const h = await request('GET', `${BASE_URL}/actuator/health`, null, { timeoutMs: 5000 });
    notes.push(`앱 헬스: HTTP ${h.status} ${h.json && h.json.status ? h.json.status : ''}`);
    if (h.status >= 500 && !(h.json && h.json.status)) throw new Error('앱이 응답하지 않는다');
  } catch (e) {
    throw new Error(`앱(${BASE_URL}) 사전 점검 실패: ${e.message}`);
  }
  // Prometheus에 닿지 않으면 시간축과 인프라 지표가 비므로 불완전한 실험을 시작하지 않는다.
  const prom = new PromClient({ baseUrl: PROM_URL });
  if (!(await prom.ping())) throw new Error(`Prometheus(${PROM_URL}) 에 닿지 않는다 — 시간축·인프라 지표를 못 모은다`);
  notes.push(`Prometheus: ${PROM_URL} ok`);
  // 실제 연결 경로는 재현을 위해 항상 기록하되, 프록시가 필요한 계획에서만 경유를 강제한다.
  const routing = proxyRouting();
  notes.push(`앱 경로: DB_URL=${routing.dbUrl || '?'} REDIS_HOST=${routing.redisHost || '?'} → ${routing.viaProxy ? 'toxiproxy 경유' : '직결'}`);
  const needsProxy = !!(plan.requires && plan.requires.proxy) || plan.inject.some((s) => s.tool === 'toxiproxy');
  if (needsProxy) {
    if (!routing.viaProxy) {
      throw new Error('이 계획은 toxiproxy 를 쓰는데 앱이 프록시를 거치지 않는다. toxic 을 걸어도 앱에 닿지 않는다.\n'
        + '  docker compose -f environment/docker-compose.perf.yml -f environment/docker-compose.fault.yml --env-file environment/.env.perf up -d');
    }
    const tox = new Toxiproxy();
    const required = [...new Set(plan.inject.filter((s) => s.tool === 'toxiproxy').map((s) => s.proxy))];
    const pf = await tox.preflight(required);
    if (pf.missing.length) throw new Error(`toxiproxy 에 프록시가 없다: ${pf.missing.join(', ')} (있는 것: ${pf.proxies.join(', ') || '없음'})`);
    if (pf.dirty.length) {
      notes.push(`toxiproxy 에 남은 toxic/disabled 가 있어 reset 한다: ${pf.dirty.join(', ')}`);
      await tox.reset();
    }
    notes.push(`toxiproxy: 프록시 ${pf.proxies.join(', ')} · 깨끗함`);
  }
  // 주입 대상이 없으면 실행을 막고, 다른 상태는 계획의 시작 조건일 수 있으므로 경고만 남긴다.
  for (const c of [...new Set(plan.inject.filter((s) => s.tool === 'docker').map((s) => s.container))]) {
    const st = dockerLib.state(c);
    if (st === 'missing') throw new Error(`컨테이너가 없다: ${c}`);
    if (st !== 'running') notes.push(`⚠ ${c} 가 ${st} 상태에서 시작한다`);
  }
  // 불변식을 고른 계획은 MySQL 을 직접 읽는다. 읽을 수 있는지 여기서 확인한다 — 12분을
  // 돌린 뒤에 "표본을 하나도 못 떴다"를 알게 되면 그 실행은 정확성 자료가 없는 실행이다.
  const probes = integrity.probesOf(plan);
  if (probes.length) {
    const trial = integrity.sampleNow(integrity.columnsFor(probes), 'preflight');
    if (!trial.ok) throw new Error(`불변식 표본을 못 뜬다: ${trial.error}\n  (MySQL 컨테이너와 자격 증명은 tools/lib/dbstate.js 의 PERF_MYSQL_* 환경 변수를 따른다)`);
    notes.push(`불변식 ${probes.join(', ')} · 시험 채취 ${trial.elapsedMs}ms`);
    const drainSec = integrity.drainWaitFor(plan);
    for (const s of integrity.sampleSchedule(plan)) notes.push(`  표본 ${s.label} @${s.atSec}s`);
    notes.push(`  표본 S0 부하 시작 직전 · S3 수집 뒤${drainSec ? ` + 드레인 ${drainSec}s` : ' (드레인 대기 없음 — 고른 프로브가 동기 반영이다)'}`);
  }

  // 결과 해석과 재현에 필요한 실행 조건은 장애를 주입하기 전에 기록한다.
  //
  // 여기서 모으는 것은 "무엇을 쟀는가"다. 관측값(구간별 지연·오류율)만 남기고 이걸 빼면
  // 몇 주 뒤에 보고서를 열었을 때 어떤 코드의 어떤 설정을 잰 것인지 복원할 수 없다.
  const containerEnv = dockerLib.envAll(APP_CONTAINER);
  const hikariMax = containerEnv.get('SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE');
  // 성능 측정기와 같은 probe 를 쓴다. 이미지 해시뿐 아니라 빌드 시각·커밋 라벨과
  // "소스가 이미지보다 새것인가"(stale)까지 준다 — 옛 코드를 재고도 모르는 사고를 막는 장치다.
  const appImage = appimage.probe();
  notes.push(appimage.describe(appImage));
  const config = appconfig.resolve({ containerEnv, dbUrl: routing.dbUrl, poller: HEALTH_POLL });
  if (config.assumedCount) {
    notes.push(`설정 ${config.assumedCount}건은 어디에도 지정돼 있지 않아 프레임워크 기본값으로 기록한다 (보고서에 '가정'으로 표시)`);
  }
  return {
    notes,
    routing,
    prom,
    appImage,
    config,
    env: {
      viaProxy: routing.viaProxy,
      dbUrl: routing.dbUrl,
      redisHost: routing.redisHost,
      hikariMax: hikariMax ? Number(hikariMax) : null,
      k6Bin: K6_BIN,
      k6Version: k6Version(),
      baseUrl: BASE_URL,
      restore: o.restore || null,
      flushRedis: o.flushRedis,
    },
  };
}

/**
 * 부하를 만든 k6 실행 파일의 버전 문자열을 읽는다.
 *
 * k6 는 버전에 따라 요약 지표 이름과 실행기 동작이 달라진다. 경로(K6_BIN)만 기록하면
 * 나중에 그 경로의 바이너리가 바뀌었는지 알 수 없으므로 버전 자체를 남긴다.
 *
 * @returns {string|null} 예: "k6 v0.49.0". 실행에 실패하면 null.
 */
function k6Version() {
  try {
    const r = spawnSync(K6_BIN, ['version'], { encoding: 'utf8' });
    return r.status === 0 ? (r.stdout || '').trim().split(/\r?\n/)[0] : null;
  } catch (_) {
    return null;
  }
}

/**
 * 지정한 데이터 스냅샷을 동기적으로 복원한다.
 *
 * 현재 Node 실행 파일로 performance/tools/snapshot.js restore --id <id>를 실행한다.
 * 자식 프로세스의 입출력을 현재 터미널에 그대로 연결하고 완료될 때까지 기다리므로,
 * 복원이 성공한 뒤에만 Redis 초기화나 부하 실행 단계로 넘어간다.
 *
 * @param {string} id snapshot.js가 식별할 스냅샷 ID.
 * @returns {void}
 * @throws {Error} 복원 프로세스가 0이 아닌 종료 코드로 끝난 경우.
 * snapshot.js는 앱과 MySQL을 멈추고 MySQL 볼륨을 스냅샷으로 교체한 뒤, MySQL을 다시
 * 시작하고 Redis를 FLUSHALL한다. 마지막으로 앱을 시작하고 데이터 지문이 일치하는지
 * 검증한다.
 *
 * 부작용: 데이터베이스를 스냅샷 시점으로 되돌리고 Redis 캐시를 비우며 앱을 재시작한다.
 */
function restoreSnapshot(id) {
  log(`  스냅샷 복원: ${id}`);
  const r = spawnSync(process.execPath, [path.join(PERF_ROOT, 'tools', 'snapshot.js'), 'restore', '--id', id], { stdio: 'inherit', cwd: PERF_ROOT });
  if (r.status !== 0) throw new Error(`스냅샷 복원 실패 (exit ${r.status})`);
}

/**
 * 실험용 Redis 컨테이너에서 FLUSHALL을 실행해 모든 데이터베이스의 키를 삭제한다.
 * Docker 명령은 동기 실행되므로 삭제가 끝난 뒤에만 다음 단계로 진행한다.
 *
 * @returns {void}
 * @throws {Error} Docker 또는 redis-cli 명령이 실패한 경우.
 * 부작용: REDIS_CONTAINER가 가리키는 Redis의 모든 키를 삭제한다.
 */
function flushRedis() {
  log(`  Redis FLUSHALL (${REDIS_CONTAINER})`);
  dockerLib.docker(['exec', REDIS_CONTAINER, 'redis-cli', 'FLUSHALL']);
}

/**
 * 이번 실행이 실제로 쓸 데이터셋 이름을 정한다.
 *
 * 우선순위는 환경 변수 DATASET, 계획의 dataset, 기본값 "medium"이다. k6 인수를 만들 때와
 * 실행 기록을 남길 때가 반드시 같은 값을 봐야 하므로 결정 규칙을 한 곳에 둔다 — 예전에는
 * k6 인수에서만 계산해서, 기록에는 어떤 데이터셋을 썼는지가 남지 않았다.
 *
 * @param {object} plan 장애 계획.
 * @returns {string} 데이터셋 이름.
 */
function resolveDataset(plan) {
  return process.env.DATASET || plan.dataset || 'medium';
}

/**
 * 데이터셋의 사용자 수. 못 읽으면 null 이다 — 0 이 아니다.
 *
 * 조회수 불변식이 "VU 가 사용자보다 많았는가"를 판단하는 데 쓴다. 못 읽었을 때 0 을 주면
 * 모든 실행이 "VU 초과"로 표시되므로, 모르는 것은 모른다고 남긴다.
 *
 * @param {string} dataset 데이터셋 이름.
 * @returns {number|null} 사용자 수.
 */
function countDatasetUsers(dataset) {
  try {
    const file = path.join(PERF_ROOT, 'datasets', 'generated', dataset, 'users.json');
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const list = Array.isArray(raw) ? raw : raw.users;
    return Array.isArray(list) ? list.length : null;
  } catch (_) {
    return null;
  }
}

/**
 * 검증된 계획을 resilience/scenarios/fault-window.js에 전달할 k6 인수 배열로 변환한다.
 *
 * 세 구간 길이, 도착률, 사전 할당·최대 VU 수, 데이터셋, 드라이버 주소, 앱 주소와 요약
 * 출력 경로를 k6 환경 변수(-e)로 전달한다. 데이터셋 우선순위는 현재 프로세스의 DATASET,
 * 계획의 dataset, "medium" 순서다. 결과 비교에 필요한 평균·최솟값·중앙값·최댓값과
 * p90/p95/p99를 요약에 포함하고, 기계가 읽기 쉽게 색상과 일반 진행 출력을 끈다.
 * Prometheus remote write 출력 옵션은 호출자가 --no-remote-write 여부를 본 뒤 별도로 붙인다.
 *
 * @param {object} plan 검증과 명령행 덮어쓰기가 끝난 장애 계획.
 * @param {string} driverUrl k6 setup/teardown 신호를 받을 로컬 드라이버 URL.
 * @param {string} runsDir performance/ 디렉터리를 기준으로 한 k6 요약 출력 디렉터리.
 * @returns {string[]} child_process.spawn()에 그대로 넘길 k6 명령행 인수.
 */
function k6Args(plan, driverUrl, runsDir) {
  const p = plan.phases;
  return [
    'run', path.join('resilience', 'scenarios', 'fault-window.js'),
    '-e', `FAULT_ID=${plan.id}`,
    '-e', `PRE=${p.preSec}`, '-e', `FAULT=${p.faultSec}`, '-e', `POST=${p.postSec}`,
    '-e', `RATE=${plan.load.rate}`,
    '-e', `PRE_VUS=${plan.load.preVus || 100}`, '-e', `MAX_VUS=${plan.load.maxVus || 1000}`,
    '-e', `DATASET=${resolveDataset(plan)}`,
    '-e', `RUNS_DIR=${runsDir}`,
    '-e', `DRIVER_URL=${driverUrl}`,
    '-e', `BASE_URL=${BASE_URL}`,
    '--summary-trend-stats', 'avg,min,med,max,p(90),p(95),p(99)',
    '--no-color', '--quiet',
  ];
}

/**
 * 이번 실행이 staging 디렉터리에 만든 k6 JSON 요약 중 가장 최신 파일을 찾는다.
 *
 * 파일 이름이 fault-<계획-id>-*.k6.json인 항목만 대상으로 하고, k6를 시작한 시각보다
 * 5초 이상 오래된 파일은 이전 실행의 잔여물로 보아 제외한다. 파일 시스템 시각 오차를
 * 허용하기 위해 정확한 시작 시각이 아니라 since - 5초를 경계로 사용한다.
 *
 * @param {string} id 장애 계획 ID.
 * @param {number} since k6 자식 프로세스를 시작한 시각의 Unix 밀리초 값.
 * @returns {string|null} 가장 최근 파일의 절대 경로. 일치하는 파일이 없으면 null.
 * @throws {Error} staging 디렉터리를 읽거나 후보 파일의 정보를 읽지 못한 경우.
 */
function newestStaged(id, since) {
  const files = fs.readdirSync(STAGING).filter((f) => f.startsWith(`fault-${id}-`) && f.endsWith('.k6.json'))
    .map((f) => ({ f, m: fs.statSync(path.join(STAGING, f)).mtimeMs })).filter((x) => x.m >= since - 5000)
    .sort((a, b) => b.m - a.m);
  return files.length ? path.join(STAGING, files[0].f) : null;
}

/**
 * 보고서의 시간축 그래프에 사용할 Prometheus 범위 시계열을 수집한다.
 *
 * k6 시작 기준 시각(t0)의 30초 전부터 계획 종료 30초 후까지를 5초 간격으로 조회한다.
 * 조회 항목은 초당 요청 수, 실패 응답 비율(%), 응답 시간 p95(ms), 사용 중인 Tomcat
 * 스레드 수, 대기·사용 중인 HikariCP 연결 수, 실행 중인 MySQL 스레드 수다. k6 지표는
 * 30초 rate 창을 사용해 짧은 순간 변동을 완화한다.
 *
 * 각 쿼리는 독립적으로 실행한다. 하나가 실패해도 나머지 시계열은 보존하며, 실패한 축은
 * 빈 배열로 두고 오류 메시지를 별도로 모은다. 따라서 일부 exporter가 없어도 보고서
 * 전체를 버리지 않는다.
 *
 * @param {PromClient} prom preflight()에서 연결을 확인한 Prometheus 클라이언트.
 * @param {Date} t0 k6 setup 신호로 정한 부하 시작 기준 시각.
 * @param {number} totalSec pre+fault+post를 합한 계획 실행 시간(초).
 * @returns {Promise<{series: object, errors: string[]}>} 그래프별 시계열과 축별 수집 오류.
 */
async function collectSeries(prom, t0, totalSec) {
  const from = new Date(t0.getTime() - 30000);
  const to = new Date(t0.getTime() + (totalSec + 30) * 1000);
  const step = 5;
  const q = {
    rps: 'sum(rate(k6_http_reqs_total[30s]))',
    errorPct: '100 * (sum(rate(k6_http_reqs_total{expected_response="false"}[30s])) or vector(0)) / clamp_min(sum(rate(k6_http_reqs_total[30s])), 0.0001)',
    p95: '1000 * histogram_quantile(0.95, sum(rate(k6_http_req_duration_seconds[30s])))',
    tomcatBusy: `sum(tomcat_threads_busy_threads{job="${APP_JOB}"})`,
    hikariPending: `sum(hikaricp_connections_pending{job="${APP_JOB}"})`,
    hikariActive: `sum(hikaricp_connections_active{job="${APP_JOB}"})`,
    mysqlThreadsRunning: 'max(mysql_global_status_threads_running)',
    // 실패의 종류를 시간축에서 가른다. k6 remote-write 는 status 라벨을 보존한다(실측 확인).
    // 5xx 는 앱이 살아서 에러를 응답한 것이고, status="0" 은 응답 자체를 못 받은 것이다.
    status5xx: 'sum(rate(k6_http_reqs_total{status=~"5.."}[30s])) or vector(0)',
    statusNoResponse: 'sum(rate(k6_http_reqs_total{status="0"}[30s])) or vector(0)',
    // 스레드가 늘어난 것과 스레드가 막힌 것은 다르다. 무한 소켓 대기는 runnable 로 잡힌다.
    threadsBlocked: `sum(jvm_threads_states_threads{job="${APP_JOB}",state="blocked"})`,
    threadsWaiting: `sum(jvm_threads_states_threads{job="${APP_JOB}",state=~"waiting|timed-waiting"})`,
    // 헬스 엔드포인트가 느려지는 것 자체가 관측 대상이다 — 로드밸런서 상한을 넘기면
    // 앱이 살아 있어도 인스턴스가 빠진다. 폴러 표본에서 만들며 Prometheus 를 쓰지 않는다.
  };
  const out = {};
  const errors = [];
  for (const [k, query] of Object.entries(q)) {
    try { out[k] = await prom.range(query, from, to, step); } catch (e) { out[k] = []; errors.push(`${k}: ${e.message}`); }
  }
  return { series: out, errors };
}

/**
 * 현재 실행과 같은 계획 ID로 만들어진 과거 장애 관측 실행의 요약 목록을 만든다.
 *
 * reports/ 바로 아래의 각 디렉터리에서 run.json을 읽는다. 현재 실행과 staging은 제외하고,
 * JSON을 읽지 못하거나 계획 ID가 다른 실행은 건너뛴다. HTML 보고서가 이전·이후 실행으로
 * 이동할 수 있도록 ID, 시작 시각, 메모만 남겨 최신순으로 정렬한다. 이 목록은 탐색 링크용일
 * 뿐 기준선 선택이나 자동 비교에는 사용하지 않는다.
 *
 * @param {string} planId 함께 묶을 장애 계획 ID.
 * @param {string} selfId 목록에서 제외할 현재 실행 ID.
 * @returns {{id: string, startedAt: string, note: string}[]} 같은 계획의 과거 실행 요약.
 * @throws {Error} 존재하는 reports 디렉터리의 항목을 열거하지 못한 경우.
 */
function siblingsOf(planId, selfId) {
  if (!fs.existsSync(REPORTS)) return [];
  return fs.readdirSync(REPORTS).filter((d) => d !== selfId && d !== 'staging')
    .map((d) => { try { return JSON.parse(fs.readFileSync(path.join(REPORTS, d, 'run.json'), 'utf8')); } catch (_) { return null; } })
    .filter((r) => r && r.plan && r.plan.id === planId)
    .map((r) => ({ id: r.id, startedAt: r.startedAt, note: r.note, commitShort: r.run && r.run.commitShort }))
    .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
}

/**
 * 명령행 실행 전체를 조정하고 최종 장애 관측 보고서를 생성한다.
 *
 * 이 함수가 직접 장애를 만드는 것은 아니다. 계획·환경을 준비하고 Driver, HealthPoller,
 * k6, Prometheus 수집기, 보고서 렌더러를 정해진 순서로 연결하는 오케스트레이터다.
 * 정상 경로에서는 모든 산출물을 저장하고 정리까지 마친 뒤 이행한다. 운영 단계의 오류는
 * 메시지를 출력하고 정리한 뒤 프로세스를 종료 코드 1로 끝낸다.
 *
 * @returns {Promise<void>}
 */
async function main() {
  // 1. 계획 파일을 현재 작업 디렉터리 기준 절대 경로로 바꾸고, 덮어쓰기까지 적용한다.
  const o = parseArgs(process.argv.slice(2));
  const planFile = path.resolve(process.cwd(), o.plan);
  const plan = loadPlan(planFile, o);
  const total = plans.totalSec(plan.phases);

  // 실제 자원을 건드리기 전에 실행 질문, 세 구간, 도착률과 모든 주입 시각을 먼저 공개한다.
  log(`▶ 장애 관측: ${plan.id} — ${plan.question}`);
  log(`  구간 pre ${plan.phases.preSec}s / fault ${plan.phases.faultSec}s / post ${plan.phases.postSec}s (총 ${total}s) · 도착률 ${plan.load.rate}/s`);
  const sched = plans.schedule(plan);
  for (const s of sched) log(`  주입 @${s.plannedAtSec}s  ${s.tool} ${s.action || ''} ${s.proxy || s.container || (s.args || s.argv || []).join(' ')}${s.toxic ? ` ${JSON.stringify(s.toxic)}` : ''}`);

  // 2. 같은 성능 스택의 동시 측정은 지표와 장애 상태를 섞으므로 공유 잠금으로 차단한다.
  const lock = acquireRunLock();
  let driver = null;
  let health = null;
  let k6 = null;
  let sampler = null;

  /**
   * 현재 시작된 구성 요소를 정리하는 공통 종료 함수다.
   * 헬스 폴링과 불변식 표본 타이머를 멈춘 뒤 Driver가 예약 타이머를 취소하고, 살아 있는 Pumba 프로세스를
   * 종료하고, 계획에 등장한 프록시의 toxic을 제거해 enable하고, Docker 대상을 running으로
   * 만들고, 로컬 신호 서버를 닫는다. shell 단계의 부작용은 Driver가 되돌리지 않는다.
   * 마지막으로 실행 잠금을 해제한다. Driver 정리는 여러 번 호출해도 한 번만 실행되므로
   * 정상 종료와 예외 처리가 같은 함수를 중복 호출해도 안전하다.
   *
   * @param {string} reason Driver 이벤트에 기록할 종료 사유.
   * @returns {Promise<void>}
   */
  const finish = async (reason) => {
    if (health) health.stop();
    // 남은 표본 타이머는 실행이 끝난 뒤에 질의를 날려 다음 실행의 pre 구간에 부하를 준다.
    if (sampler) sampler.stop();
    if (driver) await driver.cleanup(reason);
    lock.release();
  };

  // Ctrl+C는 실행 중인 k6를 종료하고 장애를 복구한 뒤 관례적인 종료 코드 130을 반환한다.
  process.on('SIGINT', async () => { log('\n중단 — 원상복구 중'); if (k6 && k6.exitCode == null) k6.kill(); await finish('SIGINT'); process.exit(130); });

  // 이벤트 콜백 등 try/catch 밖의 예외도 장애 상태를 남기지 않도록 정리하고 코드 2로 끝낸다.
  process.on('uncaughtException', async (e) => { console.error(e.stack || e.message); await finish('uncaughtException'); process.exit(2); });

  try {
    // 3. 관측에 필요한 서비스와 주입 대상을 확인한다. 결과 메모는 그대로 콘솔에 보여 준다.
    const pf = await preflight(plan, o);
    for (const nline of pf.notes) log(`  ${nline}`);

    // 실행 신원 — "어떤 코드를, 어떤 부하 스크립트로, 어떤 데이터에 걸었나".
    // 성능 측정기와 같은 함수를 쓴다. 규칙이 갈라지면 두 도구의 기록을 나란히 놓을 수 없다.
    const git = gitMeta();
    const dataset = resolveDataset(plan);
    const scriptFingerprint = scriptVersion(path.join('resilience', 'scenarios', 'fault-window.js'));
    const dsFingerprint = datasetFingerprint(dataset);
    // 사용자 풀 크기. VU 가 이 수를 넘으면 두 VU 가 같은 계정을 쓰는데
    // (data.js 의 myUser 가 나머지 연산을 쓴다), 서버는 그 둘을 한 사용자로 보고 조회수
    // 중복을 접는다. 그러면 부하 쪽 조회 카운터가 실제보다 많아진다 — 조회수 불변식이
    // 이 값을 보고 "정확"인지 "상한"인지 스스로 판단한다.
    const datasetUsers = countDatasetUsers(dataset);
    log(`  브랜치 ${git.branch} · 커밋 ${git.commit.slice(0, 12)} · 실행자 ${git.executor}`);
    log(`  데이터셋 ${dataset}${dsFingerprint ? ` (지문 ${dsFingerprint.replace(/^sha256:/, '').slice(0, 12)})` : ' (지문 없음 — meta.json 이 없는 옛 데이터셋)'}`);

    // dry-run은 사전 점검 결과만 확인하고 부하·주입·보고서 생성 없이 정리한다.
    // 단, preflight()가 기존 Toxiproxy 장애 설정을 발견했다면 그 초기화는 이미 수행됐다.
    if (o.dryRun) { log('dry-run — 여기까지'); await finish('dry-run'); return; }

    // 4. 시작 상태를 만든다. 스냅샷 복원은 선택이고, Redis 초기화는 기본이다.
    //
    // 왜 기본인가: 남은 캐시는 pre 구간 기준을 실행마다 다르게 만들고, 남은 조회 중복 마커
    // (`viewed:*`)는 서버가 조회수를 중복으로 접게 해서 유실 계산을 부풀린다. 사람이 매번
    // 옵션을 기억해야 하면 언젠가 틀린 숫자를 믿게 된다 — 성능 측정 쪽도 스냅샷 복원에
    // FLUSHALL 을 포함시켜 같은 이유로 cold 를 보장한다(tools/perf-run.js).
    if (o.restore) restoreSnapshot(o.restore);
    if (o.flushRedis) flushRedis();
    else log('  ⚠ Redis 초기화를 건너뛴다(--no-flush-redis) — pre 기준이 캐시 상태에 따라 흔들리고, 남은 조회 중복 마커 때문에 조회수 유실이 상한이 된다');
    const cacheBefore = dbstate.computeCacheState();
    log(`  캐시 ${cacheBefore.state}${cacheBefore.cacheKeys != null ? ` (키 ${cacheBefore.cacheKeys.toLocaleString()}개)` : ''}`);

    // 5. k6 요약 임시 위치, 주입 시각 동기화 서버, 5초 간격 헬스 폴러를 준비한다.
    fs.mkdirSync(STAGING, { recursive: true });
    driver = new Driver(plan, { log });
    const driverUrl = await driver.listen();
    health = new HealthPoller(`${BASE_URL}/actuator/health`, HEALTH_POLL);
    health.start();

    // 불변식 기준선(S0)은 복원·FLUSHALL이 끝난 뒤, 부하가 시작되기 전에 떠야 한다.
    // 순서가 뒤바뀌면 기준선에 초기화 작업이나 부하가 만든 변화가 섞인다.
    sampler = new integrity.Sampler(plan, { log });
    if (sampler.enabled) {
      log(`  불변식 검사: ${sampler.probes.join(', ')} (항목 ${sampler.columns.length}개)`);
      sampler.take('S0');
    }

    // 6. 기본적으로 k6 시계열을 5초마다 Prometheus에 native histogram으로 전송한다.
    // --no-remote-write이면 이 환경 변수와 출력 백엔드를 모두 생략하고 로컬 요약만 만든다.
    // k6 요약(scripts/lib/summary.js)은 실행 신원을 PERF_* 환경 변수로만 받는다. 넘기지
    // 않으면 k6.json 의 branch/commit/scriptVersion 이 전부 "unknown" 으로 남는다 —
    // 실제로 그랬다. 성능 측정기(perf-run.js)와 같은 값을 같은 이름으로 넘긴다.
    const env = {
      ...process.env,
      PERF_ENV: 'perf-fault',
      PERF_BRANCH: git.branch,
      PERF_COMMIT: git.commit,
      PERF_BUILD: git.buildNumber,
      PERF_EXECUTOR: git.executor,
      PERF_SCRIPT_VERSION: scriptFingerprint,
      PERF_NOTE: o.note || '',
    };
    if (dsFingerprint) env.PERF_DATASET_FINGERPRINT = dsFingerprint;
    if (o.remoteWrite) {
      Object.assign(env, {
        K6_PROMETHEUS_RW_SERVER_URL: K6_RW_URL,
        K6_PROMETHEUS_RW_PUSH_INTERVAL: '5s',
        K6_PROMETHEUS_RW_TREND_AS_NATIVE_HISTOGRAM: 'true',
        K6_PROMETHEUS_RW_STALE_MARKERS: 'true',
      });
    }

    // Windows에서도 k6가 해석할 수 있게 staging 상대 경로의 역슬래시를 슬래시로 바꾼다.
    const args = k6Args(plan, driverUrl, path.relative(PERF_ROOT, STAGING).replace(/\\/g, '/'));
    if (o.remoteWrite) args.push('-o', 'experimental-prometheus-rw');

    // k6는 performance/를 작업 디렉터리로 삼고 현재 터미널의 입출력을 그대로 사용한다.
    const spawnedAt = new Date();
    log(`  k6 시작: ${K6_BIN} ${args.join(' ')}`);
    k6 = spawn(K6_BIN, args, { stdio: 'inherit', env, cwd: PERF_ROOT });
    k6.on('error', (e) => { throw new Error(`k6 실행 실패: ${e.message} — K6_BIN 으로 실제 실행 파일 경로를 지정할 것`); });

    // 7. k6 setup의 /started 신호를 최대 90초 기다린다. 신호가 없으면 spawn 시각을 t0로
    // 사용한다. t0가 확정되어야 헬스 표본의 상대 시각과 장애 주입 타이머가 같은 축을 쓴다.
    await driver.waitForStart(spawnedAt, 90000);
    health.setT0(driver.t0);
    driver.arm();
    // S1·S2 는 주입과 같은 시간 축(driver.t0)에 걸어야 표본과 주입 기록을 나란히 놓을 수 있다.
    sampler.arm(driver.t0);

    // k6가 끝날 때까지 기다린다. 종료 코드와 시각은 기록하되 자동 판정에는 사용하지 않는다.
    const exitCode = await new Promise((resolve) => k6.on('exit', (code) => resolve(code)));
    const endedAt = new Date();
    log(`\n  k6 종료 (exit ${exitCode}) — 주입 정리`);
    await driver.cleanup('k6-exit');
    health.stop();
    sampler.stop();

    // handleSummary가 이번 실행에 쓴 JSON을 찾는다. k6 종료 코드가 0이 아니어도 요약이
    // 있으면 관측 자료를 보존하며, 요약조차 없으면 실행을 재구성할 수 없어 실패시킨다.
    const k6File = newestStaged(plan.id, spawnedAt.getTime());
    if (!k6File) throw new Error(`k6 요약 파일이 없다 (${STAGING}/fault-${plan.id}-*.k6.json) — k6 가 handleSummary 전에 죽었다`);
    const k6Rec = JSON.parse(fs.readFileSync(k6File, 'utf8'));

    // 8. k6 종료 직전의 표본이 Prometheus에 저장될 시간을 준 뒤 구간별 집계를 시작한다.
    log(`  스크레이프 대기 ${o.wait}s`);
    await sleep(o.wait * 1000);

    const windows = plans.phaseWindows(driver.t0, plan.phases);
    const infra = {};
    // 각 구간의 절대 시각 범위로 지표 카탈로그 전체를 집계한다. 0초 구간은 생성되지 않는다.
    for (const [name, w] of Object.entries(windows)) {
      log(`  인프라 수집: ${name} (${w.from.toISOString()} ~ ${w.to.toISOString()})`);
      infra[name] = await collectInfra(pf.prom, w);
    }
    // 장애 실험에만 필요한 앱 내부 지표 — 예외 클래스별 건수와 JVM 스레드 상태.
    // 공용 카탈로그와 분리한 이유는 lib/faultmetrics.js 머리말에.
    log('  앱 예외·스레드 상태 수집');
    const faultMetrics = await collectFaultMetrics(pf.prom, windows);

    // 최종 표본(S3)은 인프라 수집이 끝난 뒤에 뜬다. 비동기 반영을 기다려야 하는 프로브가
    // 있으면 그만큼 더 기다린다 — 마지막 스케줄러 주기가 돌아야 "결국 DB 까지 갔는가"에
    // 답할 수 있다. 수집에 이미 쓴 시간은 대기에서 뺀다.
    if (sampler.enabled) {
      const drainSec = integrity.drainWaitFor(plan);
      const waitedSec = Math.round((Date.now() - endedAt.getTime()) / 1000);
      const remainSec = Math.max(0, drainSec - waitedSec);
      if (remainSec > 0) {
        log(`  드레인 대기 ${remainSec}s (필요 ${drainSec}s · 수집에 ${waitedSec}s 씀)`);
        await sleep(remainSec * 1000);
      }
      sampler.take('S3');
    }
    // 구간별 단일 값과 별도로, 그래프에 그릴 5초 간격 전체 시계열을 수집한다.
    const { series, errors: seriesErrors } = await collectSeries(pf.prom, driver.t0, total);

    // 9. k6 원본 집계를 장애 실험 용어와 보고서 구조로 정규화한다.
    const raw = k6Rec.k6.rawMetrics || {};
    const runId = `${plan.id}-${ts(driver.t0)}`;
    const dir = path.join(REPORTS, runId);
    fs.mkdirSync(dir, { recursive: true });

    // pre 구간에서 읽은 Tomcat 워커 스레드 상한을 환경 정보에 합쳐 실행 조건을 완성한다.
    const tomcatMax = infra.pre && infra.pre.flat ? infra.pre.flat['pool.tomcatMax'] : null;
    const rec = {
      // 레코드 식별 정보와 실제 사용한 계획.
      schemaVersion: 2,
      kind: 'fault-observation',
      id: runId,
      plan,
      planFile: path.relative(PERF_ROOT, planFile).replace(/\\/g, '/'),
      note: o.note,
      // `run` — 실행 신원. 키 이름을 성능 측정 기록(performance/reports/*/run.json)과 똑같이
      // 맞춘다. tools/sanitize-reports.js 가 공개 게시 전에 지우는 필드(executor·commit·
      // branch·note·baseUrl)를 `rec.run.*` 경로에서 찾기 때문이다. 이름이 다르면 이 보고서는
      // 정화 대상에서 조용히 빠진다.
      run: {
        branch: git.branch,
        commit: git.commit,
        commitShort: git.commit.slice(0, 8),
        buildNumber: git.buildNumber,
        executor: git.executor,
        scriptVersion: scriptFingerprint,
        dataset,
        datasetFingerprint: dsFingerprint,
        baseUrl: BASE_URL,
        note: o.note || '',
      },
      // 실제로 부하를 받은 바이너리. `run.commit` 은 실행 시점 작업 트리의 HEAD 일 뿐이고
      // 컨테이너 안의 코드와 연결돼 있지 않다 — 그 차이가 왜 문제인지는 tools/lib/appimage.js.
      appImage: pf.appImage,
      // 실패 지연을 만드는 타임아웃·풀 설정. 값과 함께 어디서 읽었는지(출처)를 남긴다.
      config: pf.config,

      // 프로세스 시작, 부하 기준 시각과 그 출처, k6 종료 시각·종료 코드.
      startedAt: spawnedAt.toISOString(),
      t0: driver.t0.toISOString(),
      t0Source: driver.t0Source,
      endedAt: endedAt.toISOString(),
      k6ExitCode: exitCode,

      // 사전 점검에서 읽은 실행 환경과 보고서 해석에 필요한 고정 조건.
      env: { ...pf.env, tomcatMax, k6Timeout: '60s (k6 기본)', datasetGuard: 'n/a (관측 실행)', datasetUsers, cacheState: cacheBefore.state, cacheKeysBefore: cacheBefore.cacheKeys },
      k6: {
        // 공유 k6 코드의 warmup/measure/rampdown 이름을 pre/fault/post로 바꿔 저장한다.
        phases: plans.relabelPhases(k6Rec.k6.phases),
        all: k6Rec.k6.all,
        breakdown: plans.relabelBreakdown(k6Rec.k6.breakdown),
        // 실패 요청의 대기 시간과 기능별 장애 전파 범위를 원본 서브메트릭에서 계산한다.
        failedLatency: plans.failedLatencyByPhase(raw),
        featureByPhase: plans.featureByPhase(raw, FEATURES),
        statusByPhase: plans.statusByPhase(raw, WATCH_STATUS),
        // 도착률을 유지할 VU가 부족해 시작하지 못한 반복 수와 실제 k6 부하 계획 원본.
        droppedIterations: raw.dropped_iterations && raw.dropped_iterations.values ? raw.dropped_iterations.values.count : null,
        // 조회수가 올랐어야 할 횟수와, 서버가 거기까지 갔는지 모르는 횟수(scripts/posts.js).
        // 사라진 조회는 서버에 흔적이 없어서, 이 값 없이는 유실을 셀 수 없다.
        viewExpected: raw.view_expected && raw.view_expected.values ? raw.view_expected.values.count : null,
        viewUnknown: raw.view_unknown && raw.view_unknown.values ? raw.view_unknown.values.count : null,
        loadProfile: k6Rec.run && k6Rec.run.loadProfile,
        phasePlanRaw: k6Rec.run && k6Rec.run.phasePlan,
      },

      // 계획 대비 실제 주입·정리 시각, 전체 헬스 표본과 상태가 바뀐 지점만 뽑은 목록.
      events: driver.events,
      health: health.samples,
      healthTransitions: health.transitions(),
      healthByPhase: plans.healthByPhase(health.samples, plan.phases),
      healthUrl: `${BASE_URL}/actuator/health`,
      faultMetrics,

      // 구간별 인프라 집계, 그래프용 전체 시계열, 일부 시계열을 못 모은 이유.
      infra,
      series,
      seriesErrors,

      // 불변식 표본. 회복·탐지와 달리 **원자료**라 여기 저장한다 — 그 순간에 뜨지 않으면
      // 나중에 복원할 수 없다. 표본을 등식에 넣는 판단은 순수 함수라 렌더링 시점에 한다.
      integrity: sampler.enabled
        ? { probes: sampler.probes, drainWaitSec: integrity.drainWaitFor(plan), samples: sampler.samples }
        : null,

      // Grafana 링크 생성 실패는 관측 원자료를 무효화하지 않으므로 null로 남기고 계속한다.
      grafana: (() => { try { return grafana.buildLinks({ startedAt: driver.t0.toISOString(), endedAt: endedAt.toISOString() }); } catch (_) { return null; } })(),
    };

    // 합친 레코드를 먼저 저장하고, staging의 k6 산출물을 같은 실행 디렉터리로 옮긴다.
    // HTML의 siblings는 같은 계획의 과거 실행으로 이동하는 링크이며 자동 비교 기준선이 아니다.
    fs.writeFileSync(path.join(dir, 'run.json'), JSON.stringify(rec, null, 2));
    fs.renameSync(k6File, path.join(dir, 'k6.json'));
    const txt = k6File.replace(/\.k6\.json$/, '.summary.txt');
    if (fs.existsSync(txt)) fs.renameSync(txt, path.join(dir, 'k6.summary.txt'));
    fs.writeFileSync(path.join(dir, 'report.html'), renderReport(rec, { siblings: siblingsOf(plan.id, runId) }));

    // 긴 HTML을 열기 전에도 실행 형태를 확인하도록 세 구간의 핵심값을 판정 없이 출력한다.
    log('\n구간별 요약');
    for (const p of plans.PHASE_ORDER) {
      const s = rec.k6.phases[p];
      if (!s) continue;
      log(`  ${p.padEnd(5)} 요청 ${String(s.httpReqs).padStart(6)}  p95 ${s.p95 == null ? '—' : `${Math.round(s.p95)}ms`.padStart(8)}  max ${s.max == null ? '—' : `${Math.round(s.max)}ms`.padStart(8)}  오류율 ${s.errorRate == null ? '—' : `${(s.errorRate * 100).toFixed(2)}%`}`);
    }
    const fl = rec.k6.failedLatency.fault;
    if (fl && fl.count) log(`  fault 실패 응답 ${fl.count}건: p50 ${Math.round(fl.med)}ms  p95 ${Math.round(fl.p95)}ms  max ${Math.round(fl.max)}ms`);
    const ht = rec.healthTransitions.map((h) => `${h.tSec == null ? '시작전' : `${h.tSec}s`}:${h.status}`).join(' → ');
    log(`  헬스 전이: ${ht || '없음'}`);

    // 회복·탐지는 보고서와 같은 순수 함수로 계산한다. 12분짜리 실행 뒤 HTML 을 열기 전에
    // "돌아왔는가"부터 보이는 편이 낫다. 보고서 4번 절과 같은 값이고 판정은 아니다.
    const analysis = recovery.analyze(rec);
    if (analysis) {
      const done = analysis.metrics.filter((m) => m.status === 'recovered');
      const stuck = analysis.metrics.filter((m) => m.status === 'not-recovered');
      log(`  회복(장애 제거 후): ${done.length ? done.map((m) => `${m.label} +${m.recoverySec}s`).join(' · ') : '측정된 회복 없음'}`);
      if (stuck.length) log(`  ⚠ 미회복: ${stuck.map((m) => m.label).join(' · ')} — 실행이 끝날 때까지 pre 대역으로 돌아오지 않았다`);
      const d = analysis.detection;
      if (d.status === 'detected') log(`  탐지 지연: 주입 +${d.lagSec}s (${d.cause})${d.clearLagSec == null ? ' · 해제 미복귀' : ` · 해제 +${d.clearLagSec}s`}`);
      else if (d.status === 'undetected') log('  ⚠ 탐지: 헬스가 장애 내내 UP 이었다 — 이 장애는 헬스체크로 알아챌 수 없다');
    }

    // 불변식은 오류율·지연이 멀쩡해도 깨질 수 있는 값이라, 요약에서 빠지면 아무도 안 본다.
    if (rec.integrity) {
      for (const r of invariants.reconcile(rec.integrity.probes, rec.integrity.samples, { k6: rec.k6, env: rec.env })) {
        // 유실(하한만 아는 값)과 불일치(정확한 등식이 깨진 것)를 둘 다 잡아야 한다.
        // 불일치만 보면 조회수 유실이 콘솔에서 "정합"으로 나온다 — 실제로 그랬다.
        const bad = r.segments.filter((s) => s.status === 'mismatch' || s.status === 'loss');
        const unknown = r.segments.filter((s) => s.status === 'unknown');
        if (bad.length) {
          const detail = bad.map((s) => {
            const hits = s.checks.filter((c) => c.status === 'mismatch' || c.status === 'loss');
            return `${s.label} ${hits.map((c) => `${c.name} ${c.status === 'loss' ? `${-c.delta}건 유실` : `${c.delta > 0 ? '+' : ''}${c.delta}`}`).join('/')}`;
          }).join(' · ');
          log(`  ⚠ 불변식 ${r.id}: ${bad.some((s) => s.status === 'mismatch') ? '불일치' : '유실'} — ${detail}`);
        } else if (unknown.length === r.segments.length) {
          log(`  불변식 ${r.id}: 확인 불가 — 표본을 못 떴다`);
        } else {
          log(`  불변식 ${r.id}: 정합${unknown.length ? ` (구간 ${unknown.length}개는 확인 불가)` : ''}`);
        }
      }
    }
    log(`\n보고서: ${path.relative(process.cwd(), path.join(dir, 'report.html'))}`);

    // 정상 경로의 마지막 정리다. Driver는 앞서 정리되었으므로 여기서는 잠금 해제가 핵심이다.
    await finish('done');
  } catch (e) {
    // 준비 이후의 모든 실패는 실행 중인 k6를 멈추고 같은 원상복구 경로를 거친다.
    console.error(`\n✗ ${e.message}`);
    if (k6 && k6.exitCode == null) k6.kill();
    await finish('error');
    process.exit(1);
  }
}

// 직접 실행했을 때만 CLI를 시작한다. 인수·계획 오류처럼 main() 내부 try 이전의 실패와
// 예상하지 못한 Promise 거부는 스택을 출력하고 종료 코드 2를 사용한다.
if (require.main === module) {
  main().catch((e) => { console.error(e.stack || e.message); process.exit(2); });
}

// 테스트와 다른 도구가 부작용 없이 검증할 수 있는 순수 또는 조회 함수를 공개한다.
// main(), 복원, Redis 삭제, 보고서 생성 함수는 외부 호출 대상으로 내보내지 않는다.
module.exports = { parseArgs, loadPlan, k6Args, proxyRouting, siblingsOf };
