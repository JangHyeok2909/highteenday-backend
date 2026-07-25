# Improvements Log

Running record of production-hardening changes: what changed, why, and what it buys.
Newest entries at the top.

---

## 004 — Make anonymity safe by construction in the DTO layer

**Area:** Security / DDD
**Commit:** `fix: hide author identity in anonymous post and comment DTOs`

### Problem

The platform's core promise is anonymity, but the DTOs that serialize posts and comments
leaked author identity:

`CommentDto.fromEntity` copied the author's **real nickname** and **userId** onto every DTO
regardless of `isAnonymous`:

```java
.userId(comment.getUser().getId())
.author(comment.getUser().getNicknameValue())
.profileUrl(comment.isAnonymous() ? null : comment.getUser().getProfileUrl())  // only this was guarded
```

The comment **list** endpoint happened to be safe only because `CommentAnonymizationService`
overwrote `author` and `userId` *after* conversion. Any other caller got the raw values — and
one existed: `GET /api/posts/{postId}/comments/{commentId}` returned `CommentDto.fromEntity(...)`
directly, with no anonymization and (per `SecurityConfig`'s `GET /**` permitAll rule) **no
authentication**. Anyone could de-anonymize any comment by id.

`PostDto.fromEntity` correctly masked `author` and `userId` for anonymous posts but passed
`profileUrl` through unconditionally. A profile image URL is the same S3 URL shown on the user's
public profile, so it links an "익명" post straight back to a real account.

The architectural fault underneath both: the DTO was **unsafe by default** and safety lived in a
separate collaborator. Any new endpoint that converted an entity leaked by omission.

### Change

Anonymity is now enforced at the conversion boundary, so there is no way to produce an
identity-leaking DTO:

- `CommentDto.fromEntity` — when `isAnonymous`, emits `author="익명"`, `userId=null`,
  `profileUrl=null`.
- `PostDto.fromEntity` — `profileUrl` now follows the same branch as `author` and `userId`.

`CommentAnonymizationService` is unchanged in behaviour: it still assigns the per-thread display
index (`익명1`, `익명(글쓴이)`), but now layers that on top of an already-safe base rather than
being the only thing standing between a real nickname and the wire. `isOwner` is computed from the
entity in the controller, so it is unaffected by the DTO no longer carrying `userId`.

### Verification

`AnonymityLeakTest` (new, 4 cases) asserts that anonymous posts and comments expose none of
`author`, `userId`, `profileUrl`, and that non-anonymous ones still carry all three.
Confirmed non-vacuous: restoring either old conversion fails exactly the two anonymous cases.
`CommentAnonymizationServiceTest` (8 existing cases) still passes unchanged.

Full suite: 202 tests, 0 failures.

---

## 003 — Stop leaking internal exception detail in error responses

**Area:** Security (CWE-209) / Exception Handling / Logging
**Commit:** `fix: stop returning internal exception messages to clients`

### Problem

Every handler in `GlobalExceptionHandler` except `handleCustomException` concatenated the raw
exception message into the response body:

```java
"message", "서버 내부 오류가 발생했습니다." + " message=" + e.getMessage()
```

Framework exception messages are not user-facing text — they carry internals:

| Handler | What the client actually received |
|---|---|
| 409 `DataIntegrityViolationException` | the **full failing INSERT statement**, every column name, and the violated constraint name |
| 500 `Exception` | internal class names and JVM detail — e.g. `class java.lang.Long cannot be cast to class java.lang.Boolean (… loader 'bootstrap')`, which this service really did return to browsers |
| 400 `HttpMessageNotReadableException` | Jackson errors naming internal DTO packages and fields |
| 404 `ResourceNotFoundException` | internal lookup text such as `post does not exist, postId=4821` |

This handed an unauthenticated attacker a free schema-mapping primitive: trigger a duplicate
insert on any endpoint and read back the table's column list.

A second, quieter problem: `handleCustomException` logged `e.getErrorCode().getMessage()` — the
generic enum text — rather than `e.getMessage()`. The whole point of the
`CustomException(ErrorCode, String detail)` constructor is to attach context at the throw site,
and that context was being discarded from the logs entirely.

### Change

- No handler puts an exception message in the response body. Each status returns a fixed,
  user-appropriate Korean string.
- Every error response carries a short `traceId` (8 hex chars), logged alongside the exception.
  This is what replaces the leaked message: a user can quote the id, and support greps for it.
- `handleCustomException` now logs `e.getMessage()`, so throw-site detail reaches the logs.
- `handleConflict` narrowed to `DataIntegrityViolationException` and logs
  `getMostSpecificCause().getMessage()` — the useful root cause rather than the wrapper.
- `MethodArgumentNotValidException` keeps returning per-field messages: those are Bean Validation
  strings we author ourselves for end users, and they disclose nothing.

Response shape is unchanged apart from the added `traceId` — clients already read `code` and
`message`, so no frontend change is required.

### Verification

`GlobalExceptionHandlerTest` (new, 6 cases) asserts the response body of each handler does **not**
contain the leaked fragments (`insert into`, `USR_EMAIL`, `SQL statement`, `java.lang.Long`,
`cannot be cast`, internal package names, `postId=4821`), that `CustomException` still honours its
`ErrorCode` status/code/message contract while keeping throw-site detail out of the response, and
that all seven handlers emit a `traceId`.

Full suite: 198 tests, 0 failures.

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
