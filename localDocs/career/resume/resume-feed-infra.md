# 장혁

**백엔드 개발자**

[wkdgur456789@gmail.com](mailto:wkdgur456789@gmail.com) · [GitHub](https://github.com/JangHyeok2909) · [기술 블로그](https://janghyeok.tistory.com/)

보충역 4급 · 산업기능요원 신규 편입 가능

```html-raw
<style>
@page{margin:11mm 13mm 13mm 13mm} body{font-size:10pt;line-height:1.38}
h2{margin-top:3.7mm} h3{margin-top:3mm} h4{margin-top:2.5mm}
p{margin-bottom:1.5mm} ul{margin-bottom:1.5mm} li{margin-bottom:0.65mm}
.kpi{margin:1mm 0 1.5mm}.kpi>div{padding:1.7mm 2.2mm}
</style>
```

---

## 소개

백엔드 개발자입니다. Java와 Spring Boot로 익명 커뮤니티의 게시글·댓글·사용자 행동 집계와
인기글 서빙 경로를 구현했습니다. 기능을 만든 뒤 직접 계측을 붙여 댓글 목록의 N+1과 조회수 증가분이
유실되는 경로를 재현했습니다. 실패 테스트와 반복 부하 실험으로 개선 결과를 확인했습니다.

```html-raw
<div class="kpi">
  <div><b>1,507 &rarr; 4</b><span>댓글 목록 단일 요청의 쿼리 수<br>데이터 크기에 비례하던 항 제거</span></div>
  <div><b>226.7 &rarr; 34.3ms</b><span>동일한 로컬 혼합 시나리오의 전체 p95<br>두 단계 개선, 단계별 5회 실행</span></div>
</div>
```

## 기술

- **언어·프레임워크**: Java 17, Spring Boot 3.4, Spring Security, JPA, QueryDSL, MyBatis
- **데이터·인프라**: MySQL 8, PostgreSQL, Redis, Flyway, Docker, AWS EC2·S3, GitHub Actions
- **측정·관찰**: k6, Spring Actuator, Micrometer, Prometheus, Grafana

## 경력

### 한국클라우드 · AX 프로젝트팀 · 백엔드 개발

2026.07 ~ 재직 중

- 마이그레이션 후 Redis 누락 데이터 중 신규·변경분만 재캐싱하도록 배치 수정
- 정부 주소 검색 API 장애가 다른 요청까지 멈추지 않도록 타임아웃과 서킷 브레이커 도입 (RestTemplate, Redis)
- 로그인 실패 조건을 재현하고 Refresh Token 처리 흐름 재설계 (Spring Security, JWT)
- 조회·등록 API와 Vue 화면 구현 후 코드 리뷰 반영 (MyBatis, PostgreSQL, Vue)

## 프로젝트

### HighTeenDay 익명 커뮤니티 백엔드

2025.05 ~ 진행 중 · [GitHub 저장소](https://github.com/JangHyeok2909/highteenday-backend)

**설명**: 고등학생 대상 익명 커뮤니티. 게시글·댓글·반응·인기글·알림·채팅·S3 파일 업로드 구현  
**역할**: 동아리 프로젝트 리드. 게시글·댓글·인기글·파일 업로드 개발, 4개월 뒤부터 단독 유지보수  
**환경**: Java 17, Spring Boot 3.4, JPA, QueryDSL, MySQL 8, Redis, Docker, AWS

```html-raw
<div class="pagebreak"></div>
```

#### 사용자 행동 집계와 인기글 서빙

- 댓글·반응·스크랩을 트랜잭션 커밋 뒤에 Redis 인기글 점수에 반영
- 일간 Redis Sorted Set의 점수 순으로 상위 게시글을 조회하고 날짜별 키에 TTL 적용
- 조회 증가분을 Redis에 모아 60초마다 DB에 반영해 게시글 행의 반복 갱신 축소
- DB 반영 성공분만 Redis에서 차감하고 실패분을 다음 주기에 재시도
- 게시글 한 건의 반영 실패가 나머지 게시글 처리를 중단하지 않도록 실패 격리

#### 댓글 목록 API N+1 제거

- 댓글별 반응 조회를 한 번의 일괄 조회로 바꿔 요청당 쿼리 1,507 → 112회
- 작성자 지연 로딩에 `ManyToOne` 페치 조인을 적용해 요청당 쿼리 112 → 4회
- 혼합 시나리오 전체 p95 226.7 → 34.3ms 관측, 단계별 동일 조건 5회 실행
- 영속성 컨텍스트를 비운 뒤 페치 조인 제거 시 실패하는 쿼리 수 테스트 추가

#### 부하 실험 비교 조건 검사

- 200 VU·large 실행이 15 VU·small 실행을 기준선으로 고른 오류 재현
- 비교 조건 검사로 60,001ms 타임아웃을 회귀 폭으로 잘못 보고하지 않도록 개선
- 시나리오·환경·데이터 생성 조건·실행 전 DB 상태·부하·측정 구간이 같은 실행만 기준선으로 선택
- CPU 사용률·DB 커넥션 대기·목표 부하 달성률로 포화 상태를 분류해 비포화 실행과 비교 차단

## 개발 방식

- 구현 전에 실패 조건과 수용 기준 정의, 변경 전후에 같은 측정과 검증 반복
- AI 에이전트에 구현·테스트·문서 초안을 맡기고 실패 테스트·DB 대조·실측으로 결과 검증
- 검토한 대안과 채택하지 않은 이유, 변경 후 부작용 기록

## 학력 · 자격

- **경성대학교 컴퓨터공학과**: 2027.02 졸업 예정
- **정보처리기사**

<!-- CUT -->

## 제출 전 확인

- 공개 README의 MDE 16% 주장을 수정한 뒤 저장소 링크 유지
- 산업기능요원 신규 편입 상태가 바뀌면 머리글 갱신
- 회사 업무 수치 확보 시 경력 불릿 교체
