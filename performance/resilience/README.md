# Resilience runner

이 도구는 의존성이 죽거나 느려질 때 실패 범위와 회복 과정을 관측한다. 일반 성능 회귀와
다르게 같은 실행의 `pre`, `fault`, `post`를 비교한다.

## 실행

```bash
# 계획만 검증
node resilience/fault-run.js resilience/faults/redis-crash.json --dry-run

# Redis 프로세스 정지·복구
node resilience/fault-run.js resilience/faults/redis-crash.json \
  --note "변경 전"

# 저장된 원자료로 HTML만 다시 생성
node resilience/render-report.js redis-crash-2026-09-11T00-47-40
```

Toxiproxy 계획은 먼저 오버레이를 올린다.

```bash
docker compose \
  -f environment/docker-compose.perf.yml \
  -f environment/docker-compose.fault.yml \
  --env-file environment/.env.perf up -d
```

## 계획 파일

`faults/*.json`에는 질문, 부하, 구간, 주입 동작, 예상 결과, 데이터 불변식을 기록한다.
주입 도구는 `docker`, `toxiproxy`, `pumba`, 제한된 `shell` 동작을 지원한다.

계획은 절차의 정본이다. 원인 설명이나 실험 후 판단은 계획 JSON에 넣지 않는다.

## 안전 계약

- 실행 전 주입 대상과 연결 경로를 확인한다.
- 정상 종료, 오류, Ctrl+C에서 가능한 원상복구를 수행한다.
- 실행 후에도 컨테이너와 toxic 상태를 직접 확인한다.
- Redis 정합성 실험은 이전 캐시와 조회수 중복 키를 초기화한다.
- 생성된 `run.json`은 수정하지 않는다.

## 결과

각 실행은 `resilience/reports/<runId>/`에 다음 파일을 남긴다.

- `run.json`: 계획, 주입 시각, k6 결과, 자원, health, 불변식
- `k6.json`: k6 원본 출력
- `report.html`: `run.json`의 시각화

HTML은 관측값을 보여 주며 원인을 자동 판정하지 않는다. 사람이 내린 결론과 수정 검증은
[cases](../cases/)에 기록한다. 현재 Redis 장애 해석은
[CASE-007](../cases/CASE-007-redis-failure-cascade/)이 정본이다.

## 보고서에서 먼저 볼 항목

1. 실행 이미지·커밋·데이터셋과 주입 성공 여부
2. pre/fault/post 오류율과 p95
3. 실패 지연이 어떤 timeout 상한에 몰렸는지
4. 기능별 영향 범위
5. HikariCP, Tomcat, JVM thread, MySQL, Redis의 시간축
6. health 응답과 회복 시간
7. 데이터 불변식과 불확실한 요청 수

헬스 폴러 timeout은 앱이 DOWN을 응답했다는 뜻이 아니다. 해당 시간 안에 응답을 받지
못했다는 관측으로만 해석한다.
