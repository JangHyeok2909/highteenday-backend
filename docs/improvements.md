# 개선 기록

운영 안정화 작업을 누적 기록한다. 무엇을 왜 바꿨고 그래서 무엇이 좋아졌는지를 남긴다.
최신 항목이 위에 온다.

---

## 012 — 알림 목록의 N+1 제거

**분야:** Performance / Query Optimization
**커밋:** `perf: fetch notification senders with the list query`

### 문제

`GET /api/notifications`는 파생 쿼리
`findByReceiverAndIsValidTrueOrderByIsReadAscCreatedDesc`로 페이징했고, 이 쿼리는
`Notification.sender`를 지연 로딩으로 남겼다. 그런데 `NotificationDto.fromEntity`는 행마다
발신자를 두 번 참조한다.

```java
.senderNickname(n.getSender() != null ? n.getSender().getNicknameValue() : null)
.senderProfileUrl(n.getSender() != null ? n.getSender().getProfileUrl() : null)
```

알림은 성격상 발신자가 거의 매번 다르다(A의 좋아요, B의 댓글). 20건 페이지 하나에
추가 쿼리가 최대 20번 나갔다. 헤더의 알림 배지가 이 엔드포인트를 주기적으로 호출하므로
서비스에서 가장 빈번한 호출 중 하나다.

### 변경

파생 쿼리를 `left join fetch n.sender`와 전용 `countQuery`를 가진 명시적 쿼리로 교체했다.
`left`여야 한다 — 시스템 알림은 발신자가 없으므로 inner join이면 목록에서 조용히 사라진다.

### 확인했지만 바꾸지 않은 것

`GET /api/mypage/posts`도 같은 결함으로 보였다. `findByUser`가 지연 로딩이고
`PostPreviewDto.fromEntity`가 `post.getBoard()`를 건드리기 때문이다. 하지만 아니었다.
DTO는 `getBoard().getId()`만 읽는데, 지연 프록시의 식별자는 이미 행에 있는 외래 키로
응답되므로 프록시가 초기화되지 않는다. 작성자 조회도 무료다 — 해당 페이지의 모든 글이
이미 로딩된 한 명의 사용자 것이기 때문이다.

`join fetch p.board`를 실제로 작성하고 측정한 뒤 되돌렸다. 쿼리 수가 그대로였고 조인과
수기 count 쿼리만 늘었다. 회귀 테스트는 남겨 두되 **왜 이미 2개인지**를 주석으로 적었다.
나중에 누군가 `board.getName()`을 읽도록 고치면 조용히 퇴화하는 대신 테스트가 깨진다.

### 검증

`ListViewQueryCountTest`(신규, `@DataJpaTest`, 3케이스): 서로 다른 발신자 25명의 알림이
정확히 2쿼리로 렌더링되고, 서로 다른 게시판 25개의 글도 마찬가지이며, 발신자 없는 시스템
알림도 페이지에 포함된다.

역검증 완료: `left join fetch n.sender`를 제거하면 알림 케이스가 실패한다. 게시글 쪽
fetch join을 제거해도 **실패하지 않는다** — 이 측정이 변경의 절반을 "수정"에서
"기록으로 남긴 비문제"로 바꿨다.

전체 스위트: 289 테스트, 실패 0.

---

## 011 — 스크랩 목록의 메모리 페이징 제거

**분야:** Performance / Query Optimization
**커밋:** `perf: page scrapped posts in the database`

### 문제

`GET /api/mypage/scraps`는 전부 로딩한 뒤 자바에서 페이징했다.

```java
List<Scrap> scraps = scrapService.getRecentScrapsByUser(user);   // 사용자의 모든 스크랩
List<Post> posts = new ArrayList<>();
for (Scrap s : scraps) posts.add(s.getPost());                   // 스크랩마다 지연 로딩 1회
Page<Post> pagedPosts = PageUtils.createPage(posts, pageable);   // 10건만 남기고 폐기
```

스크랩이 `S`개인 사용자의 요청 하나가 대략 `S + 21` 쿼리를 쓰고 `S`개의 `Post` 엔티티를
메모리에 올렸다 — 미리보기 10행을 반환하려고. 정렬도 자바에서 돌았고
(`Comparator.comparing(Scrap::getCreated).reversed()`), 그래서 첫 행을 고르기 전에
전체 컬렉션이 메모리에 있어야 했다. 비용이 사용자가 서비스를 얼마나 오래 썼는지에 비례하는,
가능한 형태 중 최악이다. 가장 열심히 쓰는 사용자가 가장 느린 페이지를 받는다.

`PageUtils.createPage`에는 보호되지 않은 `list.subList(start, end)`도 있었다. 마지막
페이지를 넘겨 요청하면 `start > list.size()`가 되고 `subList`가
`IllegalArgumentException`을 던져 **500**이 난다. 올바른 답은 빈 페이지다. 마지막 페이지
이후로 계속 스크롤한 클라이언트는 전부 여기에 걸렸다.

### 변경

투영(projection) 페이징 쿼리 하나가 위 블록 전체를 대체한다.

```java
select new PostPreviewDto(p.id, p.board.id, p.nickname, p.title, p.viewCount,
                          p.likeCount, p.commentCount, p.created)
from Scrap s join s.post p
where s.user = :user and s.isValid = true and p.isValid = true
order by s.created desc
```

- `LIMIT`/`OFFSET`과 `ORDER BY`를 DB가 처리하므로 비용이 `S`에 의존하지 않는다.
- 미리보기 필드를 직접 투영하므로 `Post`, `Board`, `User` 엔티티를 하나도 로딩하지 않는다.
  행마다 있던 지연 로딩이 완전히 사라져 크기와 무관하게 **2쿼리**(목록 + 카운트)다.
