# BTL-008: `Token` 엔티티/테이블 대소문자 불일치 (Linux MySQL에서 로그인 전체 장애)

> 유형: DB / Correctness (성능이 아니라 가용성 버그 — 성능 테스트 중 실측으로 발견)
> 상태: **해소** — `Token` 엔티티에 `@Table(name="tokens")` 명시 + V5 마이그레이션(`V5__rename_token_table.sql`)으로 테이블명 통일 (커밋 `54a7c48`)
> 관련: 없음 (실험 이전에 인프라 준비 단계에서 발견)

## 증상

`prod`/`dev` 프로파일 무관하게 **Linux 위에서 새로 초기화한 MySQL 컨테이너에 앱을 붙이면
회원가입(`POST /api/user/register`)과 로그인이 전부 500으로 실패한다.**

```
서버 내부 오류가 발생했습니다. message=JDBC exception executing SQL
[select t1_0.id,t1_0.tnk_access,t1_0.tnk_expires_at,t1_0.tnk_refresh,t1_0.usr_id
 from token t1_0 where t1_0.usr_id=?] [Table 'highteenday.token' doesn't exist]
```

## 원인

- `db/migration/V1__baseline.sql`(41번째 줄)이 만드는 실제 테이블명은 `Token`(대문자 T).
- `domain/Token/Token.java` 엔티티는 `@Table(name=...)`을 지정하지 않아, Hibernate가
  기본 물리 네이밍 전략으로 클래스명 `Token`을 소문자 `token`으로 변환해 쿼리한다.
- macOS/Windows의 MySQL은 기본적으로 `lower_case_table_names=1`(또는 2)라 `Token`과
  `token`을 같은 테이블로 취급해 이 불일치가 드러나지 않는다.
- 반면 **Linux(이 프로젝트의 실제 배포 대상인 EC2, 그리고 공식 `mysql` Docker 이미지)는
  기본값이 `lower_case_table_names=0`(대소문자 구분)** — `Token` ≠ `token`이라 테이블을
  못 찾는다.

## 영향

- **회원가입, 로그인, 토큰 재발급, 로그아웃 등 인증 관련 전 기능이 장애**
  (`TokenService`가 사용자마다 `Token` row를 조회/저장하기 때문).
- 이 프로젝트의 로컬 개발 환경(대부분 Windows/Mac)에서는 100% 재현되지 않아
  지금까지 발견되지 않았을 가능성이 높다.
- **운영 EC2의 MySQL이 `lower_case_table_names`를 명시적으로 설정하지 않은 채
  Linux 기본값(대소문자 구분)으로 초기화되어 있다면, 운영 환경에서도 로그인 자체가
  전면 장애 상태일 수 있다.** (실제로 운영 서비스가 정상 동작 중이라면 운영 MySQL은
  이미 이 설정이 되어 있거나 최초 초기화 시 우연히 다른 값이었을 가능성이 높지만,
  본 저장소의 설정 파일만으로는 확인할 수 없다 — 운영 DB 에서 직접 확인해야 한다.)


## 재현 방법

```bash
# 1. lower_case_table_names 설정 없이 완전히 새 MySQL 볼륨으로 기동
docker volume rm performance_perf-mysql-data 2>/dev/null  # 있다면
# environment/mysql/perf.cnf 에서 lower_case_table_names=1 줄을 주석 처리한 뒤
docker compose -f environment/docker-compose.perf.yml --env-file environment/.env.perf up -d --build

# 2. 게시판 시드 후 회원가입 시도 → 500 확인
curl -X POST localhost:18080/api/user/register -H 'Content-Type: application/json' -d '{...}'
```

관찰: 앱 로그의 `Table '<db>.token' doesn't exist`, 또는
`SELECT LOWER_CASE_TABLE_NAMES;`로 MySQL 설정값 확인 (0이면 이 버그 재현 조건).

## 해결 방법

| 후보 | 효과 | 트레이드오프 |
|------|------|--------------|
| MySQL `lower_case_table_names=1` (이 저장소의 `environment/mysql/perf.cnf`에 적용) | 즉시 해결 | **데이터 디렉터리 최초 초기화 시점에만 적용 가능** — 기존 운영 DB에는 사후 적용 불가(재구축 필요). ⚠ 이 설정은 대소문자만 다른 경우(`Token`/`token`)에만 통한다 — 이름 자체가 다른 경우(`DailyHotPost`/`daily_hot_post`, 언더스코어 유무)는 해결 못 한다. [BTL-009](BTL-009-daily-hot-post-table-missing.md) 참고 |
| `Token` 엔티티에 `@Table(name = "\`Token\`")` 명시 (백틱으로 대소문자 고정) | 근본 해결, 플랫폼 독립적 | 코드 변경 + 재배포 필요. 이미 대소문자 구분 MySQL에 배포된 경우 즉시 적용 가능 |
| 마이그레이션에서 테이블명을 소문자 `token`으로 통일 | 근본 해결, 프로젝트 전체 네이밍 컨벤션과 일치 | 기존 운영 테이블 RENAME 마이그레이션 필요 |

**권장**: 코드 수정(`@Table` 명시 또는 테이블명 통일)이 근본 해결책이다. 운영 MySQL의
`lower_case_table_names` 값을 먼저 확인해, 이미 대소문자를 구분하지 않는 상태라면
지금까지는 운이 좋았던 것뿐이다 — 다음 MySQL 재구축(예: RDS 마이그레이션, 리전 이전)
시 동일 장애가 재발할 수 있으므로 코드 레벨 수정을 우선순위로 둘 것을 권한다.
