# Operations runbook

운영 장애에서는 증상을 먼저 보존하고 의존성, 애플리케이션, 데이터 영향 순서로 확인한다.
확인하지 않은 추정으로 데이터 삭제나 스키마 변경을 수행하지 않는다.

## 공통 초기 확인

```bash
docker ps -a -f name=highteenday-app
docker logs --tail 200 highteenday-app
curl -fsS --max-time 5 http://localhost:8081/actuator/health
```

다음 정보를 함께 기록한다.

- 장애 시작 시각과 최초 사용자 증상
- 배포된 이미지 또는 커밋
- HTTP 상태와 응답 지연
- 앱, MySQL, Redis 상태
- HikariCP active, pending과 Tomcat busy

## Redis 장애

`@ResilientRedis`는 예외가 발생한 뒤 기본값을 반환한다. timeout 전까지는 요청이 계속
대기하므로 “프로세스가 살아 있음”을 즉시 폴백과 같은 의미로 해석하지 않는다.

1. Redis 연결 가능 여부와 장애 시작 시각을 확인한다.
2. 앱 로그에서 Redis 예외, HikariCP 획득 실패, 인증 실패를 같은 시간대로 묶는다.
3. HikariCP active와 pending이 증가했다면 신규 트래픽을 줄이고 Redis 복구를 우선한다.
4. Redis를 복구한 뒤 health와 보호 API를 반복 확인한다.
5. HikariCP pending과 응답 지연이 정상 범위로 돌아오는 시각을 기록한다.
6. 조회수 버퍼와 일별 인기글 재구성 여부를 확인한다.

Redis 장애 중 조회수 증가는 기록되지 않을 수 있다. Redis 데이터가 초기화되면 DB에 아직
반영하지 않은 `post:views:*`와 중복 방지 키도 사라진다. 이를 수동으로 추정해 DB에 더하지
않는다. 손실 정책은 [DATA-001](../issues.md), 장애 근거는
[Redis 장애 Case](../../performance/cases/redis-failure-cascade.md)가 소유한다.

## 배포 실패

배포 workflow는 새 컨테이너를 기동한 뒤 management port 8081의 health가 120초 안에 UP인지
확인한다. 실패하면 컨테이너 상태와 마지막 로그 200줄을 출력하고 배포 전 이미지로
재기동한다.

자동 롤백 뒤에도 정상화되지 않으면 다음 순서로 확인한다.

1. workflow 로그에서 새 이미지와 이전 이미지 값을 확인한다.
2. `docker inspect highteenday-app`으로 실제 실행 이미지를 확인한다.
3. 애플리케이션 로그에서 Flyway, 환경변수, 포트 충돌과 외부 연결 실패를 찾는다.
4. ECR에 존재하는 이전 정상 이미지의 불변 태그를 확인한다.
5. `~/app/.env`의 `ECR_IMAGE`를 검증한 태그로 바꾸고 다시 기동한다.

```bash
docker compose -f docker-compose.prod.yml --env-file .env pull
docker compose -f docker-compose.prod.yml --env-file .env up -d --force-recreate
curl -fsS --max-time 5 http://localhost:8081/actuator/health
```

`latest`처럼 이동하는 태그는 수동 롤백 기준으로 사용하지 않는다.

## 로그와 SQL 확인

prod 애플리케이션 로그는 컨테이너 표준 출력에 남는다.

```bash
docker logs -f highteenday-app
```

dev에서 SQL을 확인하려면 `application-dev.properties`의 p6spy 로깅을 일시적으로 켠다.
prod의 p6spy는 비활성 상태를 유지한다. 조회수 동기화는
`View count batch sync complete` 로그로 주기와 반영 건수를 확인한다.

## 스키마 문제

스키마 변경과 Flyway 실패는 [MIGRATION.md](../MIGRATION.md)를 따른다.
적용된 migration을 수정하거나 `ddl-auto`로 우회하지 않는다.
