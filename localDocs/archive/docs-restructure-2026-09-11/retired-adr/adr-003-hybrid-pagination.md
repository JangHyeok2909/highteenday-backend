# ADR-003. 게시글 목록은 커서+오프셋 하이브리드 페이징을 쓴다

상태: 소급 채록 (결정 당시 기록이 아니라 README·코드에서 재구성) — 마지막 검증일: 2026-09-07

## 배경

OFFSET 페이징은 뒤 페이지로 갈수록 앞의 모든 행을 스캔 후 버리므로 대용량에서 급격히 느려진다. 10만 건 데이터 기준 README가 보고하는 개선치: avg 42ms → 11ms (커서 적용 시). 그러나 UI는 "특정 페이지로 점프"도 지원해야 해서 커서만으로는 요구를 다 못 채웠다.

## 검토한 대안

- 순수 OFFSET: 페이지 점프 가능, 뒤 페이지 성능 파탄 (README 2-2: 인덱스 없던 시절 avg 15s+).
- 순수 커서: 이전/다음만 가능, 페이지 점프 불가.
- 하이브리드: 이전/다음 이동(정렬이 최신순일 때)은 커서, 랜덤 페이지 점프·기타 정렬은 OFFSET — 채택 (README 3번 "커서, 그 외에는 오프셋 방식을 혼합").

## 결정

`PostRepositoryCustomImpl.findByBoard()`가 요청 DTO를 보고 실행 시점에 분기한다:

- 커서 경로: `sortType == RECENT && !randomPage && lastSeedId != null`일 때만 — `post.id.lt(lastSeedId)` 조건을 걸고 offset을 쓰지 않는다 (id는 단조 증가라 최신순 커서로 사용 가능).
- 오프셋 경로: 그 외 전부 — `page * size` offset.
- 두 경로 모두 복합 인덱스(`idx_posts_brd_valid_id` 등, `domain/posts/Post.java · @Table(indexes)`)를 타도록 (BRD_id, is_valid, 정렬 컬럼) 순서로 설계됐다.

앞쪽 페이지(0~4, 최신순)는 아예 이 쿼리에 오지 않고 Redis 캐시가 처리한다 (`services/domain/PostService.java · getPagedPosts()`).

## 결과·트레이드오프

- 얻은 것: 이전/다음 탐색(대부분의 트래픽)은 커서로 상수 성능, UI의 페이지 점프도 유지.
- 남은 한계 (README "한계" 서술 그대로 유효): 뒤쪽 페이지로의 OFFSET 요청은 여전히 수만~수십만 건을 스캔한다. 실제 사용자가 그런 요청을 할 가능성은 낮다고 보고 유지 중이지만, 악의적 트래픽이 큰 page 값을 반복 요청하면 심각한 성능 문제가 될 수 있다 — 코드에 page 상한 방어는 없다 (`findByBoard()`에 제한 없음) `[미확인: 컨트롤러·DTO 검증 계층의 상한 존재 여부는 전수 확인하지 않음]`.
- 좋아요순/조회순 정렬은 항상 OFFSET이다 — 커서 조건이 RECENT에만 걸려 있다.
- 페이지별 커서를 서버가 기억하는 방식은 구현하지 않았다. 실행 경로가 없던 미완성
  `CursorCacheService` 자리표시자는 제거했다.

## 근거 좌표

| 근거 | 위치 |
|---|---|
| 커서/오프셋 분기 | `domain/posts/queryDsl/PostRepositoryCustomImpl.java · findByBoard(PostListingDto)` |
| 정렬 분기 | 같은 파일 `getOrderSec()` |
| 분기 입력 (lastSeedId, randomPage) | `dtos/paged/PostListingDto.java` |
| 인덱스 정의 | `domain/posts/Post.java · @Table(indexes)` |
| 개선 서사·수치·한계 | `README.md · "3. 커서 기반 페이징"` |
| 미완성 커서 캐시 | 구현하지 않음. 과거의 빈 자리표시자는 제거했다. |
