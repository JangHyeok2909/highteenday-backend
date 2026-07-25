# Improvements Log

Running record of production-hardening changes: what changed, why, and what it buys.
Newest entries at the top.

---

## 010 — Make comment and scrap counters concurrency-safe

**Area:** Transaction / Concurrency
**Commit:** `fix: increment comment count in SQL and lock before scrap recount`

### Problem

Two counters were still maintained with an unguarded read-modify-write, the last of the family
started in 007 and 009.

**`comment_count`** was adjusted purely in memory:

```java
post.incrementCommentCount();   // this.commentCount++ on a managed entity
```

Two users commenting on the same post both read 40, both write 41. One comment is invisible to the
counter forever. `@DynamicUpdate` (improvement 009) narrows the statement to
`SET comment_count = 41` but does not make it correct — it is still a blind write of a stale read.

**`scrap_count`** used the same recount-then-assign shape as the reaction counters
(`post.syncScrapCount(count(...))`), so it had the exact defect fixed in 007 but was missed there
because it lives in `ScrapService`.

### Change

The two counters call for different tools, because they are different shapes:

- **`comment_count` — atomic SQL.** New `PostRepository.incrementCommentCount` /
  `decrementCommentCount` are `@Modifying` updates that reference the column on both sides
  (`set p.commentCount = p.commentCount + 1`), so the database performs the arithmetic under its
  own row lock inside one statement. `decrementCommentCount` keeps the existing floor via
  `case when p.commentCount > 0 …`, preserving the old `decrementCommentCount()` guard. This is
  O(1) and takes no application-held lock, so comment writes are not serialized per post.
- **`scrap_count` — pessimistic lock.** The toggle recounts from the scraps table, so it needs the
  same `findByIdForUpdate` treatment as reactions: the lock is taken before the recount and held to
  commit, which makes the recount see concurrent commits.

`CommentService` now takes `PostRepository`. The bulk update does not refresh the managed `Post`
instance, which is documented on the repository methods; neither call site reads the count
afterwards, and `createComment` returns only a `Location` header.

Counter integrity is now complete across all five denormalized columns on `Post`:

| Column | Shape | Protection |
|---|---|---|
| `like_count`, `dislike_count` | recount | row lock (007) |
| `scrap_count` | recount | row lock (010) |
| `comment_count` | delta | atomic SQL (010) |
| `view_count` | batch delta | single scheduler + `@DynamicUpdate` (009) |

### Verification

- `CommentCountAtomicityTest` (new, `@DataJpaTest`, 3 cases) — five increments really accumulate to
  5 against H2, decrement floors at 0, and both `@Query` strings are asserted to be
  self-referential (`p.commentCount = … p.commentCount`), which is the property that makes them
  atomic.
- `CommentServiceTest` — the delete case now asserts `decrementCommentCount(POST_ID)` is invoked
  rather than checking an in-memory field, and the rejected-stranger case asserts it is never
  invoked.
- `ScrapServiceTest` — stubs the lock query, so the lock is now part of the expected call sequence.

Confirmed non-vacuous: rewriting the increment as `set p.commentCount = 1` fails 2 of the 3
atomicity cases.

Full suite: 281 tests, 0 failures.

---

## 009 — Stop full-row updates from clobbering concurrent counter writes

**Area:** Transaction / Query Optimization
**Commit:** `fix: update only dirty columns on Post and Comment`

### Problem

Neither `Post` nor `Comment` declared `@DynamicUpdate`, so Hibernate emitted a **full-row**
`UPDATE` whenever the entity became dirty for any reason — every column, including the ones the
transaction never touched.

`Post` carries five independently-maintained denormalized counters (`view_count`, `like_count`,
`dislike_count`, `comment_count`, `scrap_count`), each written by a different code path in a
different transaction. A full-row write turns any one of them into a blind overwrite of the other
four with whatever values were present at load time:

```
T1  ViewCountScheduler loads post   (comment_count = 40)
T2  a user posts a comment          → comment_count = 41, commits
T1  post.addViewCount(12); flush    → UPDATE posts SET view_count=…, comment_count=40, …
                                       T2's comment is erased from the counter
```