- 작성자는 비정규화된 `p.nickname`에서 가져온다. 개선 006과 동일한 원칙이라 이 경로에서도
  익명성 보장이 유지된다.
- `p.isValid = true` 조건은 새로 추가했다. 이전에는 삭제된 게시글을 가리키는 스크랩도
  행을 만들어냈다.

`ScrapService.getRecentScrapsByUser`와 `PageUtils.createPage`는 **오직** 이 엔드포인트에서만
쓰였다. 쓰이지 않는 위험 요소로 남기지 않고 둘 다 삭제했고, 그 결과 `subList` 500도
함께 사라졌다.

### 검증

`ScrappedPostPagingTest`(신규, `@DataJpaTest`, 6케이스): 스크랩 35개인 사용자가 정확히
10행과 올바른 `totalElements`/`totalPages`를 받는다. 정렬은 최근 스크랩 순이다. 쿼리 수가
정확히 2이고 스크랩 15개와 55개에서 동일하다. 범위를 벗어난 페이지는 예외 대신 빈 목록을
반환한다. 취소된 스크랩과 소프트 삭제된 게시글은 제외된다. 익명 글의 미리보기는 작성자
실명을 담지 않는다.

쿼리 수 단언에 대한 메모: 두 표본 모두 페이지가 여러 개여야 한다. 결과가 한 페이지에
들어가면 Spring Data가 카운트 쿼리를 생략하기 때문이다. 첫 시안은 5개와 45개를 비교해
1 대 2가 나왔는데, N+1 때문이 아니라 이 최적화 때문이었다.

전체 스위트: 286 테스트, 실패 0.

---

## 010 — 댓글 수·스크랩 수 카운터의 동시성 안전 확보

**분야:** Transaction / Concurrency
**커밋:** `fix: increment comment count in SQL and lock before scrap recount`

### 문제

007과 009에서 시작한 결함군의 마지막 둘. 두 카운터가 여전히 보호되지 않은
read-modify-write로 유지되고 있었다.

**`comment_count`** 는 순수하게 메모리에서 조정됐다.

```java
post.incrementCommentCount();   // 영속 엔티티에서 this.commentCount++
```

같은 게시글에 동시에 댓글을 다는 두 사용자가 모두 40을 읽고 모두 41을 쓴다. 댓글 하나가
카운터에서 영원히 사라진다. `@DynamicUpdate`(개선 009)는 문장을 `SET comment_count = 41`로
좁혀줄 뿐, 낡은 값을 읽어 그대로 덮어쓰는 구조 자체는 그대로다.

**`scrap_count`** 는 반응 카운터와 같은 "재집계 후 대입" 형태
(`post.syncScrapCount(count(...))`)를 썼다. 007에서 고친 결함과 동일한데 `ScrapService`에
있어서 그때 누락됐다.

### 변경

두 카운터는 형태가 다르므로 다른 도구가 필요하다.

- **`comment_count` — 원자적 SQL.** 새로 만든 `PostRepository.incrementCommentCount` /
  `decrementCommentCount`는 컬럼을 양변에서 참조하는 `@Modifying` 업데이트다
  (`set p.commentCount = p.commentCount + 1`). 계산을 DB가 자기 행 잠금 아래 한 문장 안에서
  수행한다. `decrementCommentCount`는 `case when p.commentCount > 0 …`으로 기존
  `decrementCommentCount()`의 하한 가드를 그대로 유지한다. O(1)이고 애플리케이션이 잠금을
  들고 있지 않으므로 댓글 쓰기가 게시글별로 직렬화되지 않는다.
- **`scrap_count` — 비관적 잠금.** 토글이 스크랩 테이블에서 재집계하므로 반응과 동일하게
  `findByIdForUpdate` 처리가 필요하다. 재집계 전에 잠금을 잡고 커밋까지 유지하면 재집계가
  동시 커밋을 보게 된다.

`CommentService`가 `PostRepository`를 주입받는다. 벌크 업데이트는 영속성 컨텍스트의 `Post`
인스턴스를 갱신하지 않으며 이 점은 리포지토리 메서드에 문서화했다. 두 호출부 모두 이후에
카운트를 읽지 않고, `createComment`는 `Location` 헤더만 반환한다.

이로써 `Post`의 비정규화 컬럼 5개 전부에 대해 카운터 정합성이 완성됐다.

| 컬럼 | 형태 | 보호 방식 |
|---|---|---|
| `like_count`, `dislike_count` | 재집계 | 행 잠금 (007) |
| `scrap_count` | 재집계 | 행 잠금 (010) |
| `comment_count` | 증감 | 원자적 SQL (010) |
| `view_count` | 배치 증감 | 단일 스케줄러 + `@DynamicUpdate` (009) |

### 검증

- `CommentCountAtomicityTest`(신규, `@DataJpaTest`, 3케이스) — H2에서 증가 5회가 실제로 5로
  누적되고, 감소가 0에서 멈추며, 두 `@Query` 문자열이 자기 참조형
  (`p.commentCount = … p.commentCount`)인지 단언한다. 이 성질이 원자성을 만든다.
- `CommentServiceTest` — 삭제 케이스가 메모리 필드 대신 `decrementCommentCount(POST_ID)`
  호출을 단언하고, 거부되는 타인 케이스는 호출되지 않음을 단언한다.
- `ScrapServiceTest` — 잠금 쿼리를 스텁해, 잠금이 기대 호출 순서의 일부가 됐다.

역검증 완료: 증가문을 `set p.commentCount = 1`로 바꾸면 원자성 3케이스 중 2개가 실패한다.

전체 스위트: 281 테스트, 실패 0.

---

