# Testing

## 기본 명령

```bash
./gradlew test
./gradlew build
```

성능 측정 도구의 Node.js 테스트는 별도로 실행한다.

```bash
cd performance
npm test
```

## 테스트 경계

| 종류 | 목적 |
|---|---|
| 단위 테스트 | 순수 계산과 분기 계약 확인 |
| `@DataJpaTest` | JPQL, QueryDSL, migration 전제, 쿼리 수 확인 |
| 웹 슬라이스 테스트 | 매핑, validation, 직렬화, 비로그인 인가 확인 |
| 보안 테스트 | 공개·보호 경로와 filter 동작 확인 |
| 통합 테스트 | 여러 adapter와 트랜잭션 경계 확인 |
| 성능 Study/Case | 지연, 자원 포화, 장애 전파 확인 |

결함을 수정할 때는 구현 방식이 아니라 사용자에게 드러난 증상을 재현하는 테스트를 우선한다.
예를 들어 소유권 결함은 특정 private 메서드 호출이 아니라 다른 사용자의 수정 요청이
거절되는지를 검증한다.

## 데이터베이스 테스트

서비스 테스트에서 DB 동작을 검증할 때 repository를 mock해서 SQL 의미를 대신하지 않는다.
쿼리, 제약조건, 트랜잭션이 핵심인 경우 실제 테스트 DB 또는 `@DataJpaTest`를 사용한다.

Flyway migration은 적용 순서와 현재 스키마를 함께 검증한다. 이미 적용한 파일은 테스트를
통과시키기 위해 고치지 않는다.

## CI

워크플로는 테스트가 성공한 뒤에만 빌드와 배포 단계로 넘어가야 한다. 워크플로 자체의
게이트 조건은 `ci` 패키지 테스트가 검증한다. Dockerfile의 `-x test`는 CI에서 이미 테스트를
통과한 이미지를 빌드한다는 전제다.

## 성능 검증

코드 수정 전후의 숫자는 [measurement contract](../performance/reference/measurement-contract.md)를
충족할 때만 비교한다. 실행 원자료는 수정하지 않고 결론은 Study 또는 Case에 기록한다.
