# DB 마이그레이션 (Flyway)

스키마는 Flyway가 소유한다. 엔티티를 고쳐도 컬럼이 자동으로 생기지 않으므로
`src/main/resources/db/migration` 에 마이그레이션을 추가해야 한다.

---

## 파일 규칙

```
src/main/resources/db/migration/
  V1__baseline.sql                       Flyway 도입 이전 스키마 (빈 DB에만 실행)
  V2__friend_relation_indexes.sql        친구 관계 조회용 인덱스
  V3__rename_notification_entity_id.sql  Notification 컬럼명 정정 (DB-003)
  V4__chat_room_category_group.sql       채팅방 category 확장
  V5__rename_token_table.sql             token → tokens 개명 (DB-001)
  V6__create_daily_hot_post.sql          daily_hot_post 정식 생성 (DB-002)
  V7__scraps_unique_usr_pst.sql          스크랩 중복 방지 유니크 제약 (DATA-002)
  V8__normalize_column_names.sql         명명 규칙을 벗어난 컬럼 3개 정정
  V9__drop_personal_schedule.sql         사용된 적 없는 personal_schedule 테이블 삭제
```


(괄호의 ID는 [`docs/issues`](issues/)의 현재 이슈 식별자다.)

- 이름은 `V{번호}__{설명}.sql`. **밑줄 두 개**다. 하나면 Flyway가 인식하지 못한다.
- 번호는 이어서 붙인다. 같은 번호를 두 사람이 쓰면 배포 시 충돌한다. PR을 올리기 전에
  `db/migration` 의 마지막 번호를 확인하는 게 안전하다.
- **이미 적용된 파일은 절대 수정하지 않는다.** Flyway가 체크섬을 비교해서 부팅을 거부한다.
  잘못 넣었으면 되돌리는 마이그레이션을 새 번호로 추가한다.
- MySQL 문법으로 쓴다. 테스트는 H2를 쓰므로 Flyway가 꺼져 있고, 이 파일들은 실행되지 않는다.

## 마이그레이션 추가하는 순서

1. 엔티티를 고친다.
2. 대응하는 DDL을 새 번호로 `db/migration` 에 추가한다.
3. 아래 "로컬에서 검증하기" 로 빈 DB와 기존 DB 양쪽에 돌려본다.
4. 커밋한다. 엔티티 변경과 마이그레이션은 같은 커밋에 두는 게 좋다. 나뉘면 중간 커밋에서
   애플리케이션이 뜨지 않는다.

컬럼 추가처럼 기존 행이 있는 변경은 **컬럼 추가 → 값 백필 → NOT NULL/UNIQUE 제약** 순서로
나눠 쓴다. 백필 전에 제약을 걸면 기존 행 때문에 실패한다. `ddl/V_group_chat.sql` 이 그 예다.

---

## 설정

`application.properties` 에 공통 설정이 있다.

| 설정 | 값 | 이유 |
|---|---|---|
| `spring.flyway.enabled` | `true` | 모든 프로필에서 켠다 |
| `spring.flyway.locations` | `classpath:db/migration` | |
| `spring.flyway.baseline-on-migrate` | `true` | 도입 전부터 있던 DB를 처리 (아래 참고) |
| `spring.flyway.baseline-version` | `1` | V1을 "이미 적용됨"으로 표시 |
| `spring.flyway.clean-disabled` | `true` | 운영 DB에서 `clean` 사고를 막는다 |

`spring.jpa.hibernate.ddl-auto` 는 dev/prod 모두 `none` 이다. dev는 예전에 `update` 였고
그래서 dev DB에 운영과 다른 타입으로 만들어진 컬럼이 남아 있다. 드리프트를 정리한 뒤에는
`validate` 로 올려 부팅 시점에 불일치를 잡는 것이 목표다.

테스트는 `build.gradle` 의 test 태스크가 `spring.flyway.enabled=false` 를 넣어 끈다.
테스트 스키마는 Hibernate가 엔티티에서 만든다.

---

## baseline-on-migrate가 하는 일

Flyway를 처음 붙일 때 문제가 되는 건 **이미 스키마가 들어 있는 DB** 다. 그대로 V1을 실행하면
"테이블이 이미 있다" 로 실패한다. `baseline-on-migrate=true` + `baseline-version=1` 은 이 경우
V1을 **실행하지 않고 적용된 것으로 표시만** 하고 V2부터 진행한다.

실제 MySQL 8.4로 양쪽 경로를 확인한 결과다.

| 상황 | 동작 |
|---|---|
| 기존 스키마가 있는 DB | V1을 `BASELINE` 으로 기록하고 건너뜀 → V2부터 실행 |
| 빈 DB | V1부터 최신 버전까지 순서대로 전부 실행 (V1이 테이블 24개 생성) |

즉 **V1과 운영 DB의 실제 스키마가 완전히 같지 않아도 마이그레이션은 정상 동작한다.**
V1은 새로 만드는 빈 DB에만 쓰인다.

---

## V1이 "코드가 기대하는 스키마" 라는 점