## 009 — 전체 행 UPDATE가 동시 카운터 갱신을 덮어쓰는 문제 차단

**분야:** Transaction / Query Optimization
**커밋:** `fix: update only dirty columns on Post and Comment`

### 문제

`Post`도 `Comment`도 `@DynamicUpdate`를 선언하지 않았다. 그래서 Hibernate는 엔티티가 어떤
이유로든 더러워지면 **전체 행** `UPDATE`를 내보냈다 — 해당 트랜잭션이 건드리지도 않은
컬럼까지 전부 포함해서.

`Post`는 서로 독립적으로 유지되는 비정규화 카운터 5개(`view_count`, `like_count`,
`dislike_count`, `comment_count`, `scrap_count`)를 들고 있고, 각각 다른 코드 경로가 다른
트랜잭션에서 쓴다. 전체 행 쓰기는 그중 하나의 갱신을 나머지 넷에 대한 맹목적 덮어쓰기로
바꿔버린다. 로딩 시점의 값으로.

```
T1  ViewCountScheduler가 게시글 로딩   (comment_count = 40)
T2  사용자가 댓글 작성                → comment_count = 41, 커밋
T1  post.addViewCount(12); flush     → UPDATE posts SET view_count=…, comment_count=40, …
                                        T2의 댓글이 카운터에서 지워짐
```

개선 007에서 추가한 행 잠금은 여기서 도움이 되지 않는다. 스케줄러와 댓글 경로는 그 잠금을
잡지 않고, 애초에 같은 논리적 필드를 쓰는 것도 아니다. 조회된 모든 게시글에 대해 타이머로
도는 조회수 배치 동기화 하나하나가, 스케줄러가 행을 읽은 이후 커밋된 카운터 변경을 되돌릴
기회였다. `Comment`도 마찬가지로, 본문 수정이 `like_count` / `dislike_count`를 다시 쓴다.

### 변경

두 엔티티에 `@DynamicUpdate`를 달았다. 이제 Hibernate는 실제로 바뀐 컬럼만 쓰므로 조회수
배치는 `UPDATE posts SET view_count = ? WHERE PST_id = ?`를 내보내고 다른 카운터는 건드리지
않는다. 쓰기 폭도 좁아져서 서비스에서 가장 바쁜 쓰기 경로의 행 잠금 범위와 binlog 양이
줄어든다.

대가는 Hibernate가 엔티티당 준비된 `UPDATE` 하나를 캐시하지 못하고 더러워진 컬럼 조합마다
생성해야 한다는 점이다. 컬럼 13개짜리 테이블에 갱신 경로가 몇 안 되는 상황이라면 정확성과
맞바꿀 만하다.

이것이 카운터 정합성 작업의 구조적 절반이다. 007이 개별 카운터의 read-modify-write를
원자적으로 만들었다면, 009는 **무관한** 쓰기가 그것을 되돌리는 것을 막는다.

### 검증

`DenormalizedCounterMappingTest`(신규, 2케이스)가 두 엔티티에 `@DynamicUpdate`가 있는지
단언하며, 실패 메시지에 각각이 막는 구체적 손상을 적어 뒀다. 어노테이션 하나는 지우기
쉬우므로, 테스트로 고정해 두는 것이 향후 리팩터링에서 떨어져 나가지 않게 하는 방법이다.

전체 스위트: 278 테스트, 실패 0.

---

## 008 — 운영 로그에 학생 이메일이 기록되는 문제 차단

**분야:** Security / Logging
**커밋:** `fix: mask personal data in log statements`

### 문제

운영은 `logging.level.root=INFO`로 돈다. 그리고 INFO/WARN 레벨의 여러 문장이 미성년자의
개인정보 원문을 애플리케이션 로그에 남기고 있었다.

| 위치 | 레벨 | 기록 내용 |
|---|---|---|
| `UserService.register` | INFO | 가입할 때마다 이메일 전문 **및** 닉네임 |
| `UserService.registerOAuthUser` | INFO | OAuth 자동 가입마다 이메일 전문 |
| `CustomOAuth2UserService.loadUser` | INFO | OAuth 신규 사용자마다 이메일 전문 |
| `TokenService` (3곳) | WARN | Redis 장애 시마다 이메일 전문 |
| `UserController.login`, `CustomOAuth2UserService` | DEBUG | 이메일 전문 (개발 환경 한정) |

이 로그는 컨테이너 stdout을 거쳐 플랫폼 로그 저장소로 간다. 애초에 이메일을 수집한
최소수집 근거보다 훨씬 오래 보관되고, DB 접근 권한이 아니라 로그 접근 권한만 있으면 누구나
읽을 수 있다. Redis 장애 한 번이면 토큰 연산마다 이메일이 WARN으로 쏟아졌다.

저장소 자체 규칙 *"민감 필드(비밀번호, 토큰, PII)를 절대 로깅하지 말 것"* 을 정면으로
위반하고 있었다.

### 변경

- `Utils/LogMasker` 신규 — `maskEmail`은 로컬 파트 앞 두 글자만 남기고
  (`wkdgur752500@gmail.com` → `wk***@gmail.com`), `maskNickname`은 첫 글자만 남긴다.
  마스킹이 결정적이라 같은 사용자의 로그는 파일 안에서 계속 이어 볼 수 있지만, 로그만으로는
  계정을 특정할 수 없다.
- 9곳 전부 마스킹된 값을 남기거나, 엔티티가 이미 로딩돼 있는 곳에서는 `userId`를 남긴다.
  `userId`가 DB와 조인되므로 어차피 더 나은 식별자다. `TokenService`는 세 곳 모두 `userId`로
  전환했고, `CustomOAuth2UserService`의 로그인 성공 로그는 조회 아래로 옮겨 주소 대신
  `userId`를 찍게 했다.