The row lock added in improvement 007 does not help here: the scheduler and the comment path
never take it, and they are not even writing the same logical field. Every batch view-count sync —
which runs on a timer across every post that was viewed — was a chance to roll back any counter
change committed since the scheduler read the row. The same applies to `Comment`, where editing
the body rewrites `like_count` / `dislike_count`.

### Change

Annotated both entities with `@DynamicUpdate`. Hibernate now writes only the columns that actually
changed, so the view-count batch emits `UPDATE posts SET view_count = ? WHERE PST_id = ?` and
leaves every other counter alone. Writes also get narrower, which reduces row-lock footprint and
binlog volume on the busiest write path in the service.

The cost is that Hibernate can no longer cache one prepared `UPDATE` per entity and instead
generates one per dirty-column combination. For a 13-column table with a handful of distinct
update paths that is a good trade for correctness.

This is the systemic half of the counter-integrity work: 007 made a single counter's
read-modify-write atomic, 009 stops *unrelated* writes from undoing it.

### Verification

`DenormalizedCounterMappingTest` (new, 2 cases) asserts both entities carry `@DynamicUpdate`, with
failure messages naming the concrete corruption each one prevents. The annotation is trivially
removable, so pinning it in a test is what keeps it from being dropped during a future refactor.

Full suite: 278 tests, 0 failures.

---

## 008 — Stop writing student email addresses into production logs

**Area:** Security / Logging
**Commit:** `fix: mask personal data in log statements`

### Problem

Production runs at `logging.level.root=INFO`, and several statements at INFO/WARN wrote raw
personal data of minors into the application log:

| Site | Level | Logged |
|---|---|---|
| `UserService.register` | INFO | full email **and** nickname, on every signup |
| `UserService.registerOAuthUser` | INFO | full email, on every OAuth auto-registration |
| `CustomOAuth2UserService.loadUser` | INFO | full email, on every new OAuth user |
| `TokenService` (3 sites) | WARN | full email, whenever Redis is unavailable |
| `UserController.login`, `CustomOAuth2UserService` | DEBUG | full email (dev only) |

These logs go to the container's stdout and on to the platform's log store, where they are
retained far longer than the data-minimisation rationale for collecting an email in the first
place, and are readable by anyone with log access rather than by anyone with database access.
A Redis outage was enough to dump one email per token operation at WARN.

This also directly violated the repository's own stated rule: *"Never log sensitive fields
(passwords, tokens, PII)."*

### Change

- New `Utils/LogMasker` — `maskEmail` keeps the first two characters of the local part
  (`wkdgur752500@gmail.com` → `wk***@gmail.com`), `maskNickname` keeps the first character.
  Masking is deterministic, so entries for the same user still correlate across a log file, but
  the log alone no longer identifies an account.
- All nine sites now log either the masked value or, where the entity is already loaded, the
  `userId` — which is the better identifier anyway because it joins to the database.
  `TokenService` switched to `userId` at all three sites; `CustomOAuth2UserService`'s login-success
  line moved below the lookup so it can log `userId` instead of the address.
- The registration line dropped the nickname entirely: it added nothing to diagnosis that the
  masked email did not.

### Verification

- `LogMaskerTest` (new, 16 cases) — masking shape for typical/short/malformed input, and an
  explicit assertion that the full local part cannot be reconstructed from the output.
- `PiiLoggingGuardTest` (new) — walks every `.java` file under `src/main/java`, finds each
  `log.*(…)` call, and fails the build if an argument matches `…email()`, `getEmailValue()`,
  `…phone()`, `getNicknameValue()`, `getRawPassword()`, or a raw token variable, unless the
  argument list goes through `LogMasker`. This makes the rule enforceable at build time rather
  than at review time — the failure names the file and line.

Confirmed non-vacuous: restoring the raw email in `UserService.register` fails the guard with
`UserService.java:101` in the message.

Full suite: 276 tests, 0 failures.

---

## 007 — Fix lost updates in reaction counter recalculation

**Area:** Transaction / Concurrency
**Commit:** `fix: lock the target row before recounting reactions`

### Problem

`PostReactionService.syncCounts` (and its comment twin) maintains the denormalized
`PST_like_count` / `PST_dislike_count` columns by recounting from the reactions table and
assigning the result to the entity:

