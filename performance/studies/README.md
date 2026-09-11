# Studies

Study는 문제 해결 문서가 아니라 질문에 답하기 위한 실험 기록이다. 기준선, 용량 탐색,
측정 방식 대조처럼 수정 대상이 아직 정해지지 않은 작업을 여기에 둔다.

| Study | 상태 | 사용할 수 있는 결론 |
|---|---|---|
| [STUDY-000](STUDY-000-measurement-integrity/) | `incomplete` | Windows 로컬 부하기 실행은 비교 조건에서 분리해야 함 |
| [STUDY-001](STUDY-001-normal-day-saturation/) | `complete, historical` | 2코어·200 VU 조건은 포화 상태이며 현재 기준선으로 쓰면 안 됨 |

## 대기 중인 질문

| 질문 | 시작 조건 |
|---|---|
| 현재 비포화 운용점의 반복 기준선은 무엇인가 | 동일 이미지·데이터셋으로 5회 이상 실행 |
| 처리 용량의 절벽은 어느 도착률에 있는가 | open model 단계 부하 준비 |
| cold cache와 warm cache의 차이는 얼마인가 | 캐시 상태를 실행 메타데이터로 고정 |
| 인기 데이터 카운터 경합은 온라인 요청에도 영향을 주는가 | 데이터셋 정합성과 대상 ID 고정 |

새 Study는 [TEMPLATE.md](TEMPLATE.md)로 작성한다. 실행 결과에서 결함이 확인되면 결론을
복제하지 않고 Case를 만들고 이 문서에서 링크한다.

