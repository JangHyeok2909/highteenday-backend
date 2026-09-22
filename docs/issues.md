# Known issues

현재 코드나 실행 결과로 확인한 미해결 문제만 기록한다. 해결된 문제는 테스트와 Git 기록이
소유하며 이 목록에 남기지 않는다.

마지막 확인일: 2026-09-11

| ID | 상태 | 사용자 영향 | 현재 근거 | 다음 조치 |
|---|---|---|---|---|
| AUTH-001 | open | DB나 Redis 장애가 보호 API의 401로 보일 수 있음 | `TokenAuthenticationFilter`가 모든 `RuntimeException`을 삼키고 익명 요청으로 진행 | JWT 오류와 인프라 오류를 분리하고 상태 코드 테스트 추가 |
| AUTH-002 | open | DB 풀이 막히면 모든 인증 요청이 함께 대기함 | `TokenProvider.getAuthentication()`이 요청마다 User 조회 | 토큰 검증에 필요한 사용자 정보를 DB 조회 없이 구성하거나 제한된 캐시 사용 |
| RES-001 | open | Redis 장애 시 요청이 30초 또는 60초까지 대기하고 다른 API로 전파됨 | Redis timeout 미설정과 장애 실행의 지연 분포 | 연결·명령 timeout 명시, Redis 호출을 DB 트랜잭션 밖으로 이동 |
| API-001 | open | 반응·스크랩 요청을 재시도하면 원래 상태로 되돌아갈 수 있음 | 생성·삭제가 아닌 toggle POST 계약 | 원하는 최종 상태를 표현하는 멱등 API로 변경 |
| PERF-001 | needs-evidence | 부분 문자열 검색이 데이터 증가에 따라 느려질 수 있음 | QueryDSL `containsIgnoreCase` 사용 | 실제 실행 계획과 `EXPLAIN ANALYZE` 확보 |
| STORAGE-001 | open | S3 지연이 DB 트랜잭션을 늘리고 실패 시 고아 객체가 남을 수 있음 | 게시글 저장 흐름에서 S3 승격 수행 | 커밋 경계 분리와 보상 정리 작업 설계 |
| DATA-001 | accepted-risk | Redis 장애 중 조회수와 미반영 버퍼가 유실될 수 있음 | Redis가 조회수 증가분의 유일한 임시 저장소 | 허용 손실 범위와 필요 시 내구성 있는 대안 결정 |

RES-001의 장애 범위와 검증 계획은
[Redis 장애 Case](../performance/cases/redis-failure-cascade.md)가 소유한다. 새 문제는 증상,
근거, 다음 조치를 채울 수 있을 때만 이 목록에 추가한다.
