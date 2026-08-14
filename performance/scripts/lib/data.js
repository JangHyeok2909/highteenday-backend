/**
 * 시드 데이터 로더 + Zipf 샘플러.
 *
 * datasets/generate.js 가 만들어 둔 JSON을 SharedArray로 로드한다.
 * SharedArray는 VU 간 메모리를 공유하므로 10만 계정을 올려도 힙이 복제되지 않는다.
 */
import { SharedArray } from 'k6/data';
import exec from 'k6/execution';
import { DATASET } from './config.js';
import { hotIndex } from './sampling.js';

// open()의 상대 경로는 이 파일(scripts/lib/) 기준으로 해석된다.
// k6 버전에 따라 메인 스크립트 기준으로 해석되는 경우 -e DATA_ROOT=<절대경로> 로 우회.
const ROOT = __ENV.DATA_ROOT || `../../datasets/generated/${DATASET}`;

export const users = new SharedArray('users', () =>
  JSON.parse(open(`${ROOT}/users.json`)),
);

export const posts = new SharedArray('posts', () =>
  JSON.parse(open(`${ROOT}/posts.json`)),
);

export const boards = new SharedArray('boards', () =>
  JSON.parse(open(`${ROOT}/boards.json`)),
);

/** VU마다 서로 다른 계정을 고정 할당한다 (세션/쿠키 충돌 방지). */
export function myUser() {
  return users[(exec.vu.idInTest - 1) % users.length];
}

/**
 * 인기글 편중 샘플링 — posts.json은 생성 시점에 인기순으로 정렬되어 있다(index 0 = 1위).
 *
 * 분포 규칙 자체는 `./sampling.js`에 있다. 예전에는 이 파일이 `zipfIndex()`를 직접 갖고
 * 있었고 같은 식이 `datasets/seed.js`에도 복제돼 있어서, index 0을 못 뽑는 버그가 부하와
 * 시드 양쪽에 동시에 존재했다(S-03).
 */
export function hotPost() {
  return posts[hotIndex(posts.length)];
}

/** 완전 균등 샘플링 (콜드 데이터 접근 재현: 검색, 옛글 조회) */
export function randomPost() {
  return posts[Math.floor(Math.random() * posts.length)];
}

export function randomBoard() {
  return boards[Math.floor(Math.random() * boards.length)];
}

/**
 * 나 이외의 임의 사용자 (친구 검색어/채팅 상대).
 *
 * 못 찾으면 null 을 준다. 예전처럼 users[0] 으로 떨어뜨리면 실패할수록 특정 한 명에게
 * 요청이 몰려, 데이터에 없던 편중을 스크립트가 만들어 낸다.
 */
export function randomPeer(me) {
  for (let i = 0; i < 20; i++) {
    const u = users[Math.floor(Math.random() * users.length)];
    if (u.email !== me.email) return u;
  }
  return null;
}
