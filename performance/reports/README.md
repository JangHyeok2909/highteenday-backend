# Performance reports

이 디렉터리는 일반 성능 실행의 원자료와 파생 화면을 저장한다.

```text
reports/
├── runs/<runId>/      비교 후보가 되는 실행
├── archive/           기준선 선택에서 제외한 실행
├── repeatability/     반복 실행 세트 요약
├── index.json         이력 인덱스
├── history.html       이력 화면
└── trends/            시나리오별 추세 화면
```

실행 디렉터리의 `run.json`이 기계 판독 정본이고 `report.html`은 파생 표현이다. 두 파일을
손으로 수정하지 않는다.

```bash
node tools/perf-run.js scenarios/normal-day.js --dataset medium
node tools/history.js
```

`archive/`의 실행은 삭제한 것이 아니다. 실행 자체는 유효한 역사적 증거지만 현재 실행과
비교할 수 없어 기준선과 추세에서 제외한 것이다. 비교 조건은
[measurement contract](../reference/measurement-contract.md)를 따른다.

실행에서 얻은 결론은 [studies](../studies/) 또는 [cases](../cases/)에 기록한다.
