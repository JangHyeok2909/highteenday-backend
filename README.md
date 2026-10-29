# HighTeenDay Backend

고등학생 익명 커뮤니티 HighTeenDay의 Spring Boot API 서버다. 동아리 프로젝트로 시작해 지금은 한 명이
유지보수하며, 로컬 환경에서 부하와 장애를 주입해 성능과 장애 대응을 개선한 기록을 함께 둔다.

## 개요

| 항목 | 내용 |
|---|---|
| 서비스 | 게시판·게시글·댓글(익명), 좋아요·싫어요, 스크랩, 일간 인기글, 알림, 친구, 1:1·단체 채팅, 학교 급식·시간표 |
| 개발 | 2025.05 ~ 2025.08 동아리 팀 개발(백엔드 3명, 프론트엔드 4명), 2025.09부터 백엔드 단독 유지보수 |
| 프론트엔드 | [highteenday-frontend](https://github.com/JangHyeok2909/highteenday-frontend) (React) |
| 상태 | AWS에 배포했고 지금은 비용 문제로 내렸다. 성능·장애 실험은 Docker Compose 로컬 환경에서 수행한다 |

## 구조

<img src="docs/images/architecture.svg" alt="HighTeenDay 애플리케이션과 실험 환경 구조" width="760">

MySQL이 데이터의 정본이고, Redis는 목록 캐시, DB 반영 전 조회수, 일간 인기글 순위를 둔다. Redis 호출은
명령 타임아웃과 서킷브레이커로 감싸 Redis 장애 때 예외 대신 기본값을 돌려준다. 파란 점선 안은 실험
도구다. 부하는 k6 시나리오로 넣고, MySQL·Redis 장애는 Toxiproxy(지연·응답 차단)와 컨테이너 정지로
주입한다. 저장소별 데이터 소유와 Redis 키는 [시스템 구조와 데이터 경계](docs/architecture.md)가 소유한다.

## 다룬 문제

같은 조건으로 반복 실행한 부하·장애 실험으로 확인한 결과다. 원자료와 실행 ID는 각 사례 문서에 있다.

| 문제 | 변경 | 결과 | 사례 |
|---|---|---|---|
| 댓글 목록 N+1 | 반응 일괄 조회, 작성자 fetch join | 요청당 쿼리 1,507개에서 평균 3.9개 | [comment-query-amplification](performance/cases/comment-query-amplification.md) |
| Redis 정지 시 모든 API 지연 | 명령 타임아웃 100ms, 서킷브레이커 | 장애 구간 p95 60,003ms에서 224ms, 오류율 31.75%에서 0% | [redis-failure-cascade](performance/cases/redis-failure-cascade.md) |
| MySQL 정지 시 요청 대기 | 커넥션 획득·소켓·쿼리 타임아웃 | 장애 구간 p95 hang 51.3초에서 5.0초, crash 52.1초에서 1.0초 | [mysql-unavailable-wait-bound](performance/cases/mysql-unavailable-wait-bound.md) |
| 응답 유실 뒤 재시도로 좋아요가 꺼짐 | 토글 POST를 PUT·DELETE로 전환 | 좋아요 재시도 23건 결함 0건 (나머지 액션은 진행 중) | [retry-after-lost-response](performance/cases/retry-after-lost-response.md) |

남은 문제는 [현재 알려진 문제](docs/issues.md)에 있다.

## 기술 구성

- Java 17, Spring Boot 3.4.5, Spring Security
- MySQL 8, JPA, QueryDSL, Flyway
- Redis, Resilience4j, JWT, OAuth2, WebSocket/STOMP
- AWS S3
- 성능·장애 실험: k6, Toxiproxy, Prometheus, Grafana

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
