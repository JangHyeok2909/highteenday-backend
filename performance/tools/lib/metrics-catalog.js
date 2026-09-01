/**
 * 운영 지표 카탈로그 — "테스트 구간의 인프라 상태"를 정의하는 단일 진실 공급원.
 *
 * 설계 원칙
 * ---------
 * 1) 쿼리를 코드가 아니라 데이터로 둔다
 *    PromQL이 수집기 코드 안에 흩어져 있으면, 지표 하나 추가할 때마다 수집기를 고쳐야 하고
 *    리포트/회귀 분석기와 키 이름이 어긋난다. 카탈로그를 데이터로 두면 수집기는
 *    "카탈로그를 순회해 실행"만 하면 되고, 지표 추가 = 이 파일에 한 줄 추가로 끝난다.
 *
 * 2) $RANGE 토큰
 *    구간 길이를 하드코딩하지 않는다. 3분 스모크든 2시간 soak든 같은 정의가 그대로 맞아야 한다.
 *    promql.js가 실행 시점에 실제 테스트 길이로 치환한다.
 *
 * 3) avg / max / p95 를 왜 다 저장하는가
 *    평균만 보면 병목을 놓친다. CPU 평균 40%인데 max 100%면 그건 "여유 있음"이 아니라
 *    "주기적으로 포화됨"이다. 반대로 max만 보면 순간 스파이크에 과잉 반응한다.
 *    p95는 그 사이에서 "지속적으로 높았는가"를 판별해 준다. 실무 용량 산정은 대개 p95를 쓴다.
 *
 * 4) 왜 throttling / saturation 을 1급으로 두는가
 *    컨테이너 환경 부하 테스트에서 가장 자주 놓치는 병목이 CFS throttling이다.
 *    CPU 사용률이 한계의 100%에 안 닿아도 cgroup 주기마다 강제 정지되면 p99가 튄다.
 *    "왜 CPU 여유 있는데 느리지?"의 답이 대개 여기 있어서, 별도 지표로 승격해 둔다.
 *
 * 단위 규약: 시간=ms, 크기=bytes, 비율=percent(0~100), 처리율=per second.
 */
'use strict';

const APP = process.env.PERF_APP_CONTAINER || 'perf-app';
const DB = process.env.PERF_DB_CONTAINER || 'perf-mysql';
const CACHE = process.env.PERF_CACHE_CONTAINER || 'perf-redis';
/** k6 를 컨테이너로 돌릴 때의 이름. 이 이름이어야 cAdvisor 가 부하 발생기를 따로 계측한다. */
const LOADGEN = process.env.PERF_LOADGEN_CONTAINER || 'perf-k6';
const APP_JOB = 'spring-app';

/**
 * 컨테이너 지표를 항상 단일 시계열로 접는다.
 *
 * name="perf-app" 은 논리적으로 컨테이너 하나를 가리키지만, 컨테이너를 재생성하면
 * cAdvisor 가 죽은 컨테이너의 시계열을 staleness 마킹 전까지 같은 라벨로 계속 노출한다.
 * 그 구간에서는 시계열이 2~3개가 되는데, 분자(사용량)는 reduce:'sum' 으로 합산되고
 * 분모(cgroup 한계)는 단일 값이라 포화도가 물리적으로 불가능한 값이 된다.
 * 실측으로 메모리 포화도 227%(3.66GB / 1.61GB)가 리포트에 실렸고, 그 값이 그대로
 * "OOM Kill 위험" 병목 가설로 승격됐다. cgroup 한계를 넘긴 컨테이너는 존재할 수 없으므로
 * 이건 자원 문제가 아니라 측정 오류였다.
 *
 * 쿼리 단계에서 접어 두면 겹친 시계열이 몇 개든 결과가 항상 1개다.
 */
const one = (expr) => `max(${expr})`;

/**
 * 효율 지표의 공통 분모 — 측정 구간의 요청 수.
 *
 * k6 요약본이 아니라 remote-write 로 들어온 시계열에서 센다. 요약본은 실행 전체에 대해
 * 한 번 계산된 값이라 임의 구간으로 나눌 수 없고, 애초에 Prometheus 질의 안에 넣을 수 없다.
 *
 * `clamp_min(..., 1)` 은 0 나눗셈 방지다. 요청이 0건인 구간은 효율을 논할 수 없으므로
 * 값이 커지지 않게 1 로 막아 둔다.
 *
 * ⚠ **분자도 반드시 라벨을 지워야 한다.** 이 값은 `sum()` 을 거쳐 라벨이 하나도 없는데,
 * PromQL 의 이항 연산은 **양변의 라벨 집합이 같은 것끼리만 짝짓는다.** 라벨이 남은 벡터를
 * 이걸로 나누면 짝이 없어 **에러 없이 빈 결과**가 되고, 수집기에는 그냥 null 로 기록된다.
 * 실제로 이 그룹의 절반이 그렇게 조용히 비어 있었다(검증에서 발견). 분자는 `one()` 이나
 * `max()`/`sum()` 으로 반드시 감싼다.
 */
const REQS = 'clamp_min(sum(increase(k6_http_reqs_total[$RANGE])), 1)';

/**
 * 인터페이스/디바이스별로 쪼개지는 지표용 — 컨테이너 인스턴스(id) 안에서 먼저 합친 뒤 접는다.
 * 그냥 sum() 하면 eth0+eth1 합산이라는 원래 의도와 죽은 컨테이너 합산이 구분되지 않는다.
 */
const onePerContainer = (expr) => `max(sum by (id) (${expr}))`;

// 게이지의 구간 통계(avg/max/p95)를 한 번에 만들어주는 헬퍼.
// 같은 패턴을 20번 손으로 쓰면 반드시 하나는 오타가 난다.
function gaugeStats(base, expr, opts = {}) {
  const { scale, unit, label, reduce = 'sum', desc } = opts;
  return [
    { key: `${base}.avg`, label: `${label} avg`, query: `avg_over_time((${expr})[$RANGE:])`, reduce, scale, unit, desc },
    { key: `${base}.max`, label: `${label} max`, query: `max_over_time((${expr})[$RANGE:])`, reduce, scale, unit, desc },
    { key: `${base}.p95`, label: `${label} p95`, query: `quantile_over_time(0.95, (${expr})[$RANGE:])`, reduce, scale, unit, desc },
  ];
}

/**
 * 그룹별 지표 정의.
 * 각 항목: { key, label, query, reduce, scale, unit, desc }
 *   reduce — 다중 시계열이 나올 때 축약 방식 (sum: 힙 영역 합산, max: 인스턴스 중 최대)
 *   scale  — 단위 환산 계수 (초→ms는 1000, 비율→퍼센트는 100)
 */
