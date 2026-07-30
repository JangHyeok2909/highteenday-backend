# Tools — 도구 모음

## 이 저장소의 자체 도구

| 도구 | 용도 | 사용법 |
|------|------|--------|
| `compare.js` | baseline 대비 회귀 판정 | `node tools/compare.js <summary.json>` — regression/README 참고 |
| `chaos-redis-flap.sh` | Redis 순단 반복 주입 | `tools/chaos-redis-flap.sh 3 10 60` (3회, 10초 정지, 60초 간격) |
| `chaos-cpu-squeeze.sh` | 앱 CPU 제한 주입 | `tools/chaos-cpu-squeeze.sh 1 300 2` |

네트워크 지연 주입(tc netem)은 Linux 호스트 전용:
```bash
# perf-app 컨테이너에서 mysql로 가는 트래픽에 +50ms (호스트에서 실행, 컨테이너 veth 대상)
docker exec perf-app sh -c "which tc" || echo "이미지에 iproute2 필요"
# 대안: pumba (컨테이너 카오스 도구) — docker run gaiaadm/pumba netem --duration 5m delay --time 50 perf-mysql
```

## 외부 도구 카탈로그

### 부하 발생

| 도구 | 목적 | 이 프로젝트에서의 역할 |
|------|------|------------------------|
| **k6** | HTTP/WS 부하 발생 | 표준 도구. scripts/, scenarios/ 전부 k6 |
| JMeter | GUI 기반 부하 | 사용 안 함 — k6로 통일 (코드 리뷰 가능한 시나리오가 원칙) |

### 관측 (스택에 동봉)

| 도구 | 목적 | 접근 |
|------|------|------|
| **Prometheus** | 시계열 수집 (앱/DB/Redis/컨테이너/k6) | http://localhost:9090 |
| **Grafana** | 대시보드/비교/annotation | http://localhost:3001 (admin/perf) |
| **Micrometer + Actuator** | 앱 메트릭 노출 | /actuator/prometheus (environment/README의 사전 준비 필요) |
| **mysqld-exporter / redis-exporter / cAdvisor** | DB/캐시/컨테이너 메트릭 | 자동 스크레이프 |

### JVM 심층 분석 (병목 원인 규명 단계에서)

| 도구 | 목적 | 사용법 요약 |
|------|------|-------------|
| **JFR** | 상시 프로파일링 (컴포즈가 자동 기록 중) | `docker cp perf-app:/tmp/perf.jfr .` → JDK Mission Control로 열기. 핫 메서드/락 경합/할당 확인 |
| **async-profiler** | CPU/alloc 플레임그래프 | `docker exec perf-app ./asprof -d 60 -f /tmp/flame.html 1` (이미지에 바이너리 추가 필요) |
| **VisualVM** | 힙/스레드 실시간 관찰 | JMX 포트 노출 후 연결. 로컬 탐색용 — 수치 기록은 Prometheus 기준 |
| **Arthas** | 운영 중 메서드 단위 진단 | `docker exec -it perf-app` 후 arthas attach → `trace`, `monitor` |
| GC 로그 | GC 병목 확정 | `/tmp/gc.log` → GCeasy.io 또는 직접 분석. "Full GC 유무"가 1차 확인 |

### DB / Redis 심층 분석

| 도구 | 목적 | 사용법 요약 |
|------|------|-------------|
| **slow query log** | 100ms+ 쿼리 전수 기록 (perf.cnf 설정됨) | `docker exec perf-mysql sh -c "cat /var/lib/mysql/slow.log"` |
| **performance_schema** | 쿼리 digest별 통계 | `SELECT DIGEST_TEXT, COUNT_STAR, SUM_TIMER_WAIT/1e12 sec, SUM_ROWS_EXAMINED FROM performance_schema.events_statements_summary_by_digest ORDER BY SUM_TIMER_WAIT DESC LIMIT 10;` |
| **EXPLAIN / EXPLAIN ANALYZE** | 쿼리 플랜 확정 | 병목 쿼리마다 실험 문서에 플랜 첨부 |
| **p6spy** | 요청당 쿼리 수 계측 (이미 앱 의존성) | 앱 로그에서 확인 — N+1 검증(EXP-005)의 핵심 |
| **RedisInsight** | Redis 키/메모리 분석 | `docker run -p 5540:5540 redis/redisinsight` 후 perf-redis 연결 |
| **redis-cli** | slowlog/latency | `SLOWLOG GET 10`, `LATENCY HISTORY event` |

### 컨테이너/시스템

| 도구 | 목적 |
|------|------|
| `docker stats` | 즉석 리소스 확인 (기록은 cAdvisor→Prometheus) |
| `docker update` | 카오스 실험의 리소스 제한 주입 |

## 도구 선택 원칙

1. **기록되는 도구 우선** — 눈으로 본 수치는 증거가 아니다. Prometheus에 남는 경로를 기본으로.
2. **심층 도구는 원인 규명 단계에만** — 프로파일러 오버헤드가 측정을 오염시키므로,
   지표로 병목 범위를 좁힌 뒤 짧게 붙인다.
3. 프로파일링 결과(플레임그래프, JFR 파일)는 해당 실험 디렉터리에 보관한다.