- 가입 로그에서 닉네임은 아예 뺐다. 마스킹된 이메일이 주는 것 이상으로 진단에 보태는 게
  없었다.

### 검증

- `LogMaskerTest`(신규, 16케이스) — 일반/짧은/형식이 깨진 입력에 대한 마스킹 형태와,
  출력에서 로컬 파트 전문을 복원할 수 없다는 명시적 단언.
- `PiiLoggingGuardTest`(신규) — `src/main/java` 아래 모든 `.java` 파일을 훑어 각
  `log.*(…)` 호출을 찾고, 인자가 `…email()`, `getEmailValue()`, `…phone()`,
  `getNicknameValue()`, `getRawPassword()`, 원문 토큰 변수에 해당하면 `LogMasker`를 거치지
  않는 한 빌드를 실패시킨다. 리뷰가 아니라 빌드가 규칙을 강제하게 됐고, 실패 메시지에
  파일과 줄 번호가 찍힌다.

역검증 완료: `UserService.register`에 이메일 원문을 되돌리면 가드가 메시지에
`UserService.java:101`을 담아 실패한다.

전체 스위트: 276 테스트, 실패 0.

---

## 007 — 반응 카운터 재집계의 갱신 손실 수정

**분야:** Transaction / Concurrency
**커밋:** `fix: lock the target row before recounting reactions`

### 문제

`PostReactionService.syncCounts`(및 댓글 쪽 쌍둥이)는 비정규화된
`PST_like_count` / `PST_dislike_count` 컬럼을 반응 테이블에서 재집계한 뒤 엔티티에 대입하는
방식으로 유지한다.

```java
int likes = postReactionRepository.countByPostAndKindAndIsValidTrue(post, LIKE);
post.syncReactionCounts(likes, dislikes);
```

잠금 없는 read-modify-write다. `READ COMMITTED`에서 같은 게시글에 동시에 좋아요를 누른 두
사용자는 이렇게 교차한다.

| | T1 | T2 |
|---|---|---|
| 1 | 반응 A `INSERT` | |
| 2 | | 반응 B `INSERT` |
| 3 | `COUNT` → 10 (B는 미커밋이라 안 보임) | |
| 4 | | `COUNT` → 10 (A는 미커밋이라 안 보임) |
| 5 | `UPDATE posts SET like_count = 10` | |
| 6 | | `UPDATE posts SET like_count = 10` |

반응은 둘 들어갔는데 카운터는 하나 올랐다. 표시되는 수치가 실제보다 **아래로** 영구히
어긋나고, 이후 동시 요청 쌍마다 격차가 벌어진다.

이건 이미 의심되고 있던 결함이다. 저장소에는
`PostConsistencyController` / `PostConsistencyService`(`@Profile("!prod")`)가 이미 있고,
비정규화 카운터를 반응 테이블의 `COUNT(*)`와 비교해 `drift` 플래그를 보고하며 k6 부하
테스트 teardown에서 호출된다. **탐지기는 있었고 원인은 고쳐지지 않았다.**

### 변경

- `PostRepository.findByIdForUpdate`, `CommentRepository.findByIdForUpdate` — 새 쿼리에
  `@Lock(LockModeType.PESSIMISTIC_WRITE)`, 즉 `SELECT … FOR UPDATE`를 달았다.
- 두 반응 서비스의 `likeReact` / `dislikeReact`가 이 잠금을 **첫** 문장으로 잡는다. 잠금은
  커밋까지 유지되므로 같은 게시글에 대한 두 번째 트랜잭션은 첫 번째가 커밋될 때까지 막히고,
  따라서 그 재집계는 첫 트랜잭션이 만든 행을 본다.
- 두 서비스를 `jakarta.transaction.Transactional`에서 Spring 어노테이션으로 바꿨다.
  `services/` 나머지 전부가 쓰는 관례에 맞춘 것이다.
- `posts_reactions`에 커버링 인덱스 `(PST_id, PST_RCT_kind, is_valid)`를, `comments_reactions`에
  대응 인덱스를 추가했다. 기존에는 `uk_*_reactions_*_usr (id, USR_id)`뿐이라 재집계가 그
  행에 달린 모든 반응을 훑고 필터링해야 했다. 운영은 `ddl-auto=none`이므로 엔티티의 `@Index`
  선언과 함께 `src/main/resources/ddl/V_reaction_count_indexes.sql`을 두어 배포 전에 수동
  적용하도록 했다.

직렬화는 행 단위이지 전역이 아니다. **다른** 게시글에 대한 동시 반응은 영향받지 않는다.

### 남아 있는 비용

재집계는 여전히 클릭당 O(해당 게시글의 반응 수)다. 자가 치유 특성 때문에 유지했지만, 반응이
1만 개인 게시글은 버튼을 누를 때마다 1만 엔트리 인덱스 스캔을 낸다. 다음 단계는
`like_count = like_count + delta` 원자 갱신으로 바꾸고 재집계는 주기적 보정 작업으로
내리는 것이다. 여기서 하지 않은 이유는 카운터의 의미를 "권위 있는 값"에서 "증분"으로 바꾸는
변경이라 별도로 다룰 만하기 때문이다.

`PostReactionService.getLikeSatateDto`는 `dislikeCount`를 채우지 않는다(항상 0). 현재
컨트롤러가 자체 DTO를 만들어 쓰므로 사용되지 않아, 투기적으로 고치는 대신 그대로 뒀다.

### 검증

- `ReactionCountLockingTest`(신규, 2케이스) — 두 리포지토리를 리플렉션으로 훑어 잠금 쿼리에
  `PESSIMISTIC_WRITE`가 달렸는지 단언한다. 읽기 잠금으로 약화하면 빌드가 깨진다.
