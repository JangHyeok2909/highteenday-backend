# Improvements Log

Running record of production-hardening changes: what changed, why, and what it buys.
Newest entries at the top.

---

## 001 — Remove N+1 from the comment list endpoint

**Area:** Performance / Query Optimization
**Commit:** `perf: remove N+1 queries from comment list rendering`

### Problem

`GET /api/posts/{postId}/comments` issued a query count that grew linearly with the
number of comments on a post. For a post with `N` comments written by `D` distinct
authors, rendering the response cost:

| Source | Queries |
|---|---|
| `CommentRepository.findByPost` | 1 |
| `CommentDto.fromEntity` → `comment.getUser()` lazy load | `D` |
| `CommentDto.fromEntity` → `comment.getPost().getTitle()` lazy load | 1 |
| `CommentReactionService.getLikeSatateDto` per comment (`existsBy…LIKE` + `existsBy…DISLIKE`) | `2N` |

A post with 200 comments from 50 distinct authors therefore executed **~452 queries**
on a single page view. The lazy loads only worked at all because `spring.jpa.open-in-view`
is left at its default (`true`) — the controller dereferences associations outside any
service transaction.

The same `fromEntity` cost applied to `GET /api/mypage/comments`, which paged over a
user's own comments and lazy-loaded each comment's parent post individually.

### Change

1. `CommentRepository.findByPost` — added `join fetch c.user join fetch c.post`.
   `CommentDto.fromEntity` unconditionally dereferences both, so fetching them lazily
   was never an optimization.
2. `CommentRepository.findByUser` — same fetch joins, with an explicit `countQuery`
   (Spring Data cannot derive a count query from a `join fetch`).
3. `CommentReactionRepository.findActiveByUserAndCommentIds` — new batch lookup of the
   viewer's active reactions across a whole comment list.
4. `CommentReactionService.getLikeStates(List<Comment>, User)` — resolves the viewer's
   like/dislike state for every comment in the list with one query, returning a
   `Map<commentId, LikeStateDto>`. The existing per-comment `getLikeSatateDto` is kept
   for single-comment call sites (reaction write endpoints).
5. `CommentController.getComments` — consumes the batch map instead of calling the
   per-comment method inside the loop.

The `(CMT_id, USR_id)` unique constraint on `comments_reactions` guarantees at most one
active reaction per (comment, viewer) pair, so the batch result collapses to a map
without ambiguity, and `CMT_id IN (…) AND USR_id = ?` is served by that same index.

### Result

Comment list rendering now runs in **exactly 2 queries regardless of comment count** —
one for the comment list, one for the viewer's reactions.

### Verification

`CommentListQueryCountTest` (`@DataJpaTest`, Hibernate `generate_statistics`) asserts:

- query count for 33 comments equals query count for 3 comments,
- the rendering path executes exactly 2 statements,
- batch-resolved reaction state matches the per-comment lookup it replaces.

The test was confirmed non-vacuous: reverting the fetch joins fails 2 of the 3 cases.
Full suite: 184 tests, 0 failures.
