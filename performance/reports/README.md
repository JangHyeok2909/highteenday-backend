# Generated performance reports

이 디렉터리는 일반 성능 실행의 원자료와 파생 화면을 저장한다.

```text
runs/<runId>/   실행별 run.json과 report.html
archive/        비교 계열에서 제외한 실행
repeatability/  반복 실행 요약
index.json      실행 인덱스
history.html    실행 이력 화면
trends/         시나리오별 추세 화면
```

`run.json`은 기계 판독 정본이다. `report.html`, `history.html`, `trends/`는 원자료에서 만든
표현이다. 생성된 파일을 손으로 고치지 않는다.

```bash
node tools/perf-run.js scenarios/normal-day.js --dataset medium
node tools/history.js
```

`archive/`는 삭제 공간이 아니다. 실행 조건이 현재 비교 계열과 맞지 않아 기준선 선택에서
제외한 원자료를 보존한다. 비교 규칙은 [METHOD.md](../METHOD.md)를 따른다.
