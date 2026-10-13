# CS Lab·라이브 코딩 연습 프로젝트 생성 프롬프트

작성일: 2026-09-25

이 문서는 `/Users/janghyeog/Desktop/project` 아래에 다음 두 저장소를 만들 때 사용할 복사용
프롬프트다.

| 저장소 | 공개 여부 | 목적 |
|---|---|---|
| `backend-systems-lab` | 공개 후보 | CS 개념을 코드·로그·수치로 재현하는 실행형 실험 6개 |
| `backend-live-coding-kata` | 비공개 | AI 없이 요구사항을 구현하고 테스트하는 반복 훈련 |

두 저장소를 한 번에 만들지 않는다. 첫 번째 프롬프트로 CS Lab을 만든 뒤 구조와 실행을 확인하고,
두 번째 프롬프트를 별도 작업에서 사용한다. 생성 에이전트는 학습자의 구현과 결론을 대신 작성하면
안 된다. 실행 환경, 요구사항, 검증 장치만 만든다.

---

## 1. `backend-systems-lab` 생성 프롬프트

아래 블록 전체를 새 Codex 작업에 붙여 넣는다.

```text
목표

/Users/janghyeog/Desktop/project/backend-systems-lab 에 공개 가능한 실행형 CS 학습 저장소를
새로 만들어라. 이 저장소는 면접 답안 모음이 아니다. 운영체제·네트워크·DB·JVM 개념을 작은
실험으로 재현하고, 실행 전 예상과 실제 관측의 차이를 기록하는 저장소다.

안전 규칙

1. 작업 전에 대상 경로의 존재 여부와 내용을 읽기 전용으로 확인하라.
2. 대상 경로가 이미 존재하고 비어 있지 않으면 어떤 파일도 덮어쓰거나 삭제하지 말고 중단해
   사용자에게 현재 내용을 보고하라.
3. /Users/janghyeog/Desktop/project 아래의 다른 저장소는 수정하지 마라.
4. rm, git reset, git clean, 강제 덮어쓰기 명령을 사용하지 마라.
5. 비밀번호, 토큰, 로컬 사용자 정보, 내부 회사 정보를 파일에 넣지 마라.
6. git 저장소 초기화는 해도 되지만 commit, remote 추가, push는 하지 마라.
7. 외부 패키지 설치나 네트워크 접근이 필요하면 먼저 이유를 설명하고 승인을 받아라.

기술 선택

- Java 21
- Gradle Wrapper와 Gradle Kotlin DSL 또는 Groovy DSL 중 더 단순한 쪽
- JUnit 5
- Docker Compose
- MySQL 8
- Toxiproxy
- Spring, ORM, Lombok, 애플리케이션 프레임워크 사용 금지
- 실험에 꼭 필요하지 않은 의존성 추가 금지
- macOS와 Linux에서 실행 가능한 셸 스크립트

학습 보호 규칙

1. 최종 구현, 모범 답안, 예상 결과 수치, 결론을 작성하지 마라.
2. 사용자가 직접 구현해야 하는 핵심 부분은 컴파일 가능한 인터페이스·빈 구현·TODO로 남겨라.
3. TODO에 해결 알고리즘이나 정답을 암시하지 마라.
4. 환경 배선, Docker Compose, 공통 실행기, 결과 저장 형식은 완성해도 된다.
5. 실행하지 않은 결과 파일이나 그래프를 만들지 마라.
6. README의 ‘실행 전 예상’과 ‘실제 결과’는 빈 템플릿으로 남겨라.
7. 학습자가 공식 문서와 소스 코드를 찾아 결론을 만들 수 있도록 출처 기록 칸만 제공하라.

저장소의 역할

- 공개 저장소로 읽어도 취업 준비 답안집처럼 보이지 않아야 한다.
- 각 실험은 질문, 예상, 재현, 관측, 설명, 선택 기준 순서로 읽혀야 한다.
- 한 실험은 사용자가 2회, 총 4시간 이내에 완성할 수 있어야 한다.
- 모든 실험은 다른 실험과 독립적으로 실행 가능해야 한다.
- 결과에는 실행 시각, OS, JDK, Docker 이미지, 설정값을 남길 수 있어야 한다.

만들 디렉터리

backend-systems-lab/
  README.md
  AGENTS.md
  CONTRIBUTING.md
  .gitignore
  compose.yaml
  build.gradle 또는 build.gradle.kts
  settings.gradle 또는 settings.gradle.kts
  gradlew, gradlew.bat, gradle/wrapper/
  scripts/
    check-environment.sh
    run-lab.sh
  common/
  labs/
    01-tcp-failure-modes/
    02-mysql-lost-update/
    03-mysql-deadlock/
    04-jvm-concurrency/
    05-pools-backpressure/
    06-index-query-plan/
  results/
    .gitkeep
  docs/
    experiment-template.md
    environment.md
    progress.md

실험별 요구사항

01-tcp-failure-modes
- 연결 거부 또는 RST, 응답 없는 연결, 지연된 응답, 재사용 연결을 구분하는 실험 명세
- Java Socket 또는 JDK HTTP Client 기반 starter API
- connect timeout과 read timeout을 별도로 지정할 자리
- Toxiproxy를 이용한 지연·timeout 환경 배선
- 사용자가 패킷과 예외 종류를 관찰할 명령의 빈칸
- 운영체제별 tcpdump 권한 차이를 environment.md에 설명

02-mysql-lost-update
- 두 세션이 같은 행을 읽고 수정하는 순서를 재현할 SQL 및 Java starter
- 격리 수준을 바꿔 실행할 수 있는 설정
- 비관적 락과 원자적 UPDATE를 사용자가 직접 구현할 자리
- 최종 값, affected rows, lock wait를 결과로 저장할 형식
- 해결 방법의 정답이나 추천은 쓰지 말 것

03-mysql-deadlock
- 두 트랜잭션이 서로 반대 순서로 행을 잠그는 재현 명세
- InnoDB deadlock 정보를 수집할 스크립트 배선
- retry와 lock ordering을 사용자가 구현할 자리
- 무한 retry를 막는 검증 요구사항
- retry가 항상 옳다는 결론을 미리 쓰지 말 것

04-jvm-concurrency
- visibility와 atomicity를 구분하는 최소 Java starter
- volatile, synchronized, Atomic 계열을 비교할 수 있는 동일 인터페이스
- 반복 실행 횟수와 JVM 옵션을 기록하는 장치
- 타이밍에 따라 재현되지 않을 수 있다는 제한을 README 템플릿에 명시
- microbenchmark 수치를 성능 결론으로 과장하지 않도록 주의 문구 추가

05-pools-backpressure
- 제한된 worker thread, 제한된 DB permit, bounded queue를 가진 시뮬레이터 starter
- 도착률, 작업 시간, 풀 크기, 큐 크기를 인자로 변경할 수 있는 구조
- 처리량, 대기 시간, 거절 수, 동시 점유 수를 CSV로 저장하는 배선
- unbounded queue, bounded queue, rejection 정책을 사용자가 구현·비교할 자리
- 실제 HikariCP나 Spring을 도입하지 말고 원리를 보여 주는 최소 시뮬레이터로 유지

06-index-query-plan
- MySQL 데이터 생성 스크립트와 재현 가능한 seed
- 데이터 규모를 인자로 조절하는 구조
- 단일·복합 인덱스를 사용자가 추가하고 제거할 SQL 자리
- EXPLAIN ANALYZE 결과와 실행 시간을 원문으로 보관하는 스크립트
- selectivity와 복합 인덱스 컬럼 순서를 비교할 실험 질문
- 인덱스 정답을 미리 생성하지 말 것

각 실험 README 템플릿

1. 확인할 질문
2. 관련 개념과 범위
3. 실행 전 예상
4. 환경과 고정 조건
5. 재현 절차
6. 관측할 값
7. 실제 결과
8. 예상과 달랐던 점
9. 원리 설명
10. 해결책 또는 선택지 비교
11. 운영 환경에서의 적용 조건
12. 관련 면접 질문 ID
13. 사용한 출처
14. 재현 한계

루트 README 요구사항

- 저장소 목적과 하지 않는 일을 첫 화면에서 설명
- 실험 6개의 상태 표: 미착수, 진행중, 완료
- 10분 안에 환경을 확인하는 명령
- 각 실험은 결과가 아니라 재현 절차를 먼저 읽도록 안내
- 실행하지 않은 결과를 작성하지 않는 규칙
- 기존 HighTeenDay 프로젝트와 독립된 학습 저장소임을 설명하되 로컬 절대경로나 비공개 문서 링크는
  공개 README에 넣지 말 것

AGENTS.md 요구사항

- 에이전트가 사용자 대신 핵심 구현과 실험 결론을 작성하지 못하게 명시
- 사용자가 특정 구현을 요청한 경우에만 해당 TODO를 구현
- 수치를 생성하거나 추측하지 않고 실제 실행 ID와 원자료를 요구
- 자동 수정 전에 dirty worktree 확인
- commit과 push는 사용자 요청 없이 금지

검증

1. 생성한 모든 파일 목록을 출력하라.
2. Gradle wrapper와 Docker Compose 구문을 확인하라.
3. 공통 코드와 starter가 컴파일되는지 확인하라.
4. 초기 상태에서 통과해야 하는 scaffold 검증 테스트만 실행하라.
5. 핵심 TODO가 구현되지 않았는데 전체 실험이 완료된 것처럼 보이지 않는지 확인하라.
6. 절대경로, 비밀값, 가짜 결과가 파일에 없는지 rg로 검사하라.
7. 실패가 있으면 원인과 남은 작업을 보고하라. 검사 통과를 꾸미지 마라.

최종 보고

- 만든 경로
- 실행한 검증과 결과
- 사용자가 첫 번째로 구현할 파일
- 의도적으로 비워 둔 핵심 TODO
- 추가 승인이나 설치가 필요한 항목
```

