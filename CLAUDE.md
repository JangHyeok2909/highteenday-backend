# CLAUDE.md — HighTeenDay Backend

Guidance for Claude Code when working on this repository.

---

## Project Overview

**HighTeenDay** is an anonymous community platform for high school students.  
Stack: Java 17 · Spring Boot 3.4.5 · MySQL 8 · Redis · AWS S3 · JWT + OAuth2

---

## Build & Run

```bash
# Build (skip tests)
./gradlew build -x test

# Run locally — dev profile has localhost defaults built in (see README.md)
./gradlew bootRun --args='--spring.profiles.active=dev'

# Run tests
./gradlew test

# Build Docker image
docker build -t highteenday-backend .

# Start local stack (Spring app + Redis)
docker-compose up -d

# Start production stack (EC2)
docker-compose -f docker-compose.prod.yml up -d
```

---

## Architecture

```
controllers/      HTTP layer — no business logic, delegate to services
services/
  domain/         Core business logic (@Service, @Transactional)
  security/       Auth services (CustomOAuth2UserService, JwtCookieService)
  global/         Cross-cutting services (S3Service, etc.)
domain/           JPA entities, grouped by subdomain
dtos/             Request / response objects (never expose entities directly)
security/         Spring Security config, filters, TokenProvider
queryDsl/         Complex dynamic queries via QueryDSL
schedulers/       Batch jobs (view count sync, hot score calculation)
configs/          Bean configuration (Redis, S3, Swagger, AppConfig)
exceptions/       CustomException, ErrorCode enum, GlobalExceptionHandler
enums/            Shared enumerations (Role, Provider, Grade, etc.)
```

### Key External Domains

| Concern | Solution |
|---------|----------|
| Auth tokens | JWT (JJWT 0.12.3) in HttpOnly cookies, SameSite=None |
| OAuth2 | Google via Spring Security OAuth2 Client (Kakao/Naver: provider endpoints prepared, registrations commented out) |
| Token revocation | Refresh token stored in `Token` entity (DB) |
| Caching | Redis — view counts, board/post lists, hot rankings |
| File storage | AWS S3 — tmp upload then promote pattern |
| Hot posts | Redis Sorted Set, score recalculated by scheduler |
| Query complexity | QueryDSL custom repositories for dynamic filtering |

---

## Authentication Flow

1. User hits `/oauth2/authorization/{provider}` → provider consent screen
2. Provider redirects to `/oauth2/login/code/{provider}` (custom redirection endpoint — see `SecurityConfig.filterChain()`)
3. `CustomOAuth2UserService.loadUser()` — looks up user by email
   - **New user** → auto-registers via `registerOAuthUser()` and sets `isNewUser=true` on the principal
   - **Existing user** → `isNewUser=false` (roles are no longer used to signal newness)
4. `OAuth2SuccessHandler` issues JWT cookies and redirects based on `isNewUser`:
   - New user → `{frontend-url}/welcome`
   - Existing user → `{frontend-url}`
5. All subsequent requests carry the `accessToken` cookie
6. `TokenAuthenticationFilter` validates the cookie and populates `SecurityContext`
7. Expired access token? POST `/api/token/refresh` with the `refreshToken` cookie

**Cookie attributes (prod):**
`HttpOnly; Secure; SameSite=None; Domain=.highteenday.org`

---

## Database Conventions

- **Column naming:** `{DOMAIN_PREFIX}_{column}` in UPPER_SNAKE (e.g. `USR_id`, `PST_id`)
- **FK naming:** `fk_{table}_{referenced_table}` (e.g. `fk_token_usr`)
- **Index naming:** `idx_{table}_{fields}`
- **Soft delete:** `is_valid` boolean in `BaseEntity` — never hard-delete rows
- **Audit fields:** `created`, `updatedDate`, `updatedBy` from `BaseEntity`
- **DDL:** schema is owned by Flyway (`src/main/resources/db/migration/`, see `docs/MIGRATION.md`). `ddl-auto=none` in dev and prod. Never edit an applied migration; add a new numbered one.
- **Denormalization:** `Post` carries `nickname`, `likeCount`, `dislikeCount`, `commentCount`, `scrapCount` to avoid joins on hot paths

---

## Code Conventions

### Naming
- Entities: singular (`Post`, `Comment`, `User`)
- Repositories: `{Entity}Repository` + optional `{Entity}RepositoryCustom`
- Services: `{Domain}Service`
- Controllers: `{Domain}Controller`
- DTOs: descriptive, e.g. `RequestPostDto`, `PostDto`, `UpdatePostDto`
- Methods: verb-first camelCase (`createPost`, `deleteComment`)
- Service methods that modify an entity must be prefixed with `update` (e.g. `updatePassword`, `updateSchool`) — never `modify` or `change`

