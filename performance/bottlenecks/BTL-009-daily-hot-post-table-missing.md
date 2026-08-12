# BTL-009: `DailyHotPost` 엔티티가 실제로 쿼리하는 테이블이 생성되지 않음

> 유형: DB / Correctness (성능이 아니라 가용성 버그 — 성능 테스트 중 실측으로 발견)
> 상태: **해소** — V6 마이그레이션(`V6__create_daily_hot_post.sql`)으로 `daily_hot_post` 정식 생성 (커밋 `519d331`). 결함 있던 수동 스크립트 `ddl/V_daily_hot_post.sql`은 경고 주석을 달아 기록용으로 보존
> 관련: BTL-008과 유사한 계열의 스키마/엔티티 불일치 문제. `GET /api/hotposts/daily` 전면 장애

## 증상

`GET /api/hotposts/daily` 호출 및 `HotScoreScheduler`(주기 실행) 양쪽에서 500:

```
java.sql.SQLSyntaxErrorException: Table 'highteenday.daily_hot_post' doesn't exist
```

`BTL-008`을 고쳐 `lower_case_table_names=1`을 적용한 뒤에도 재현된다 — **이건 대소문자
문제가 아니라 테이블 이름 자체가 다른, 더 근본적인 문제다.**

## 원인

`domain/hot/DailyHotPost.java` 엔티티는 `@Table`에 `name`을 지정하지 않는다:

```java
@Entity
@Table(
    uniqueConstraints = @UniqueConstraint(name = "uk_daily_hot_post_date_post", ...),
    indexes = @Index(name = "idx_daily_hot_post_date_created", ...)
)
public class DailyHotPost extends BaseEntity { ... }
```

Spring Boot 기본 물리 네이밍 전략(`SpringPhysicalNamingStrategy`)은 CamelCase 클래스명을
스네이크케이스로 변환한다: `DailyHotPost` → **`daily_hot_post`**(언더스코어 포함).

그런데 `db/migration/V1__baseline.sql`이 실제로 만드는 테이블은 **`DailyHotPost`**
(클래스명 그대로, 언더스코어 없음, 15번째 줄 주석: "수동 스크립트
ddl/V_daily_hot_post.sql은 daily_hot_post를 만든다. 서로 다른 테이블이다").

즉 세 이름이 전부 다르다:

| 출처 | 실제 문자열 |
|------|-------------|
| Hibernate가 기대하는 이름 (네이밍 전략) | `daily_hot_post` |
| `V1__baseline.sql`이 만드는 테이블 | `DailyHotPost` (Hibernate가 쓰지 않는 고아 테이블) |
| `ddl/V_daily_hot_post.sql`(레거시 수동 스크립트) | `daily_hot_post` ✅ Hibernate 기대값과 일치 |

**`ddl/V_daily_hot_post.sql`은 레거시가 아니라, 실제로 필요한 테이블을 만드는
유일한 스크립트였다** — BTL-008 조사 당시 "V1 baseline이 이미 포함하니 적용하면
안 된다"고 판단한 것은 **틀린 결론**이었다. `V1__baseline.sql`의 `DailyHotPost`
테이블은 Hibernate가 절대 쿼리하지 않는 죽은 테이블이고, 진짜 필요한
`daily_hot_post`는 어디에서도 자동으로 만들어지지 않는다.

**추가 버그**: `ddl/V_daily_hot_post.sql`의 FK가 `REFERENCES post(PST_id)`로 되어
있는데, 실제 게시글 테이블명은 `posts`(복수형)다. 이 스크립트를 있는 그대로 실행하면
"Table 'highteenday.post' doesn't exist"로 또 실패한다 — 이 스크립트 자체도
현재 스키마 기준으로는 오래되어 깨져 있다.

## 영향

- HOT 게시글 조회(`/api/hotposts/daily`) 전면 장애 — 200이 아니라 항상 500
- `HotScoreScheduler`가 주기마다 예외를 던짐(스케줄러 자체가 죽지는 않지만 매번 실패 로그)
- 신선한 MySQL(이 저장소의 마이그레이션만으로 구성한 DB)에 앱을 처음 붙이는
  모든 환경(로컬 재현, CI, 신규 개발자 온보딩, 재해복구 시 DB 재구축)에서 100% 재현

## 재현 방법

```bash
# Flyway 마이그레이션만 적용된 순정 DB에서
curl -i localhost:18080/api/hotposts/daily
# → 500, 로그에 "Table '<db>.daily_hot_post' doesn't exist"
```

## 해결 방법

| 후보 | 효과 | 트레이드오프 |
|------|------|--------------|
| `DailyHotPost` 엔티티에 `@Table(name = "\`DailyHotPost\`")` 명시 | 코드 변경만으로 즉시 해결, 기존 baseline 그대로 사용 | 프로젝트의 테이블 네이밍 컨벤션(스네이크케이스)과 어긋남 |
| Flyway 신규 마이그레이션(V4)으로 정정된 `daily_hot_post` 생성 + 고아 `DailyHotPost` DROP | 근본 해결, 네이밍 컨벤션 일치 | 마이그레이션 스크립트 추가 필요, `ddl/V_daily_hot_post.sql`의 FK 오타(`post`→`posts`)도 함께 수정해야 함 |
| `ddl/V_daily_hot_post.sql`을 그대로 신규 환경에 적용 | 즉효 | FK 오타부터 먼저 고쳐야 하고, 제약명이 baseline의 고아 테이블과 충돌하므로 baseline의 `DailyHotPost`를 먼저 DROP하거나 제약명을 바꿔야 함(실측 중 실제로 이 충돌을 겪음) |

**성능 테스트 환경 임시 조치**: 이 저장소의 `environment/README.md` "게시판 시드"
절차 옆에 `daily_hot_post` 테이블을 (FK 대상을 `posts`로 고쳐서, 제약명을 바꿔서)
직접 생성하는 절차를 추가해야 한다. 근본 수정은 백엔드 코드/마이그레이션 담당자 몫이다.