- `PostReactionServiceTest` / `CommentReactionServiceTest`(+4케이스) — 잠금이 첫 `COUNT`
  **이전에** 획득되는지 `InOrder`로 검증하고, 행이 사라진 경우 반응을 쓰지 않고 잠금 단계에서
  실패하는지 검증한다.

역검증 완료: 잠금 호출 두 개를 제거하면 정확히 그 4케이스가 실패한다.

동시성 자체는 경쟁 테스트가 아니라 구조적으로 고정했다(잠금 모드 + 순서). H2 대상 2스레드
테스트는 타이밍에 의존해 불안정해지므로 그만한 값어치가 없다고 판단했다.

전체 스위트: 259 테스트, 실패 0.

---

## 006 — 캐시 미스 경로 투영의 실명 노출 수정

**분야:** Security
**커밋:** `fix: use denormalized nickname in post preview projection`

### 문제

`PostRepository.findAllDtoByIds`는 작성자를 조인해 미리보기 DTO를 만들었다.

```java
SELECT new PostPreviewDto(p.id, p.board.id, p.user.nickname.value, p.title, …)
```

`p.user.nickname.value`는 작성자의 **실명** 닉네임이고 조건 없이 복사된다. 이 쿼리는
`RedisPostsCache`(76번째 줄)의 캐시 미스 재조회 경로다. 게시판 목록 페이지가 Redis에서
미스 나면, 재구성된 항목들이 모든 익명 글 작성자의 실명 닉네임을 달고 나갔다.

같은 DTO를 만드는 나머지 두 경로는 제대로 처리하고 있었다 —
`PostPreviewDto.fromEntity`는 `"익명"`으로 가리고, QueryDSL의 `findByBoard`는
`post.nickname`을 선택한다. 그래서 누출은 캐시 미스 분기에서만 나타났는데, 개발 중 클릭해
가며 걸리기 가장 어려운 분기가 정확히 그곳이다.

개선 004의 실패 양상이 한 겹 아래에서 재현된 것이다. 익명화가 경계가 아니라 호출부마다
구현돼 있으니, 세 호출부 중 하나가 틀렸다.

### 변경

투영이 이제 `p.nickname`을 읽는다. `Post.create`가 익명 글에는 `"익명"`을, 그 외에는
작성자 닉네임을 이미 채워 넣는 비정규화 `USR_nickname` 컬럼이다. QueryDSL 목록 쿼리가 쓰는
바로 그 컬럼이므로 세 경로가 구조적으로 일치하게 됐다.

부수 효과: 쿼리가 `users`를 아예 조인하지 않는다.

### 검증

`PostPreviewProjectionTest`(신규, `@DataJpaTest`, 3케이스)가 익명 글 미리보기에 실명이
담기지 않고, 실명 글은 유지되며, 투영 결과가 두 경우 모두 `PostPreviewDto.fromEntity`와
일치함을 단언한다. 역검증 완료: `p.user.nickname.value`를 되돌리면 3케이스 중 2개가
실패한다.

전체 스위트: 253 테스트, 실패 0.

---

## 005 — 시큐리티 필터 체인을 deny-by-default로 전환

**분야:** Security / Architecture
**커밋:** `refactor: make security rules deny-by-default with an explicit allowlist`

### 문제

`SecurityConfig`가 읽기를 포괄 규칙으로 인가하고 있었다.

```java
.requestMatchers(HttpMethod.GET, "/**").permitAll()
.anyRequest().authenticated()
```

위쪽에 선언된 `authenticated()` 매처에 우연히 경로가 들어 있지 않는 한 모든 GET이
공개였다. fail-open 구조다. 보호 여부가 "새 읽기 엔드포인트를 목록에 추가하는 걸 누군가
기억했는가"에 달려 있고, 잊었을 때의 결과는 눈에 보이는 401이 아니라 조용한 공개 노출이다.

이미 두 번 잘못됐다.

- `GET /api/friends/list`, `/api/friends/requests/sent`, `/api/friends/requests/received`가
  인증 목록에 추가된 적이 없어 무인증으로 접근 가능했다. 우연히 살아남았을 뿐이다 —
  `@AuthenticationPrincipal`이 `null`로 해석돼 컨트롤러가 NPE를 던졌고 **401 대신 500**을
  반환했다.
- `GET /api/posts/{postId}/comments/{commentId}`(개선 004)가 같은 이유로 공개 접근
  가능했고, 그쪽은 실제로 비공개 데이터를 반환했다.

`/**` 규칙은 컨트롤러를 추가하는 것만으로 공개 발행이 된다는 뜻이기도 하다. 미성년자의 학교,
시간표, 소셜 그래프 데이터를 들고 있는 서비스의 기본값으로는 틀렸다.

### 변경

정책을 뒤집었다. 이제 체인은 명시된 것만 허용하고 나머지는 전부 인증을 요구한다.

```java
.requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
.requestMatchers(PublicEndpoints.PUBLIC_ANY).permitAll()
.requestMatchers(HttpMethod.GET,  PublicEndpoints.PUBLIC_GET).permitAll()
.requestMatchers(HttpMethod.POST, PublicEndpoints.PUBLIC_POST).permitAll()
.anyRequest().authenticated()
```

허용 목록은 작은 상수 클래스 `PublicEndpoints`로 옮겼다. API의 공개 표면이 순서에 민감한
빌더 체인이 아니라 읽고 리뷰하고 테스트할 수 있는 목록 하나가 된다. 포함 범위는 커뮤니티
읽기(게시판, 게시글, 검색, 댓글, 인기글, 학교 검색), 가입 시 중복 확인 엔드포인트, 인증
진입점(`register`, `login`, `token/refresh`), OAuth2 시작 및 콜백(`/oauth2/**`), 서블릿 에러
디스패치다.

