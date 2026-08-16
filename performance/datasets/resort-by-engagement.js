#!/usr/bin/env node
/**
 * `posts.json` 을 **실측 참여도 순**으로 다시 정렬한다.
 *
 * 왜 필요한가
 * -----------
 * `posts.json` 의 순서는 계약이다 — k6 의 `hotPost()` 가 index 0 을 가장 자주 뽑으므로,
 * index 0 은 실제로 가장 무거운 글이어야 한다. 그게 아니면 "인기글 조회"라는 이름으로
 * 가벼운 글을 치게 되고, 핫로우·캐시 실험의 전제가 무너진다(S-03 이 정확히 그 사고였다).
 *
 * 시더는 이 순서를 **생성 랭크**로 만든다. 참여 데이터를 붙일 때 쓴 배열 인덱스가 곧
 * 랭크이므로 자기완결적이다. 그런데 그 연결이 끊기는 경로가 있다:
 *
 *   - 체크포인트를 DB 에서 손으로 재구성할 때 `ORDER BY PST_id` 로 뽑는 경우.
 *     ID 는 10개 레인의 **완료 순**이고 랭크는 **작업 순**이라 머리 부분이 국소적으로
 *     뒤섞인다. 실측(2026-08-16 large): posts.json[0] 의 참여도가 17,384 인데 실제 1위는
 *     45,075 였다. 전체 분포는 멱법칙 그대로였고 어긋남은 머리 안에서의 뒤섞임이었다.
 *
 * 이 스크립트는 **DB 의 실측 참여도**로 순서를 다시 매겨 그 계약을 복구한다. 생성 랭크라는
 * 간접 지표 대신 측정된 사실을 쓰므로, 복구 후에는 `verify.sh` 의 ④ 검증이 정의상 통과한다.
 *
 * 무엇을 바꾸고 무엇을 안 바꾸나
 * ------------------------------
 *   바꾼다     posts.json 의 **순서만**. 항목(id·boardId)은 그대로다.
 *   안 바꾼다  DB, users.json, boards.json, 데이터셋 지문.
 *
 * 지문이 그대로인 이유: 지문은 생성 규칙·파라미터·단계별 생성 수를 해싱한 값이고, 순서는
 * 거기 들어가지 않는다. 같은 데이터를 어떤 순서로 나열하든 **같은 데이터셋**이다. 다만
 * 후처리했다는 사실 자체는 보이지 않으면 안 되므로 meta.json 에 기록을 남긴다.
 *
 * 사용법: node datasets/resort-by-engagement.js <profile>
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PROFILE = process.argv[2];
if (!PROFILE) {
  console.error('사용법: node datasets/resort-by-engagement.js <profile>');
  process.exit(2);
}

const OUT_DIR = path.join(__dirname, 'generated', PROFILE);
const POSTS_FILE = path.join(OUT_DIR, 'posts.json');
const META_FILE = path.join(OUT_DIR, 'meta.json');

if (!fs.existsSync(POSTS_FILE)) {
  console.error(`${POSTS_FILE} 이 없다 — 시드를 먼저 완료할 것`);
  process.exit(2);
}

const CT = 'perf-mysql';
const DB = process.env.MYSQL_DATABASE || 'highteenday';
const PW = process.env.MYSQL_ROOT_PASSWORD || 'perfroot';

/**
 * 참여도 = 댓글 + 좋아요 + 싫어요 + 스크랩.
 *
 * 비정규화 카운터를 쓰는 이유는 관계 테이블을 세 번 조인하는 것보다 훨씬 싸기 때문이다.
 * 카운터가 실제 행 수와 일치한다는 것은 `verify.sh` 의 ② 가 따로 검증한다 — 그쪽이
 * 통과하지 않은 상태에서 이걸 돌리면 틀린 순서가 나온다.
 */
const rows = execFileSync('docker', [
  'exec', CT, 'mysql', '-uroot', `-p${PW}`, DB, '-N', '-B', '-e',
  `SELECT PST_id, (PST_comment_count + PST_like_count + PST_dislike_count + PST_scrap_count)
   FROM posts WHERE is_valid = 1;`,
], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
  .split('\n')
  .filter((l) => l && !/^Warning/i.test(l));

const engagement = new Map();
for (const line of rows) {
  const [id, e] = line.split('\t');
  engagement.set(Number(id), Number(e));
}

const posts = JSON.parse(fs.readFileSync(POSTS_FILE, 'utf8'));
const before = posts.slice(0, 3).map((p) => p.id);

const missing = posts.filter((p) => !engagement.has(p.id));
if (missing.length) {
  // JSON 에는 있는데 DB 에 없는 ID — 데이터셋이 DB 와 어긋났다는 뜻이라 정렬로 덮으면 안 된다.
  console.error(`posts.json 의 ${missing.length}건이 DB 에 없다 (예: ${missing.slice(0, 3).map((p) => p.id).join(', ')})`);
  console.error('  데이터셋과 DB 가 다른 세대다 — 정렬이 아니라 재생성이 필요하다.');
  process.exit(1);
}

// 참여도 내림차순. 동률은 ID 오름차순으로 고정해 실행할 때마다 순서가 흔들리지 않게 한다.
posts.sort((a, b) => (engagement.get(b.id) - engagement.get(a.id)) || (a.id - b.id));

fs.writeFileSync(POSTS_FILE, JSON.stringify(posts.map((p) => ({ id: p.id, boardId: p.boardId })), null, 1));

// 후처리 사실을 남긴다. 지문은 바뀌지 않지만, 나중에 "이 데이터셋만 왜 순서가 다른가"를
// 물었을 때 답할 수 있어야 한다.
if (fs.existsSync(META_FILE)) {
  const meta = JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
  meta.postProcessed = meta.postProcessed || [];
  meta.postProcessed.push({
    step: 'resort-by-engagement',
    at: new Date().toISOString(),
    reason: 'posts.json 순서가 생성 랭크와 어긋나 index 0 이 최고 참여글이 아니었다',
    before, after: posts.slice(0, 3).map((p) => p.id),
  });
  fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 1));
}

const top = posts.slice(0, 5).map((p) => `${p.id}(${engagement.get(p.id)})`);
console.log(`정렬 완료: ${posts.length}건`);
console.log(`  이전 앞 3건: ${before.join(', ')}`);
console.log(`  이후 앞 5건: ${top.join(', ')}`);
console.log('  meta.json 에 후처리 기록을 남겼다 (지문은 그대로 — 순서는 지문 입력이 아니다).');
