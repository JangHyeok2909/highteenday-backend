# Datasets — 부하 테스트 시드 데이터

## 설계 원칙

부하 테스트 결과는 **데이터 분포**에 극도로 민감하다. 균등분포 데이터로는
현실의 병목(단일 row 락 경합, 캐시 히트 편중, 헤비 유저 팬아웃)이 재현되지 않는다.

| 축 | 분포 | 근거 |
|----|------|------|
| 작성 활동량 | 사용자별 Zipf(s≈1.7) | 커뮤니티의 1% 법칙 — 소수 헤비 유저가 콘텐츠 대부분 생산 |
| 게시글 인기도 | 게시글별 Zipf | 조회/반응의 ~80%가 상위 ~10% 글에 집중 (Hot Data) |
| 친구 관계 | 학교 내 80% 클러스터링 | 실제 서비스는 같은 학교끼리 연결됨 → 채팅/알림 팬아웃도 클러스터 안에서 발생 |
| 반응 종류 | LIKE 85% : DISLIKE 15% | 일반 커뮤니티 비율 |
| 익명 여부 | 글 50%, 댓글 60% | 익명 커뮤니티 특성 |

k6 스크립트도 같은 분포로 **접근**한다: `scripts/lib/data.js`의 `hotPost()`가
Zipf 샘플링으로 인기글을 편중 조회하므로, 생성 분포와 접근 분포가 함께 Hot Data를 만든다.

## 스케일 프로파일 (`profiles.json`)

| 프로파일 | 사용자 | 게시글 | 댓글 | 반응 | 친구쌍 | 용도 |
|---------|-------:|-------:|-----:|-----:|-------:|------|
| smoke | 20 | 50 | 150 | 300 | 20 | 스크립트 동작 확인 (1분 내) |
| small | 100 | 500 | 2k | 5k | 200 | 로컬 개발 반복 실험 |
| medium | 1,000 | 10k | 40k | 100k | 3k | 표준 실험 (EXP 기본값) |
| large | 10,000 | 100k | 400k | 1M | 30k | 인덱스/페이징 병목 재현 |
| xlarge | 100,000 | 500k | 2M | 5M | 200k | 운영 1년 후 규모 가정 |

## 생성 방법

```bash
# 서버가 떠 있어야 한다 (environment/ 참고)
node datasets/seed.js --profile medium --base http://localhost:8080 --concurrency 10
```

- **API 기반 생성**이다. SQL 직접 삽입보다 느리지만:
  - 스키마 변경에 깨지지 않는다 (엔티티 컬럼명 하드코딩 없음)
  - 서비스 로직(비정규화 카운터, 알림 팬아웃, HOT 점수)이 실제와 동일하게 만들어진다
  - 생성 과정 자체가 1차 쓰기 부하 테스트를 겸한다
- 결정론적 PRNG(고정 시드)라 **같은 프로파일 → 항상 같은 데이터** (재현성).
- 재실행 시 이미 존재하는 계정은 건너뛴다 (4xx 무시).
- `large` 이상은 시간이 오래 걸린다(수 시간). 야간 실행을 권장하며,
  더 빠른 적재가 필요하면 `SHOW CREATE TABLE`로 스키마를 덤프한 후 SQL 벌크 삽입으로
  전환하되, **비정규화 카운터(likeCount 등)와 Redis 상태를 수동으로 정합시켜야 한다.**

## 산출물

```
datasets/generated/<profile>/
├── users.json    # [{email, nickname}]  — 비밀번호는 전 계정 공통 PerfTest123!
├── posts.json    # [{id, boardId}]      — 인기순 정렬 (index 0 = 최고 인기글)
└── boards.json   # [{id, name}]
```

k6에서 `-e DATASET=<profile>` 로 선택한다. `generated/`는 `.gitignore` 대상
(데이터가 아니라 **생성기와 프로파일**이 버전 관리 대상이다).

## 검증

생성 후 분포가 의도대로인지 확인:

```sql
-- 상위 10% 게시글이 전체 반응의 몇 %를 가져갔는가 (~80% 기대)
SELECT SUM(CASE WHEN rk <= total/10 THEN cnt ELSE 0 END) / SUM(cnt) AS hot_ratio
FROM (
  SELECT PST_id, COUNT(*) cnt,
         RANK() OVER (ORDER BY COUNT(*) DESC) rk,
         COUNT(*) OVER () total
  FROM post_reaction GROUP BY PST_id
) t;
```
