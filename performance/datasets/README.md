# Performance datasets

데이터셋은 부하의 배경이 아니라 실행 조건이다. 이름이 같아도 앞선 쓰기 실행으로 상태가
달라졌다면 같은 데이터셋으로 비교하지 않는다.

## 프로필

정확한 수량은 [profiles.json](profiles.json)이 정본이다.

| 프로필 | 사용자 | 게시글 | 댓글 | 용도 |
|---|---:|---:|---:|---|
| `smoke` | 20 | 50 | 150 | 배관 확인 |
| `small` | 100 | 500 | 2,000 | 빠른 기능 점검 |
| `medium` | 1,000 | 10,000 | 40,000 | 기본 성능 실험 |
| `large` | 10,000 | 100,000 | 400,000 | 큰 데이터와 편중 실험 |
| `xlarge` | 100,000 | 500,000 | 2,000,000 | 별도 자원 계획이 있을 때만 사용 |

## 생성과 검증

`seed.js`는 Node.js 18 이상이 필요하다.

```bash
node datasets/seed.js --profile medium
bash datasets/verify.sh medium
node tools/snapshot.js create medium
```

검증은 행 수뿐 아니라 참조 무결성, 비정규화 카운터, 인기 데이터 분포를 확인한다. 검증을
통과하지 않은 데이터셋으로 얻은 지연은 원인 분석에 사용하지 않는다.

## 상태 고정

일반 성능 실행은 시작 시 DB 상태 지문을 계산한다. 저장된 스냅샷과 다르면 기본 `strict`
정책에서 복원을 시도하거나 실행을 중단한다.

```bash
node tools/preflight.js --dataset medium --rate 4
node tools/perf-run.js scenarios/normal-day.js --dataset medium
```

`--guard off`는 탐색용으로만 사용한다. 해당 실행은 Before/After 근거로 사용하지 않는다.

## Redis 상태

DB 스냅샷과 Redis 캐시는 별개다. cold/warm 비교에서는 Redis 초기화 여부를 명시한다.
조회수 중복 방지 키와 미반영 버퍼가 남아 있으면 데이터 정합성 실험이 오염될 수 있다.
