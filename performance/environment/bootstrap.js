#!/usr/bin/env node
/**
 * 데이터셋 프로파일 부트스트랩 — 리셋 직후/프로파일 전환 후 매번 해야 하는 일을 묶는다.
 *
 * 이 절차를 손으로 하면 반드시 빠뜨린다(실측):
 *  - boards 5행을 안 넣으면 seed.js가 /api/boards에서 빈 배열을 받아 조용히 실패한다
 *    (spring.sql.init.mode=never라 data.sql이 자동 실행되지 않는다).
 *  - daily_hot_post 테이블이 없으면 GET /api/hotposts/daily가 항상 500이다 (BTL-009).
 *  - Redis를 비우지 않으면 이전 프로파일의 캐시/카운터가 남는다. MySQL 볼륨만
 *    프로파일별로 분리되므로, 전환해도 Redis 컨테이너는 그대로 살아있다.
 *  - seed.js를 두 번 돌리면 계정만 건너뛰고 글/댓글은 매번 새로 만들어져 데이터셋이
 *    명세의 2배가 된다(실측: small 명세 500 → 실제 1065). 재현성이 깨진다.
 *
 * 사용법:
 *   node environment/bootstrap.js --profile small
 *   node environment/bootstrap.js --profile small --force     # 이미 적재돼 있어도 재시드
 *   node environment/bootstrap.js --profile small --skip-seed # 스키마/캐시만 정리
 *   node environment/bootstrap.js --profile large --resume    # 중단된 생성을 빈 단계부터
 *
 * 시드 정책 옵션(`--tolerance`, `--on-failure`, `--resume`)은 seed.js 로 그대로 전달된다.
 * 예전에는 인자가 하드코딩돼 있어, 허용치를 주려면 부트스트랩을 건너뛰고 seed.js 를 직접
 * 불러야 했다 — 그러면 아래 준비 작업을 사람이 다시 챙겨야 한다.
 *
 * 선행 조건: 스택이 떠 있어야 한다.
 *   DATASET_PROFILE=small docker compose -f environment/docker-compose.perf.yml \
 *     --env-file environment/.env.perf up -d
 */
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');

// datasets/seed.js 와 동일한 이유 — Node 18 미만에는 전역 fetch가 없다.
if (typeof fetch !== 'function') {
  console.error(
    `이 스크립트는 Node 18+ 가 필요하다 (전역 fetch 사용). 현재: ${process.version}\n` +
    `  nvm-windows 예: nvm use 22.23.1`
  );
  process.exit(1);
}

const PROFILES = require('../datasets/profiles.json');

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const arg = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};

const PROFILE = arg('profile', process.env.DATASET_PROFILE || 'medium');
const BASE = arg('base', 'http://localhost:18080');
const CONCURRENCY = arg('concurrency', '10');
// 중단된 생성을 이어서 한다. `--force`(이미 적재돼 있어도 재시드)와 다르다 — 이쪽은
// 완료된 단계를 **건너뛰고** 빈 단계부터 채운다. 중복 적재 경고도 이때는 통과시킨다.
const RESUME = args.includes('--resume');
const DB = process.env.MYSQL_DATABASE || 'highteenday';
const DB_PASS = process.env.MYSQL_ROOT_PASSWORD || 'perfroot';
const MYSQL_CT = 'perf-mysql';
const REDIS_CT = 'perf-redis';
const APP_CT = 'perf-app';

if (!PROFILES[PROFILE]) {
  console.error(`unknown profile: ${PROFILE} (available: ${Object.keys(PROFILES).join(', ')})`);
  process.exit(1);
}

