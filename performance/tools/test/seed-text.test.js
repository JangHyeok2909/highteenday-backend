'use strict';

/**
 * 시더가 만드는 본문의 **길이 분포와 다양성**을 검증한다.
 *
 * 왜 분포를 테스트하는가. 이 값들이 틀리면 부하 테스트는 멀쩡히 통과하면서 결론만
 * 조용히 어긋난다. 실측(2026-09-01): 댓글 40,000건의 서로 다른 본문이 10종, 평균 7.1자
 * 였고, 그래서 댓글 3,903건 응답이 1.41MB 로 나왔다. 그중 본문은 건당 7바이트뿐이고
 * 나머지 354바이트가 JSON 필드 이름과 타임스탬프였다. 그 숫자를 근거로 페이지네이션
 * 필요 여부를 판단하면 실제보다 작게 본다.
 *
 * seed.js 는 `require.main === module` 일 때만 시딩을 시작하므로, 여기서는 서버에 접속하지
 * 않고 생성기만 불러 쓴다. 규칙을 테스트에 복사하지 않는다 — 복사하면 구현과 테스트가
 * 사이좋게 같이 틀린다(sampling.test.js 와 같은 원칙).
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const seed = require('../../datasets/seed.js');

/** n 개를 뽑아 정렬한 길이 배열과 분위수 함수를 준다. */
function lengths(fn, n = 20000) {
  const xs = Array.from({ length: n }, () => fn().length).sort((a, b) => a - b);
  return { xs, q: (p) => xs[Math.floor(xs.length * p)] };
}

test('seed.js 는 require 만으로 시딩을 시작하지 않는다', () => {
  // 이것이 깨지면 테스트가 실제 서버에 붙어 데이터를 만든다.
  assert.equal(typeof seed.commentText, 'function');
  assert.equal(typeof seed.postText, 'function');
});

test('댓글 길이가 목표 분포를 따른다 — 중앙값 15자 / p90 60자', () => {
  const { q } = lengths(seed.commentText);
  assert.ok(q(0.5) >= 10 && q(0.5) <= 22, `중앙값 ${q(0.5)}`);
  assert.ok(q(0.9) >= 45 && q(0.9) <= 75, `p90 ${q(0.9)}`);
});

test('게시글 길이가 목표 분포를 따른다 — 중앙값 200자 / p90 800자', () => {
  const { q } = lengths(seed.postText, 8000);
  assert.ok(q(0.5) >= 150 && q(0.5) <= 260, `중앙값 ${q(0.5)}`);
  assert.ok(q(0.9) >= 600 && q(0.9) <= 1000, `p90 ${q(0.9)}`);
});

test('컬럼 상한을 넘지 않는다 — CMT_content varchar(10000), PST_content TEXT', () => {
  // 넘으면 시딩이 500 으로 죽는데, 그 실패는 단계 끝에서야 집계돼 원인을 찾기 어렵다.
  assert.ok(lengths(seed.commentText).xs.every((x) => x <= 300));
  assert.ok(lengths(seed.postText, 8000).xs.every((x) => x <= 3000));
});

test('빈 본문은 나오지 않는다 — 서버가 @NotBlank 로 거절한다', () => {
  for (let i = 0; i < 5000; i++) {
    assert.ok(seed.commentText().trim().length > 0);
    assert.ok(seed.postText().trim().length > 0);
  }
});

test('본문이 조각 개수보다 훨씬 다양하다', () => {
  // 조각 17종으로 수천 종을 만들어야 검색 코퍼스와 응답 크기가 의미를 갖는다.
  const texts = new Set(Array.from({ length: 20000 }, () => seed.commentText()));
  assert.ok(texts.size > 2000, `서로 다른 댓글 ${texts.size}종`);
  assert.ok(texts.size > seed.COMMENT_PARTS.length * 100);
});

test('같은 조각이 바로 이어 붙지 않는다', () => {
  // "헐 헐 헐 헐" 같은 본문은 다양성을 늘리려는 목적과 어긋난다.
  //
  // 실제 조각에는 공백이 들어 있어서 결과 문자열을 공백으로 쪼개도 조각 경계를 알 수
  // 없다. 그래서 공백 없는 조각만 넣은 풀로 buildText 를 직접 부른다 — 그때는 토큰
  // 하나가 곧 조각 하나다.
  const pool = ['가', '나', '다'];
  for (let i = 0; i < 3000; i++) {
    const tokens = seed.buildText(pool, 15, 60, 300).split(' ');
    for (let j = 1; j < tokens.length; j++) {
      assert.notEqual(tokens[j], tokens[j - 1], `인접 중복: ${tokens.join(' ')}`);
    }
  }
});

test('조각이 하나뿐이면 반복을 허용한다 — 목표 길이를 못 맞추는 것보다 낫다', () => {
  // 대체 조각이 없을 때까지 거르면 본문이 한 조각으로 끝나 길이 분포가 무너진다.
  const out = seed.buildText(['가'], 15, 60, 300);
  assert.ok(out.length > 1, `한 조각만 나왔다: ${out}`);
});

test('targetLength 는 상한을 넘지 않고 하한 아래로도 안 간다', () => {
  for (let i = 0; i < 20000; i++) {
    const n = seed.targetLength(15, 60, 300);
    assert.ok(n >= 2 && n <= 300, `${n}`);
  }
});

test('buildText 는 목표보다 길어지지 않는다 — 잘라내지 않고 맞춘다', () => {
  // 넘긴 뒤 자르면 단어가 중간에서 끊긴다. 맞는 조각만 골라 목표 이하로 유지한다.
  for (let i = 0; i < 3000; i++) {
    assert.ok(seed.buildText(seed.COMMENT_PARTS, 15, 60, 300).length <= 300);
  }
});
