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
const APP_JOB = 'spring-app';

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
      ...gaugeStats('cpu.cores', `rate(container_cpu_usage_seconds_total{name="${APP}"}[1m])`, {
        label: '컨테이너 CPU', unit: 'cores', reduce: 'sum',
        desc: '컨테이너가 소비한 CPU 코어 수. cgroup 한계와 직접 비교한다.',
      }),
      {
        key: 'cpu.limitCores', label: 'CPU 한계(코어)',
        query: `container_spec_cpu_quota{name="${APP}"} / container_spec_cpu_period{name="${APP}"}`,
        reduce: 'max', unit: 'cores',
        desc: 'cgroup에 설정된 CPU 상한. 포화도 계산의 분모.',
      },
      {
        // 컨테이너 부하 테스트의 숨은 1순위 병목. 0이 아니면 무조건 조사 대상이다.
        key: 'cpu.throttledPct', label: 'CPU throttled 비율',
        query: `100 * rate(container_cpu_cfs_throttled_periods_total{name="${APP}"}[$RANGE]) / clamp_min(rate(container_cpu_cfs_periods_total{name="${APP}"}[$RANGE]), 1)`,
        reduce: 'max', unit: 'percent',
        desc: 'cgroup이 CPU를 강제로 뺏은 주기 비율. >0 이면 CPU 한계가 지연에 직접 영향을 준다.',
      },
      {
        key: 'cpu.throttledSeconds', label: 'CPU throttled 누적(초)',
        query: `increase(container_cpu_cfs_throttled_seconds_total{name="${APP}"}[$RANGE])`,
        reduce: 'sum', unit: 'seconds',
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
      ...gaugeStats('memory.workingSet', `container_memory_working_set_bytes{name="${APP}"}`, {
        label: '컨테이너 메모리', unit: 'bytes', reduce: 'sum',
        desc: 'OOM 판정 기준이 되는 실사용 메모리(page cache 제외).',
      }),
      {
        key: 'memory.limitBytes', label: '메모리 한계',
        query: `container_spec_memory_limit_bytes{name="${APP}"}`,
        reduce: 'max', unit: 'bytes',
        desc: 'cgroup 메모리 상한.',
      },
      ...gaugeStats('memory.rss', `container_memory_rss{name="${APP}"}`, {
        label: 'RSS', unit: 'bytes', reduce: 'sum',
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
        query: `sum(rate(container_network_receive_bytes_total{name="${APP}"}[$RANGE]))`,
        reduce: 'sum', unit: 'bytes_per_sec',
        desc: '앱 컨테이너 초당 수신 바이트.',
      },
      {
        key: 'network.txBytesSec', label: '송신 대역폭',
        query: `sum(rate(container_network_transmit_bytes_total{name="${APP}"}[$RANGE]))`,
        reduce: 'sum', unit: 'bytes_per_sec',
        desc: '앱 컨테이너 초당 송신 바이트.',
      },
      {
        key: 'network.rxErrors', label: '수신 에러',
        query: `sum(increase(container_network_receive_errors_total{name="${APP}"}[$RANGE]))`,
        reduce: 'sum', unit: 'count',
        desc: '네트워크 수신 오류. 0이어야 정상.',
      },
      {
        key: 'network.txDropped', label: '송신 드롭',
        query: `sum(increase(container_network_transmit_packets_dropped_total{name="${APP}"}[$RANGE]))`,
        reduce: 'sum', unit: 'count',
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
        query: `sum(rate(container_fs_reads_bytes_total{name="${DB}"}[$RANGE]))`,
        reduce: 'sum', unit: 'bytes_per_sec',
        desc: 'DB 컨테이너 초당 디스크 읽기. 버퍼풀 미스와 연동해서 본다.',
      },
      {
        key: 'disk.writeBytesSec', label: '디스크 쓰기',
        query: `sum(rate(container_fs_writes_bytes_total{name="${DB}"}[$RANGE]))`,
        reduce: 'sum', unit: 'bytes_per_sec',
        desc: 'DB 컨테이너 초당 디스크 쓰기 (redo/binlog 포함).',
      },
      {
        key: 'disk.ioTimeSec', label: 'I/O 시간',
        query: `sum(increase(container_fs_io_time_seconds_total{name="${DB}"}[$RANGE]))`,
        reduce: 'sum', unit: 'seconds',
        desc: '디스크가 바빴던 누적 시간. duration 대비 비율이 디스크 이용률.',
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
  const pct = (num, den) =>
    num != null && den != null && den > 0 ? (num / den) * 100 : null;

  return {
    'saturation.cpuPct': pct(flat['cpu.cores.max'], flat['cpu.limitCores']),
    'saturation.cpuAvgPct': pct(flat['cpu.cores.avg'], flat['cpu.limitCores']),
    'saturation.memoryPct': pct(flat['memory.workingSet.max'], flat['memory.limitBytes']),
    'saturation.heapPct': pct(flat['heap.used.max'], flat['heap.maxBytes']),
    'saturation.hikariPct': pct(flat['pool.hikariActive.max'], flat['pool.hikariMax']),
    'saturation.tomcatPct': pct(flat['pool.tomcatBusy.max'], flat['pool.tomcatMax']),
    'saturation.mysqlConnPct': pct(flat['mysql.threadsConnected.max'], flat['mysql.maxConnections']),
    'saturation.redisMemPct':
      flat['redis.memoryMaxBytes'] > 0
        ? pct(flat['redis.memoryUsed.max'], flat['redis.memoryMaxBytes'])
        : null,
  };
}

module.exports = { GROUPS, computeDerived, APP, DB, APP_JOB };
