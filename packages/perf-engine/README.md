# perf-engine

> 상태: 개발 중. 작업 디렉터리와 설정만 동작하고, k6 실행 단계는 아직 없다.

k6 실행 결과를 같은 조건으로 돈 이전 실행과 비교하는 CLI다. 저장소의
[performance/](../../performance/README.md)에 있는 실행·비교 기능 중 필요한 부분을 옮겨 독립 도구로 만들고
있으며, `performance/`의 원본은 그대로 둔다. v0.1에서 하기로 한 일과 남은 질문은 [DESIGN.md](DESIGN.md)에 있다.

Node.js 20 이상이 필요하고 외부 의존성은 없다.

## 명령

저장소에서는 `node packages/perf-engine/bin/perf-engine.js <명령>`으로 실행한다. 아래는 `npm link` 등으로
`perf-engine` 명령을 설치했을 때의 형태다.

```bash
perf-engine init [--dir <경로>]
perf-engine run <k6 스크립트> [--dir <경로>]
perf-engine --help      # 또는 -h. 사용법 출력
perf-engine --version   # 또는 -v. 버전 출력
```

- `init`: 작업 디렉터리와 `config.json`을 만든다. 이미 있는 `config.json`은 덮어쓰지 않는다.
- `run`: 스크립트 경로와 설정을 검사하고 작업 디렉터리를 만든다. k6 실행 단계는 아직 없어서
  종료 코드 1로 끝난다.

## 작업 디렉터리

위치는 `--dir` > `PERF_ENGINE_DIR` > `./perf-engine` 순서로 정한다. 디렉터리 안의 `.gitignore`는
`.cache/`만 제외하고, 사용자 저장소의 `.gitignore`는 건드리지 않는다.

## 설정

`<작업 디렉터리>/config.json`에 둔다. 파일이 없으면 기본값으로 동작한다. 값은 환경변수 > config >
기본값 순서로 정하고, 모르는 키가 있으면 실행하지 않는다. CLI 옵션으로 설정 값을 덮어쓰는 단계는
예정이며 아직 CLI로 지정하는 설정 키는 없다.

| 키 | 환경변수 | 기본값 | 뜻 |
|---|---|---|---|
| `k6.bin` | `PERF_ENGINE_K6_BIN` | `k6` | k6 실행 파일 |

`init`은 기본값을 파일에 적지 않는다. 파일에 적힌 값은 사용자가 고른 값으로 취급된다.

## 종료 코드

| 코드 | 뜻 |
|---|---|
| 0 | 결과를 만들었다. 판정 결과와 무관하다 |
| 1 | 실행은 했지만 쓸 수 있는 결과를 만들지 못했다 |
| 2 | 입력이나 환경이 잘못돼 실행하지 않았다 |
| 130 | 사용자가 중단했다(예정. 상수만 있고 중단 신호 처리는 아직 없다) |

## 개발

```bash
cd packages/perf-engine
npm test
```

`npm test`는 `node --test test/*.test.js`이고 `*.test.js` 확장을 셸에 맡긴다. 확장하지 않는 셸(Windows
cmd 등)에서는 Git Bash 같은 POSIX 셸에서 실행한다.
