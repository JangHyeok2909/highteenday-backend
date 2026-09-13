# Repository rules

HighTeenDay Backend에서 코드 에이전트가 따라야 할 저장소 규칙이다. 제품 설명과 운영 지식은
`docs/`, 성능 측정 계약은 `performance/`에 둔다.

## 기본 명령

```bash
./gradlew test
./gradlew build
./gradlew bootRun --args='--spring.profiles.active=dev'
docker compose up -d --build

cd performance
npm test
```

Java 17을 사용한다. 성능 도구는 Node.js 18 이상이 필요하다.

## 코드 구조

- `controllers/`: HTTP 매핑, 입력 검증, 응답 변환
- `services/`: 유스케이스와 트랜잭션 조정
- `domain/`: 엔티티, repository, 외부 저장소 port
- `infrastructure/`: Redis 등 외부 시스템 adapter
- `security/`: Spring Security filter와 JWT 처리
- `schedulers/`: 주기 작업
- `configs/`: Spring 구성
- `exceptions/`: 오류 코드와 HTTP 예외 변환

Controller에 비즈니스 규칙을 넣지 않는다. 엔티티를 HTTP 응답으로 직접 노출하지 않는다.

## 구현 규칙

- 생성자 주입과 `final` 필드를 사용한다.
- 쓰기 유스케이스에는 `@Transactional`, 읽기에는 가능한 경우
  `@Transactional(readOnly = true)`를 사용한다.
- DB 트랜잭션 안에서 Redis, S3, 메시지 발행을 기다리지 않는다. 원자성이 필요하지 않은
  외부 작업은 커밋 뒤 또는 트랜잭션 밖으로 분리한다.
- 도메인 오류는 `CustomException`과 `ErrorCode`로 표현한다.
- DTO 변환은 명시적으로 수행하고 LAZY 연관을 반복 접근하지 않는다.
- 대량 목록은 OFFSET 비용과 응답 크기를 확인한다.
- 추측성 추상화와 도달할 수 없는 방어 코드를 추가하지 않는다.

## 데이터베이스

스키마는 Flyway가 소유한다. dev와 prod에서 `ddl-auto=none`을 유지한다.

- 적용된 migration 파일을 수정하지 않는다.
- `src/main/resources/db/migration/`의 다음 번호로 새 migration을 추가한다.
- 엔티티 변경과 migration을 같은 변경 단위에 둔다.
- 기존 데이터가 있으면 컬럼 추가, 백필, 제약 적용 순서를 지킨다.
- 절차는 `docs/MIGRATION.md`를 따른다.

## 보안

- 비밀번호, 토큰, 개인정보와 내부 비밀값을 로그나 문서에 남기지 않는다.
- 변경 요청은 리소스 소유권을 확인한다.
- 익명 게시물과 댓글은 작성자 식별 정보를 노출하지 않는다.
- 인증 실패와 DB·Redis 같은 인프라 실패를 같은 상태 코드로 처리하지 않는다.
- 자격 증명은 환경변수로 전달한다.

## 주석

코드가 계약과 이유를 표현하지 못할 때만 주석을 쓴다.

- 한국어 현재형 문장으로 작성한다.
- 다음 줄의 동작을 그대로 설명하지 않는다.
- 호출자가 알아야 하는 제약과 실패 의미는 Javadoc으로 남긴다.
- TODO에는 추적 가능한 이슈와 제거 조건을 적는다.
- 과거 작업 번호나 변경 이력을 주석에 남기지 않는다.
- 동작을 바꾸면 인접 주석도 함께 고친다.
- 적용된 Flyway migration은 주석 정리를 이유로 수정하지 않는다.

## 테스트

- 변경한 사용자 동작을 재현하는 테스트를 우선한다.
- 쿼리, 제약, 트랜잭션이 핵심이면 repository mock으로 대신하지 않는다.
- JPQL과 QueryDSL은 `@DataJpaTest` 또는 실제 테스트 DB에서 검증한다.
- 보안 변경은 공개·보호 경로와 실제 HTTP 상태를 함께 검증한다.
- 측정 도구를 바꾸면 `performance`의 Node.js 테스트도 실행한다.

## 성능 측정

Before/After는 앱 이미지, 데이터셋 지문, 부하 모델, 측정 구간과 자원 한계가 같을 때만
비교한다. 자동 생성된 `run.json`과 `report.html`은 수정하지 않는다. 자세한 계약은
`performance/METHOD.md`를 따른다.

큰 실행 파일은 통째로 읽지 않는다. `jq`, `rg`, `head`, `tail`로 필요한 범위만 추출한다.
특히 다음 경로를 주의한다.

- `performance/reports/index.json`
- `performance/reports/**/hostprobe.jsonl`
- `performance/resilience/reports/**`
- `schoolData/**/*.json`

## 문서

- 현재 동작만 정본 문서에 쓴다.
- 한 사실은 한 문서에서 소유하고 다른 곳에서는 링크한다.
- 과거 수치에는 실행 ID나 원자료 경로를 붙인다.
- 확인하지 못한 운영 절차와 추측한 대안을 정본에 넣지 않는다.
- 해결된 이슈는 현재 이슈 장부에서 제거한다.

## Git

`develop`이 통합 브랜치이고 `main`은 배포 브랜치다.

- 작업 브랜치는 `origin/develop`에서 만든다.
- PR의 base는 `develop`으로 지정한다.
- 브랜치 접두사는 `feature/`, `fix/`, `refactor/`, `test/`, `chore/`, `perf/`를 사용한다.
- 커밋은 Conventional Commits 형식으로 작성하고 본문에 변경 이유와 효과를 적는다.
- 커밋 제목과 본문은 한국어로 작성한다.
- 사용자의 명시적 요청 없이 commit, push, force-push하지 않는다.
- 사용자 작업과 무관한 dirty 파일을 되돌리거나 덮어쓰지 않는다.
