# 일반 부하 실행 기록

이 디렉터리는 일반 부하 실행의 원자료와, 원자료에서 만든 화면을 저장한다. 화면은
[실행 기록 대시보드](https://janghyeok2909.github.io/highteenday-backend/)에서 바로 볼 수 있다.

```text
runs/<runId>/          실행별 원자료와 화면
  run.json             실행 결과의 기준 파일
  report.html          run.json을 렌더링한 화면
  k6.json, summary.txt k6 원본 출력과 종료 요약
  dbstate.json         실행 전후 DB 상태 지문(초기 실행에는 없음)
  hostprobe.jsonl      실행 중 호스트 표본(초기 실행에는 없음)
runs/normal-day-2026-08-25T11-47-39.*
                       실행 디렉터리 없이 남은 k6 출력 2개
archive/               비교 계열에서 제외한 실행(초기 기능별 실행, archive/runs/, 별도 index.json)
repeatability/         반복 실행 요약
calib/                 기준 조정용 breakpoint 실행 출력
raw/                   초기 실행의 k6 요약 출력(csv, html, json)
idle-cpu-bench.jsonl   유휴 상태 CPU 벤치 표본(tools/idle-bench-logger.js)
index.json             실행 인덱스
history.html, trends/  실행 이력과 시나리오별 추세 화면
summary/, overnight/   빈 폴더. overnight/의 진행 로그는 Pages에 게시하지 않는다
```

`run.json`이 실행 결과의 기준 파일이다. `report.html`, `history.html`, `trends/`는 원자료에서 만든
표현이다. 생성된 파일을 손으로 고치지 않는다.

비교 계열과 같은 조건으로 실행하고 이력 화면을 다시 만드는 명령이다. 스택 기동, 데이터셋 적재, 상태
스냅샷 생성을 먼저 마쳐야 한다. 그 절차와 조건의 뜻은 [성능·장애 실험](../README.md#준비와-실행)에 있다.

```bash
node tools/perf-run.js scenarios/normal-day.js \
  --dataset medium --loadgen docker --rate 4 --warmup 180 --hold 5m
node tools/history.js
```

`archive/`는 실행 조건이 현재 비교 계열과 맞지 않아 기준선 선택에서 제외한 원자료를 보존한다.
비교 규칙은 [측정 방법](../METHOD.md)을 따른다.
