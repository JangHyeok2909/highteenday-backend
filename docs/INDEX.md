# Documentation index

문서는 현재 동작, 결정, 문제, 운영 절차를 구분한다. 같은 사실을 여러 문서에서 설명하지
않고 정본을 링크한다.

| 질문 | 정본 |
|---|---|
| 애플리케이션은 어떻게 구성됐는가 | 저장소 루트 `README.md`, `CLAUDE.md` |
| 데이터베이스 스키마를 어떻게 바꾸는가 | [MIGRATION.md](MIGRATION.md) |
| Redis는 어떤 데이터를 소유하는가 | [crosscutting/redis.md](crosscutting/redis.md) |
| 운영 중 무엇을 해야 하는가 | [operations/runbook.md](operations/runbook.md) |
| 현재 확인된 결함은 무엇인가 | [issues/](issues/) |
| 왜 이 구조를 선택했는가 | [adr/](adr/) |
| 성능·장애 측정은 어디에 있는가 | [performance](../performance/) |
| 문서를 어떤 문체로 쓰는가 | [WRITING.md](WRITING.md) |

## 문서 유형

- 설명 문서는 현재 동작만 적는다.
- ADR은 채택한 선택과 트레이드오프를 적는다.
- Issue는 현재 코드에서 확인한 결함과 상태를 적는다.
- Performance Study는 질문과 실행 결과를 적는다.
- Performance Case는 관측된 문제의 원인부터 수정 검증까지 적는다.
- Runbook은 장애나 배포 중 수행할 행동을 적는다.

이전 KI 장부와 성능 문서는 [docs archive](archive/)와
[performance archive](../performance/archive/)에 보존되어 있다. 아카이브는 현재 동작의
정본이 아니다.