### Patterns
- Use `@RequiredArgsConstructor` + `final` fields for dependency injection
- Use `@Transactional` on all service methods that write to DB
- Use `@Transactional(readOnly = true)` for read-only service methods
- Convert entities to DTOs with a `fromEntity()` static factory method
- Use `CustomException(ErrorCode)` for all domain errors — never throw raw exceptions
- `@Value` fields must **not** be `final` (use alongside `@RequiredArgsConstructor`)

### Error Handling
```java
// Always use ErrorCode + CustomException
throw new CustomException(ErrorCode.USER_NOT_FOUND, "optional detail");

// GlobalExceptionHandler handles all CustomException → correct HTTP status
```

### REST API Design
- `GET` — read, no side effects
- `POST` — create new resource
- `PATCH` — partial update (not PUT)
- `DELETE` — remove resource
- Query params for filtering/sorting; path params for resource identity
- Consolidate related actions behind a single endpoint with a `type` query param when appropriate (e.g. `/reaction?type=LIKE`)

---

## Security Rules

- **Never expose entities directly** in HTTP responses — always use DTOs
- **Never log sensitive fields** (passwords, tokens, PII)
- **Never hardcode credentials** — use environment variables or `@Value`
- Validate user ownership before any mutation (`user.getId().equals(resource.getUser().getId())`)
- `isAnonymous=true` posts/comments must **not** expose `profileUrl`, `userId`, or `author`

---

## Performance Guidelines

- Prefer **cursor-based pagination** (ID-based) over `OFFSET` for large result sets
- Buffer write-heavy counters in Redis; flush to DB via scheduler
- Use `FetchType.LAZY` everywhere; apply `JOIN FETCH` only in queries that need the association
- Add composite indexes for common query patterns: `(board_id, is_valid, sort_column)`
- Cache board lists and post lists in Redis; invalidate on write

---

## Large Files — Never Read Wholesale

Reading any of these into context costs more than a whole session of
conversation, and the content is re-sent on every subsequent turn. Always
extract with `grep`, `jq`, `node -e`, `head`, or `tail` instead of reading the
file.

| Path | Size |
|------|------|
| `performance/reports/index.json` | ~250 KB (~65k tokens) |
| `performance/reports/runs/*/hostprobe.jsonl` | ~300 KB each, 89 runs |
| `performance/reports/archive/**` | ~23 MB total |
| `schoolData/**/*.json` | 400 KB – 32 MB |
| `src/main/resources/static/testImg.png`, `testGif.gif` | ~1 MB each |

`performance/reports/overnight/*.log` is no longer in the repository — it is
runtime output of the overnight runner and is now gitignored (the reason is in
`performance/.gitignore`). It still appears locally after a run, and it is the
largest of all at 300 KB – 950 KB per file, so the same rule applies to it.

```bash
node -e "const r=require('./performance/reports/index.json'); console.log(r.runs.slice(-5))"
tail -40 performance/reports/overnight/exp7.stdout.log   # local only
```

The same rule applies to command output, which also lands in context in full:

- `git diff --stat` first, then `git diff <path>` for the files that matter
- `./gradlew test 2>&1 | tail -40` instead of the full build log
- always bound searches over the report logs (`grep -m 20`, `head`, `tail`)

---

## Documentation Rules

사람이 읽는 모든 문서(`docs/`, `performance/docs/`, ADR, README, 외부 독자용 원고)에 적용한다.
근거·예문·검사 스크립트는 `docs/WRITING.md`. 2026-09-05 문서 리뷰에서 실제로 겪은 문제를 규칙으로 옮겼다.

- **주어는 사람, 결론은 첫 문단.** 프로젝트에 무슨 일이 있었나가 아니라 누가 무엇을 했고 무엇이 남았나를 쓴다.
- **문장 70자 이내, 문단 3문장 이내.** 넷째 문장부터는 불릿이나 표. 괄호 안에 판단을 넣지 않는다.
- **AI 문체 금지.** "X가 아니라 Y"는 문서당 3회 이하. 절 끝 교훈·경구 금지. 문서 자기 언급("이 문서는") 금지.
  "라벨 — 경구", "라벨. 경구" 이중 제목 금지. 줄표(—) 금지. 조사·%는 앞말에 붙인다. 굵게는 수치·제목에만.
- **용어는 첫 등장에 정의.** 프로젝트 안에서 만든 말과 내부 식별자(OPT-·KI-·BTL-·T-)는 외부 독자용 문서에 정의 없이 쓰지 않는다.
- **숫자는 출처와 검산.** 같은 비교에 두 숫자를 쓰지 않는다. 백분율은 문서 안의 두 값으로 검산되어야 하고, 안 맞으면 두 값만 쓴다.
- **날것 하나 이상.** 캡처·로그·날짜·링크. 손으로 그린 표와 SVG만 있는 문서는 생성물로 읽힌다.
- **상호참조 대신 그 자리에 다시 쓴다.** "N장 참조"는 문서당 3개 이하.
- **원고는 하나.** 길이가 다른 판은 한 원고의 구간 마커로 빌드한다. 원고가 둘이면 수치가 갈라진다.
- **빌드 산출물을 열어 본다.** `- ` 뒤 공백이 없는 목록, 줄에 걸친 굵게, 제목 오타, 쪽수를 확인한다.
- **표면을 고친 뒤 다시 잰다.** `docs/WRITING.md` 6장의 스크립트로 문장 길이·대비 구문·상호참조 수를 다시 센다.
  수치가 줄지 않았으면 고친 것이 아니다.