const GROUPS = [
  {
    id: 'cpu',
    label: 'CPU',
    metrics: [
      // JVM 프로세스 관점 (호스트 코어 수 대비 사용률). 앱이 실제로 CPU를 얼마나 쓰는가.
      ...gaugeStats('cpu.process', `process_cpu_usage{job="${APP_JOB}"}`, {
        label: 'JVM 프로세스 CPU', scale: 100, unit: 'percent', reduce: 'max',
        desc: 'JVM이 사용한 CPU 비율. 호스트 전체 코어 기준.',
      }),
      // 컨테이너 관점 (코어 수). cgroup 한계와 직접 비교 가능한 값.
      ...gaugeStats('cpu.cores', one(`rate(container_cpu_usage_seconds_total{name="${APP}"}[1m])`), {
        label: '컨테이너 CPU', unit: 'cores', reduce: 'max',
        desc: '컨테이너가 소비한 CPU 코어 수. cgroup 한계와 직접 비교한다.',
      }),
      {
        key: 'cpu.limitCores', label: 'CPU 한계(코어)',
        query: one(`container_spec_cpu_quota{name="${APP}"} / container_spec_cpu_period{name="${APP}"}`),
        reduce: 'max', unit: 'cores',
        desc: 'cgroup에 설정된 CPU 상한. 포화도 계산의 분모.',
      },
      {
        // 컨테이너 부하 테스트의 숨은 1순위 병목. 0이 아니면 무조건 조사 대상이다.
        key: 'cpu.throttledPct', label: 'CPU throttled 비율',
        query: one(`100 * rate(container_cpu_cfs_throttled_periods_total{name="${APP}"}[$RANGE]) / clamp_min(rate(container_cpu_cfs_periods_total{name="${APP}"}[$RANGE]), 1)`),
        reduce: 'max', unit: 'percent',
        desc: 'cgroup이 CPU를 강제로 뺏은 주기 비율. >0 이면 CPU 한계가 지연에 직접 영향을 준다.',
      },
      {
        // 구간 **총** 소비량. avg 코어 수와 달리 창 길이에 무관한 절대량이라, 요청 수로
        // 나누면 곧바로 "요청 1건에 든 CPU"가 된다(efficiency 그룹). 세션 간 편차 조사에서
        // 결정적이었던 값이 이것이다 — 소비량은 같은데 처리량만 줄었다는 관측.
        key: 'cpu.seconds', label: '앱 컨테이너 CPU 총초',
        query: one(`increase(container_cpu_usage_seconds_total{name="${APP}"}[$RANGE])`),
        reduce: 'max', unit: 'sec',
        desc: '측정 구간에 앱 컨테이너가 태운 CPU 초. 요청 수로 나누면 요청당 CPU 비용.',
      },
      {
        key: 'cpu.throttledSeconds', label: 'CPU throttled 누적(초)',
        query: one(`increase(container_cpu_cfs_throttled_seconds_total{name="${APP}"}[$RANGE])`),
        reduce: 'max', unit: 'seconds',
        desc: '테스트 구간 동안 강제 정지된 총 시간.',
      },
    ],
  },

  {
    id: 'memory',
    label: 'Memory',
    metrics: [
      // working_set 을 쓰는 이유: usage_bytes는 회수 가능한 page cache까지 포함해 과대평가된다.
      // OOM Killer가 실제로 보는 값이 working set이다.
      ...gaugeStats('memory.workingSet', one(`container_memory_working_set_bytes{name="${APP}"}`), {
        label: '컨테이너 메모리', unit: 'bytes', reduce: 'max',
        desc: 'OOM 판정 기준이 되는 실사용 메모리(page cache 제외).',
      }),
      {
        key: 'memory.limitBytes', label: '메모리 한계',
        query: one(`container_spec_memory_limit_bytes{name="${APP}"}`),
        reduce: 'max', unit: 'bytes',
        desc: 'cgroup 메모리 상한.',
      },
      ...gaugeStats('memory.rss', one(`container_memory_rss{name="${APP}"}`), {
        label: 'RSS', unit: 'bytes', reduce: 'max',
        desc: '프로세스가 물리 메모리에 올린 양.',
      }),
    ],
  },

  {
    id: 'heap',
    label: 'JVM Heap',
    metrics: [
      ...gaugeStats('heap.used', `sum(jvm_memory_used_bytes{job="${APP_JOB}",area="heap"})`, {
        label: 'Heap 사용', unit: 'bytes', reduce: 'max',
        desc: '힙 영역 합계 사용량.',
      }),
      {
        key: 'heap.maxBytes', label: 'Heap 최대',
        query: `sum(jvm_memory_max_bytes{job="${APP_JOB}",area="heap"})`,
        reduce: 'max', unit: 'bytes',
        desc: '-Xmx 로 설정된 힙 상한.',
      },
      {
        key: 'heap.committedMax', label: 'Heap committed max',
        query: `max_over_time((sum(jvm_memory_committed_bytes{job="${APP_JOB}",area="heap"}))[$RANGE:])`,
        reduce: 'max', unit: 'bytes',
        desc: 'OS로부터 실제로 확보한 힙 크기.',
      },
      {
        // GC 이후에도 안 줄어드는 부분 = 실사용 라이브셋. 누수 판단의 근거.
        key: 'heap.liveDataMax', label: 'Live data max',
        query: `max_over_time((jvm_gc_live_data_size_bytes{job="${APP_JOB}"})[$RANGE:])`,
        reduce: 'max', unit: 'bytes',
        desc: 'Full GC 직후 남은 힙. 계속 우상향하면 누수 의심.',
      },
      ...gaugeStats('heap.nonHeapUsed', `sum(jvm_memory_used_bytes{job="${APP_JOB}",area="nonheap"})`, {
        label: 'Non-heap 사용', unit: 'bytes', reduce: 'max',
        desc: 'Metaspace/CodeCache 등.',
      }),
    ],
  },

  {
    id: 'gc',
    label: 'GC',
    metrics: [
      {
        // rate(sum)/rate(count) = 구간 평균 pause. 단순 avg_over_time(max)와 다르다.
        key: 'gc.pauseAvgMs', label: 'GC pause avg',
        query: `1000 * sum(rate(jvm_gc_pause_seconds_sum{job="${APP_JOB}"}[$RANGE])) / clamp_min(sum(rate(jvm_gc_pause_seconds_count{job="${APP_JOB}"}[$RANGE])), 0.0001)`,
        reduce: 'max', unit: 'ms',
        desc: '한 번의 GC가 애플리케이션을 멈춘 평균 시간.',
      },
      {
        key: 'gc.pauseMaxMs', label: 'GC pause max',
        query: `1000 * max_over_time((max(jvm_gc_pause_seconds_max{job="${APP_JOB}"}))[$RANGE:])`,
        reduce: 'max', unit: 'ms',
        desc: '최악의 단일 STW 시간. p99 지연의 주범인지 판단하는 근거.',
      },
      {
        key: 'gc.pauseP95Ms', label: 'GC pause p95',
        query: `1000 * histogram_quantile(0.95, sum by (le) (rate(jvm_gc_pause_seconds_bucket{job="${APP_JOB}"}[$RANGE])))`,
        reduce: 'max', unit: 'ms',
        desc: 'GC pause 분포의 95분위.',
      },
      {
        key: 'gc.count', label: 'GC 횟수',
        query: `sum(increase(jvm_gc_pause_seconds_count{job="${APP_JOB}"}[$RANGE]))`,
        reduce: 'sum', unit: 'count',
        desc: '테스트 구간 총 GC 발생 횟수.',
      },
      {
        key: 'gc.totalPauseMs', label: 'GC 총 정지시간',
        query: `1000 * sum(increase(jvm_gc_pause_seconds_sum{job="${APP_JOB}"}[$RANGE]))`,
        reduce: 'sum', unit: 'ms',
        desc: '구간 내 STW 누적. duration 대비 비율이 GC 오버헤드다.',
      },
      ...gaugeStats('gc.overheadPct', `jvm_gc_overhead{job="${APP_JOB}"}`, {
        label: 'GC 오버헤드', scale: 100, unit: 'percent', reduce: 'max',
        desc: 'CPU 시간 중 GC가 차지한 비율. 지속 5% 초과면 튜닝 대상.',
      }),
      {
        key: 'gc.allocRateBytesSec', label: '할당률',
        query: `sum(rate(jvm_gc_memory_allocated_bytes_total{job="${APP_JOB}"}[$RANGE]))`,
        reduce: 'sum', unit: 'bytes_per_sec',
        desc: '초당 힙 할당량. GC 빈도의 선행 지표.',
      },
      {
        // Young→Old 승격이 많다 = 객체가 오래 산다 = Full GC 위험 상승.
        key: 'gc.promotedBytesSec', label: 'Old 승격률',
        query: `sum(rate(jvm_gc_memory_promoted_bytes_total{job="${APP_JOB}"}[$RANGE]))`,
        reduce: 'sum', unit: 'bytes_per_sec',
        desc: 'Young에서 Old로 승격된 초당 바이트. 높으면 Full GC가 다가온다.',
      },
    ],
  },

  {
    // 컨테이너 CPU 지표만으로는 구분되지 않는 층을 보는 그룹이다. 같은 2코어를 똑같이
    // 태우고 있어도 JIT 재컴파일이 늘었는지 스레드가 쌓였는지는 그 지표로 갈리지 않는다.
    // 게이트는 걸지 않는다 — 과거 런에 값이 없어 UNMEASURED 가 되기 때문.
    id: 'jvm',
    label: 'JVM 내부 (JIT / 스레드 / CPU)',
    metrics: [
      {
        key: 'jvm.jitCompileMs', label: 'JIT 컴파일 누적시간',
        query: `increase(jvm_compilation_time_ms_total{job="${APP_JOB}"}[$RANGE])`,
        reduce: 'sum', unit: 'ms',
        desc: 'JIT 컴파일러가 쓴 CPU 시간. 워밍업이 덜 끝났으면 크고, 정상 상태면 작다.',
      },
      ...gaugeStats('jvm.classesLoaded', `jvm_classes_loaded_classes{job="${APP_JOB}"}`, {
        label: '로드된 클래스', unit: 'count', reduce: 'sum',
        desc: '현재 로드된 클래스 수. 워밍업 진행도의 대리 지표.',
      }),
      {
        // 컨테이너 CPU(cpu.usageCores)와 달리 JVM 프로세스만의 소비량.
        // 요청 수로 나누면 "요청 1건당 CPU" 가 나와 효율 회귀를 직접 본다.
        key: 'jvm.cpuSeconds', label: 'JVM CPU 소비(초)',
        query: `increase(process_cpu_time_ns_total{job="${APP_JOB}"}[$RANGE]) / 1e9`,
        reduce: 'sum', unit: 'sec',
        desc: 'JVM 프로세스가 실제로 쓴 CPU 초. 요청 수로 나누면 요청당 CPU 비용.',
      },
      ...gaugeStats('jvm.cpuUsagePct', `100 * process_cpu_usage{job="${APP_JOB}"}`, {
        label: 'JVM CPU 사용률', unit: 'percent', reduce: 'max',
        desc: 'JVM 이 쓰는 CPU 비율(호스트 코어 기준).',
      }),
      ...gaugeStats('jvm.threadsLive', `jvm_threads_live_threads{job="${APP_JOB}"}`, {
        label: '살아있는 스레드', unit: 'count', reduce: 'sum',
        desc: '전체 스레드 수. 누수가 있으면 실행마다 증가한다.',
      }),
      ...gaugeStats('jvm.threadsBlocked', `jvm_threads_states_threads{job="${APP_JOB}",state="blocked"}`, {
        label: 'BLOCKED 스레드', unit: 'count', reduce: 'max',
        desc: 'synchronized 락을 기다리는 스레드. >0 이 지속되면 앱 레벨 경합이다.',
      }),
      ...gaugeStats('jvm.threadsWaiting', `jvm_threads_states_threads{job="${APP_JOB}",state="waiting"}`, {
        label: 'WAITING 스레드', unit: 'count', reduce: 'max',
        desc: '대기 중인 스레드. 커넥션 풀·큐 대기가 여기 잡힌다.',
      }),
    ],
  },

  {
    id: 'mysql',
    label: 'MySQL',
    metrics: [
      ...gaugeStats('mysql.threadsRunning', 'mysql_global_status_threads_running', {
        label: 'Threads running', unit: 'count', reduce: 'max',
        desc: '실제로 쿼리를 실행 중인 스레드. DB 동시성의 직접 지표.',
      }),
      ...gaugeStats('mysql.threadsConnected', 'mysql_global_status_threads_connected', {
        label: 'Threads connected', unit: 'count', reduce: 'max',
        desc: '연결된 커넥션 수.',
      }),
      {
        key: 'mysql.maxConnections', label: 'max_connections',
        query: 'mysql_global_variables_max_connections',
        reduce: 'max', unit: 'count',
        desc: '서버 커넥션 상한. 포화도 계산 분모.',
      },
      {
        key: 'mysql.slowQueries', label: 'Slow query 수',
        query: 'increase(mysql_global_status_slow_queries[$RANGE])',
        reduce: 'sum', unit: 'count',
        desc: 'long_query_time(0.1s) 초과 쿼리 수. 인덱스 회귀의 1차 신호.',
      },
      {
        key: 'mysql.qps', label: 'Queries/sec',
        query: 'rate(mysql_global_status_queries[$RANGE])',
        reduce: 'sum', unit: 'per_sec',
        desc: '초당 쿼리 수. RPS 대비 비율이 곧 요청당 쿼리 수 = N+1 탐지기.',
      },
      {
        key: 'mysql.qpsMax', label: 'Queries/sec max',
        query: 'max_over_time((rate(mysql_global_status_queries[1m]))[$RANGE:])',
        reduce: 'sum', unit: 'per_sec',
        desc: '순간 최대 쿼리 처리율.',
      },
      {
        // 버퍼풀 히트율이 떨어지면 디스크 I/O로 새는 중. 99.9% 미만이면 조사 대상.
        key: 'mysql.bufferPoolHitPct', label: 'Buffer pool hit ratio',
        query: '100 * (1 - (increase(mysql_global_status_innodb_buffer_pool_reads[$RANGE]) / clamp_min(increase(mysql_global_status_innodb_buffer_pool_read_requests[$RANGE]), 1)))',
        reduce: 'max', unit: 'percent',
        desc: 'InnoDB 버퍼풀 적중률. 낮으면 디스크에서 읽고 있다는 뜻.',
      },
      {
        key: 'mysql.rowsReadPerSec', label: 'Rows read/sec',
        query: 'rate(mysql_global_status_innodb_row_ops_total{operation="read"}[$RANGE])',
        reduce: 'sum', unit: 'per_sec',
        desc: '초당 읽은 행 수. 쿼리 수 대비 급증하면 풀스캔 의심.',
      },
      {
        key: 'mysql.abortedConnects', label: 'Aborted connects',
        query: 'increase(mysql_global_status_aborted_connects[$RANGE])',
        reduce: 'sum', unit: 'count',
        desc: '연결 실패 횟수. 커넥션 고갈의 직접 증거.',
      },
      ...gaugeStats('mysql.innodbRowLockWaits', 'mysql_global_status_innodb_row_lock_current_waits', {
        label: 'Row lock 대기', unit: 'count', reduce: 'max',
        desc: '현재 행 잠금 대기 수. 핫 로우 경합 탐지.',
      }),
      {
        // 풀스캔은 인덱스 회귀의 직접 증거. 세션 간 편차 조사에서 옵티마이저 플랜이
        // 바뀌었는지 보려면 slowQueries 보다 이쪽이 먼저 움직인다.
        key: 'mysql.selectScan', label: '풀 테이블 스캔 수',
        query: 'increase(mysql_global_status_select_scan[$RANGE])',
        reduce: 'sum', unit: 'count',
        desc: '첫 테이블을 전부 훑은 SELECT 수. 급증하면 인덱스가 안 먹고 있다.',
      },
      {
        key: 'mysql.selectFullJoin', label: '인덱스 없는 조인',
        query: 'increase(mysql_global_status_select_full_join[$RANGE])',
        reduce: 'sum', unit: 'count',
        desc: '조인 키에 인덱스가 없어 상대 테이블을 전부 훑은 횟수. 0이어야 정상.',
      },
      {
        key: 'mysql.tmpDiskTables', label: '디스크 임시 테이블',
        query: 'increase(mysql_global_status_created_tmp_disk_tables[$RANGE])',
        reduce: 'sum', unit: 'count',
        desc: '메모리에 못 담아 디스크로 내려간 임시 테이블. ORDER BY/GROUP BY 비용의 신호.',
      },
      {
        key: 'mysql.rowLockTimeMs', label: 'Row lock 대기 총시간',
        query: 'increase(mysql_global_status_innodb_row_lock_time[$RANGE])',
        reduce: 'sum', unit: 'ms',
        desc: '행 잠금을 기다린 누적 시간(ms). 응답시간에 그대로 더해진다. (T-29)',
      },
      {
        key: 'mysql.rowLockWaitCount', label: 'Row lock 대기 횟수',
        query: 'increase(mysql_global_status_innodb_row_lock_waits[$RANGE])',
        reduce: 'sum', unit: 'count',
        desc: '행 잠금 대기가 발생한 횟수. 대기 총시간과 나누면 1회 평균 대기. (T-29)',
      },
      {
        key: 'mysql.rollbacks', label: '롤백 수',
        query: 'increase(mysql_global_status_commands_total{command="rollback"}[$RANGE])',
        reduce: 'sum', unit: 'count',
        desc: '롤백된 트랜잭션 수. 데드락·예외가 조용히 늘고 있는지 본다. (T-29)',
      },

      // ── 컨테이너 관점 ──────────────────────────────────────────────────
      // 위쪽은 전부 mysqld-exporter(=MySQL 자신이 세는 값)이고 여기부터는 cAdvisor
      // (=커널이 세는 값)다. 출처가 다르니 답하는 질문도 다르다. exporter 는 "쿼리를 몇 번
      // 처리했나", cAdvisor 는 "그러느라 CPU 를 얼마나 태웠나"를 안다.
      //
      // 왜 뒤늦게 붙였나: 앱이 느려졌을 때 **DB 도 같이 느려졌는가**를 갈라야 하는데, DB 쪽
      // CPU 지표가 없어 Prometheus 를 손으로 조회해야 했다. 실제로 그 값이 결론을 갈랐다 —
      // MySQL 도 같은 CPU 로 23% 적은 쿼리를 처리하고 있었다. 두 프로세스가 동시에 같은
      // 비율로 비효율해졌다면 원인은 어느 한쪽 프로세스가 아니라 컨테이너 아래 층이다.
      // 다시 손으로 조회하지 않도록 카탈로그에 넣는다.
      ...gaugeStats('mysql.cpuCores', one(`rate(container_cpu_usage_seconds_total{name="${DB}"}[1m])`), {
        label: 'MySQL 컨테이너 CPU', unit: 'cores', reduce: 'max',
        desc: 'MySQL 컨테이너가 소비한 CPU 코어 수. 앱 CPU 와 나란히 놓고 본다.',
      }),
      {
        key: 'mysql.cpuSeconds', label: 'MySQL CPU 총초',
        query: one(`increase(container_cpu_usage_seconds_total{name="${DB}"}[$RANGE])`),
        reduce: 'max', unit: 'sec',
        desc: '측정 구간에 MySQL 이 태운 CPU 초. 쿼리 수로 나누면 쿼리당 CPU 비용.',
      },
      {
        key: 'mysql.cpuLimitCores', label: 'MySQL CPU 한계(코어)',
        query: one(`container_spec_cpu_quota{name="${DB}"} / container_spec_cpu_period{name="${DB}"}`),
        reduce: 'max', unit: 'cores',
        desc: 'MySQL 에 걸린 cgroup CPU 상한. 여유가 있는데 느리면 CPU 부족이 아니다.',
      },
      {
        key: 'mysql.throttledPct', label: 'MySQL CPU throttled 비율',
        query: one(`100 * rate(container_cpu_cfs_throttled_periods_total{name="${DB}"}[$RANGE]) / clamp_min(rate(container_cpu_cfs_periods_total{name="${DB}"}[$RANGE]), 1)`),
        reduce: 'max', unit: 'percent',
        desc: 'MySQL 이 cgroup 에 강제 정지된 주기 비율. >0 이면 DB 지연의 원인이 CPU 상한이다.',
      },
    ],
  },

  {
    id: 'redis',
    label: 'Redis',
    metrics: [
      {
        key: 'redis.opsPerSec', label: 'Ops/sec',
        query: 'rate(redis_commands_processed_total[$RANGE])',
        reduce: 'sum', unit: 'per_sec',
        desc: '초당 처리 명령 수.',
      },
      // MySQL 과 같은 이유로 붙인다(위 주석 참고). Redis 는 소비량이 작아 보통 결론을
      // 가르지 않지만, **셋 중 하나만 빠져 있으면 "스택 전체가 같이 느려졌나"를 못 묻는다.**
      ...gaugeStats('redis.cpuCores', one(`rate(container_cpu_usage_seconds_total{name="${CACHE}"}[1m])`), {
        label: 'Redis 컨테이너 CPU', unit: 'cores', reduce: 'max',
        desc: 'Redis 컨테이너가 소비한 CPU 코어 수.',
      }),
      {
        key: 'redis.cpuSeconds', label: 'Redis CPU 총초',
        query: one(`increase(container_cpu_usage_seconds_total{name="${CACHE}"}[$RANGE])`),
        reduce: 'max', unit: 'sec',
        desc: '측정 구간에 Redis 가 태운 CPU 초.',
      },
      {
        key: 'redis.opsPerSecMax', label: 'Ops/sec max',
        query: 'max_over_time((rate(redis_commands_processed_total[1m]))[$RANGE:])',
        reduce: 'sum', unit: 'per_sec',
        desc: '순간 최대 처리율.',
      },
      ...gaugeStats('redis.connectedClients', 'redis_connected_clients', {
        label: 'Connected clients', unit: 'count', reduce: 'sum',
        desc: '연결된 클라이언트 수. Lettuce 풀 설정과 비교한다.',
      }),
      {
        key: 'redis.hitRatioPct', label: 'Hit ratio',
        query: '100 * increase(redis_keyspace_hits_total[$RANGE]) / clamp_min(increase(redis_keyspace_hits_total[$RANGE]) + increase(redis_keyspace_misses_total[$RANGE]), 1)',
        reduce: 'max', unit: 'percent',
        desc: '캐시 적중률. 캐시 기여도 실험(EXP-004)의 핵심 지표.',
      },
      {
        // 0이 아니면 maxmemory 부족 — 캐시가 조용히 무력화되는 중이다.
        key: 'redis.evictedKeys', label: 'Evicted keys',
        query: 'increase(redis_evicted_keys_total[$RANGE])',
        reduce: 'sum', unit: 'count',
        desc: '메모리 부족으로 쫓겨난 키 수. >0 이면 캐시 효과가 무너지고 있다.',
      },
      {
        key: 'redis.expiredKeys', label: 'Expired keys',
        query: 'increase(redis_expired_keys_total[$RANGE])',
        reduce: 'sum', unit: 'count',
        desc: 'TTL 만료로 삭제된 키 수.',
      },
      ...gaugeStats('redis.memoryUsed', 'redis_memory_used_bytes', {
        label: 'Redis 메모리', unit: 'bytes', reduce: 'sum',
        desc: 'Redis가 사용 중인 메모리.',
      }),
      {
        key: 'redis.memoryMaxBytes', label: 'maxmemory',
        query: 'redis_config_maxmemory',
        reduce: 'max', unit: 'bytes',
        desc: 'Redis 메모리 상한 (0이면 무제한).',
      },
      {
        key: 'redis.blockedClients', label: 'Blocked clients',
        query: 'max_over_time((redis_blocked_clients)[$RANGE:])',
        reduce: 'max', unit: 'count',
        desc: '블로킹 명령 대기 클라이언트.',
      },
    ],
  },

  {
    id: 'pool',
    label: 'Connection Pool / Threads',
    metrics: [
      ...gaugeStats('pool.hikariActive', `hikaricp_connections_active{job="${APP_JOB}"}`, {
        label: 'HikariCP active', unit: 'count', reduce: 'sum',
        desc: '사용 중인 DB 커넥션.',
      }),
      ...gaugeStats('pool.hikariPending', `hikaricp_connections_pending{job="${APP_JOB}"}`, {
        label: 'HikariCP pending', unit: 'count', reduce: 'sum',
        desc: '커넥션을 기다리는 스레드. >0 이 지속되면 풀이 병목이다.',
      }),
      {
        key: 'pool.hikariMax', label: 'HikariCP max',
        query: `max(hikaricp_connections_max{job="${APP_JOB}"})`,
        reduce: 'max', unit: 'count',
        desc: '풀 최대 크기. 포화도 분모.',
      },
      {
        key: 'pool.hikariAcquireP95Ms', label: '커넥션 획득 p95',
        query: `1000 * histogram_quantile(0.95, sum by (le) (rate(hikaricp_connections_acquire_seconds_bucket{job="${APP_JOB}"}[$RANGE])))`,
        reduce: 'max', unit: 'ms',
        desc: '풀에서 커넥션을 받기까지 걸린 p95. 응답시간에 그대로 더해진다.',
      },
      {
        key: 'pool.hikariTimeouts', label: '커넥션 타임아웃',
        query: `sum(increase(hikaricp_connections_timeout_total{job="${APP_JOB}"}[$RANGE]))`,
        reduce: 'sum', unit: 'count',
        desc: '커넥션을 못 받고 실패한 횟수. 0이어야 정상.',
      },
      ...gaugeStats('pool.tomcatBusy', `tomcat_threads_busy_threads{job="${APP_JOB}"}`, {
        label: 'Tomcat busy threads', unit: 'count', reduce: 'sum',
        desc: '요청 처리 중인 워커 스레드.',
      }),
      {
        key: 'pool.tomcatMax', label: 'Tomcat max threads',
        query: `max(tomcat_threads_config_max_threads{job="${APP_JOB}"})`,
        reduce: 'max', unit: 'count',
        desc: '워커 스레드 상한. 여기 닿으면 요청이 큐에서 대기한다.',
      },
    ],
  },

  {
    id: 'network',
    label: 'Network',
    metrics: [
      {
        key: 'network.rxBytesSec', label: '수신 대역폭',
        query: onePerContainer(`rate(container_network_receive_bytes_total{name="${APP}"}[$RANGE])`),
        reduce: 'max', unit: 'bytes_per_sec',
        desc: '앱 컨테이너 초당 수신 바이트.',
      },
      {
        key: 'network.txBytesSec', label: '송신 대역폭',
        query: onePerContainer(`rate(container_network_transmit_bytes_total{name="${APP}"}[$RANGE])`),
        reduce: 'max', unit: 'bytes_per_sec',
        desc: '앱 컨테이너 초당 송신 바이트.',
      },
      {
        key: 'network.rxErrors', label: '수신 에러',
        query: onePerContainer(`increase(container_network_receive_errors_total{name="${APP}"}[$RANGE])`),
        reduce: 'max', unit: 'count',
        desc: '네트워크 수신 오류. 0이어야 정상.',
      },
      {
        key: 'network.txDropped', label: '송신 드롭',
        query: onePerContainer(`increase(container_network_transmit_packets_dropped_total{name="${APP}"}[$RANGE])`),
        reduce: 'max', unit: 'count',
        desc: '드롭된 송신 패킷.',
      },
    ],
  },

  {
    id: 'disk',
    label: 'Disk (MySQL)',
    metrics: [
      {
        key: 'disk.readBytesSec', label: '디스크 읽기',
        query: onePerContainer(`rate(container_fs_reads_bytes_total{name="${DB}"}[$RANGE])`),
        reduce: 'max', unit: 'bytes_per_sec',
        desc: 'DB 컨테이너 초당 디스크 읽기. 버퍼풀 미스와 연동해서 본다.',
      },
      {
        key: 'disk.writeBytesSec', label: '디스크 쓰기',
        query: onePerContainer(`rate(container_fs_writes_bytes_total{name="${DB}"}[$RANGE])`),
        reduce: 'max', unit: 'bytes_per_sec',
        desc: 'DB 컨테이너 초당 디스크 쓰기 (redo/binlog 포함).',
      },
      {
        key: 'disk.ioTimeSec', label: 'I/O 시간',
        query: onePerContainer(`increase(container_fs_io_time_seconds_total{name="${DB}"}[$RANGE])`),
        reduce: 'max', unit: 'seconds',
        desc: '디스크가 바빴던 누적 시간. duration 대비 비율이 디스크 이용률.',
      },
    ],
  },
  {
    id: 'host',
    label: '호스트',
    // cAdvisor 는 컨테이너 **하나하나**를 본다. 그것들이 합쳐서 머신을 얼마나 밀었는지는
    // 보지 못한다. 컨테이너별 CPU 가 전부 한가해 보여도 호스트 run queue 가 길면 응답시간은
    // 늘어난다 — 그 경우를 설명할 지표가 없었다(E-09).
    //
    // 여기서 "호스트"는 **WSL2 VM** 이다. Windows 자체가 아니다. Windows 에서 직접 실행하는
    // k6.exe 는 이 VM 밖이라 잡히지 않는다 — 그래서 loadgen 그룹이 따로 있다.
    metrics: [
      {
        key: 'host.cores', label: '호스트 코어 수',
        query: `count(count by (cpu) (node_cpu_seconds_total))`,
        reduce: 'max', unit: 'cores',
        desc: 'VM 에 할당된 논리 코어 수. 아래 사용률의 분모.',
      },
      ...gaugeStats('host.cpuPct', `100 * (1 - avg(rate(node_cpu_seconds_total{mode="idle"}[1m])))`, {
        label: '호스트 CPU 사용률', unit: 'percent', reduce: 'max',
        desc: 'VM 전체 CPU 사용률. 개별 컨테이너가 한가해도 이 값이 높으면 서로 밀어낸 것이다.',
      }),
      // `node_load1 / count(...)` 를 그대로 쓰면 안 된다. 왼쪽에는 instance·job 레이블이
      // 있고 오른쪽 집계에는 없어서 벡터 매칭이 실패해 **빈 결과**가 된다(실측). 오른쪽을
      // scalar() 로 접어 레이블 없는 상수로 만든다.
      ...gaugeStats('host.loadPerCore', `avg(node_load1) / scalar(count(count by (cpu) (node_cpu_seconds_total)))`, {
        label: '코어당 run queue', unit: 'ratio', reduce: 'max',
        desc: 'load1 을 코어 수로 나눈 값. 1 을 넘으면 실행 대기가 코어보다 많다는 뜻이다.',
      }),
      {
        key: 'host.iowaitPct', label: 'iowait 비율',
        query: `100 * avg(rate(node_cpu_seconds_total{mode="iowait"}[$RANGE]))`,
        reduce: 'max', unit: 'percent',
        desc: 'CPU 가 디스크를 기다린 비율. 높으면 병목이 CPU 가 아니라 I/O 다.',
      },
      {
        key: 'host.stealPct', label: 'steal 비율',
        query: `100 * avg(rate(node_cpu_seconds_total{mode="steal"}[$RANGE]))`,
        reduce: 'max', unit: 'percent',
        desc: '하이퍼바이저가 CPU 를 가져간 비율. VM 밖(Windows) 부하의 간접 증거다.',
      },
      {
        key: 'host.memAvailableBytes', label: '가용 메모리',
        query: `min_over_time(node_memory_MemAvailable_bytes[$RANGE:])`,
        reduce: 'max', unit: 'bytes',
        desc: '구간 중 최저 가용 메모리. 0 에 가까우면 페이지 캐시가 밀려 디스크 읽기가 는다.',
      },
      {
        key: 'host.contextSwitchesSec', label: '컨텍스트 스위치',
        query: `rate(node_context_switches_total[$RANGE])`,
        reduce: 'max', unit: 'per_sec',
        desc: '초당 컨텍스트 스위치. 급증은 과도한 스레드 경합 신호다.',
      },
    ],
  },
  {
    id: 'loadgen',
    label: '부하 발생기',
    // E-01 — 부하 발생기와 측정 대상이 같은 머신을 쓴다. 분리가 최선이지만, 분리하지 못하는
    // 실험이라면 **최소한 얼마나 먹었는지는 기록**해야 "이 결과는 로컬 상대 비교로만 유효"
    // 라고 말할 근거가 생긴다.
    //
    // 이 지표들은 k6 를 컨테이너로 돌릴 때만 값이 있다(`perf-run.js --loadgen docker`).
    // Windows 네이티브 k6.exe 는 cAdvisor 도 node-exporter 도 보지 못하므로 전부 결측이
    // 되는데, 그 결측 자체가 "부하 발생기를 측정하지 않았다"는 정확한 기록이다.
    metrics: [
      ...gaugeStats('loadgen.cores', one(`rate(container_cpu_usage_seconds_total{name="${LOADGEN}"}[1m])`), {
        label: '부하 발생기 CPU', unit: 'cores', reduce: 'max',
        desc: 'k6 컨테이너가 소비한 코어 수. 측정 대상과 같은 머신이면 이만큼 뺏은 것이다.',
      }),
      {
        key: 'loadgen.throttledPct', label: '부하 발생기 throttled',
        query: one(`100 * rate(container_cpu_cfs_throttled_periods_total{name="${LOADGEN}"}[$RANGE]) / clamp_min(rate(container_cpu_cfs_periods_total{name="${LOADGEN}"}[$RANGE]), 1)`),
        reduce: 'max', unit: 'percent',
        desc: '**0 이 아니면 그 실행의 지연은 서버가 아니라 부하 발생기가 만든 것일 수 있다.** 서버 포화와 발생기 포화를 가르는 값.',
      },
      ...gaugeStats('loadgen.memBytes', one(`container_memory_working_set_bytes{name="${LOADGEN}"}`), {
        label: '부하 발생기 메모리', unit: 'bytes', reduce: 'max',
        desc: 'k6 가 쓴 메모리. VU 가 많으면 여기가 먼저 터진다.',
      }),
    ],
  },
  {
    // k6 시계열 — remote-write 로 들어온 **부하 발생기 관점**의 지표 (P0-4 9번).
    //
    // record.k6 (k6 요약본)와 무엇이 다른가: 요약본은 실행 전체에 대해 **한 번** 계산된
    // 값이라 사후에 구간을 바꿔 다시 물어볼 수 없다. 이쪽은 5초 간격 원본 분포가
    // Prometheus 에 남아 있어, 저장된 실행에서 measure 앞 5분만 잘라 p95 를 다시 구하는
    // 식의 재질의가 된다. 두 값이 크게 어긋나면 그 자체가 신호다(창 계산 오류 등).
    //
    // native histogram 이라 분위수는 **질의 시점에** 계산된다. `histogram_quantile` 은
    // 버킷 원본을 받으므로 임의 구간에 대해 정확하다 — 계산된 p95 를 저장해 두는 방식은
    // 분위수가 합산되지 않아 근사치밖에 안 된다.
    //
    // k6 는 초 단위로 보낸다. 리포트·SLO 는 전부 ms 기준이라 1000 을 곱해 맞춘다.
    //
    // ⚠ 요약본과 **정확히 같은 값이 나오지는 않는다.** 두 가지 이유가 있고 둘 다 정상이다.
    //
    //   1) rate() 는 창의 **첫 표본을 기준선으로 소비**한다. push 간격이 5초이므로
    //      창 맨 앞 5초에 일어난 요청은 분포에서 빠진다. 20분 측정 구간이면 0.4%라
    //      무시할 수 있지만, 1분짜리 짧은 실행에서는 8%가 되어 눈에 띈다. 실제로
    //      검증 smoke(63초)에서 >100ms 요청 5건이 전부 첫 구간에 몰려 있어
    //      요약본 P99 195ms 대 시계열 P99 22ms 로 벌어졌다 — 그 5건은 커넥션·JIT
    //      워밍업이었고, measure 구간이 애초에 배제하려는 종류의 표본이다.
    //   2) native histogram 은 버킷 경계로 반올림된다. k6 가 쓰는 schema 3 은 버킷
    //      폭비가 2^(1/8)=1.0905 라 상대 오차가 최대 ±4.5%다.
    //
    // 그래서 이 값은 요약본을 **대체**하는 게 아니라 요약본이 답할 수 없는 질문
    // ("구간을 바꾸면 얼마인가")을 답한다. 판정은 계속 요약본으로 한다.
    //
    // 게이트는 걸지 않는다 — remote-write 이전 실행에는 값이 없어 UNMEASURED 가 된다.
    // `--no-remote-write` 로 끈 실행도 전부 null 이 되는데, 그 결측 자체가
    // "이 실행은 시계열을 남기지 않았다"는 정확한 기록이다.
    id: 'k6ts',
    label: 'k6 시계열 (remote-write)',
    metrics: [
      {
        key: 'k6ts.p95', label: 'k6 P95 (시계열)',
        query: '1000 * histogram_quantile(0.95, sum(rate(k6_http_req_duration_seconds[$RANGE])))',
        reduce: 'max', unit: 'ms',
        desc: '측정 구간 전체의 응답시간 P95. k6 요약본의 P95 와 같은 값이어야 한다 — 어긋나면 측정 창 계산을 의심한다.',
      },
      {
        key: 'k6ts.p99', label: 'k6 P99 (시계열)',
        query: '1000 * histogram_quantile(0.99, sum(rate(k6_http_req_duration_seconds[$RANGE])))',
        reduce: 'max', unit: 'ms',
        desc: '응답시간 P99. 꼬리가 얼마나 두꺼운지를 본다.',
      },
      {
        key: 'k6ts.p50', label: 'k6 P50 (시계열)',
        query: '1000 * histogram_quantile(0.50, sum(rate(k6_http_req_duration_seconds[$RANGE])))',
        reduce: 'max', unit: 'ms',
        desc: '응답시간 중앙값. P95 와의 벌어짐이 곧 꼬리 비대칭의 크기다.',
      },
      {
        // SLO 가 읽기 300ms / 쓰기 500ms 로 갈려 있다. k6 가 붙여 보내는 `op` 라벨로
        // 그 구분을 지표 레벨에서 그대로 잰다 — 요약본에서는 섞여 있어 못 하던 것이다.
        key: 'k6ts.p95Read', label: 'k6 P95 읽기',
        query: '1000 * histogram_quantile(0.95, sum(rate(k6_http_req_duration_seconds{op="read"}[$RANGE])))',
        reduce: 'max', unit: 'ms',
        desc: '읽기 요청만의 P95. SLO 기준 300ms.',
      },
      {
        key: 'k6ts.p95Write', label: 'k6 P95 쓰기',
        query: '1000 * histogram_quantile(0.95, sum(rate(k6_http_req_duration_seconds{op="write"}[$RANGE])))',
        reduce: 'max', unit: 'ms',
        desc: '쓰기 요청만의 P95. SLO 기준 500ms.',
      },
      {
        // waiting = TTFB(요청을 다 보낸 뒤 첫 바이트까지). duration 에서 이걸 빼면
        // 전송·수신에 쓴 시간이 남는다. 서버가 느린 것과 왕복 경로가 느린 것을 가른다.
        key: 'k6ts.waitingP95', label: 'k6 서버 대기 P95',
        query: '1000 * histogram_quantile(0.95, sum(rate(k6_http_req_waiting_seconds[$RANGE])))',
        reduce: 'max', unit: 'ms',
        desc: '첫 바이트까지 기다린 시간의 P95(TTFB). P95 전체와 거의 같으면 지연은 서버 안에서 났다.',
      },
      {
        // 발생기가 자기 커넥션 슬롯을 기다린 시간. 0 이 아니면 서버가 아니라 k6 가
        // 먼저 막힌 것이다 — loadgen.throttledPct 와 함께 E-01 판정에 쓴다.
        key: 'k6ts.blockedP95', label: 'k6 커넥션 대기 P95',
        query: '1000 * histogram_quantile(0.95, sum(rate(k6_http_req_blocked_seconds[$RANGE])))',
        reduce: 'max', unit: 'ms',
        desc: '요청을 보내기 전 커넥션을 기다린 시간. 커지면 부하 발생기 쪽 병목이다.',
      },
      {
        key: 'k6ts.rps', label: 'k6 RPS (시계열)',
        query: 'sum(rate(k6_http_reqs_total[$RANGE]))',
        reduce: 'sum', unit: 'per_sec',
        desc: '측정 구간의 초당 요청 수. 닫힌 부하 루프라 지연이 오르면 이 값이 내려간다.',
      },
      {
        key: 'k6ts.reqs', label: 'k6 요청 수 (시계열)',
        query: 'sum(increase(k6_http_reqs_total[$RANGE]))',
        reduce: 'sum', unit: 'count',
        desc: '측정 구간 요청 총수. k6 요약본의 measure 구간 httpReqs 와 대조하는 용도.',
      },
      {
        // expected_response=false = k6 가 실패로 친 응답. 비율을 여기서 직접 계산하는
        // 이유: k6 의 `_failed_rate` 게이지는 실행 시작부터 누적된 비율이라 구간을
        // 잘라 다시 계산할 수 없다. 카운터 두 개로 나누면 임의 구간에 대해 정확하다.
        key: 'k6ts.errorPct', label: 'k6 오류율 (시계열)',
        // `or vector(0)` 가 없으면 **오류가 0건일 때 결과가 빈 벡터**가 된다 —
        // 일치하는 계열이 아예 없기 때문이다. 그러면 "오류율 0%" 와 "측정 못 함" 이
        // 똑같이 null 로 기록돼, 가장 흔한 정상 실행이 전부 결측으로 보인다.
        query: '100 * (sum(rate(k6_http_reqs_total{expected_response="false"}[$RANGE])) or vector(0))'
          + ' / clamp_min(sum(rate(k6_http_reqs_total[$RANGE])), 0.0001)',
        reduce: 'max', unit: 'percent',
        desc: '측정 구간의 실패 응답 비율. 구간을 잘라도 정확하게 다시 계산된다.',
      },
      ...gaugeStats('k6ts.vus', 'max(k6_vus)', {
        label: '활성 VU', unit: 'count', reduce: 'max',
        desc: '그 순간 붙어 있던 가상 사용자 수. 램프업 곡선과 지연 상승을 겹쳐 보는 축이다.',
      }),
    ],
  },

  {
    // 효율 — "요청 1건을 처리하는 데 자원이 얼마나 들었나".
    //
    // 왜 별도 그룹인가: **CPU 가 포화된 상태에서는 사용률이 신호가 아니다.** 앱은 세션이
    // 빠르든 느리든 항상 2코어에 붙어 있어 `cpu.cores.avg` 가 1.98 로 똑같이 나온다.
    // 그 상태에서 실제로 달라지는 것은 "같은 CPU 로 몇 건을 처리했나"뿐이고, 그건 사용률이
    // 아니라 **총소비량 ÷ 처리량**으로만 보인다.
    //
    // 실제로 자원 지표가 전부 평평한데 요청당 CPU 만 앱 +27%, MySQL +21% 로 함께 올라
    // 있던 실행이 있었다. 사용률만 보면 아무 일도 없었던 것으로 읽힌다. 매번 손으로 나눠
    // 계산하던 것을 지표로 고정한다.
    //
    // ⚠ **분모가 k6 remote-write 에서 온다.** `--no-remote-write` 로 끈 실행과
    // remote-write 도입 이전 실행은 전부 null 이다. 그 결측은 "효율이 나빴다"가 아니라
    // "요청 수를 시계열로 남기지 않았다"는 뜻이다.
    id: 'efficiency',
    label: '효율 (요청당 자원 비용)',
    metrics: [
      {
        key: 'efficiency.appCpuMsPerReq', label: '요청당 앱 CPU',
        query: `1000 * ${one(`increase(container_cpu_usage_seconds_total{name="${APP}"}[$RANGE])`)} / ${REQS}`,
        reduce: 'max', unit: 'ms',
        desc: '요청 1건에 앱 컨테이너가 태운 CPU(ms). **CPU 포화 상태에서 성능 회귀를 직접 보는 값.** 오르면 같은 일을 더 비싸게 하고 있다.',
      },
      {
        // 컨테이너 CPU 에는 JVM 밖(쉘·에이전트 등)도 섞인다. 이 둘이 크게 벌어지면
        // 컨테이너 안에서 JVM 아닌 무언가가 CPU 를 먹고 있다는 뜻이다.
        key: 'efficiency.jvmCpuMsPerReq', label: '요청당 JVM CPU',
        query: `1000 * ${one(`increase(process_cpu_time_ns_total{job="${APP_JOB}"}[$RANGE])`)} / 1e9 / ${REQS}`,
        reduce: 'max', unit: 'ms',
        desc: 'JVM 프로세스만의 요청당 CPU(ms). 앱 컨테이너 값과 크게 다르면 컨테이너 안에 다른 소비자가 있다.',
      },
      {
        key: 'efficiency.dbCpuMsPerReq', label: '요청당 MySQL CPU',
        query: `1000 * ${one(`increase(container_cpu_usage_seconds_total{name="${DB}"}[$RANGE])`)} / ${REQS}`,
        reduce: 'max', unit: 'ms',
        desc: '요청 1건에 MySQL 이 태운 CPU(ms). 앱 값과 **같은 비율로** 움직이면 원인은 둘 다의 아래 층이다.',
      },
      {
        key: 'efficiency.cacheCpuMsPerReq', label: '요청당 Redis CPU',
        query: `1000 * ${one(`increase(container_cpu_usage_seconds_total{name="${CACHE}"}[$RANGE])`)} / ${REQS}`,
        reduce: 'max', unit: 'ms',
        desc: '요청 1건에 Redis 가 태운 CPU(ms).',
      },
      {
        key: 'efficiency.stackCpuMsPerReq', label: '요청당 스택 전체 CPU',
        query: `1000 * (${one(`increase(container_cpu_usage_seconds_total{name="${APP}"}[$RANGE])`)}`
          + ` + ${one(`increase(container_cpu_usage_seconds_total{name="${DB}"}[$RANGE])`)}`
          + ` + ${one(`increase(container_cpu_usage_seconds_total{name="${CACHE}"}[$RANGE])`)}) / ${REQS}`,
        reduce: 'max', unit: 'ms',
        desc: '앱+MySQL+Redis 를 합친 요청당 CPU. 병목이 옮겨 다녀도 이 합계는 총비용을 그대로 보여준다.',
      },
      {
        // 쿼리 수로 나누면 "쿼리가 늘어난 것"과 "쿼리 하나가 비싸진 것"이 갈린다.
        // efficiency.dbCpuMsPerReq 만 보면 이 둘이 섞여 있다.
        key: 'efficiency.dbCpuUsPerQuery', label: '쿼리당 MySQL CPU',
        query: `1e6 * ${one(`increase(container_cpu_usage_seconds_total{name="${DB}"}[$RANGE])`)} / clamp_min(${one('increase(mysql_global_status_queries[$RANGE])')}, 1)`,
        reduce: 'max', unit: 'us',
        desc: '쿼리 1건에 든 CPU(마이크로초). 요청당 쿼리 수는 그대로인데 이 값만 오르면 DB 자체가 비효율해진 것이다.',
      },
      {
        key: 'efficiency.queriesPerReq', label: '요청당 쿼리 수',
        query: `${one('increase(mysql_global_status_queries[$RANGE])')} / ${REQS}`,
        reduce: 'max', unit: 'count',
        desc: '요청 1건이 만든 쿼리 수. 급증하면 N+1 이다. 위 두 지표를 해석할 때의 기준선.',
      },
      {
        key: 'efficiency.ctxSwitchPerReq', label: '요청당 컨텍스트 스위치',
        query: `${one('increase(node_context_switches_total[$RANGE])')} / ${REQS}`,
        reduce: 'max', unit: 'count',
        desc: '요청 1건당 VM 전체 컨텍스트 스위치. CPU 는 그대로인데 이게 오르면 스케줄링 비용이 늘어난 것이다.',
      },
    ],
  },
];