호출자 입장의 동작 변경:

| 경로 | 이전 | 이후 |
|---|---|---|
| `GET /api/friends/**` | 500 (null principal NPE) | **401** |
| `/static` 아래 테스트 픽스처 | 공개 | 인증 필요 (테스트는 `ClassPathResource`로 읽으며 HTTP를 타지 않음) |

그 외 경로는 동작이 그대로다. 의도적으로 공개였던 엔드포인트는 전부 공개로 남는다.

### 검증

`SecurityPolicyTest`(신규, 파라미터화 48케이스)가 Spring Security와 동일한
`PathPatternParser`로 허용 목록을 파싱해 양방향을 단언한다.

- 비공개 읽기 경로 17개(친구, 마이페이지, 알림, 사용자 정보, 급식, 시간표)가 어떤 공개
  패턴에도 **매칭되지 않는다**;
- 쓰기 경로 13개가 공개 패턴에 매칭되지 않는다;
- 진짜 공개여야 할 읽기 경로 11개와 인증 진입점 3개는 **매칭된다**. 향후 정책을 조이더라도
  비로그인 열람이 조용히 깨지지 않는다;
- OAuth2와 `/error`는 메서드와 무관하게 열려 있다.

역검증 완료: `PUBLIC_GET`에 `/**`를 다시 넣으면 정확히 비공개 읽기 17케이스가 실패한다.
`HighteendayBackendApplicationTests.contextLoads`가 통과하므로 재작성된 체인이 실제 Spring
컨텍스트에서 빌드된다.

전체 스위트: 250 테스트, 실패 0.

---

## 004 — DTO 계층에서 익명성을 구조적으로 보장

**분야:** Security / DDD
**커밋:** `fix: hide author identity in anonymous post and comment DTOs`

### 문제

이 플랫폼의 핵심 약속은 익명성인데, 게시글과 댓글을 직렬화하는 DTO가 작성자 신원을
누출하고 있었다.

`CommentDto.fromEntity`는 `isAnonymous`와 무관하게 작성자의 **실명 닉네임**과 **userId**를
모든 DTO에 복사했다.

```java
.userId(comment.getUser().getId())
.author(comment.getUser().getNicknameValue())
.profileUrl(comment.isAnonymous() ? null : comment.getUser().getProfileUrl())  // 이것만 방어돼 있었다
```

댓글 **목록** 엔드포인트가 안전했던 건 `CommentAnonymizationService`가 변환 *이후*에
`author`와 `userId`를 덮어썼기 때문일 뿐이다. 다른 호출자는 원본 값을 받았고, 실제로 그런
호출자가 있었다. `GET /api/posts/{postId}/comments/{commentId}`가
`CommentDto.fromEntity(...)`를 그대로 반환했고, 익명화를 거치지 않았으며, `SecurityConfig`의
`GET /**` permitAll 규칙에 따라 **인증도 필요 없었다**. 누구나 id만 알면 아무 댓글이나
익명 해제할 수 있었다.

`PostDto.fromEntity`는 익명 글의 `author`와 `userId`는 제대로 가렸지만 `profileUrl`은
조건 없이 통과시켰다. 프로필 이미지 URL은 사용자 공개 프로필에 나오는 바로 그 S3 URL이므로,
"익명" 글을 실제 계정으로 곧장 연결한다.

두 경우의 밑바닥에 있는 구조적 결함: DTO가 **기본적으로 안전하지 않았고**, 안전성이 별도
협력 객체에 있었다. 엔티티를 변환하는 새 엔드포인트는 아무것도 안 해도 누출한다.

### 변경

익명성을 변환 경계에서 강제해, 신원을 누출하는 DTO를 만들 방법 자체를 없앴다.

- `CommentDto.fromEntity` — `isAnonymous`면 `author="익명"`, `userId=null`,
  `profileUrl=null`을 내보낸다.
- `PostDto.fromEntity` — `profileUrl`이 이제 `author`, `userId`와 같은 분기를 탄다.

`CommentAnonymizationService`의 동작은 그대로다. 여전히 스레드별 표시 번호
(`익명1`, `익명(글쓴이)`)를 부여하지만, 이제는 이미 안전한 기반 위에 얹는 것이지 실명과
네트워크 사이를 막는 유일한 장치가 아니다. `isOwner`는 컨트롤러에서 엔티티로 계산하므로
DTO가 `userId`를 더 이상 담지 않아도 영향이 없다.

### 검증

`AnonymityLeakTest`(신규, 4케이스)가 익명 글·댓글이 `author`, `userId`, `profileUrl` 중
어느 것도 노출하지 않고, 비익명은 셋 다 유지함을 단언한다. 역검증 완료: 이전 변환 중 하나를
되돌리면 정확히 익명 2케이스가 실패한다. 기존 `CommentAnonymizationServiceTest`(8케이스)는
수정 없이 통과한다.

전체 스위트: 202 테스트, 실패 0.

---

## 003 — 에러 응답의 내부 예외 정보 노출 차단

**분야:** Security (CWE-209) / Exception Handling / Logging
**커밋:** `fix: stop returning internal exception messages to clients`

### 문제

`GlobalExceptionHandler`의 모든 핸들러가 — `handleCustomException`만 빼고 — 예외 메시지
원문을 응답 본문에 이어 붙이고 있었다.

```java
"message", "서버 내부 오류가 발생했습니다." + " message=" + e.getMessage()
```

프레임워크 예외 메시지는 사용자용 문구가 아니라 내부 정보를 담고 있다.