- **사용자가 쓴 문장은 어조를 바꾸지 않는다.** 오타와 길이만 고친다.

---

## Environment Properties

| Property | Purpose |
|----------|---------|
| `app.frontend-url` | Redirect target after OAuth2 (e.g. `https://www.highteenday.org`) |
| `app.cookie-domain` | Cookie `Domain=` attribute (e.g. `.highteenday.org`; blank in local) |
| `app.server-url` | Swagger server URL |
| `app.cors.allowed-origins` | Comma-separated CORS origins |
| `jwt.key` | HMAC secret for JWT signing |

---

## Testing

- Unit tests live in `src/test/java/`
- Most unit tests are Mockito-based and run without infrastructure (the `embedded-redis` dependency in build.gradle is currently unused)
- Use `@Nested` classes for BDD-style grouping within a test class
- Do **not** mock the database in service-layer tests — use a real (test) DB or `@DataJpaTest`
- New service methods should have corresponding unit tests

---

## Deployment

```
GitHub Actions
  └─ Build Docker image
  └─ Push to AWS ECR

EC2 (ap-northeast-2)
  └─ docker-compose.prod.yml
       └─ network_mode: host  (required — Redis runs on EC2 localhost)
       └─ Spring Boot on :8080

S3 + CloudFront
  └─ www.highteenday.org/* → S3 (정적 파일 CDN 배포)

ALB
  └─ api.highteenday.org/* → EC2 :8080 (HTTPS 처리 + 로드밸런싱)
  └─ /swagger-ui/*         → EC2 :8080
```

**Profiles:**
- `local` — default profile; requires a personal gitignored `application-local.properties` (not in the repo)
- `dev` — recommended for local development; localhost defaults built in, actuator on port 8081 (`README.md`)
- `prod` — all credentials from environment variables, actuator on port 8081
- `perf` — layered on top of prod (`--spring.profiles.active=prod,perf`) for load testing; see `application-perf.properties` comments

---

## Git Rules

### Branching — always base on `develop`

`develop` is the integration branch; `main` is the release line. All day-to-day
work branches off `develop` and merges back into `develop`.

- **Always create new branches from `develop`**, never from `main` and never from
  whatever branch happens to be checked out:
  ```bash
  git fetch origin
  git switch -c <type>/<short-description> origin/develop
  ```
- **Always open pull requests against `develop`** as the base branch:
  ```bash
  gh pr create --base develop
  ```
  GitHub's repository default branch is what the PR form pre-selects. If it is
  still `main`, the base **must** be switched to `develop` manually — otherwise
  the diff includes every commit `develop` is ahead of `main` and the PR becomes
  unreviewable.
- Branch names use the same prefixes as commit types: `feature/`, `fix/`,
  `refactor/`, `test/`, `chore/`, `perf/`.
- Never merge or rebase a branch onto `main` directly. `main` only ever receives
  `develop`.
- Before starting work on an existing branch, bring it up to date with
  `develop` (`git merge origin/develop`, or rebase if the branch is unpushed).

### Commits

- **Commit subject and body are written in Korean** (rule changed on 2026-09-04; older commits are English and are left as they are)
- Follow Conventional Commits format: `type: short description` — the type prefix stays in English
  - Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`
  - Example: `feat: OAuth2 신규 사용자 자동 가입 추가`

- Keep subject line under 72 characters
- Commit description(body) must include:
  - What was changed 
  - Why it was changed 
  - What benefit it brings 
- **Always ask before committing AND pushing** — never commit or push without explicit user confirmation
- Never force-push `main` without explicit user instruction
- Never force-push a shared branch without explicit user instruction — a teammate
  may have it checked out
- Prefer one focused commit per logical change; squash noise commits before pushing

---

## Commands

- "simplify": rewrite the previous response in simple English

Rules for "simplify":
- Use short and clear sentences
- Avoid complex vocabulary
- Keep the original meaning
- Do not add new information

---

## What Not To Do

- Do not add error handling for scenarios that cannot happen
- Do not add speculative abstractions — implement only what is asked
- Do not add docstrings or comments to code you did not change
- Do not use `ddl-auto=update` or `ddl-auto=create` anywhere — schema changes go through Flyway migrations (`docs/MIGRATION.md`)
- Do not add backwards-compatibility shims when the old code can simply be replaced
- Do not design for hypothetical future requirements
