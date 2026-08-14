# BTL-011: `Notification.entityId` 컬럼명 불일치 (알림 목록 전면 장애)

> **해소된 애플리케이션 결함 — 참조 보존용으로 남긴다.**
>
> 이건 병목(느려서 문제)이 아니라 결함(틀려서 문제)이다. 앞으로 발견되는 애플리케이션
> 결함의 단일 출처는 [`docs/KNOWN-ISSUES.md`](../../docs/KNOWN-ISSUES.md)이며, 이 문서는
> 그 구분이 정해지기 전에 등록됐다. 자세한 배경은
> [`bottlenecks/README.md`](README.md)의 "여기 없는 것 — 애플리케이션 결함" 절을 볼 것.
>
> **해소됐는데도 삭제하지 않는 이유:** 적용이 끝난 Flyway 마이그레이션 주석이 이 번호를
> 가리키고 있고, 적용된 마이그레이션은 체크섬 때문에 수정할 수 없다.
>
> - `src/main/resources/db/migration/V3__rename_notification_entity_id.sql:15`
>
> 이 문서를 지우면 저 주석이 존재하지 않는 문서를 가리키게 된다.

> 유형: Correctness (성능이 아니라 가용성 버그 — 부하 테스트 스크립트 검증 중 실측으로 발견)
> 상태: **해소** (V3 마이그레이션 + 엔티티 `@Column` 적용, 읽기·쓰기 재현 검증 완료)
> 관련: BTL-009와 같은 계열(엔티티 필드 ↔ 실제 컬럼명 불일치) — 이번엔 테이블이 아니라 컬럼

## 증상

`GET /api/notifications` (알림 목록)이 항상 500:

```
JDBC exception executing SQL
[select ... from notifications n1_0 where n1_0.usr_rec_id=? and n1_0.is_valid
 order by n1_0.nt_is_read, n1_0.created_at desc limit ?]
[Unknown column 'n1_0.entity_id' in 'field list']
```

## 원인

`domain/notification/Notification.java`:

```java
@Column(name = "NT_entity_type")
private EntityType entityType;

private Long entityId;   // ← @Column(name=...) 없음
```

`entityId` 필드에 `@Column` 지정이 없어 Hibernate 기본 네이밍 전략이
`entityId` → **`entity_id`**(스네이크케이스)로 변환해 쿼리한다.

그런데 실제 `notifications` 테이블(`DESCRIBE notifications` 실측)의 컬럼명은:

```
entityId   bigint   YES   NULL      ← 언더스코어 없이 그대로
```

이 프로젝트의 나머지 모든 컬럼은 `{DOMAIN_PREFIX}_{column}` 컨벤션(`NT_id`, `NT_CAT`,
`NT_entity_type` 등)을 따르는데, 이 컬럼 하나만 컨벤션에서 벗어나 있고 엔티티 쪽도
`@Column` 지정을 빠뜨려 마이그레이션이 만든 실제 이름과 어긋난다.

## 영향

**최초 기록보다 범위가 넓었다 — 조회뿐 아니라 저장도 실패하고 있었다.**
small 프로파일 시드 1회 + 스모크 실행 동안 실측한 앱 로그 집계:

| 경로 | 실패 건수 | 쿼리 |
|------|----------:|------|
| **INSERT** | **8,748** | `insert into notifications (... entity_id ...)` → `Unknown column 'entity_id' in 'field list'` |
| SELECT | 80 | `select ... n1_0.entity_id ...` → `Unknown column 'n1_0.entity_id'` |

즉 알림은 목록이 안 열리는 정도가 아니라 **애초에 한 건도 쌓이지 않았다**
(`SELECT COUNT(*) FROM notifications` = 0). 배지 수(`/unread-count`)가 200을 반환한 것은
기능이 살아 있어서가 아니라 셀 데이터가 0건이었기 때문이다.

- 알림은 친구 신청/수락, 댓글, 좋아요 임계치 등 다양한 이벤트로 쌓이는 핵심 기능이라
  영향 범위가 넓다.
- `entityId`는 `V1__baseline.sql`(Flyway 도입 이전 운영 스키마)에 정의돼 있다 —
  **따라서 이 장애는 성능 환경 한정이 아니라 운영에도 동일하게 존재했다.**

## 재현 방법

```bash
k6 run scripts/notifications.js -e VUS=5 -e DURATION=20s -e DATASET=smoke -e BASE_URL=http://localhost:18080
# 또는 scenarios/lib/workload.js의 journeyNotification 경유(normal-day 등 모든 시나리오에서 간접 재현)
```

직접 확인:
```sql
DESCRIBE notifications;   -- entityId (언더스코어 없음) 확인
```

## 해결 방법

`Notification.java`의 `entityId` 필드에 실제 컬럼명을 명시:

```java
@Column(name = "entityId")   // 또는 마이그레이션에서 컬럼명을 entity_id로 RENAME
private Long entityId;
```

두 방향 중 하나를 선택:

| 후보 | 효과 | 트레이드오프 |
|------|------|--------------|
| 엔티티에 `@Column(name="entityId")` 명시 | 즉시 해결, 코드 한 줄 | 프로젝트 네이밍 컨벤션과 이 컬럼만 계속 어긋남 |
| Flyway 마이그레이션으로 컬럼명을 RENAME | 컨벤션 통일 | 기존 운영 데이터가 있다면 무중단 컬럼 rename 절차 필요 |

## 적용한 해결 (2026-07-31)

**컨벤션 통일 방향을 택했다.** 바로 옆 컬럼이 `NT_entity_type`이므로 `NT_entity_id`가
짝이 맞고, CLAUDE.md의 `{DOMAIN_PREFIX}_{column}` 규칙과도 일치한다.

```sql
-- V3__rename_notification_entity_id.sql
ALTER TABLE notifications RENAME COLUMN entityId TO NT_entity_id;
```
```java
// Notification.java
@Column(name = "NT_entity_id")
private Long entityId;
```

`RENAME COLUMN`은 데이터를 보존하며 MySQL 8에서 메타데이터 연산으로 처리된다.
컬럼명은 대소문자를 구분하지 않으므로 Hibernate가 만드는 `nt_entity_id`와도 매칭된다.

### 검증

`docs/MIGRATION.md`의 요구대로 **기존 DB와 빈 DB 양쪽**에서 확인:

| 대상 | 결과 |
|------|------|
| 기존 DB (V1·V2 적용됨) | V3 추가 적용 성공, 컬럼 `NT_entity_id`로 변경, 기존 데이터 보존 |
| 빈 DB | V1 → V2 → V3 순차 적용 성공 |

기능 재현 검증 (A가 글 작성 → B가 댓글 → A가 알림 확인):

```
글 작성    201  id=502
댓글 작성  201
알림 목록  200  {"totalElements":1,"notifications":[{"id":1,"category":"POST_COMMENT",
                 "entityType":"POST","entityId":502,"message":"내 게시글에 댓글이 달렸습니다."}]}
```

저장(`id:1` — 최초로 성공한 알림 행)과 조회가 모두 정상 동작한다.