| 핸들러 | 클라이언트가 실제로 받은 것 |
|---|---|
| 409 `DataIntegrityViolationException` | **실패한 INSERT 문 전문**, 모든 컬럼명, 위반된 제약조건명 |
| 500 `Exception` | 내부 클래스명과 JVM 상세 — 예: `class java.lang.Long cannot be cast to class java.lang.Boolean (… loader 'bootstrap')`. 이 서비스가 실제로 브라우저에 반환했던 문구다 |
| 400 `HttpMessageNotReadableException` | 내부 DTO 패키지와 필드명이 담긴 Jackson 오류 |
| 404 `ResourceNotFoundException` | `post does not exist, postId=4821` 같은 내부 조회 문구 |

무인증 공격자에게 스키마 매핑 수단을 공짜로 쥐여준 셈이다. 아무 엔드포인트에서나 중복
INSERT를 유발하면 테이블의 컬럼 목록을 그대로 읽어갈 수 있었다.

두 번째, 더 조용한 문제: `handleCustomException`이 `e.getMessage()`가 아니라
`e.getErrorCode().getMessage()` — 일반 enum 문구 — 를 로깅했다.
`CustomException(ErrorCode, String detail)` 생성자가 존재하는 이유가 발생 지점에 맥락을
붙이는 것인데, 그 맥락이 로그에서 통째로 버려지고 있었다.

### 변경

- 어떤 핸들러도 예외 메시지를 응답 본문에 넣지 않는다. 상태별로 고정된 사용자용 한국어
  문구를 반환한다.
- 모든 에러 응답이 짧은 `traceId`(16진수 8자)를 담고, 예외와 함께 로깅된다. 누출된
  메시지를 대체하는 것이 이것이다. 사용자는 id를 알려주고 지원 담당은 그것으로 grep 한다.
- `handleCustomException`이 이제 `e.getMessage()`를 로깅하므로 발생 지점의 상세가 로그에
  도달한다.
- `handleConflict`를 `DataIntegrityViolationException`으로 좁히고
  `getMostSpecificCause().getMessage()` — 래퍼가 아닌 실제 근본 원인 — 을 로깅한다.
- `MethodArgumentNotValidException`은 필드별 메시지를 계속 반환한다. 우리가 최종 사용자를
  위해 직접 작성한 Bean Validation 문구이며 아무것도 노출하지 않는다.

응답 형태는 `traceId` 추가 외에는 그대로다. 클라이언트는 이미 `code`와 `message`를 읽고
있으므로 프론트 수정이 필요 없다.

### 검증

`GlobalExceptionHandlerTest`(신규, 6케이스)가 각 핸들러의 응답 본문에 누출 조각
(`insert into`, `USR_EMAIL`, `SQL statement`, `java.lang.Long`, `cannot be cast`, 내부
패키지명, `postId=4821`)이 **없음**을 단언하고, `CustomException`이 발생 지점 상세를 응답
밖에 두면서도 `ErrorCode`의 상태/코드/문구 계약을 지키는지, 그리고 7개 핸들러 전부가
`traceId`를 내보내는지 단언한다.

전체 스위트: 198 테스트, 실패 0.

---

## 002 — 게시글·댓글 변경을 작성자로 제한

**분야:** Security (OWASP A01 — 취약한 접근 통제)
**커밋:** `fix: reject post and comment mutations by non-authors`

### 문제

변경 엔드포인트 4개가 호출자 신원을 받으면서도 리소스 소유자와 대조한 적이 없었다.

| 엔드포인트 | 결과 |
|---|---|
| `PATCH /api/posts/{postId}` | 로그인한 아무나 남의 게시글 제목·본문을 다시 쓸 수 있음 |
| `DELETE /api/posts/{postId}` | 로그인한 아무나 남의 게시글을 소프트 삭제할 수 있음 |
| `PATCH /api/posts/{postId}/comments/{commentId}` | 로그인한 아무나 남의 댓글을 다시 쓸 수 있음 |
| `DELETE /api/posts/{postId}/comments/{commentId}` | 로그인한 아무나 남의 댓글을 삭제할 수 있음 |

두 컨트롤러 모두 `user.getId()`를 서비스로 넘겨 인가를 하는 것처럼 보였지만, 서비스는 그
id를 **오직** `UPT_id` 감사 컬럼을 채우는 데만 썼다.

```java
Post post = findById(postId);   // 소유권 확인 없음
post.delete();
post.setUpdatedBy(userId);      // userId는 감사용으로만 사용
```

인증 자체는 강제되고 있었으므로(유효한 JWT 쿠키 필요) 익명 접근은 아니었다. 하지만 방금
직접 가입한 계정을 포함해 인증된 모든 계정이, 연속된 id를 추측하는 것만으로 다른 모든
사용자의 콘텐츠를 변경할 수 있었다. 콘텐츠가 눈에 보이는 사용자명이 아니라 익명 번호로
귀속되는 플랫폼에서, 다른 학생의 댓글을 조용히 수정하는 것은 사실상 추적 불가능한
사칭이다. 게다가 감사 컬럼은 공격자를 정당한 수정자로 기록한다.

시간표와 알림 도메인은 이미 소유권을 검증하고 있었다. 서비스의 주된 콘텐츠인 게시글과
댓글만 아니었다.

### 변경

소유권 검증을 서비스 계층에서 강제한다(컨트롤러에 비즈니스 로직을 두지 않는다는 저장소
규칙에 따라). 현재의 HTTP 진입점만이 아니라 이 메서드를 호출하는 모든 곳이 보호된다.

- `PostService.verifyAuthor(Post, Long)` — `updatePost`, `deletePost` 맨 앞에서 호출
- `CommentService.verifyAuthor(Comment, Long)` — `updateComment`, `deleteComment` 맨 앞에서 호출