/** docker exec으로 mysql에 SQL을 흘려넣는다. utf8mb4를 명시하지 않으면 한글이 깨진다(실측). */
function mysql(sql) {
  return execFileSync(
    'docker',
    ['exec', '-i', MYSQL_CT, 'mysql', '--default-character-set=utf8mb4',
     '-uroot', `-p${DB_PASS}`, '-N', '-B', DB],
    { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
  ).trim();
}

function step(n, msg) { console.log(`\n[${n}] ${msg}`); }

(async () => {
  console.log(`프로파일: ${PROFILE} → ${BASE}`);
  console.log(`대상 볼륨: perf-mysql-data-${PROFILE} (DATASET_PROFILE로 결정됨)`);

  // ---- 0. 실제 마운트된 볼륨이 이 프로파일 것인지 확인 ----
  //
  // DATASET_PROFILE은 .env.perf 안에 있어 셸 환경에는 없다. 따라서 환경변수를 믿으면
  // 가드가 헛돈다. 지금 떠 있는 컨테이너의 마운트를 직접 조회하는 것이 유일하게
  // 속지 않는 방법이다 — 이 확인이 없으면 medium 데이터를 small 볼륨에 부어버린다.
  const mounted = execFileSync(
    'docker',
    ['inspect', MYSQL_CT,
     '--format', '{{range .Mounts}}{{if eq .Destination "/var/lib/mysql"}}{{.Name}}{{end}}{{end}}'],
    { encoding: 'utf8' }
  ).trim();
  const expected = `perf-mysql-data-${PROFILE}`;

  if (mounted !== expected) {
    console.error(
      `\n✗ 볼륨 불일치 — ${PROFILE} 데이터가 엉뚱한 볼륨에 섞인다.\n` +
      `    실제 마운트: ${mounted}\n` +
      `    기대값     : ${expected}\n\n` +
      `  .env.perf 의 DATASET_PROFILE 을 ${PROFILE} 로 바꾸고 스택을 다시 띄운 뒤 실행할 것:\n` +
      `    docker compose -f environment/docker-compose.perf.yml --env-file environment/.env.perf up -d`
    );
    process.exit(1);
  }
  console.log(`볼륨 확인: ${mounted}`);

  // ---- 1. 앱이 뜰 때까지 대기 ----
  step(1, '앱 health 확인');
  let up = false;
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/actuator/health`);
      if (r.ok) { up = true; break; }
    } catch { /* 아직 안 뜸 */ }
    await new Promise((r) => setTimeout(r, 3000));
  }
  if (!up) {
    console.error(`✗ ${BASE}/actuator/health 가 응답하지 않는다. 스택이 떠 있는지 확인할 것.`);
    process.exit(1);
  }
  console.log('  UP');

  // ---- 1-b. 스키마가 이 볼륨에 실제로 적용됐는지 ----
  //
  // 앱이 UP 이라는 것과 이 볼륨에 마이그레이션이 돌았다는 것은 다르다. 프로파일을 바꿔
  // `docker compose up -d` 를 하면 **MySQL 컨테이너만 재생성되고 앱은 그대로 살아 있다.**
  // Flyway 는 기동 시점에만 도므로 새 빈 볼륨에는 테이블이 하나도 없는데, health 는
  // 200 을 준다. 그 상태로 다음 단계가 `boards` 를 조회하면
  // `Table 'highteenday.boards' doesn't exist` 로 죽는다 — 프로파일 전환 때마다 겪었다.
  //
  // 앱을 무조건 재시작하지 않는 이유: 부팅이 40초 넘게 걸려 평소 실행이 그만큼 느려진다.
  // 스키마가 없을 때만 재시작한다.
  const tableCount = () => Number(mysql(
    `SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='${DB}';`));

  if (tableCount() === 0) {
    console.log('  스키마 없음 — 앱을 재시작해 Flyway 를 이 볼륨에 적용한다');
    execFileSync('docker', ['restart', APP_CT], { stdio: 'ignore' });
    let ready = false;
    for (let i = 0; i < 60; i++) {
      try {
        const r = await fetch(`${BASE}/actuator/health`);
        if (r.ok && tableCount() > 0) { ready = true; break; }
      } catch { /* 부팅 중 */ }
      await new Promise((r) => setTimeout(r, 3000));
    }
    if (!ready) {
      console.error('✗ 재시작 후에도 스키마가 만들어지지 않았다 — 앱 로그를 확인할 것:');
      console.error(`    docker logs ${APP_CT} --tail 50`);
      process.exit(1);
    }
    console.log(`  마이그레이션 적용됨 (테이블 ${tableCount()}개)`);
  }

  // ---- 2. 게시판 (seed.js가 /api/boards를 조회하므로 반드시 선행) ----
  step(2, '게시판 확인/삽입');
  const boardCount = Number(mysql('SELECT COUNT(*) FROM boards;'));
  if (boardCount > 0) {
    console.log(`  이미 ${boardCount}개 존재 — 건너뜀`);
  } else {
    mysql(`INSERT INTO boards (BRD_name, created_at) VALUES
      ('자유게시판', NOW()), ('수능게시판', NOW()), ('이과게시판', NOW()),
      ('문과게시판', NOW()), ('질문게시판', NOW());`);
    console.log('  5개 삽입');
  }

  // ---- 3. daily_hot_post (마이그레이션이 만들지 않는다 — BTL-009) ----
  // 레거시 ddl/V_daily_hot_post.sql은 FK 대상이 `post`로 오타나 있어 그대로 쓰면 실패한다.
  step(3, 'daily_hot_post 테이블 확인/생성');
  mysql(`CREATE TABLE IF NOT EXISTS daily_hot_post (
      DHP_id               BIGINT AUTO_INCREMENT PRIMARY KEY,
      PST_id               BIGINT       NOT NULL,
      DHP_score            DOUBLE       NOT NULL,
      DHP_leaderboard_date DATE         NOT NULL,
      created_at           DATETIME(6)  NOT NULL,
      UPT_Date             DATETIME(6),
      UPT_id               BIGINT,
      is_valid             BOOLEAN      NOT NULL DEFAULT TRUE,
      CONSTRAINT fk_daily_hot_post_pst_v2 FOREIGN KEY (PST_id) REFERENCES posts(PST_id),
      UNIQUE INDEX uk_daily_hot_post_date_post_v2 (DHP_leaderboard_date, PST_id),
      INDEX idx_daily_hot_post_date_created_v2 (DHP_leaderboard_date, created_at DESC)
  );`);
  console.log('  OK');

  // ---- 4. Redis 초기화 (MySQL 볼륨만 분리되므로 캐시는 수동으로 끊어줘야 한다) ----
  step(4, 'Redis FLUSHALL');
  execFileSync('docker', ['exec', REDIS_CT, 'redis-cli', 'FLUSHALL'], { stdio: 'inherit' });

  // ---- 5. 시드 (중복 실행 방지) ----
  step(5, '시드 데이터');
  const postCount = Number(mysql('SELECT COUNT(*) FROM posts;'));
  const spec = PROFILES[PROFILE];

  if (flag('skip-seed')) {
    console.log(`  --skip-seed 지정됨 — 건너뜀 (현재 posts=${postCount})`);
  } else if (postCount > 0 && !flag('force') && !RESUME) {
    console.log(
      `  ✗ 이미 데이터가 있다 (posts=${postCount}, 명세=${spec.posts}).\n` +
      `    seed.js는 계정만 건너뛰고 글/댓글은 매번 새로 만들기 때문에 지금 재실행하면\n` +
      `    데이터셋이 명세를 초과해 재현성이 깨진다.\n` +
      `    - 중단된 생성을 이어서: --resume  (완료된 단계를 건너뛴다)\n` +
      `    - 깨끗한 상태에서 다시 시작: down -v 후 up → 이 스크립트 재실행\n` +
      `    - 의도한 추가 적재라면: --force`
    );
    process.exit(2);
  } else {
    const seedPath = path.join(__dirname, '..', 'datasets', 'seed.js');
    // 시드 정책 옵션을 그대로 넘긴다. 예전에는 인자를 하드코딩해서, 부트스트랩을 거치면
    // `--tolerance`·`--on-failure`·`--resume` 을 줄 방법이 아예 없었다. large 생성이
    // 데드락 1건으로 죽었을 때 허용치를 주려면 seed.js 를 직접 호출하는 수밖에 없었고,
    // 그러면 부트스트랩이 대신 해 주던 것들(게시판 선삽입·Redis flush·중복 적재 방지)을
    // 사람이 다시 챙겨야 한다.
    const seedArgs = [seedPath, '--profile', PROFILE, '--base', BASE, '--concurrency', CONCURRENCY];
    for (const name of ['tolerance', 'on-failure']) {
      const v = arg(name, null);
      if (v != null) seedArgs.push(`--${name}`, v);
    }
    if (RESUME) seedArgs.push('--resume');
    execFileSync(process.execPath, seedArgs, { stdio: 'inherit' });
  }

  // ---- 6. 최종 상태 ----
  step(6, '적재 결과');
  const rows = mysql(
    `SELECT 'users', COUNT(*) FROM users
     UNION ALL SELECT 'posts', COUNT(*) FROM posts
     UNION ALL SELECT 'comments', COUNT(*) FROM comments
     UNION ALL SELECT 'boards', COUNT(*) FROM boards;`
  );
  const actual = Object.fromEntries(rows.split('\n').map((l) => l.split('\t')));
  console.log(`  users    ${actual.users}\t(명세 ${spec.users})`);
  console.log(`  posts    ${actual.posts}\t(명세 ${spec.posts})`);
  console.log(`  comments ${actual.comments}\t(명세 ${spec.comments})`);
  console.log(`  boards   ${actual.boards}`);

  const drift = Number(actual.posts) - spec.posts;
  if (drift > 0) {
    console.log(`\n  ⚠ 글이 명세보다 ${drift}개 많다. 시드 중복 실행이나 이전 k6 쓰기 부하의 잔재다.`);
    console.log('    기준선 측정용이라면 down -v 로 리셋 후 다시 부트스트랩할 것.');
  }
  console.log(`\n완료. k6 실행 시 -e DATASET=${PROFILE} 을 쓸 것.`);
})();
