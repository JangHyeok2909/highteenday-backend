# Performance environment

성능 실행은 애플리케이션과 의존성을 Docker로 고정한다. 로컬 개발용 Compose와 섞지 않는다.

## 준비

1. `environment/.env.perf.example`을 `environment/.env.perf`로 복사한다.
2. 비밀값과 호스트 포트를 로컬 환경에 맞게 바꾼다.
3. Node.js 18 이상, Docker Compose, k6를 준비한다.

```bash
docker compose -f environment/docker-compose.perf.yml \
  --env-file environment/.env.perf up -d --build

docker compose -f environment/docker-compose.perf.yml \
  --env-file environment/.env.perf ps
```

## 기본 주소와 자원 한계

| 구성 요소 | 호스트 주소 | 컨테이너 한계 |
|---|---|---:|
| app | `http://localhost:18080` | CPU 2, memory 2.5GiB |
| MySQL | `localhost:13316` | CPU 2, memory 2GiB |
| Redis | `localhost:16389` | CPU 1, memory 512MiB |
| Prometheus | `http://localhost:9090` | Compose 파일 참조 |
| Grafana | `http://localhost:3001` | Compose 파일 참조 |

포트와 한계는 환경변수 또는 Compose 변경으로 달라질 수 있다. 실행 판단에는 문서의 기본값이
아니라 `run.json`에 기록된 값을 사용한다.

## 장애 주입 환경

MySQL이나 Redis의 네트워크 지연을 주입할 때만 Toxiproxy 오버레이를 추가한다.

```bash
docker compose \
  -f environment/docker-compose.perf.yml \
  -f environment/docker-compose.fault.yml \
  --env-file environment/.env.perf up -d
```

오버레이는 앱의 `DB_URL`과 `REDIS_HOST`를 Toxiproxy로 바꾼다. `docker stop`을 직접 사용하는
Redis crash 계획에는 프록시가 필요하지 않다.

## 실행 전 확인

- app, MySQL, Redis, Prometheus exporter가 healthy인지 확인한다.
- 앱 이미지가 현재 소스보다 오래되지 않았는지 확인한다.
- `DATASET_PROFILE`과 실제 MySQL 볼륨 이름이 일치하는지 확인한다.
- HikariCP 크기와 앱·DB 자원 한계를 기록한다.
- 비교 실행이라면 부하 발생기 위치를 동일하게 유지한다.

실행기는 가능한 항목을 자동 기록하지만, dirty 작업 트리와 stale 이미지는 사람이 결론의
범위를 제한해야 한다.
