# BTL-011: `Notification.entityId` 컬럼명 불일치 (알림 목록 전면 장애)

> 유형: Correctness (성능이 아니라 가용성 버그 — 부하 테스트 스크립트 검증 중 실측으로 발견)
> 상태: **확정** (재현 완료)
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

- **알림 목록 조회(`GET /api/notifications`)가 100% 장애** — 알림 배지 수(`/unread-count`,
  COUNT 쿼리라 `entity_id` 컬럼을 안 쓰는 것으로 보임)는 영향 없을 수 있으나,
  목록 자체를 열면 항상 500.
- 알림은 친구 신청/수락, 댓글, 좋아요 임계치 등 다양한 이벤트로 쌓이는 핵심 기능이라
  영향 범위가 넓다.

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
| Flyway 마이그레이션으로 컬럼명을 `entity_id`로 RENAME | 컨벤션 통일 | 기존 운영 데이터가 있다면 무중단 컬럼 rename 절차 필요 |