### 생성 뒤 첫 작업

저장소 생성을 마치면 `01-tcp-failure-modes`부터 시작한다. 에이전트에게 해결을 요청하지 않고,
다음 작업만 요청한다.

```text
01-tcp-failure-modes의 SPEC과 starter를 읽고, 내가 2시간 동안 직접 구현할 순서를 점검해라.
정답 코드와 예상 결과를 말하지 말고, 요구사항의 모순·실행 불가능한 부분·환경 누락만 찾아라.
파일은 수정하지 말고 점검 결과만 보고하라.
```

---

## 2. `backend-live-coding-kata` 생성 프롬프트

아래 블록 전체를 CS Lab과 다른 새 Codex 작업에 붙여 넣는다.

```text
목표

/Users/janghyeog/Desktop/project/backend-live-coding-kata 에 비공개 연습용 Java 저장소를 새로
만들어라. 목적은 AI 없이 요구사항을 읽고, 제한 시간 안에 구현하고, 테스트와 컴파일러만으로
디버깅하는 능력을 훈련하는 것이다. 공개 포트폴리오를 만드는 작업이 아니다.

안전 규칙

1. 작업 전에 대상 경로의 존재 여부와 내용을 읽기 전용으로 확인하라.
2. 대상 경로가 이미 존재하고 비어 있지 않으면 파일을 덮어쓰거나 삭제하지 말고 중단해 보고하라.
3. /Users/janghyeog/Desktop/project 아래 다른 저장소는 수정하지 마라.
4. rm, git reset, git clean, 강제 덮어쓰기 명령을 사용하지 마라.
5. git 초기화는 가능하지만 commit, remote 추가, push는 하지 마라.
6. 외부 설치나 네트워크가 필요하면 먼저 승인을 받아라.

기술 선택

- Java 21
- Gradle Wrapper
- JUnit 5
- AssertJ는 테스트 가독성에 실제 이점이 있을 때만 사용
- Spring, DB, Docker, Lombok 사용 금지
- 표준 라이브러리 중심
- 모든 starter는 컴파일 가능해야 함

핵심 원칙

1. 참조 구현과 모범 답안을 만들지 마라.
2. SPEC에 사용할 알고리즘, 자료구조, 동시성 해결책을 암시하지 마라.
3. starter는 공개 API와 최소 타입만 제공하고 핵심 메서드는 UnsupportedOperationException 또는
   명확한 미구현 상태로 둬라.
4. 테스트는 요구사항을 검증하되 테스트 이름과 assertion 메시지로 해결책을 알려 주지 마라.
5. 예제 테스트와 채점 테스트를 분리하라.
6. 초기 저장소의 scaffold 검사는 통과해야 하고, 개별 kata 채점은 미구현 때문에 실패해야 정상이다.
7. 실패가 컴파일 오류가 아니라 미충족 요구사항으로 나타나게 만들어라.
8. 시간 측정과 세션 기록은 자동화하되 AI 사용 여부를 기술적으로 감시하려 하지 마라.

만들 구조

backend-live-coding-kata/
  README.md
  AGENTS.md
  PRACTICE_RULES.md
  .gitignore
  build.gradle 또는 build.gradle.kts
  settings.gradle 또는 settings.gradle.kts
  gradlew, gradlew.bat, gradle/wrapper/
  scripts/
    list-katas.sh
    start-session.sh
    grade.sh
    finish-session.sh
  docs/
    SESSION_TEMPLATE.md
    PROGRESS.md
    REVIEW_TEMPLATE.md
  katas/
    01-ttl-cache/
    02-lru-cache/
    03-token-bucket/
    04-idempotency-store/
    05-inventory-reservation/
    06-bounded-blocking-queue/
    07-worker-pool/
    08-retry-policy/
    09-circuit-breaker/
    10-log-top-k/
    11-task-scheduler/
    12-concurrent-transfer/
  grader/
  sessions/
    .gitkeep

각 kata 공통 구성

- SPEC.md
- src/main/java 아래 starter 타입
- src/test/java 아래 공개 예제 테스트 2~4개
- grader 아래 추가 채점 테스트
- 45분, 60분, 75분 중 하나의 권장 제한 시간
- 입력과 출력 또는 공개 API
- 기능 요구사항
- 오류 처리 요구사항
- 경계 조건
- 성능 또는 동시성 제약
- 구현 완료 기준
- 면접 종료 때 설명할 항목: 복잡도, 테스트, 대안, 남은 한계

문제별 범위

01-ttl-cache
- put, get, remove
- 만료 시간
- Clock 주입으로 테스트 가능
- 전체 스캔으로 만료를 지우는지 여부는 구현자 선택으로 남김

02-lru-cache
- 고정 capacity
- get과 put에 따른 사용 순서
- capacity 0, 갱신, 제거
- 사용할 자료구조를 SPEC에서 암시하지 말 것

03-token-bucket
- capacity와 refill rate
- tryAcquire
- Clock 또는 시간 공급자 주입
- 동시 호출 요구사항

04-idempotency-store
- key별 처리 중·성공·실패 상태
- 같은 key의 동시 요청
- 성공 결과 재사용
- 만료 정책
- 분산 환경 해법은 범위 밖이라고만 적고 정답은 쓰지 말 것

05-inventory-reservation
- reserve, confirm, cancel
- 중복 confirm·cancel
- 재고 하한 0
- 같은 상품의 동시 예약

06-bounded-blocking-queue
- put, take, offer with timeout
- capacity 제한
- interruption 처리
- busy waiting 금지라는 요구사항만 제시

07-worker-pool
- 작업 제출, 종료, graceful shutdown
- bounded queue
- overload 처리
- 작업 예외가 worker 전체를 죽이지 않아야 함

08-retry-policy
- 최대 시도 횟수
- exponential backoff
- jitter를 주입 가능한 전략으로 분리
- 재시도 가능 예외 판정
- 전체 deadline
- 실제 sleep 대신 Sleeper 주입으로 테스트

09-circuit-breaker
- closed, open, half-open 상태
- 실패 임계치와 reset timeout
- 동시 half-open 요청 제한
- 상태 전이 테스트

10-log-top-k
- 로그 스트림에서 빈도 상위 K개 집계
- 입력이 메모리 한도를 넘는 조건
- 동률 정렬 규칙
- 알고리즘 코테와 실무 구현의 중간 난도

11-task-scheduler
- 지정 시각 실행
- 같은 시각의 여러 작업
- 취소
- graceful shutdown
- 실제 시간 대신 Clock 또는 scheduler abstraction으로 테스트

12-concurrent-transfer
- 계좌 간 이체
- 잔액 하한 0
- 총액 불변
- 반대 방향 동시 이체
- deadlock이 발생하지 않아야 한다는 요구사항
- 사용할 lock 전략은 암시하지 말 것

세션 스크립트 요구사항

list-katas.sh
- 문제 ID, 이름, 권장 시간, 진행 상태 출력

start-session.sh <kata-id>
- 대상 kata와 제한 시간을 확인
- sessions/<날짜-시각>-<kata-id>.md 생성
- 기존 세션 파일을 덮어쓰지 않음
- 시작 시각 기록
- 사용자에게 AI 플러그인 비활성화와 네트워크 차단 여부를 스스로 확인하라고 출력

grade.sh <kata-id>
- 해당 kata의 공개 테스트와 grader 테스트만 실행
- 통과·실패 테스트 수와 실행 시간을 출력
- 다른 kata의 미구현 때문에 실패하지 않음

finish-session.sh <session-file>
- 종료 시각과 경과 시간 기록
- Git 상태와 테스트 결과를 세션 문서에 넣을 수 있는 명령 안내
- 자동 commit은 하지 않음

PRACTICE_RULES.md 요구사항

첫 시도
- AI, 검색, 기존 해답 금지
- 컴파일러, 테스트, JDK API 문서만 허용
- 60~75분 뒤 미완성이어도 중단
- 첫 시도 보존

리뷰
- 첫 시도 뒤 AI와 자료 사용 허용
- AI는 코드 리뷰와 실패 원인 설명에만 사용
- 완성 코드를 복사하지 않음
- 직접 수정한 두 번째 상태 보존

재구현
- 7일 안에 실패한 핵심 부분을 빈 파일에서 20~30분 재구현
- 재구현 성공 여부를 PROGRESS.md에 기록

SESSION_TEMPLATE.md 항목

- kata ID
- 시작·종료 시각
- 제한 시간
- 첫 실행 가능 코드까지 걸린 시간
- 통과한 공개·채점 테스트 수
- 놓친 요구사항
- 경계 조건 오류
- 컴파일 오류 횟수
- AI 리뷰 전 상태
- AI 리뷰에서 발견한 문제
- 직접 수정한 내용
- 7일 뒤 재구현 결과

AGENTS.md 요구사항

- 사용자가 첫 시도 중이라고 밝히면 정답, 코드, 알고리즘 힌트를 주지 않음
- 요구사항의 의미만 설명하고 해결 방법은 말하지 않음
- 첫 시도 종료 뒤에는 리뷰어로만 동작
- 사용자가 명시하지 않으면 kata 구현 파일을 수정하지 않음
- 참조 구현을 저장소에 추가하지 않음
- commit과 push는 사용자 요청 없이 금지

루트 README 요구사항

- 이 저장소가 비공개 훈련용임을 첫 문단에 명시
- DSA 코딩 테스트와 요구사항 기반 구현 훈련의 차이 설명
- 주 1회 표준 루틴
- scripts 사용 예시
- 12개 kata 진행표
- 점수보다 반복 실패 원인을 보는 기준
- 공개 포트폴리오로 포장하는 데 시간을 쓰지 않는다는 규칙

검증

1. 생성 파일 목록을 출력하라.
2. Gradle wrapper와 전체 starter의 컴파일을 확인하라.
3. scaffold 검사만 통과하는지 확인하라.
4. kata 하나를 골라 grade.sh가 미구현 요구사항 때문에 실패하는지 확인하라.
5. 다른 kata 때문에 해당 grade가 실패하지 않는지 확인하라.
6. start-session.sh가 새 파일을 만들고 기존 파일을 덮어쓰지 않는지 확인하라.
7. 참조 구현, 해답 암시, 가짜 통과 기록이 없는지 rg로 검사하라.
8. 실패를 숨기거나 테스트를 비활성화해 통과시키지 마라.

최종 보고

- 만든 경로
- 실행한 검증과 결과
- 첫 번째 추천 kata와 추천 이유
- 사용자가 직접 구현해야 하는 파일
- 의도적으로 제공하지 않은 해답
- 남은 환경 문제
```