```java
int likes = postReactionRepository.countByPostAndKindAndIsValidTrue(post, LIKE);
post.syncReactionCounts(likes, dislikes);
```

That is a read-modify-write with no lock. Under `READ COMMITTED`, two users liking the same post
concurrently interleave as:

| | T1 | T2 |
|---|---|---|
| 1 | `INSERT` reaction A | |
| 2 | | `INSERT` reaction B |
| 3 | `COUNT` → 10 (B uncommitted, invisible) | |
| 4 | | `COUNT` → 10 (A uncommitted, invisible) |
| 5 | `UPDATE posts SET like_count = 10` | |
| 6 | | `UPDATE posts SET like_count = 10` |

Two reactions were inserted; the counter advanced by one. The displayed count drifts permanently
**below** the true value, and every subsequent concurrent pair widens the gap.

This was a known-suspected defect: the repository already ships `PostConsistencyController` /
`PostConsistencyService` (`@Profile("!prod")`), which compares the denormalized counters against
`COUNT(*)` on the reactions table and reports a `drift` flag, called from a k6 load-test teardown.
The detector existed; the cause was never fixed.

### Change

- `PostRepository.findByIdForUpdate` and `CommentRepository.findByIdForUpdate` — new queries
  annotated `@Lock(LockModeType.PESSIMISTIC_WRITE)`, i.e. `SELECT … FOR UPDATE`.
- `likeReact` / `dislikeReact` in both reaction services take that lock as their **first**
  statement. The lock is held until commit, so a second transaction on the same post blocks until
  the first commits — and its recount therefore sees the first transaction's row.
- Both services switched from `jakarta.transaction.Transactional` to Spring's annotation, matching
  the convention used everywhere else in `services/`.
- Added covering index `(PST_id, PST_RCT_kind, is_valid)` on `posts_reactions` and the equivalent
  on `comments_reactions`. Only `uk_*_reactions_*_usr (id, USR_id)` existed, so the recount had to
  scan every reaction on the row and filter. Since prod runs `ddl-auto=none`, the `@Index`
  declarations are accompanied by `src/main/resources/ddl/V_reaction_count_indexes.sql` to be
  applied manually before deploy.

Serialization is per-row, not global: concurrent reactions on *different* posts are unaffected.

### Known remaining cost

The recount is still O(reactions on that post) per click. It is self-healing, which is why it was
kept, but a post with 10k reactions pays a 10k-entry index scan on every button press. The next
step is an atomic `like_count = like_count + delta` update with the recount demoted to a periodic
repair job. Deliberately not done here: it changes the counter's semantics from authoritative to
incremental and deserves its own change.

`PostReactionService.getLikeSatateDto` never populates `dislikeCount` (always 0). It is unused by
the current controller, which builds its own DTO, so it was left alone rather than fixed
speculatively.

### Verification

- `ReactionCountLockingTest` (new, 2 cases) — reflects over both repositories and asserts the
  locking query is annotated `PESSIMISTIC_WRITE`, so weakening it to a read lock fails the build.
- `PostReactionServiceTest` / `CommentReactionServiceTest` (+4 cases) — `InOrder` verification that
  the lock is acquired **before** the first `COUNT`, plus that a vanished row fails at the lock step
  without writing a reaction.

Confirmed non-vacuous: removing the two lock calls fails exactly those 4 cases.

The concurrency property itself is pinned structurally (lock mode + ordering) rather than by a
racing test — a two-thread test against H2 would be timing-dependent and is not worth the flake.

Full suite: 259 tests, 0 failures.

---

## 006 — Fix real nickname leak in the cached post-list projection

**Area:** Security
**Commit:** `fix: use denormalized nickname in post preview projection`

### Problem

`PostRepository.findAllDtoByIds` built its preview DTO by joining to the author:

```java
SELECT new PostPreviewDto(p.id, p.board.id, p.user.nickname.value, p.title, …)
```

`p.user.nickname.value` is the author's **real** nickname, copied in unconditionally. This query
is the cache-miss refill path in `RedisPostsCache` (line 76): whenever a board list page missed
Redis, the rebuilt entries carried the real nickname of every anonymous post's author.

