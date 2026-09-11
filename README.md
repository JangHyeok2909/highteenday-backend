# HighTeenDay Backend

고등학생 커뮤니티 HighTeenDay의 Spring Boot 백엔드다.

- Java 17, Spring Boot 3.4.5
- MySQL 8, JPA, QueryDSL, Flyway
- Redis
- JWT와 OAuth2
- AWS S3
- WebSocket/STOMP

## 로컬 실행

개발 프로필은 로컬 MySQL과 Redis 주소를 기본값으로 사용한다. JWT 키처럼 비밀인 값은
환경변수로 제공한다.

```bash
./gradlew test
./gradlew bootRun --args='--spring.profiles.active=dev'
```

Docker 환경은 다음 명령으로 올린다.

```bash
docker compose up -d --build
```

DB 스키마는 Flyway가 소유한다. 이미 적용한 migration은 수정하지 않고 다음 버전 파일을
추가한다.

## 주요 구조

```text
src/main/java/com/example/highteenday_backend/
├── controllers/       HTTP 요청과 응답
├── services/          도메인·보안·외부 시스템 조정
├── domain/            엔티티와 repository
├── infrastructure/    Redis 등 외부 저장소 adapter
├── security/          JWT와 Spring Security filter
├── schedulers/        조회수·점수·토큰 정리 작업
├── configs/           Spring 구성
└── exceptions/        오류 코드와 HTTP 변환
```

## 문서

- [문서 지도](docs/INDEX.md)
- [DB migration](docs/MIGRATION.md)
- [Redis 계약](docs/crosscutting/redis.md)
- [운영 runbook](docs/operations/runbook.md)
- [현재 이슈](docs/issues/)
- [성능·장애 측정](performance/)

이전 장문 설명과 장부는 [문서 아카이브](docs/archive/)와
[성능 문서 아카이브](performance/archive/)에 보존되어 있으며 현재 동작의 정본은 아니다.

## 검증

```bash
# 애플리케이션 테스트
./gradlew test

# 성능 측정 도구 테스트
cd performance
npm test
```

코딩 규칙과 에이전트 작업 규칙은 [CLAUDE.md](CLAUDE.md)를 따른다.