둘 다 `CustomException(ErrorCode.NO_ACCESS)`를 던져 **403 Forbidden**이 되고, 거부된 시도를
리소스 id와 요청자 id와 함께 `WARN`으로 남겨 grep 가능하게 했다.

검증은 어떤 상태 변경이나 부수 효과보다 **먼저** 실행된다. 거부된 요청은 엔티티도, S3 미디어
파이프라인도, Redis 게시글 미리보기 캐시도 건드리지 않는다.

익명 게시글을 특별 취급하지 않는다. 작성자는 `isAnonymous` 플래그와 무관하게 `USR_id`로
추적되므로 동일한 검증이 적용된다.

### 범위에 대한 메모

enum에 `Role.ADMIN`이 있지만 이를 사용하는 모더레이션 엔드포인트가 없어 관리자 우회는
추가하지 않았다. 나중에 모더레이션을 만든다면 그때 규칙을 넓힐 자리다. 의도적으로 미리
만들지 않았다.

### 검증

- `CommentServiceTest`(신규) — 4케이스: 작성자는 수정/삭제 가능. 타인은 `NO_ACCESS`로
  거부되고 댓글 내용, `is_valid` 플래그, 게시글의 `commentCount`가 모두 그대로다.
- `PostServiceTest.AuthorOnlyMutation`(신규) — 4케이스: 작성자는 수정/삭제 가능. 타인은
  거부되고 제목과 `is_valid` 플래그가 그대로이며, `verifyNoInteractions`로 미디어
  파이프라인과 미리보기 캐시가 전혀 건드려지지 않았음을 단언한다.

역검증 완료: `verifyAuthor` 호출 두 개를 제거하면 정확히 공격 경로 4케이스가 실패한다.
전체 스위트: 192 테스트, 실패 0.

---

## 001 — 댓글 목록 엔드포인트의 N+1 제거

**분야:** Performance / Query Optimization
**커밋:** `perf: remove N+1 queries from comment list rendering`

### 문제

`GET /api/posts/{postId}/comments`의 쿼리 수가 게시글의 댓글 수에 선형으로 비례해 늘었다.
댓글 `N`개를 서로 다른 작성자 `D`명이 쓴 게시글의 응답 렌더링 비용은 다음과 같았다.

| 출처 | 쿼리 수 |
|---|---|
| `CommentRepository.findByPost` | 1 |
| `CommentDto.fromEntity` → `comment.getUser()` 지연 로딩 | `D` |
| `CommentDto.fromEntity` → `comment.getPost().getTitle()` 지연 로딩 | 1 |
| 댓글마다 `CommentReactionService.getLikeSatateDto` (`existsBy…LIKE` + `existsBy…DISLIKE`) | `2N` |

서로 다른 작성자 50명이 쓴 댓글 200개짜리 게시글은 페이지 한 번 볼 때 **약 452 쿼리**를
실행했다. 애초에 이 지연 로딩들이 동작한 것도 `spring.jpa.open-in-view`가 기본값(`true`)으로
남아 있기 때문이다 — 컨트롤러가 서비스 트랜잭션 바깥에서 연관을 참조하고 있다.

같은 `fromEntity` 비용이 `GET /api/mypage/comments`에도 적용됐다. 사용자 본인 댓글을
페이징하면서 각 댓글의 상위 게시글을 개별적으로 지연 로딩했다.

### 변경

1. `CommentRepository.findByPost` — `join fetch c.user join fetch c.post` 추가.
   `CommentDto.fromEntity`가 두 연관을 무조건 참조하므로 지연 로딩은 애초에 최적화가
   아니었다.
2. `CommentRepository.findByUser` — 동일한 fetch join과 명시적 `countQuery`
   (Spring Data는 `join fetch`에서 카운트 쿼리를 유도하지 못한다).
3. `CommentReactionRepository.findActiveByUserAndCommentIds` — 댓글 목록 전체에 대한 조회자의
   활성 반응을 한 번에 가져오는 배치 조회 신규 추가.
4. `CommentReactionService.getLikeStates(List<Comment>, User)` — 목록의 모든 댓글에 대한
   조회자의 좋아요/싫어요 상태를 쿼리 한 번으로 해결하고 `Map<commentId, LikeStateDto>`를
   반환한다. 기존의 댓글 단위 `getLikeSatateDto`는 단일 댓글 호출부(반응 쓰기 엔드포인트)를
   위해 유지한다.
5. `CommentController.getComments` — 루프 안에서 댓글 단위 메서드를 호출하는 대신 배치 맵을
   사용한다.

`comments_reactions`의 `(CMT_id, USR_id)` 유니크 제약이 (댓글, 조회자) 쌍당 활성 반응이
최대 하나임을 보장하므로 배치 결과가 모호함 없이 맵으로 정리되고,
`CMT_id IN (…) AND USR_id = ?`도 그 인덱스로 처리된다.

### 결과

댓글 목록 렌더링이 이제 **댓글 수와 무관하게 정확히 2쿼리**다 — 목록 1회, 조회자 반응 1회.

### 검증

`CommentListQueryCountTest`(`@DataJpaTest`, Hibernate `generate_statistics`)가 다음을
단언한다.

- 댓글 33개의 쿼리 수가 댓글 3개의 쿼리 수와 같다,
- 렌더링 경로가 정확히 2개의 문장을 실행한다,
- 배치로 구한 반응 상태가 그것이 대체한 댓글 단위 조회 결과와 일치한다.

역검증 완료: fetch join을 되돌리면 3케이스 중 2개가 실패한다.
전체 스위트: 184 테스트, 실패 0.
