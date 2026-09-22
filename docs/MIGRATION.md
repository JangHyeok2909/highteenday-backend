# Database migrations

MySQL 스키마는 Flyway가 변경한다. 엔티티를 수정해도 dev와 prod의
`spring.jpa.hibernate.ddl-auto=none` 설정은 스키마를 자동 변경하지 않는다.

## 변경 절차

1. `src/main/resources/db/migration/`에서 가장 높은 버전을 확인한다.
2. `V{다음 번호}__{설명}.sql`을 추가한다. 구분자는 밑줄 두 개다.
3. 엔티티와 SQL의 컬럼명, 타입, null 허용 여부, 기본값과 인덱스를 대조한다.
4. 기존 데이터가 있는 MySQL과 빈 MySQL에서 migration을 실행한다.
5. 애플리케이션 테스트와 실제 MySQL 부팅을 확인한다.
6. 엔티티 변경과 migration을 같은 변경 단위로 제출한다.

적용된 migration은 내용이나 주석을 수정하지 않는다. 잘못된 변경도 다음 버전의 forward
migration으로 고친다.

## 기존 데이터가 있는 변경

제약을 바로 추가하면 기존 행 때문에 배포가 실패할 수 있다. 필요한 경우 migration을 다음
순서로 나눈다.

1. null을 허용하는 컬럼 또는 새 구조를 추가한다.
2. 기존 값을 백필하고 누락과 중복을 검사한다.
3. 애플리케이션이 새 구조를 사용하도록 배포한다.
4. `NOT NULL`, `UNIQUE`, FK와 불필요한 옛 컬럼 정리를 적용한다.

큰 테이블의 인덱스와 컬럼 변경은 잠금 시간과 디스크 여유를 별도로 확인한다.

## baseline 동작

공통 설정은 `baseline-on-migrate=true`, `baseline-version=1`이다.

- 비어 있는 DB에서는 V1부터 순서대로 실행한다.
- Flyway 이력은 없지만 스키마가 이미 있는 DB에서는 V1을 `BASELINE`으로 기록하고 V2부터
  실행한다.

V1은 새 환경의 시작점이므로 다른 migration과 마찬가지로 수정하지 않는다. 운영 스키마와
V1의 차이는 새 migration으로 수렴시킨다.

`src/main/resources/ddl/`은 Flyway 도입 전 수동 스크립트의 기록이다. 배포 입력으로 실행하지
않는다. 현재 애플리케이션 스키마는 `db/migration/`만 따라야 한다.

## 검증

일반 테스트는 H2가 엔티티에서 스키마를 만들기 때문에 MySQL migration 검증을 대체하지
못한다. 변경 전용 MySQL에서 애플리케이션을 시작해 Flyway 적용을 확인한다.

```bash
docker compose up -d mysql
./gradlew bootRun --args='--spring.profiles.active=dev'
```

적용 결과는 MySQL에서 확인한다.

```sql
SELECT installed_rank, version, description, type, success
FROM flyway_schema_history
ORDER BY installed_rank;
```

배포 전에는 백업 또는 복구 지점, 예상 잠금 시간, 롤백 대신 사용할 forward migration을
준비한다. 배포 후에는 Flyway 이력과 변경된 제약·인덱스를 직접 확인한다.
