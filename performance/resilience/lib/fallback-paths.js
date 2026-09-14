'use strict';
/**
 * Redis 폴백이 걸린 **사용자 경로** 카탈로그.
 *
 * 왜 필요한가
 * -----------
 * 폴백 계측은 두 갈래로 들어온다. 앱은 `redis_fallback_total{method}` 로 **자바 메서드 이름**
 * 을 내고, 부하는 `checks{check}` 로 **검사 이름**을 낸다. 둘을 나란히 놓아도 독자가 코드를
 * 알아야 "RedisHotPostRanking.topPostIds 가 hot_daily_nonempty 와 같은 경로다"를 연결할 수
 * 있다. 그 연결을 여기에 한 번 적어 두고 보고서가 한 줄로 읽히게 만든다.
 *
 * 통과 여부보다 중요한 것
 * -----------------------
 * 폴백이 "동작했다"와 "손실이 없었다"는 다르다. 게시글 상세가 그 예다. Redis 가 죽으면
 * `tryMarkViewed` 가 false 를 돌려주고, 그러면 `ViewCountService.increaseViewCount` 는
 * `incrementCount` 를 아예 부르지 않는다. 응답 본문은 DB 에서 다 채워져 나가므로 내용 검사는
 * 통과하는데 **조회수 증가는 사라진다.** `costs` 와 `lossShownBy` 가 그 차이를 적어 둔다.
 *
 * `redisMethods` 가 빈 배열인 경로는 대조군이다. Redis 를 안 쓰는데도 fault 구간이 나빠지면
 * 폭발 반경이 Redis 경계를 넘은 것이고, 경로는 스레드·커넥션 같은 공유 자원이다.
 *
 * 값을 고칠 때
 * ------------
 * `check` 는 scripts/ 의 `contentCheck()` 호출부와, `feature` 는 `tags()` 의 첫 인자와,
 * `redisMethods` 는 앱이 실제로 내는 태그 값과 같아야 한다. 앱 태그 값은 이렇게 확인한다.
 *   curl -s localhost:18080/actuator/prometheus | grep redis_fallback_total
 */

const PATHS = [
  {
    id: 'hot',
    label: '인기글',
    endpoint: 'GET /api/hotposts/daily',
    feature: 'hot',
    check: 'hot_daily_nonempty',
    redisMethods: ['RedisHotPostRanking.topPostIds'],
    fallback: 'ZSET 조회가 실패하면 빈 Set 이 되고, 호출자가 DailyHotPost 테이블을 대신 읽는다',
    costs: '랭킹이 스케줄러가 마지막으로 DB 에 동기화한 시점의 것이 된다 — 그 뒤의 조회수·반응은 순위에 안 들어간다',
    lossShownBy: null,
  },
  {
    id: 'post-list',
    label: '게시글 목록',
    endpoint: 'GET /api/boards/{id}/posts',
    feature: 'post',
    check: 'post_list_nonempty',
    redisMethods: ['RedisPostsCache.getPostPrevs'],
    fallback: '예외를 잡아 postRepository.findByBoard 로 같은 목록을 DB 에서 직접 읽는다',
    costs: '데이터는 같다. 캐시가 흡수하던 쿼리가 전부 DB 로 가므로 MySQL 부하가 오른다',
    lossShownBy: null,
  },
  {
    id: 'post-detail',
    label: '게시글 상세',
    endpoint: 'GET /api/posts/{id}',
    feature: 'post',
    check: 'post_detail_has_id',
    redisMethods: ['RedisViewCountStore.tryMarkViewed', 'RedisViewCountStore.incrementCount'],
    fallback: 'tryMarkViewed 가 false 를 돌려주고, 그러면 incrementCount 를 부르지 않는다. 본문은 DB 에서 채워 내보낸다',
    costs: '조회수 증가가 사라진다',
    lossShownBy: 'viewcount-conservation',
  },
  {
    id: 'board-list',
    label: '게시판 목록 (대조군)',
    endpoint: 'GET /api/boards',
    feature: 'board',
    check: 'board_list_nonempty',
    redisMethods: [],
    fallback: 'Redis 를 쓰지 않는다 — BoardService.findAll 이 DB 를 바로 읽는다',
    costs: '없다. 이 행이 나빠지면 폭발 반경이 Redis 경계를 넘은 것이고, 경로는 공유 자원(스레드·커넥션)이다',
    lossShownBy: null,
  },
];

module.exports = { PATHS };
