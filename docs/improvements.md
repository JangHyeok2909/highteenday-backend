# Improvements Log

Running record of production-hardening changes: what changed, why, and what it buys.
Newest entries at the top.

---

## 002 — Enforce author-only mutation on posts and comments

**Area:** Security (OWASP A01 — Broken Access Control)
**Commit:** `fix: reject post and comment mutations by non-authors`

### Problem

Four mutating endpoints accepted the caller's identity but never checked it against the
resource owner:

| Endpoint | Effect |
|---|---|
| `PATCH /api/posts/{postId}` | any logged-in user could rewrite any post's title and body |
| `DELETE /api/posts/{postId}` | any logged-in user could soft-delete any post |
| `PATCH /api/posts/{postId}/comments/{commentId}` | any logged-in user could rewrite any comment |
| `DELETE /api/posts/{postId}/comments/{commentId}` | any logged-in user could delete any comment |

Both controllers passed `user.getId()` into the service, which looked authorization-aware,
but the services used that id **only** to populate the `UPT_id` audit column:

```java
Post post = findById(postId);   // no ownership check
post.delete();
post.setUpdatedBy(userId);      // userId used for audit only
```

Authentication was enforced (a valid JWT cookie is required), so this was not anonymous
access — but every authenticated account, including freshly self-registered ones, could
mutate every other user's content by guessing sequential ids. On a platform whose content
is attributed by anonymity index rather than a visible username, silent edits to another
student's comment are effectively unattributable impersonation, and the audit column would
record the attacker as the legitimate editor.

The timetable and notification domains already validated ownership; posts and comments —
the primary content of the service — did not.

### Change

Ownership is enforced in the service layer (per the repository's rule that controllers hold
no business logic), so every caller of these methods is covered rather than only the current
HTTP entry points:

- `PostService.verifyAuthor(Post, Long)` — called at the top of `updatePost` and `deletePost`
- `CommentService.verifyAuthor(Comment, Long)` — called at the top of `updateComment` and `deleteComment`

Both throw `CustomException(ErrorCode.NO_ACCESS)` → **403 Forbidden**, and log the rejected
attempt at `WARN` with the resource id and requester id so the attempt is greppable.

Checks run **before** any state change or side effect, so a rejected request touches neither
the entity, the S3 media pipeline, nor the Redis post-preview cache.

Anonymous posts are not special-cased: authorship is tracked by `USR_id` regardless of the
`isAnonymous` flag, so the same check applies.

### Scope note

`Role.ADMIN` exists in the enum but no moderation endpoint uses it, so no admin bypass was
added. If moderation is built later, that is the place to widen the rule — deliberately not
pre-built here.

### Verification

- `CommentServiceTest` (new) — 4 cases: author can update/delete; a stranger is rejected with
  `NO_ACCESS` and the comment content, `is_valid` flag, and the post's `commentCount` are all
  unchanged.
- `PostServiceTest.AuthorOnlyMutation` (new) — 4 cases: author can update/delete; a stranger is
  rejected and the title, `is_valid` flag are unchanged, with `verifyNoInteractions` asserting
  the media pipeline and preview cache were never touched.

Confirmed non-vacuous: removing the two `verifyAuthor` calls fails exactly the 4 attacker-path
cases. Full suite: 192 tests, 0 failures.

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