V1은 이 커밋 시점의 JPA 엔티티에서 Hibernate 메타데이터로 추출했다. 운영 DB를 덤프한 것이
아니므로, 아래 항목은 실제 운영 스키마와 다를 수 있다. 확인된 차이는 이렇다.

1. **enum 컬럼** — Hibernate 6은 `@Enumerated(STRING)` 을 MySQL 네이티브 `enum(...)` 으로
   만든다. 기존 수동 스크립트 `ddl/V_group_chat.sql` 은 같은 컬럼(`CHT_PT_role`,
   `CHT_MSG_type`)을 `VARCHAR(20)` 으로 만들었다.
2. **`DailyHotPost` vs `daily_hot_post`** — 엔티티에 `@Table(name=...)` 이 없어서 테이블명이
   클래스명 그대로 `DailyHotPost` 가 된다. 반면 `ddl/V_daily_hot_post.sql` 은
   `daily_hot_post` 를 만들고, 그 안에서 `post(PST_id)` 를 참조하는데 실제 테이블명은
   `posts` 다. **둘은 서로 다른 테이블이고 스크립트 쪽에는 오타가 있다.** 어느 쪽이 운영에
   들어가 있는지 확인이 필요하다.
3. **`Token` 테이블의 UNIQUE 제약 이름** — Hibernate가 자동 생성한 값(`UK7b8qtg...`)이라
   환경마다 다를 수 있다.

운영과 정확히 일치하는 baseline이 필요해지면 실제 DB를 덤프해서 V1을 교체한다. V1은 기존
DB에서 실행되지 않으므로, 교체해도 이미 baseline된 DB에는 영향이 없다.

```bash
mysqldump --no-data --skip-add-drop-table --skip-comments \
  -h <host> -u <user> -p <database> > V1__baseline.sql
```

교체할 때 `flyway_schema_history` 의 V1 체크섬이 달라지는데, `BASELINE` 타입 행은
체크섬 검증 대상이 아니라 문제가 되지 않는다.

---

## 기존 데이터베이스에 처음 적용할 때

**dev/prod에 처음 배포하기 전에 확인할 것.**

1. `ddl/` 아래 수동 스크립트가 해당 DB에 적용되어 있는지 확인한다. Flyway 도입 이전 스크립트라
   Flyway가 관리하지 않는다. 특히 `V_group_chat.sql` 은 단체 채팅 배포 전에 실행해야 한다고
   스크립트 주석에 적혀 있다.

   ```sql
   -- 적용 여부 확인 예시
   SHOW COLUMNS FROM chat_rooms LIKE 'CHT_RM_pair_key';
   SHOW COLUMNS FROM chat_participants LIKE 'CHT_PT_role';
   ```

2. 첫 배포 시 Flyway가 자동으로 `flyway_schema_history` 를 만들고 V1을 baseline으로 기록한 뒤
   V2를 적용한다. 별도 조작은 필요 없다.

3. 배포 후 확인한다.

   ```sql
   SELECT installed_rank, version, description, type, success
   FROM flyway_schema_history ORDER BY installed_rank;
   ```

   V1이 `BASELINE`, V2가 `SQL` 로 성공 기록되어 있으면 정상이다.

---

## 로컬에서 검증하기

로컬 개발용 MySQL(`docker compose up -d mysql`)에는 이미 데이터가 있으므로, 빈 DB 검증은 임시 컨테이너를 따로 띄워 쓴다.


```bash
docker run -d --name htd-mysql-check \
  -e MYSQL_ROOT_PASSWORD=rootpw -e MYSQL_DATABASE=fresh_db \
  -p 13306:3306 mysql:8

# 빈 DB에 전부 적용
docker run --rm --network container:htd-mysql-check \
  -v "$(pwd)/src/main/resources/db/migration:/flyway/sql" \
  flyway/flyway:10 \
  -url="jdbc:mysql://localhost:3306/fresh_db?allowPublicKeyRetrieval=true&useSSL=false" \
  -user=root -password=rootpw -baselineOnMigrate=true -baselineVersion=1 migrate

docker rm -f htd-mysql-check
```

기존 DB 경로도 확인하려면, 새 DB를 만들어 V1만 수동으로 넣고(= 도입 전 상태) 위 명령을
돌려 V1이 `BASELINE` 으로 건너뛰어지는지 본다.

---

## 아직 안 한 것

- `ddl/V_daily_hot_post.sql` 과 `ddl/V_group_chat.sql` 은 Flyway로 옮기지 않았다. 이미
  적용되었는지가 환경마다 다를 수 있어서, 임의로 마이그레이션으로 만들면 "컬럼이 이미 있다"로
  배포가 실패한다. 각 환경의 적용 상태를 확인한 뒤 정리하는 것이 맞다.
- 위에 적은 `DailyHotPost` / `daily_hot_post` 불일치는 V6 가 `daily_hot_post` 를 정식으로 만들어
  해소했다. V1 baseline 이 만드는 `DailyHotPost` 는 아무도 쿼리하지 않는 고아 테이블로 남아 있다
  ([DB-002](issues/) 참고).