The two sibling paths that produce the same DTO both get it right —
`PostPreviewDto.fromEntity` masks to `"익명"`, and the QueryDSL `findByBoard` selects
`post.nickname` — so the leak appeared only on the cache-miss branch, which is exactly the branch
least likely to be hit while clicking around in development.

This is improvement 004's failure mode reappearing one layer down: identity masking implemented
per call site rather than at the boundary, so one of the three call sites was wrong.

### Change

The projection now reads `p.nickname` — the denormalized `USR_nickname` column that `Post.create`
already populates with `"익명"` for anonymous posts and the author's nickname otherwise. This is
the same column the QueryDSL list query uses, so all three paths now agree by construction.

Side benefit: the query no longer joins `users` at all.

### Verification

`PostPreviewProjectionTest` (new, `@DataJpaTest`, 3 cases) asserts an anonymous post's preview
never carries the real nickname, a named post's preview keeps it, and the projection agrees with
`PostPreviewDto.fromEntity` for both. Confirmed non-vacuous: restoring `p.user.nickname.value`
fails 2 of the 3 cases.

Full suite: 253 tests, 0 failures.

---

## 005 — Make the security filter chain deny-by-default

**Area:** Security / Architecture
**Commit:** `refactor: make security rules deny-by-default with an explicit allowlist`

### Problem

`SecurityConfig` authorised reads with a blanket rule:

```java
.requestMatchers(HttpMethod.GET, "/**").permitAll()
.anyRequest().authenticated()
```

Every GET was public unless a path happened to appear in an `authenticated()` matcher declared
above it. That is fail-open: protection depended on someone remembering to add each new read
endpoint to a list, and the consequence of forgetting was silent public exposure rather than a
visible 401.

It had already gone wrong twice:

- `GET /api/friends/list`, `/api/friends/requests/sent`, `/api/friends/requests/received` were
  never added to the authenticated list, so they were reachable unauthenticated. They survived
  only by accident — `@AuthenticationPrincipal` resolved to `null` and the controller threw an
  NPE, returning **500 instead of 401**.
- `GET /api/posts/{postId}/comments/{commentId}` (improvement 004) was publicly reachable for the
  same reason, and it *did* return private data.

The `/**` rule also meant that adding a controller was enough to publish it. That is the wrong
default for a service holding minors' school, timetable, and social-graph data.

### Change

Inverted the policy. The chain now permits only what is explicitly listed and requires
authentication for everything else:

```java
.requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
.requestMatchers(PublicEndpoints.PUBLIC_ANY).permitAll()
.requestMatchers(HttpMethod.GET,  PublicEndpoints.PUBLIC_GET).permitAll()
.requestMatchers(HttpMethod.POST, PublicEndpoints.PUBLIC_POST).permitAll()
.anyRequest().authenticated()
```

The allowlist moved into `PublicEndpoints`, a small constants class, so the public surface of the
API is one readable, reviewable, testable list rather than an ordering-sensitive builder chain.
It covers: community reads (boards, posts, search, comments, hot posts, school search), the
signup duplicate-check endpoints, the authentication entry points (`register`, `login`,
`token/refresh`), OAuth2 start and callback (`/oauth2/**`), and the servlet error dispatch.

Behaviour changes for callers:

| Path | Before | After |
|---|---|---|
| `GET /api/friends/**` | 500 (NPE on a null principal) | **401** |
| static test fixtures under `/static` | public | authenticated (loaded via `ClassPathResource` in tests, never over HTTP) |

All other paths keep their current behaviour; every endpoint that was intentionally public
remains public.

### Verification

`SecurityPolicyTest` (new, 48 parameterized cases) parses the allowlist with the same
`PathPatternParser` Spring Security uses and asserts both directions:

- 17 private read paths (friends, mypage, notifications, user info, meals, timetables) match
  **no** public pattern;
- 13 write paths match no public pattern;
- 11 genuinely public read paths and the 3 auth entry points **do** match, so a future tightening
  cannot silently break anonymous browsing;
- OAuth2 and `/error` stay open regardless of method.

Confirmed non-vacuous: reintroducing `/**` into `PUBLIC_GET` fails exactly the 17 private-read
cases. `HighteendayBackendApplicationTests.contextLoads` passes, so the rewritten chain builds
against a real Spring context.

Full suite: 250 tests, 0 failures.

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
