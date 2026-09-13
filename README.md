# HighTeenDay Backend

고등학생 커뮤니티 HighTeenDay의 Spring Boot API 서버다.

## 기술 구성

- Java 17, Spring Boot 3.4.5
- MySQL 8, JPA, QueryDSL, Flyway
- Redis, JWT, OAuth2, WebSocket/STOMP
- AWS S3

## 실행

전체 로컬 환경은 Docker Compose로 실행한다.

```bash
docker compose up -d --build
```

애플리케이션만 실행하려면 MySQL과 Redis를 먼저 준비한 뒤 dev 프로필을 사용한다.

```bash
./gradlew bootRun --args='--spring.profiles.active=dev'
```

기본 검증 명령은 다음과 같다.

```bash
./gradlew test
./gradlew build

cd performance
npm test
```

성능 도구는 Node.js 18 이상이 필요하다.

## 문서

- [시스템 구조와 데이터 경계](docs/architecture.md)
- [현재 알려진 문제](docs/issues.md)
- [DB 마이그레이션](docs/MIGRATION.md)
- [운영 대응 절차](docs/operations/runbook.md)
- [성능·장애 실험](performance/README.md)

문서의 역할과 정본은 [docs/README.md](docs/README.md)에서 확인한다. 개발 규칙은
[CLAUDE.md](CLAUDE.md)가 소유한다.