### 첫 세션 시작 프롬프트

프로젝트 생성 뒤 첫 훈련에서는 다음 프롬프트만 사용한다.

```text
나는 지금 01-ttl-cache 첫 시도를 시작한다. SPEC의 요구사항이 모순되거나 실행할 수 없는지만
확인해라. 해결 방법, 자료구조, 코드, 의사코드, 힌트는 말하지 마라. 내가 구현 중 질문하더라도
요구사항의 의미만 답하고 해법은 알려주지 마라. 첫 시도가 끝났다고 내가 명시한 뒤에만 리뷰어로
전환하라.
```

첫 시도가 끝난 뒤에는 다음 프롬프트를 사용한다.

```text
첫 시도가 끝났다. 구현 파일과 테스트 결과를 읽고 리뷰만 해라. 파일은 수정하지 마라. 요구사항
누락, 동시성 결함, 경계 조건, 복잡도, 테스트 공백을 심각도 순으로 보고하라. 완성 코드나 전체
대체 구현은 제공하지 말고, 각 문제를 재현하는 최소 테스트 조건까지만 제시하라.
```

---

## 3. 두 저장소의 경계

| 항목 | `backend-systems-lab` | `backend-live-coding-kata` |
|---|---|---|
| 질문 | 왜 이런 현상이 발생하는가 | 요구사항을 제한 시간에 구현할 수 있는가 |
| 중심 결과 | 로그·수치·실행계획·설명 | 동작하는 코드·테스트·실패 기록 |
| AI 사용 | 환경 점검과 실험 뒤 리뷰 | 첫 시도 뒤 리뷰만 허용 |
| 공개 | 완료한 실험만 공개 가능 | 비공개 유지 |
| 시간 제한 | 실험당 최대 4시간 | 회차당 45~75분 |
| 포트폴리오 | 좋은 실험 2개만 반영 | 반영하지 않음 |

CS Lab에서 구현 과제를 계속 늘리지 않는다. 라이브 코딩 저장소에서 실험 보고서를 꾸미지 않는다.
두 저장소의 목적이 섞이면 프로젝트 확장과 문서 작업이 다시 학습 시간을 차지한다.