/**
 * 파생 지표 — 원시 값들로부터 계산되는 "포화도".
 *
 * 왜 따로 두는가: 절대값(CPU 1.4코어)은 환경이 바뀌면 의미가 없지만,
 * 포화도(한계의 70%)는 환경이 달라져도 그대로 비교된다. 회귀 판정과 병목 지목은
 * 절대값이 아니라 포화도로 해야 이식성이 생긴다.
 */
function computeDerived(flat) {
  const issues = [];

  // 포화도는 한계 대비 비율이므로 100%를 넘을 수 없다. 넘긴 자원은 OOM Kill 이나
  // throttling 으로 강제 회수되지, 초과한 채 유지되지 않는다. 따라서 100%를 넘은 값은
  // 자원 부족이 아니라 측정 오류다 — 중복 시계열, 라벨 불일치, 분자/분모 스코프 불일치.
  //
  // 그냥 두면 bottleneckHints 가 이 값을 "메모리 포화 227%, OOM Kill 위험" 같은 병목
  // 가설로 승격시킨다. 실제로 그렇게 실렸고, 존재하지 않는 문제를 가리키고 있었다.
  // 그럴듯한 오보는 결측보다 나쁘다 — 결측은 조사를 멈추게 하지만 오보는 엉뚱한 곳으로
  // 몇 시간을 보낸다. 그래서 값을 버리고 사유만 남긴다.
  //
  // 5%는 분자와 분모의 스크레이프 시점이 어긋나 생기는 오차 허용분이다.
  const CEILING_PCT = 105;

  const pct = (key, num, den) => {
    if (num == null || den == null || den <= 0) return null;
    const v = (num / den) * 100;
    if (v > CEILING_PCT) {
      issues.push({
        key,
        error:
          `포화도 ${v.toFixed(0)}% — 한계를 넘을 수 없는 값이라 측정 오류로 보고 버렸다 ` +
          `(분자 ${num}, 분모 ${den}). 컨테이너 재생성 직후의 중복 시계열을 먼저 의심할 것.`,
      });
      return null;
    }
    return v;
  };

  const derived = {
    'saturation.cpuPct': pct('saturation.cpuPct', flat['cpu.cores.max'], flat['cpu.limitCores']),
    'saturation.cpuAvgPct': pct('saturation.cpuAvgPct', flat['cpu.cores.avg'], flat['cpu.limitCores']),
    'saturation.memoryPct': pct('saturation.memoryPct', flat['memory.workingSet.max'], flat['memory.limitBytes']),
    'saturation.heapPct': pct('saturation.heapPct', flat['heap.used.max'], flat['heap.maxBytes']),
    'saturation.hikariPct': pct('saturation.hikariPct', flat['pool.hikariActive.max'], flat['pool.hikariMax']),
    'saturation.tomcatPct': pct('saturation.tomcatPct', flat['pool.tomcatBusy.max'], flat['pool.tomcatMax']),
    'saturation.mysqlConnPct': pct('saturation.mysqlConnPct', flat['mysql.threadsConnected.max'], flat['mysql.maxConnections']),
    'saturation.redisMemPct':
      flat['redis.memoryMaxBytes'] > 0
        ? pct('saturation.redisMemPct', flat['redis.memoryUsed.max'], flat['redis.memoryMaxBytes'])
        : null,
  };

  return { derived, issues };
}

module.exports = { GROUPS, computeDerived, APP, DB, APP_JOB, LOADGEN };
