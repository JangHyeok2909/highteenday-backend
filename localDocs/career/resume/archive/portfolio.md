<<<<<<< Updated upstream
# 포트폴리오: HighTeenDay 백엔드

```html-raw
<p class="lead">측정을 신뢰해도 되는 조건을 먼저 정하고, 그 조건을 만족하는 측정으로 병목을 고친 기록</p>
<p class="meta">장혁 · Java 17 / Spring Boot 3.4 / MySQL 8 / Redis / AWS · <a href="https://github.com/JangHyeok2909/highteenday-backend">github.com/JangHyeok2909/highteenday-backend</a></p>
```

익명 커뮤니티 백엔드를 만들고, 부하 실험으로 병목을 찾아 고치고 있습니다.
3명이 시작한 동아리 프로젝트였고, 4개월 뒤부터 혼자 이어오고 있습니다.
이 문서에는 잘못 판단한 것, 그것을 발견한 과정, 고친 결과를 적었습니다. 기능 목록은 저장소에 있습니다.

```html-raw
<div class="toc">
  <div><span class="num">1</span>프로젝트의 질문과 결과 요약 <span class="tocd">성능 개선을 주장하기 위한 조건</span></div>
  <div><span class="num">2</span>시스템과 측정 환경 <span class="tocd">실시간 인기글 랭킹 설계와 컨테이너 9개짜리 측정 환경</span></div>
  <div><span class="num">3</span>부하 테스트 p95 편차 조사와 포화 실행 분리 <span class="tocd">포화된 고정 VU 실행을 일반 성능 비교에서 분리한 과정</span></div>
  <div><span class="num">4</span>회귀 판정기의 비교 기준 오선택과 유효성 검사 <span class="tocd">잘못된 대조군이 만든 회귀 보고</span></div>
  <div><span class="num">5</span>개선 판정 기준 정의 <span class="tocd">변동계수에서 최소 검출 가능 효과 16% 산출</span></div>
  <div><span class="num">6</span>댓글 목록 API N+1 제거 <span class="tocd">요청당 쿼리 1,507개에서 3.9개, p95 226.7에서 34.3ms</span></div>
  <div><span class="num">7</span>전역 p99 30ms 목표 검토 (미결정) <span class="tocd">전역 p99 30ms 가 불가능한 이유와 초과 요청의 구성</span></div>
  <div><span class="num">8</span>스크랩 토글 경쟁 상태와 상세 조회 장애 <span class="tocd">중복 행 한 건이 게시글 상세 조회를 실패시킨 경위</span></div>
  <div><span class="num">9</span>일하는 방식 <span class="tocd">결함 기록의 성격별 분리, 설계 결정 기록</span></div>
  <div><span class="num">10</span>한계 <span class="tocd">측정 결과의 유효 범위와 조치한 항목</span></div>
=======
# HighTeenDay 백엔드 포트폴리오

```html-raw
<p class="lead">동아리에서 시작한 커뮤니티 서비스의 백엔드를 1년 넘게 만들고 있습니다. 측정값이 실행마다 25~45% 흔들려 닷새를 날린 일, 댓글 API 쿼리 1,507개를 4개로 줄인 일, 중복 행 하나가 상세 화면을 죽인 일을 적었습니다.</p>
<p class="meta">장혁 · wkdgur456789@gmail.com · <a href="https://github.com/JangHyeok2909/highteenday-backend">github.com/JangHyeok2909/highteenday-backend</a> · janghyeok.tistory.com</p>
```

기능 목록과 API 명세는 [저장소 README](https://github.com/JangHyeok2909/highteenday-backend)에 있습니다. 측정 결과는 [공개 대시보드](https://janghyeok2909.github.io/highteenday-backend/)에서 실행 단위로 볼 수 있습니다. 실험·최적화 기록은 저장소의 [performance/](https://github.com/JangHyeok2909/highteenday-backend/tree/main/performance) 디렉터리에 있습니다.

```html-raw
<div class="toc">
  <div><span class="num">1</span>프로젝트 개요</div>
  <div><span class="num">2</span>시스템 구조와 인기글 랭킹 파이프라인</div>
  <div><span class="num">3</span>부하 테스트 환경</div>
  <div><span class="num">4</span>트러블슈팅 1 · 실행마다 25~45% 흔들려 개선을 판정할 수 없던 측정</div>
  <div><span class="num">5</span>트러블슈팅 2 · 회귀 판정기의 잘못된 대조군 선택</div>
  <div><span class="num">6</span>노이즈를 먼저 재서 정한 개선 판정 기준</div>
  <div><span class="num">7</span>댓글 목록 API N+1 제거, 요청당 쿼리 1,507개 → 4개</div>
  <div><span class="num">8</span>스크랩 중복 행이 만든 게시글 조회 장애와 유니크 제약</div>
  <div><span class="num">9</span>p99 30ms 전역 목표를 그룹별 목표로 재설정</div>
  <div><span class="num">10</span>일하는 방식</div>
  <div><span class="num">11</span>한계와 다음 할 일</div>
>>>>>>> Stashed changes
</div>
```

---

<<<<<<< Updated upstream
## 1. 프로젝트의 질문과 결과 요약

처음 목표는 커뮤니티 서비스를 만드는 것이었습니다. 만들고 나서 부하를 걸어 응답이
느린 곳을 찾고 원인을 분석하다가, 제가 낸 측정 결과를 제가 믿을 수 없다는 문제를 먼저
발견했습니다.

그래서 프로젝트의 질문이 바뀌었습니다. 성능을 개선했다고 말하려면 무엇이 참이어야 하는가.

이 문서는 그 질문에 답한 과정입니다. 순서대로 세 가지를 했습니다. 측정을 신뢰해도 되는 조건을
정의했고, 그 조건을 만족하는 측정으로 병목을 고쳤고, 개선폭이 측정 오차보다 큰지
확인했습니다.

### 이 프로젝트가 다룬 문제

이 프로젝트는 사용자 규모를 목표로 만든 서비스는 아닙니다. 실사용자 지표를 올린 이야기가 없고, 규모는 게시판 단위입니다.

제가 다룬 문제는 측정 결과를 신뢰할 수 있는 조건을 만드는 것입니다. 부하 실험을 반복해도
세션마다 결과가 45~48% 달라 어떤 개선도 판정할 수 없었고(3장), 회귀 판정기는 조건이 다른
실행을 기준으로 골라 있지도 않은 회귀를 보고했습니다(4장). 이 둘을 고치기 전에는 어떤 성능
수치도 근거가 되지 못했습니다.

### 작업 순서 (계측, 코드 분석, 재계측)

현재의 저는 이렇게 일 합니다.

> 계측을 통해 어디가 문제인지를 파악하고, 그 부분의 코드를 통해 정확히 무엇이 문제인지 파악합니다.
> 이후 수정을 거치고 그 수정이 정말로 유의미한 효과가 있는지 다시 계측을 통해 검증합니다.

이 과정에서 생긴 문제, 시도한 방법을 문서로 정리 해 둡니다.
수정이나 개선을 할때에는 문제인 것으로 파악되는 것을 가설로 등록하고, 가설이 정말로 맞았는지 시도해봅니다.
가설이 틀렸다면 왜틀렸는지를 반영하고 가설을 기각합니다.

### 개선 결과

| 무엇                         | 값                                                                            |
|------------------------------|-------------------------------------------------------------------------------|
| 댓글 목록 API 요청당 쿼리 수 | **1,507 → 3.9개** (−99.7%)                                                    |
| 같은 API p95                 | **226.7ms → 34.3ms**                                                          |
| 쿼리 수와 데이터 크기의 관계 | 비례 → **무관**(댓글 6개 글과 4,040개 글이 같은 4개)                          |
| 잘못 판단했던 지연의 실제 원인 | **앱 처리 시간보다 커넥션 대기 시간이 큼**(포화 상태, 같은 코드에서 38배 차이) |
| 회귀 판정의 신뢰성           | 잘못된 비교 기준으로 +59,000% 회귀를 보고. 이후 대조군 검사 도입              |
| 개선 판정 기준               | 반복 측정의 변동계수로 **최소 검출 가능 효과**를 산출해 정의                  |
| 저장된 부하 실행 기록        | 108건                                                                         |
| 테스트                       | 725개 통과                                                                    |
=======
## 1. 프로젝트 개요

### 1.1 개요

```html-raw
<table>
<colgroup><col style="width:15%"><col></colgroup>
<thead><tr><th>항목</th><th>내용</th></tr></thead>
<tbody>
<tr><td>프로젝트</td><td>HighTeenDay. 고등학생 대상 익명 커뮤니티의 백엔드</td></tr>
<tr><td>기간</td><td>2025.05 ~ 현재 (16개월). 2025.05~08 팀 개발, 2025.09~ 단독 개발</td></tr>
<tr><td>팀 구성</td><td>대학 동아리 프로젝트. 백엔드 3명(본인이 동아리 회장으로 리드), 프론트엔드 별도</td></tr>
<tr><td>담당</td><td>팀 구간: 게시글·댓글·반응·스크랩 API, 인기글 랭킹, S3 업로드 (사용자 엔티티·인증 설정은 팀원 담당). 단독 구간: 백엔드 전체, 부하 테스트 환경, 성능·정합성 개선</td></tr>
<tr><td>기여도</td><td>전체 715 커밋 중 519건. 부하 테스트·성능 문서(<code>performance/</code>) 158 커밋은 전부 본인</td></tr>
<tr><td>주요 기능</td><td>게시판·게시글·댓글·반응·스크랩·인기글·알림·채팅(WebSocket)·친구·시간표·급식 조회(NEIS)·소셜 로그인(Google). 익명 글·댓글은 응답 어디에서도 작성자 식별자와 프로필 이미지를 내보내지 않음</td></tr>
<tr><td>기술</td><td>Java 17, Spring Boot 3.4, Spring Security(JWT, OAuth2), JPA/Hibernate, QueryDSL, MySQL 8(Flyway), Redis, AWS(EC2·RDS·S3·CloudFront·ALB·ECR), Docker, GitHub Actions, k6, Prometheus, Grafana</td></tr>
<tr><td>테스트</td><td>725개 통과, CI에서 실행</td></tr>
<tr><td>링크</td><td><a href="https://github.com/JangHyeok2909/highteenday-backend">github.com/JangHyeok2909/highteenday-backend</a> · <a href="https://janghyeok2909.github.io/highteenday-backend/">측정 대시보드</a> · <a href="https://janghyeok.tistory.com">janghyeok.tistory.com</a></td></tr>
<tr><td>상태</td><td>운영 배포는 비용 문제로 중단. 실사용자 지표는 없고, 아래 수치는 전부 부하 테스트 환경에서 잰 값</td></tr>
</tbody></table>
```

### 1.2 배포 구성

```html-raw
<div class="fig">
<svg viewBox="0 0 760 250" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="Malgun Gothic, sans-serif">
  <defs>
    <marker id="a0" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#555"/></marker>
    <marker id="a0g" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#999"/></marker>
  </defs>

  <rect x="20" y="100" width="100" height="44" rx="4" fill="#fff" stroke="#888" stroke-width="1.1"/>
  <text x="70" y="119" text-anchor="middle" font-size="12">사용자</text>
  <text x="70" y="135" text-anchor="middle" font-size="9.6" fill="#666">브라우저 · HTTPS</text>

  <rect x="190" y="30" width="180" height="44" rx="4" fill="#fff" stroke="#888" stroke-width="1.1"/>
  <text x="280" y="49" text-anchor="middle" font-size="12">CloudFront + S3</text>
  <text x="280" y="65" text-anchor="middle" font-size="9.6" fill="#666">정적 프론트 · www.highteenday.org</text>

  <rect x="190" y="110" width="130" height="44" rx="4" fill="#fff" stroke="#888" stroke-width="1.1"/>
  <text x="255" y="129" text-anchor="middle" font-size="12">ALB</text>
  <text x="255" y="145" text-anchor="middle" font-size="9.6" fill="#666">HTTPS 종단 · api.highteenday.org</text>

  <rect x="370" y="30" width="170" height="44" rx="4" fill="#fff" stroke="#bbb" stroke-width="1.1" stroke-dasharray="4 3"/>
  <text x="455" y="49" text-anchor="middle" font-size="12">GitHub Actions → ECR</text>
  <text x="455" y="65" text-anchor="middle" font-size="9.6" fill="#666">push 마다 이미지 빌드·푸시</text>

  <rect x="370" y="106" width="170" height="52" rx="4" fill="#fff" stroke="#444" stroke-width="1.3"/>
  <text x="455" y="127" text-anchor="middle" font-size="12.5">EC2 · Docker</text>
  <text x="455" y="145" text-anchor="middle" font-size="9.6" fill="#666">Spring Boot :8080 (network_mode: host)</text>

  <rect x="370" y="195" width="170" height="40" rx="4" fill="#fff" stroke="#888" stroke-width="1.1"/>
  <text x="455" y="212" text-anchor="middle" font-size="12">Redis</text>
  <text x="455" y="227" text-anchor="middle" font-size="9.6" fill="#666">EC2 호스트 · 캐시 · 조회수 버퍼 · 랭킹</text>

  <rect x="600" y="110" width="140" height="44" rx="4" fill="#fff" stroke="#888" stroke-width="1.1"/>
  <text x="670" y="129" text-anchor="middle" font-size="12">MySQL (RDS)</text>
  <text x="670" y="145" text-anchor="middle" font-size="9.6" fill="#666">스키마는 Flyway로 관리</text>

  <rect x="600" y="195" width="140" height="40" rx="4" fill="#fff" stroke="#888" stroke-width="1.1"/>
  <text x="670" y="212" text-anchor="middle" font-size="12">S3</text>
  <text x="670" y="227" text-anchor="middle" font-size="9.6" fill="#666">이미지 업로드</text>

  <rect x="600" y="30" width="140" height="44" rx="4" fill="#fff" stroke="#bbb" stroke-width="1.1" stroke-dasharray="4 3"/>
  <text x="670" y="49" text-anchor="middle" font-size="12">NEIS API</text>
  <text x="670" y="65" text-anchor="middle" font-size="9.6" fill="#666">외부 · 급식 데이터</text>

  <g stroke="#555" stroke-width="1.2" marker-end="url(#a0)" fill="none">
    <line x1="122" y1="112" x2="186" y2="60"/>
    <line x1="122" y1="128" x2="186" y2="132"/>
    <line x1="322" y1="132" x2="366" y2="132"/>
    <line x1="542" y1="132" x2="596" y2="132"/>
    <line x1="455" y1="160" x2="455" y2="191"/>
    <line x1="542" y1="150" x2="596" y2="205"/>
    <line x1="542" y1="112" x2="596" y2="62"/>
  </g>
  <line x1="455" y1="76" x2="455" y2="102" stroke="#999" stroke-width="1.2" stroke-dasharray="4 3" marker-end="url(#a0g)"/>
  <text x="464" y="93" font-size="9.6" fill="#888">배포</text>
</svg>
<div class="fig-cap">그림 1. 배포 구성. 정적 프론트는 CloudFront와 S3로, API 요청은 ALB를 거쳐 EC2의 Spring Boot 컨테이너로 간다. 이미지는 GitHub Actions가 빌드해 ECR에 올리고 EC2가 받아 실행한다. 현재는 비용 문제로 내려둔 상태다.</div>
</div>
```

### 1.3 숫자로 보는 결과

| 항목 | 값 |
|---|---|
| 댓글 목록 API 요청당 쿼리 수 | **1,507개 → 4개** (부하 테스트 5회 평균 3.9개). 댓글 6개인 글과 4,040개인 글이 같은 4개 |
| 같은 API의 p95 응답 시간 | **226.7ms → 34.3ms** |
| 닷새를 쓴 오판의 실제 원인 | 실행마다 25~45% 흔들리던 p95. 원인은 용량의 1.5배 부하였고, 부하 모델을 고친 뒤 4시간 간격 재현 차이는 1.5% |
| 개선으로 인정하는 최소 크기 | 같은 조건을 5회 반복해 잰 편차(변동계수)로 계산한 약 16% (기록된 부하 실행 108회) |
>>>>>>> Stashed changes

---

```html-raw
<div class="pagebreak"></div>
```

## 2. 시스템 구조와 인기글 랭킹 파이프라인

<<<<<<< Updated upstream
### 2.1 메인 서비스

고등학생 대상 익명 커뮤니티입니다. 게시글·댓글·반응·스크랩·알림·채팅과
소셜 로그인이 있습니다. 설계 시 지킨 조건은 두 가지입니다.

- **익명성**: 익명 글·댓글에서 작성자 식별자와 프로필 이미지 비노출
- **읽기 위주 요청 분포**: 목록 조회에 캐시, 조회수·인기글에 Redis 버퍼와 스케줄러 반영

| 층 | 사용 기술 |
|---|---|
| 애플리케이션 | Java 17 · Spring Boot 3.4 · Spring Security · JPA(Hibernate) · QueryDSL |
| 저장소 | MySQL 8 (스키마는 Flyway 로만 변경) · Redis (캐시 · 조회수 버퍼 · 인기글 랭킹) |
| 인증 | JWT(HttpOnly 쿠키) · OAuth2 |
| 배포 | Docker · GitHub Actions → ECR → EC2 · S3 + CloudFront · ALB |

<!-- FULL -->
### 2.2 요청 처리 경로

이 문서에서 다루는 두 문제(커넥션 풀 대기, 댓글마다 나가는 추가 쿼리)는 같은 요청 경로의
서로 다른 지점에서 일어났습니다. 
=======
### 2.1 요청 하나가 지나는 길
>>>>>>> Stashed changes

```html-raw
<div class="fig">
<svg viewBox="0 0 760 250" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="Malgun Gothic, sans-serif">
  <defs>
    <marker id="a1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#555"/></marker>
    <marker id="a1r" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#b00000"/></marker>
  </defs>

<<<<<<< Updated upstream
  <text x="551" y="26" text-anchor="middle" font-size="12" fill="#b00000">커넥션 풀 대기 6,364ms (3장)</text>
=======
  <text x="551" y="26" text-anchor="middle" font-size="12" fill="#b00000">트러블슈팅 1: 여기서 커넥션을 6,364ms 기다렸다 (4장)</text>
>>>>>>> Stashed changes
  <line x1="551" y1="32" x2="551" y2="50" stroke="#b00000" stroke-width="1" stroke-dasharray="3 2"/>

  <text x="22" y="77" font-size="11.5" fill="#666">요청</text>
  <line x1="30" y1="73" x2="42" y2="73" stroke="#555" stroke-width="1.2" marker-end="url(#a1)"/>

  <g fill="#fff" stroke="#888" stroke-width="1.1">
    <rect x="46" y="52" width="98" height="42" rx="4"/>
    <rect x="160" y="52" width="98" height="42" rx="4"/>
    <rect x="274" y="52" width="98" height="42" rx="4"/>
    <rect x="388" y="52" width="98" height="42" rx="4"/>
    <rect x="502" y="52" width="98" height="42" rx="4" stroke="#b00000"/>
    <rect x="616" y="52" width="98" height="42" rx="4"/>
  </g>
  <g font-size="12.5" text-anchor="middle" fill="#1a1a1a">
    <text x="95" y="78">인증 필터</text>
    <text x="209" y="78">컨트롤러</text>
    <text x="323" y="78">서비스</text>
    <text x="437" y="78">리포지토리</text>
    <text x="551" y="78">커넥션 풀</text>
    <text x="665" y="78">MySQL</text>
  </g>
  <g stroke="#555" stroke-width="1.2" marker-end="url(#a1)">
    <line x1="146" y1="73" x2="157" y2="73"/>
    <line x1="260" y1="73" x2="271" y2="73"/>
    <line x1="374" y1="73" x2="385" y2="73"/>
    <line x1="488" y1="73" x2="499" y2="73"/>
    <line x1="602" y1="73" x2="613" y2="73"/>
  </g>

  <line x1="323" y1="94" x2="323" y2="148" stroke="#555" stroke-width="1.2" marker-end="url(#a1)"/>
  <text x="332" y="124" font-size="11" fill="#666">엔티티</text>

  <rect x="238" y="150" width="170" height="46" rx="4" fill="#fff" stroke="#b00000" stroke-width="1.2"/>
  <text x="323" y="170" text-anchor="middle" font-size="12.5" fill="#1a1a1a">DTO 변환</text>
  <text x="323" y="187" text-anchor="middle" font-size="10.5" fill="#666">댓글 한 건마다 이 자리를 지난다</text>

  <path d="M408,173 C470,173 551,152 551,100" fill="none" stroke="#b00000" stroke-width="1.3" stroke-dasharray="4 3" marker-end="url(#a1r)"/>
<<<<<<< Updated upstream
  <text x="470" y="216" text-anchor="middle" font-size="12" fill="#b00000">DTO 변환 중 지연 로딩으로 쿼리 추가 발생 (6장)</text>

  <text x="46" y="240" font-size="10.5" fill="#888">* 조회수 버퍼와 인기글 랭킹은 Redis 경유. 이 그림에서는 생략</text>
</svg>
<div class="fig-cap">그림 1. 댓글 목록 요청의 처리 경로. 커넥션 풀 대기(3장)와 응답 생성 중 추가 쿼리(6장)의 발생 지점</div>
</div>
```

두 문제는 발생 지점이 다릅니다. 커넥션 풀 대기(3장)는 요청이 DB 에 닿기 전에 커넥션을
기다린 것이고, 추가 쿼리(6장)는 응답 DTO 를 만드는 중에 댓글마다 쿼리가 더 나간 것이었습니다.
커넥션 풀 대기는 애플리케이션 코드 밖에서 일어나므로 코드만 봐서는 알 수 없습니다. 추가
쿼리는 코드에서 짐작할 수 있지만, 요청 하나에 몇 개가 나가는지는 파악하기 힘듭니다. 
그래서 둘 다 측정으로 먼저 찾았습니다.

<!-- /FULL -->
### 2.3 실시간 인기글 랭킹 (행동 집계와 순위 조회)

사용자가 가장 자주 보는 화면은 인기글 목록입니다. 이 경로는 사용자 행동을 모아 점수로 바꾸고
순위대로 반환하는 파이프라인입니다.
=======
  <text x="470" y="216" text-anchor="middle" font-size="12" fill="#b00000">성능 개선: 여기서 지연 로딩으로 쿼리가 추가로 나갔다 (7장)</text>

  <text x="46" y="240" font-size="10.5" fill="#888">* 조회수 버퍼와 인기글 랭킹은 Redis를 거치며, 이 그림에서는 생략했습니다.</text>
</svg>
<div class="fig-cap">그림 2. 댓글 목록 요청 하나가 지나는 길. 4장의 문제는 커넥션 풀에서, 7장의 문제는 응답 DTO를 만드는 자리에서 일어났다.</div>
</div>
```

두 문제는 같은 요청 경로의 서로 다른 지점에서 일어났습니다. 커넥션 풀 대기는 요청이 들어가는 길에서 생겼고, 추가 쿼리는 응답을 만드는 길에서 나갔습니다. 둘 다 측정으로 먼저 잡았습니다.

### 2.2 인기글 랭킹 파이프라인

사용자가 가장 자주 보는 화면이 인기글 목록입니다. 사용자 행동을 모아 점수로 바꾸고, 점수 순으로 정렬해 내보내는 파이프라인입니다.
>>>>>>> Stashed changes

```html-raw
<div class="fig">
<svg viewBox="0 0 760 200" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="Malgun Gothic, sans-serif">
  <defs>
    <marker id="a4" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#555"/></marker>
  </defs>

  <text x="100" y="28" text-anchor="middle" font-size="10.5" fill="#888">사용자 행동</text>
  <text x="295" y="28" text-anchor="middle" font-size="10.5" fill="#888">수집</text>
  <text x="495" y="28" text-anchor="middle" font-size="10.5" fill="#888">점수</text>
  <text x="670" y="28" text-anchor="middle" font-size="10.5" fill="#888">순위 · 서빙</text>

  <rect x="25" y="42" width="150" height="42" rx="4" fill="#fff" stroke="#888" stroke-width="1.1"/>
  <text x="100" y="60" text-anchor="middle" font-size="11">직접 행동</text>
  <text x="100" y="76" text-anchor="middle" font-size="9.6" fill="#666">댓글 · 반응 · 스크랩</text>

  <rect x="25" y="104" width="150" height="42" rx="4" fill="#fff" stroke="#888" stroke-width="1.1"/>
  <text x="100" y="122" text-anchor="middle" font-size="11">조회</text>
  <text x="100" y="138" text-anchor="middle" font-size="9.6" fill="#666">조회</text>

  <rect x="215" y="42" width="160" height="42" rx="4" fill="#fff" stroke="#888" stroke-width="1.1"/>
  <text x="295" y="60" text-anchor="middle" font-size="11">커밋 이후 이벤트</text>
  <text x="295" y="76" text-anchor="middle" font-size="9.6" fill="#666">AFTER_COMMIT</text>

  <rect x="215" y="104" width="160" height="42" rx="4" fill="#fff" stroke="#888" stroke-width="1.1"/>
  <text x="295" y="122" text-anchor="middle" font-size="11">Redis 버퍼</text>
  <text x="295" y="138" text-anchor="middle" font-size="9.6" fill="#666">1분 주기로 DB 반영</text>

  <rect x="425" y="73" width="140" height="42" rx="4" fill="#fff" stroke="#888" stroke-width="1.1"/>
  <text x="495" y="91" text-anchor="middle" font-size="11">인기 점수</text>
  <text x="495" y="107" text-anchor="middle" font-size="9.6" fill="#666">5분 주기 재계산</text>

  <rect x="605" y="42" width="130" height="42" rx="4" fill="#fff" stroke="#888" stroke-width="1.1"/>
  <text x="670" y="60" text-anchor="middle" font-size="11">Sorted Set</text>
  <text x="670" y="76" text-anchor="middle" font-size="9.6" fill="#666">시간 버킷 + TTL</text>

  <rect x="605" y="104" width="130" height="42" rx="4" fill="#fff" stroke="#888" stroke-width="1.1"/>
  <text x="670" y="130" text-anchor="middle" font-size="11">인기글 목록</text>

  <g stroke="#555" stroke-width="1.2" marker-end="url(#a4)">
    <line x1="177" y1="63" x2="211" y2="63"/>
    <line x1="177" y1="125" x2="211" y2="125"/>
    <line x1="377" y1="68" x2="421" y2="85"/>
    <line x1="377" y1="120" x2="421" y2="103"/>
    <line x1="567" y1="88" x2="601" y2="72"/>
    <line x1="670" y1="86" x2="670" y2="100"/>
  </g>
</svg>
<<<<<<< Updated upstream
<div class="fig-cap">그림 3. 인기글 읽기 경로. 두 종류의 사용자 행동이 서로 다른 방식으로 모여 하나의 점수가 되고, 날짜별 Sorted Set 에 쌓여 목록으로 나간다.</div>
</div>
```

사용자 행동을 두 종류로 나눠 처리합니다.

- **댓글·반응·스크랩**: 사용자가 직접 한 행동. 트랜잭션이 커밋된 뒤 이벤트로 반영
- **조회**: 게시글 열람. Redis 에 모아 두고 1분 주기로 반영

커밋 전에 반영하면 롤백된 행동이 순위에 남습니다. 조회를 요청마다 DB 에 쓰면 인기 게시글
한 행에 쓰기가 몰리므로 Redis 에 먼저 모읍니다.

점수는 좋아요 5, 댓글 3, 스크랩 2, 조회 1, 싫어요 −2 의 가중치주고 `log10` 으로 압축해
만듭니다. 로그를 적용하는 이유는 조회 수천 건이 좋아요 수십 건보다 항상 높은 점수를 받는 것을 막기
위해서입니다.
여기에 시간 감쇠를 `(경과 시간 + 2)^1.5` 로 나눠 적용합니다. 분모에 2를 더하는 것은 작성 직후
글의 분모가 0에 가까워져 점수가 비정상적으로 커지는 것을 막기 위해서입니다.

감쇠는 사용자 행동이 없어도 순위를 낮춰야 하므로 이벤트 반영만으로는 부족합니다. 그래서 5분
주기 배치가 현재 랭킹 상위 50개의 점수를 다시 계산합니다. 전체 게시글 재계산은 게시글 수에
비례해 비싸지고, 감쇠 보정이 필요한 대상은 이미 순위권에 있는 글이기 때문입니다. 대신 상위
50위 밖에서 일어난 반응 취소는 이 배치로 보정되지 않습니다.

이 랭킹은 실시간으로 갱신됩니다. 반응·댓글·스크랩은 커밋 직후, 조회는 1분 배치, 시간 감쇠는
5분 배치로 점수에 반영됩니다. 점수의 재료는 게시글의 누적 반응 수이고 하루치 집계가
아닙니다. 조회 API 는 현재 점수 상위 10개 중 좋아요 10개 이상인 글만 반환합니다.

Redis 키는 `hot:leaderboard:day:{yyyyMMdd}` 로 날짜마다 나뉩니다. 이 날짜는 점수를 집계하는
구간이 아닌, 랭킹 후보군의 범위입니다. 오늘 점수가 갱신된 글만 오늘 키에 들어가므로, 어제까지만
활동이 있던 글은 자정이 지나면 순위에서 빠집니다. 지난 순위가 키 만료로 함께 정리되는 것도 같은 구조에서
얻습니다.

<!-- FULL -->
#### 설계 판단: Sorted Set 만료 시간의 지정 위치

**결정**: Sorted Set 의 만료 시간을 Redis 어댑터가 키 이름을 보고 정하지 않고, 저장을
요청하는 서비스 코드가 함께 넘기도록 바꿨습니다.

키 종류마다 만료 시간이 다릅니다. 랭킹 키는 이틀입니다. 키 이름이 날짜라 자정에 새 키로
바뀌는데, 마지막 쓰기 직후 만료되면 그날 남은 조회가 DB 폴백으로 빠지기 때문입니다.
게시판별 5분 단위 키는 30분입니다. Redis 어댑터가 키 이름을 보고 만료 시간을 정하면, 키
종류를 추가할 때마다 어댑터를 수정해야 합니다. 그래서 만료 시간은 저장을 요청하는 서비스
코드가 넘기고, 어댑터는 받은 값을 그대로 적용합니다.

게시판별 5분 단위 키를 쓰는 코드는 서비스 메서드까지만 있고 어떤 컨트롤러에도 연결하지
않았습니다. 위 만료 설계는 그 미연결 코드까지 포함해 정한 것입니다.

#### 조회수 반영 실패분의 재시도 처리

조회수 반영은 게시글마다 따로 실패할 수 있습니다. 그래서 성공한 것만 정산하고 실패분은
버퍼에 남겨 다음 주기에 다시 시도합니다. 다만 삭제된 게시글은 재시도해도 성공하지 않으므로
반영된 것으로 처리해 버퍼에서 제거합니다. 그러지 않으면 같은 실패가 매 분 반복되면서 로그만 쌓이고
버퍼는 비지 않습니다.

#### 발견한 결함 (Sorted Set 만료 누락)

초기에는 Sorted Set 키에 만료가 없었습니다. 지나간 날짜와 시각의 순위가 영구히 남아 Redis
메모리가 단조 증가합니다. 결함 목록(KI-20)에 등록한 뒤 만료를 넣어 해소했습니다.

=======
<div class="fig-cap">그림 3. 인기글 랭킹 파이프라인. 두 종류의 행동 신호를 다른 방식으로 모아 하나의 점수로 만들고, 시간 버킷 단위의 Sorted Set에 쌓아 목록으로 내보낸다.</div>
</div>
```

- 댓글·반응·스크랩처럼 사용자가 직접 한 행동은 트랜잭션이 커밋된 뒤 이벤트(`AFTER_COMMIT`)로 받아 점수에 반영합니다. 커밋 전에 반영하면 롤백된 행동이 순위에 남기 때문입니다.
- 조회수는 요청마다 DB에 쓰면 인기 게시글 한 행에 쓰기가 몰립니다. 그래서 Redis에 모아 두었다가 1분 주기로 DB에 반영합니다.
- 반영에 실패한 게시글만 버퍼에 남겨 다음 주기에 다시 시도합니다. 삭제된 게시글은 재시도해도 성공할 수 없으므로 반영된 것으로 처리해 버퍼에서 뺍니다. 그러지 않으면 같은 실패가 매 분 반복되어 버퍼가 비지 않습니다.
- 인기 점수는 5분 주기로 다시 계산해 Redis Sorted Set에 넣습니다. 일별 리더보드와 5분 단위 실시간 버킷을 따로 둡니다. 버킷마다 TTL(만료 시간)을 걸어 지난 순위가 메모리에 남지 않게 했습니다.

#### TTL을 누가 정하는가

TTL은 Redis 어댑터가 키 이름을 보고 정하는 대신, 수명을 아는 호출자가 넘기게 했습니다. 버킷은 종류마다 수명이 다릅니다. 일자 리더보드는 하루가 지나면 다시 읽히지 않고, 5분 실시간 버킷은 몇십 분이면 끝납니다.

어댑터가 키 이름으로 수명을 추측하게 만들면 새 버킷을 추가할 때마다 어댑터를 고쳐야 합니다. 그래서 확장 지점을 인터페이스 바깥, 호출자 쪽에 두었습니다.

<!-- FULL -->
#### 이 경로에 있었던 결함

초기에는 정렬 집합 키에 만료가 없었습니다. 지나간 날짜와 시각의 순위가 남아 Redis 메모리가 계속 늘었습니다. 결함 목록([KNOWN-ISSUES.md](https://github.com/JangHyeok2909/highteenday-backend/blob/main/docs/KNOWN-ISSUES.md)의 KI-20)에 등록한 뒤 TTL을 넣어 해소했습니다.
>>>>>>> Stashed changes
<!-- /FULL -->
점수는 모든 사용자에게 같습니다. 개인화와 추천은 없고, 규모는 게시판 단위입니다.

<<<<<<< Updated upstream
<!-- FULL -->
### 2.4 측정 환경을 따로 만든 이유

애플리케이션만 띄우고 재면 어느 API 가 느린지는 알 수 있어도 원인은 알 수 없습니다.
애플리케이션 지표만으로는 DB 지연, 커넥션 부족, CPU 제한 중 무엇인지 구분할 수 없기
때문입니다. 그래서 부하 생성과 지표 수집을 함께 갖춘 별도 환경을 만들었습니다.

**컨테이너 9개**: 애플리케이션, MySQL, Redis, Prometheus, Grafana, MySQL exporter,
Redis exporter, cAdvisor, node exporter. 부하 생성기(k6)는 분리해서 띄웁니다.
=======
이 경로에 개인화나 추천은 없습니다. 점수는 모든 사용자에게 같고 인스턴스도 하나입니다. 여러 인스턴스에서의 스케줄러·이벤트 동작은 아직 설계하지 않았습니다.

---

## 3. 부하 테스트 환경

로컬에서 애플리케이션만 띄우고 재면 무엇이 느린지는 알 수 있어도 왜 느린지는 알기 어렵습니다. DB가 느린지, 커넥션이 모자란지, 컨테이너 CPU 한도에 걸렸는지를 가르려면 애플리케이션 바깥의 지표가 같이 필요했습니다. 그래서 부하와 관측을 함께 세운 환경을 따로 만들었습니다.

컨테이너는 9개입니다. 애플리케이션, MySQL, Redis, Prometheus, Grafana, exporter 3종(MySQL·Redis·node), cAdvisor입니다. 부하 생성기 k6는 밖에서 띄웁니다.
>>>>>>> Stashed changes

```html-raw
<div class="fig">
<svg viewBox="0 0 760 300" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="Malgun Gothic, sans-serif">
  <defs>
    <marker id="a2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#555"/></marker>
    <marker id="a2g" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#999"/></marker>
  </defs>

  <rect x="30" y="58" width="130" height="48" rx="4" fill="#fff" stroke="#888" stroke-width="1.1"/>
  <text x="95" y="79" text-anchor="middle" font-size="12.5">k6</text>
  <text x="95" y="95" text-anchor="middle" font-size="10.5" fill="#666">부하 생성 (분리 실행)</text>

  <rect x="230" y="58" width="140" height="48" rx="4" fill="#fff" stroke="#888" stroke-width="1.1"/>
  <text x="300" y="87" text-anchor="middle" font-size="12.5">애플리케이션</text>

  <rect x="440" y="36" width="120" height="36" rx="4" fill="#fff" stroke="#888" stroke-width="1.1"/>
  <text x="500" y="59" text-anchor="middle" font-size="12">MySQL</text>
  <rect x="440" y="92" width="120" height="36" rx="4" fill="#fff" stroke="#888" stroke-width="1.1"/>
  <text x="500" y="115" text-anchor="middle" font-size="12">Redis</text>

  <line x1="162" y1="82" x2="226" y2="82" stroke="#555" stroke-width="1.2" marker-end="url(#a2)"/>
  <text x="194" y="74" text-anchor="middle" font-size="10.5" fill="#666">요청</text>
  <line x1="372" y1="74" x2="436" y2="58" stroke="#555" stroke-width="1.2" marker-end="url(#a2)"/>
  <line x1="372" y1="92" x2="436" y2="108" stroke="#555" stroke-width="1.2" marker-end="url(#a2)"/>

  <path d="M230,140 L560,140" fill="none" stroke="#bbb" stroke-width="1"/>
  <line x1="300" y1="108" x2="300" y2="140" stroke="#bbb" stroke-width="1"/>
  <line x1="500" y1="130" x2="500" y2="140" stroke="#bbb" stroke-width="1"/>
  <line x1="330" y1="140" x2="330" y2="166" stroke="#999" stroke-width="1.2" stroke-dasharray="4 3" marker-end="url(#a2g)"/>
  <text x="342" y="158" font-size="10.5" fill="#888">지표 노출</text>

  <rect x="230" y="168" width="200" height="52" rx="4" fill="#fff" stroke="#888" stroke-width="1.1"/>
  <text x="330" y="189" text-anchor="middle" font-size="12">exporter 4종</text>
  <text x="330" y="206" text-anchor="middle" font-size="10.5" fill="#666">앱 · MySQL · Redis · 컨테이너</text>

  <rect x="470" y="168" width="130" height="52" rx="4" fill="#fff" stroke="#888" stroke-width="1.1"/>
  <text x="535" y="199" text-anchor="middle" font-size="12">Prometheus</text>

  <rect x="630" y="168" width="105" height="52" rx="4" fill="#fff" stroke="#888" stroke-width="1.1"/>
  <text x="682" y="199" text-anchor="middle" font-size="12">Grafana</text>

  <line x1="432" y1="194" x2="466" y2="194" stroke="#555" stroke-width="1.2" marker-end="url(#a2)"/>
  <line x1="602" y1="194" x2="626" y2="194" stroke="#555" stroke-width="1.2" marker-end="url(#a2)"/>

  <rect x="110" y="248" width="530" height="46" rx="4" fill="#fafafa" stroke="#444" stroke-width="1.2"/>
  <text x="375" y="267" text-anchor="middle" font-size="12.5">실행 기록 하나</text>
<<<<<<< Updated upstream
  <text x="375" y="284" text-anchor="middle" font-size="10.5" fill="#555">포화 판정(3장) · 비교 기준 유효성(4장) · 최소 검출 가능 효과 대조(5장)</text>
=======
  <text x="375" y="284" text-anchor="middle" font-size="10.5" fill="#555">포화 판정(4장) · 대조군 확인(5장) · 노이즈 대조(6장)</text>
>>>>>>> Stashed changes

  <path d="M95,108 L95,271 L106,271" fill="none" stroke="#555" stroke-width="1.2" stroke-dasharray="4 3" marker-end="url(#a2)"/>
  <text x="103" y="176" font-size="10.5" fill="#666">지연·처리량</text>
  <line x1="535" y1="222" x2="535" y2="244" stroke="#555" stroke-width="1.2" stroke-dasharray="4 3" marker-end="url(#a2)"/>
  <text x="545" y="240" font-size="10.5" fill="#666">자원·DB 지표</text>
</svg>
<<<<<<< Updated upstream
<div class="fig-cap">그림 2. 측정 환경 구성. 한 번의 실행이 부하 결과와 자원 지표를 하나의 기록으로 묶고, 그 기록에 3~5장의 판정이 붙는다.</div>
</div>
```

이 구성이 있어야 하나의 요청 지연을 애플리케이션, 커넥션 풀, DB, 컨테이너 자원의 네 층으로
나눠 볼 수 있습니다. 3장의 원인을 이 구분으로 찾았습니다.

측정은 매번 같은 데이터셋 스냅샷을 복원한 뒤 실행하고, 데이터셋의 내용 해시와 실행 조건을
기록에 함께 남깁니다. 같은 데이터로 비교했다는 것을 기록으로 증명하기 위해서입니다.

<!-- /FULL -->
**이 장의 요약**: 인기글 랭킹을 실시간 갱신 구조로 설계했고, 사용자 행동을 직접 행동과 조회
두 종류로 나눠 수집했고, 점수 산식과 시간 감쇠 적용 주기를 정했습니다.
=======
<div class="fig-cap">그림 4. 무엇을 어디서 재는가. 한 번의 실행이 부하 쪽 결과와 자원 쪽 지표를 함께 묶어 하나의 기록이 되고, 그 기록에 포화 판정, 대조군 확인, 노이즈 대조 결과가 붙는다.</div>
</div>
```

이 구성이 있어야 요청 하나의 지연을 애플리케이션, 커넥션 풀, DB, 컨테이너 자원의 네 층으로 나눠 볼 수 있습니다. 커넥션 풀 대기 6,364ms가 그 나누기로 드러났습니다.

실행마다 같은 데이터셋 스냅샷을 복원한 뒤 시작합니다. 데이터셋의 내용 해시와 실행 조건을 k6의 지연·처리량, Prometheus의 자원·DB 지표와 묶어 한 기록으로 남깁니다. 같은 데이터로 비교했다는 것을 사람의 기억 대신 기록으로 증명하기 위해서입니다.
>>>>>>> Stashed changes

---

```html-raw
<div class="pagebreak"></div>
```

<<<<<<< Updated upstream
## 3. 부하 테스트 p95 편차 조사와 포화 실행 분리

### 3.1 발생 경위

같은 코드와 데이터, 같은 200 VU 설정으로 실행했지만 p95는 실행마다 달랐습니다.
하루 안에 10,979ms에서 16,269ms로 48% 상승한 뒤, 이후 9회 평균은 10,685ms로 내려갔습니다.
이 상태에서는 저장한 실행을 나중에 비교 기준으로 사용하기 어려웠습니다. 코드 변경에 따른
차이와 실행 사이의 차이를 구분할 수 없었기 때문입니다.

200 VU는 동시 사용자 수를 고정하는 closed model이었습니다. 시스템이 느려지면 각 사용자가
다음 요청을 늦게 보내므로 실제 초당 요청 수도 줄어듭니다. 설정은 같았지만 실행마다 실제 초당
요청 수는 달랐습니다.

### 3.2 호스트 환경 가설 검토

처음에는 호스트 PC의 성능 변동을 원인으로 의심했습니다. CPU 주파수, 성능·효율 코어 배치,
Hyper-V 스케줄링, 전원 관리, 가상 디스크와 WSL2 메모리 상태를 닷새 동안 확인했습니다.
134시간 동안 CPU 벤치 814건을 수집했습니다. 부하 중 표본 26건을 제외한 788건에서는 낮과
밤 사이에 16%의 성능 차이가 반복됐습니다.

호스트 CPU 성능 차이가 부하 테스트 결과에도 나타나는지 별도로 확인했습니다. 비포화 상태로
실행한 11건에서 실행 직전 CPU 벤치와 전체 p95의 상관계수는 -0.006이었습니다. 호스트 CPU의
성능 차이는 존재했지만 부하 테스트의 p95 차이를 설명하지 못했습니다.

### 3.3 포화 상태의 p95와 처리율 관계

호스트 환경에서 원인을 찾지 못한 뒤, 같은 코드와 데이터에서 초당 요청 수만 3·4·5건으로
바꿔 측정했습니다. 이 측정은 처리 용량을 확인하기 위한 것입니다.

| 목표 요청 수 | 실제 요청 수 | 목표 달성률 | p95 | 앱 CPU | 커넥션 대기 |
|---|---:|---:|---:|---:|---:|
| 초당 3건 | 2.96/s | 99% | 690ms | 37% | 2 |
| 초당 4건 | 4.03/s | 101% | 402ms | 52% | 0 |
| 초당 5건 | 3.83/s | 77% | 11,871ms | 97% | 65 |
| 고정 200 VU (기존) | 5.96/s | 해당 없음 | 10,685ms | 100% | 145 |

초당 4건에서는 목표한 요청을 모두 보냈고 커넥션 대기가 없었습니다. 초당 5건에서는 실제로
보낸 요청이 목표의 77%에 그쳤고 p95가 402ms에서 11,871ms로 늘었습니다. 기존 200 VU
실행에서는 앱 CPU가 상한에 도달했고 커넥션 대기 145건이 발생했습니다.

고정 VU 부하에서는 동시 사용자 수 N이 200으로 고정됩니다. 리틀의 법칙 `R = N / X`에 따라
처리율 X가 낮아질수록 응답시간 R은 길어집니다. 실측에서도 `200 / 처리율`과 p95의 상관계수가
0.962로 나왔습니다.

커넥션 획득 p95는 6,364ms로 전체 p95의 57%였습니다. 이 값은 요청이 커넥션 풀에서 기다린
시간을 보여줍니다. 앱 CPU는 할당된 2.0코어 중 1.998코어를 사용해 상한에 도달했습니다. 이
분석으로 처리율 차이가 p95 차이로 이어지는 구조를 확인했지만, 처리율이 실행마다 달라진 원인은
찾지 못했습니다.

CPU 사용률과 처리율이 비슷하게 유지된 포화 실행에서는 p95도 비슷했습니다. 처리율이 달라진
실행에서는 p95도 크게 달랐습니다. 포화 실행의 편차가 작다는 사실만으로 측정이
안정적이라고 판단할 수 없습니다.

### 3.4 실행별 포화 상태 자동 판정

커넥션 대기, CPU 사용률, CPU 할당량 도달 비율, 커넥션 획득 시간의 비중, 목표 요청 수 달성
여부를 조합해 실행마다 네 단계로 판정합니다. SATURATED로 판정되면 비포화 실행과 비교할 수
없다는 경고를 표시합니다. 두 실행의 포화 상태가 다르면 증감률을 계산하지 않습니다.
=======
## 4. 트러블슈팅 1 · 실행마다 25~45% 흔들려 개선을 판정할 수 없던 측정

### 4.1 증상

2026년 8월, 같은 코드와 데이터셋으로 부하 테스트를 반복하자 p95가 실행마다 25~45% 달랐습니다. 값은 10,000~17,000ms(평균 10,685ms) 사이를 오갔습니다.

이 폭은 제가 노리던 개선폭 10~40%보다 큽니다. 아무것도 바꾸지 않은 실행이 이만큼 흔들리면 어떤 변경도 효과인지 잡음인지 가를 수 없습니다. 측정 시스템 자체가 쓸모없어지는 문제였습니다.

저는 흔들림의 원인을 환경에서 찾았습니다. 호스트 CPU 주파수, 성능/효율 코어 배치, 하이퍼바이저 스케줄링, 전원 관리 설정, 가상 디스크 조각화, 리눅스 서브시스템의 메모리 회수까지 확인했습니다. 여기에 닷새를 썼고 원인을 찾지 못했습니다.

### 4.2 가설과 용량 곡선

부하가 낮은 시나리오는 같은 조건을 반복해도 편차가 10% 안이었습니다. 그래서 자원이 포화(요청이 처리 용량을 넘어 줄을 선 상태)된 실행에서만 편차가 커지는 것이 아닌지 의심했습니다. 확인하려고 같은 코드로 도착률(초당 보내는 요청 수)만 초당 3·4·5요청으로 바꿔 2026-08-20에 다시 쟀습니다.

| 목표 도착률 | 실제 도달률 | p95 | 앱 CPU | 커넥션 대기 |
|---|---|---|---|---|
| 초당 3요청 | 99% | 690ms | 37% | 2건 |
| **초당 4요청** | **101%** | **402ms** | 52% | **0건** |
| 초당 5요청 | **77%** | **11,871ms** | 97% | 65건 |

부하를 25% 올리면 p95가 30배가 됩니다. 대기행렬에서 이용률이 1에 가까워지면 대기 시간이 `1/(1-ρ)`로 발산하기 때문입니다. 제가 200 VU로 돌리던 부하는 이 환경 용량의 약 1.5배였습니다.

세션마다 유효 용량이 조금만 달라져도 절벽 위에서는 이용률이 임계선 양쪽을 넘나듭니다. 실제로 세션 A에서 C로 가며 처리량이 25% 떨어졌고, 그래서 실행마다 값이 통째로 달라 보였습니다. 용량을 흔든 원인은 아직 규명하지 못했고, 호스트 탓이라는 근거는 없습니다.

### 4.3 원인

부하 모델도 틀렸는데, k6를 사용자 수 200명 고정(closed model)으로 돌리고 있었습니다. 사용자 수를 고정하면 응답 시간이 `사용자 수 ÷ 처리량`으로 결정됩니다. 리틀의 법칙(동시 사용자 수 = 처리량 × 응답 시간)을 옮겨 쓴 것입니다.

실측에서 `200 ÷ 처리량`과 p95의 상관계수는 0.962였습니다. 커넥션 획득 시간과의 상관 0.944보다 높습니다. 제가 애플리케이션 지연으로 읽던 값은 처리량의 역수였습니다.

필요한 지표는 처음부터 전부 수집되고 있었습니다.

| 지표 | 값 | 뜻 |
|---|---|---|
| 커넥션 획득 p95 | 6,364ms | p95 10,685ms 중 6,364ms가 커넥션을 기다린 시간 |
| 커넥션 대기 건수 평균 | 145 | 커넥션 10개를 145개 요청이 기다림 |
| CPU 한도에 걸린 기간 비율 | 99.86% | 거의 매 기간 CPU 한도를 다 씀. 상한에 붙어 있다는 뜻이고, 그 시간만큼 멈췄다는 뜻은 아님 |
| 사용 코어 | 1.998 / 2.0 | CPU 상한에 붙어 있음 |
| 시나리오 기대 처리량 | 45~55 RPS (실측 17~28) | 계획한 부하를 소화하지 못하는 중 |

이 조합을 보고 "이 실행의 p95는 인용하지 마라"고 알려 주는 코드가 없었습니다. 기존 판정 코드는 지표가 빠졌는지만 봤고, 지표가 다 있으면서 그 값의 의미가 달라지는 경우는 보지 않았습니다.

### 4.4 고친 것 넷

- 부하 모델을 도착률 고정(`ramping-arrival-rate`)으로 바꿨습니다. 사용자 수를 고정하면 시스템이 느려질 때 요청 속도도 같이 느려져 부하 부족이 숨는데, 이를 coordinated omission이라 부릅니다. 도착률을 고정하면 못 따라가는 것이 도달률 미달로 드러납니다.
- 판정용 부하를 초당 4요청으로 고정했습니다. 용량 곡선에서 확인한 포화 이하 지점이고, 앱 CPU 37~45%, 커넥션 대기 0건, 커넥션 획득 1ms입니다. 포화 시 실측 처리량은 초당 17~28요청입니다.
- 포화 여부를 실행마다 자동 판정합니다. 커넥션 대기, CPU 상한 도달, CPU 사용률, 커넥션 획득 시간 비중, 도달률 다섯 신호를 봅니다.
- 저장돼 있던 실행 119건을 다시 판정했습니다. 포화로 나온 49건은 아카이브로 옮겼습니다(2026-08-21). 날짜로 자르지 않고 판정으로 갈랐습니다.
>>>>>>> Stashed changes

```html-raw
<div class="fig">
  <div class="flow">
    <div class="flow-step"><b>HEADROOM</b><span>자원 여유 있음<br>일반 성능 비교 가능</span></div>
    <div class="flow-arrow">›</div>
    <div class="flow-step"><b>NEAR_LIMIT</b><span>대기 발생 시작<br>비교 주의</span></div>
    <div class="flow-arrow">›</div>
<<<<<<< Updated upstream
    <div class="flow-step"><b>SATURATED</b><span>대기 시간 비중 큼<br>비포화 실행과 비교 제외</span></div>
    <div class="flow-arrow">›</div>
    <div class="flow-step"><b>UNKNOWN</b><span>판정에 필요한<br>지표가 없음</span></div>
  </div>
  <div class="fig-cap">그림 5. 실행별 포화 상태 판정. SATURATED로 판정된 실행은 비포화 실행과 비교하지 않는다.</div>
</div>
```

### 3.5 일반 성능 비교와 처리 용량 측정 분리

코드 변경 효과는 같은 조건의 비포화 실행끼리 비교하도록 했습니다. 포화 실행은 최대 처리
용량과 대기 상태를 확인하는 결과로 따로 보관합니다.

초당 요청 수를 4건으로 고정한 뒤에도 한 실행은 CPU 사용률 100%, p95 5,634ms로
포화됐습니다. 초당 요청 수를 고정해도 비포화 상태를 보장할 수 없었으므로 실행마다 실제 자원
상태를 판정했습니다.

처리 용량을 찾는 테스트에서는 포화 자체가 측정 대상입니다. 따라서 포화를 테스트 실패로
처리하지 않고, 일반 성능 비교에서만 제외했습니다.

<!-- FULL -->
### 3.6 분리 후 재측정

비포화 상태에서 4시간 간격으로 측정한 두 세트의 댓글 목록 p95 평균은 2,201ms와
2,169ms였습니다. 세트 간 차이는 1.5%였습니다. 같은 시간 동안 유휴 CPU 벤치는 18%
느려졌지만 댓글 목록 p95는 비슷했습니다.

각 세트 내부에서 전체 p95의 변동계수는 9.6~15.8%였습니다. 1.5%는 두 세트의 댓글 목록
p95에만 적용되는 값입니다.

### 3.7 한계

포화 실행의 처리율이 달라진 원인과 같은 초당 요청 수에서도 일부 실행만 포화된 원인은 확인하지
못했습니다. 포화 상태에서 편차가 작았던 실행은 CPU가 계속 상한에 도달했고 처리율도 비슷했기
때문으로 추정합니다.

포화 판정 기준은 로컬 2코어 환경에서 정한 값입니다. 운영 환경에 적용하려면 환경별 처리 용량과
판정 기준을 다시 측정해야 합니다.
=======
    <div class="flow-step"><b>SATURATED</b><span>p95는 대기 시간<br><b style="display:inline">인용 금지</b></span></div>
    <div class="flow-arrow">›</div>
    <div class="flow-step"><b>UNKNOWN</b><span>판정에 필요한<br>지표가 없음</span></div>
  </div>
  <div class="fig-cap">그림 5. 실행마다 붙는 포화 판정. SATURATED로 판정된 실행의 지연값은 리포트에서 성능 근거로 인용되지 않는다.</div>
</div>
```

포화를 테스트 실패로 처리하지는 않았습니다. 한계를 찾는 시나리오(stress, breakpoint)는 포화를 만드는 것이 목적입니다. 거기서 포화가 실패면 그 시나리오는 항상 실패합니다.

그래서 포화를 해석 조건으로 정의해, 결과를 버리는 대신 그 결과로 무엇을 주장할 수 있는지를 제한합니다. 높은 부하 실행에서는 처리량과 도달률, 에러율을 보고 지연값은 인용하지 않습니다. 개선의 효과 판정은 포화 이하에서 합니다.

### 4.5 검증

코드를 그대로 두고 2026-08-20 16:06과 20:32에 4시간 간격으로 두 세트를 쟀습니다.

| 세트 | 시각 | 유효 n | 댓글 목록 p95 | 세트 내 변동계수 |
|---|---|---|---|---|
| Before-A | 16:06~16:32 | 2 | 2,201ms | 16.8% |
| Before-B | 20:32~21:10 | 4 | **2,169ms** | **3.2%** |

그 사이 유휴 CPU 벤치는 4,962ms에서 5,795ms로 18% 느려졌습니다. 같은 조건의 앱 p95는 2,201ms에서 2,169ms로 1.5% 변했습니다. 포화 이하에서는 환경이 이만큼 느려져도 앱이 따라가지 않습니다.

표본 11개로 다시 확인하니 실행 직전 CPU 벤치와 앱 p95의 상관계수는 −0.006이었습니다. 포화 시절에는 같은 조건이 하루 안에 28~48% 왕복했습니다. 반복하면 같은 값이 나오게 된 뒤에 개선으로 인정할 최소 크기를 다시 정했습니다.

위 수치의 출처는 저장소의 조사 기록 [perf-session-drift.md](https://github.com/JangHyeok2909/highteenday-backend/blob/main/performance/docs/investigations/perf-session-drift.md)입니다.

<!-- FULL -->
### 4.6 리틀의 법칙 검산
>>>>>>> Stashed changes

커넥션 사용량을 리틀의 법칙으로 확인했습니다. 처리량 17.76 RPS × 응답 0.104초 ≈ 1.85개입니다. 정상 구간에서는 커넥션 10개로 충분하다는 뜻이고, 대기 145건은 도착률이 용량을 넘긴 결과라는 해석과 맞습니다.
<!-- /FULL -->
<<<<<<< Updated upstream

**이 장의 요약**: 같은 200 VU 설정에서 p95가 실행마다 최대 48% 달랐습니다. 호스트 CPU의
성능 차이는 부하 테스트 결과를 설명하지 못했습니다. 포화된 고정 VU 실행의 p95는 처리율과
대기 상태를 반영했으며, 처리율이 달라진 원인은 찾지 못했습니다. 이후 실행마다 포화 여부를
판정하고, 포화 실행을 일반 성능 비교에서 제외했습니다.
=======
>>>>>>> Stashed changes

---

```html-raw
<div class="pagebreak"></div>
```

<<<<<<< Updated upstream
## 4. 회귀 판정기의 비교 기준 오선택과 유효성 검사

### 4.1 발생 경위

성능 회귀를 자동으로 잡는 판정기를 만들어 두었습니다. 이 판정기가 p95 가 101ms 에서
60,001ms 로 나빠졌다고(+59,000%) 보고했습니다.

실제 회귀는 없었습니다. 판정기가 부하 1/13, 데이터 1/100인 실행을 대조군(비교 기준이 되는
이전 실행)으로 골랐습니다.
조건이 다른 두 실행을 비교했으니 차이는 당연했습니다.

### 4.2 원인 · 계기 · 감지

회귀 판정은 서로 다른 두 질문에 답해야 합니다.

| | 질문 | 성격 |
|---|---|---|
| (a) | 시간 순서로 **바로 앞 실행**은 무엇인가 | 순서만 보는 질문 |
| (b) | 이 실행과 **같은 조건으로 돌린** 실행은 무엇인가 | **조건이 같은지 보는 질문** |

(a)만 구현돼 있었고, (b)는 같은 시나리오면 조건도 같을 것이라고 가정하고 있었습니다.
그 가정을 검사하는 코드는 없었습니다.

- **원인**: 대조군 선택이 시간 순서만 보고, 조건이 같은지는 확인하지 않음
- **계기**: 부하와 데이터 규모를 크게 바꾼 실행이 직전 실행으로 남음
- **감지**: 회귀 폭 +59,000% 라는 비현실적 값 발견

### 4.3 조치 (실행 조건 분류표)

**결정**: 실행 조건을 두 묶음으로 나눴습니다. 부하 크기나 데이터셋처럼 다르면 비교 자체가
성립하지 않는 조건과, 다르더라도 비교는 되고 신뢰도만 낮아지는 조건입니다.

첫 번째 묶음의 값만 모아 해시를 만들고, 그 해시가 같은 실행 중에서만 대조군을 고릅니다.

조건들은 하나의 컬렉션으로 관리하며,
조건이 하나 늘면 표에 한 줄을 더하는 것으로 대조군 선택과 리포트, 추세 그래프의 계열 분리가 전부 따라옵니다.

3장의 포화 판정도 같은 검사에 들어갑니다. 현재 실행과 대조군의 포화 상태가 다르면 증감률을
계산하지 않습니다. 포화 실행의 p95 는 처리량으로 정해지고 비포화 실행의 p95 는 처리 시간이라
둘의 증감률에는 의미가 없기 때문입니다.

<!-- FULL -->
### 4.4 설계 판단: 스크립트 지문을 해시에서 제외

부하 스크립트의 내용 해시도 조건에 넣을 수 있었지만 뺐습니다. 넣으면 주석 한 줄만 고쳐도
계열이 갈라져 추세 그래프가 상시로 리셋되기 때문입니다. 
비교를 무효로 만드는 변화와 그렇지 않은 변화를 구분하지 못하면, 규칙을 엄격하게 할수록 비교 가능한 실행이 줄어 쓸모가 없어집니다.

대신 스크립트 버전 설정하도록 하여 현 스크립트의 실행 이력과 변경 후의 이력을 비교하고 싶을때는 버전을 그대로,
스크립트의 변경이 커 이전 이력과 비교하면 안 될 경우엔 버전을 올리는 형식으로 사용하게 만들었습니다.

### 4.5 한계

조건 표의 버전을 해시에 포함해 두어 규칙이 바뀌면 추세 계열이 나뉘는 것은 알 수 있지만,
나뉜 뒤 과거 실행을 새 기준으로 옮기는 절차는 없습니다.
=======
## 5. 트러블슈팅 2 · 회귀 판정기의 잘못된 대조군 선택

### 5.1 증상

성능 회귀(코드 변경 뒤 성능이 나빠지는 것)를 자동으로 잡는 판정기를 만들어 두었습니다. 이 판정기가 p95가 101ms에서 60,001ms로 나빠졌다고, +59,000% 회귀라고 보고했습니다. 실제로는 회귀가 아니었습니다.

판정기가 부하 13배, 데이터 100배 조건의 실행을 대조군(비교 기준이 되는 실행)으로 골랐던 것입니다. 조건이 다른 두 실행을 비교했으니 차이는 당연했습니다. 60,001ms는 요청 타임아웃에 잘린 값이라 실제 지연도 아닙니다.

### 5.2 원인

회귀 판정은 두 가지 질문에 답해야 합니다. "이력상 직전 실행은 무엇인가"와 "이 실행과 비교해도 되는 실행은 무엇인가"입니다. 코드에는 앞의 질문만 구현되어 있었습니다.

뒤의 질문은 "같은 시나리오면 조건도 같겠지"라고 제 머릿속에서만 가정하고 있었습니다. 그 가정이 코드에 없었다는 것이 문제의 전부였습니다.

### 5.3 고친 것

실행 조건을 두 종류로 나눴습니다. 부하 크기나 데이터 규모처럼 비교 자체를 무효로 만드는 조건과, 신뢰도만 낮추는 조건입니다. 앞의 조건만으로 "같은 실험"을 식별하는 해시를 만들고, 대조군은 그 해시가 같은 실행 중에서만 고르게 했습니다.

조건 목록은 분기문 대신 선언적인 표로 뺐습니다. 조건이 하나 늘면 표에 한 줄을 더하는 것으로 대조군 선택과 리포트, 추세 그래프 분리가 함께 따라옵니다.

조건 표의 버전도 해시에 넣어, 규칙이 바뀌면 계열이 갈라지는 것을 알 수 있습니다. 다만 갈라진 뒤 과거 실행을 새 기준으로 옮기는 절차는 아직 없습니다. 사건 기록은 [perf-findings-tools.md](https://github.com/JangHyeok2909/highteenday-backend/blob/main/performance/docs/findings/perf-findings-tools.md)에 있습니다.

<!-- FULL -->
### 5.4 스크립트 지문을 해시에서 뺀 판단
>>>>>>> Stashed changes

부하 스크립트의 내용 해시도 조건에 넣을 수 있었지만 뺐습니다. 넣으면 주석 한 줄만 고쳐도 계열이 갈라져 추세 그래프가 자주 리셋됩니다. 비교를 무효로 만드는 변화와 그렇지 않은 변화를 구분해야 판정이 쓸모를 유지합니다.
<!-- /FULL -->
<<<<<<< Updated upstream
운이 작용한 부분: 보고된 값이 +59,000% 였기 때문에 발견했습니다. 같은 결함이 +40% 를
보고했다면 실제 회귀로 받아들이고 원인을 코드에서 찾았을 것입니다.

**이 장의 요약**: 잘못된 회귀 보고의 원인이 바로 앞 실행과 같은 조건의 실행을 구분하지
않은 데 있음을 찾았고, 실행 조건을 표 하나로 정리했고, 같은 조건의 실행만 비교하도록 바꿨습니다.
=======
>>>>>>> Stashed changes

---

```html-raw
<div class="pagebreak"></div>
```

<<<<<<< Updated upstream
## 5. 개선 판정 기준 정의 (변동계수와 최소 검출 가능 효과)
=======
## 6. 노이즈를 먼저 재서 정한 개선 판정 기준
>>>>>>> Stashed changes

"p95가 20% 나빠지면 회귀"라고 말하려면 전제가 필요합니다. 아무것도 바꾸지 않고 같은 조건을 반복했을 때의 편차가 20%보다 작아야 합니다. 그 편차를 모르면 20%가 나빠져도 노이즈인지 회귀인지 가릴 수 없습니다.

<<<<<<< Updated upstream
p95 가 20% 나빠지면 회귀라고 말하려면 전제가 필요합니다. 아무것도 바꾸지 않고 같은 조건을
반복했을 때의 자연 편차가 20%보다 작아야 합니다. 그 편차를 모르면 20% 는 근거 없는
숫자입니다.

### 5.2 조치

같은 조건을 N회 반복 실행해 변동계수(표준편차 / 평균)를 재고, 거기서 최소 검출 가능
효과(MDE)를 구했습니다. 자연 편차보다 커야 개선이라고 부를 수 있는 최소 폭이라는 뜻입니다.
그보다 작은 변화는 개선으로 세지 않습니다.

변동계수는 단위가 없는 비율이라 절대 지연이 달라진 환경끼리도 비교할 수 있습니다. 측정 환경 자체를
바꾼 전후를 비교할 수 있는 유일한 지표라 이것을 골랐습니다.
=======
그래서 같은 조건을 5회 반복 실행해 변동계수(표준편차 ÷ 평균)를 쟀습니다. 거기서 최소 검출 가능 효과(노이즈보다 크다고 말할 수 있는 최소 변화폭)를 구했습니다. 그보다 작은 변화는 개선으로 인정하지 않습니다.

변동계수는 단위가 없어서 절대 지연이 다른 환경끼리도 비교할 수 있습니다. 측정 환경 자체를 바꾼 전후를 비교할 수 있는 유일한 축이라 이 지표를 골랐습니다.
>>>>>>> Stashed changes

```html-raw
<div class="fig">
  <div class="flow">
    <div class="flow-step"><b>실행</b><span>같은 조건 5회</span></div>
    <div class="flow-arrow">›</div>
    <div class="flow-step"><b>포화 판정</b><span>지연으로 읽어도 되나<br>(4장)</span></div>
    <div class="flow-arrow">›</div>
    <div class="flow-step"><b>대조군 확인</b><span>비교해도 되는 실행인가<br>(5장)</span></div>
    <div class="flow-arrow">›</div>
    <div class="flow-step"><b>노이즈 대조</b><span>변동계수보다 큰가<br>(6장)</span></div>
    <div class="flow-arrow">›</div>
    <div class="flow-step"><b>판정</b><span>개선 / 회귀 /<br>판정 불가</span></div>
  </div>
<<<<<<< Updated upstream
  <div class="fig-cap">그림 6. 개선을 주장하기까지 통과해야 하는 세 조건. 하나라도 막히면 수치를 인용하지 않는다.</div>
</div>
```

### 5.3 무효 처리한 확정치와 재산정

처음 확정한 변동계수는 3.12% 였습니다. 그런데 이 값은 포화 상태의 고정 VU 부하에서 잰
것이었습니다(3장과 같은 원인). 그 상태에서는 p95 가 처리량에 따라 정해지므로, 세트 안
변동계수 3.12% 는 사실상 처리율의 편차(6.26%)를 재고 있던 셈입니다. 응답 시간 자체의 편차는
이 값으로 알 수 없었습니다. 그래서 확정치를 폐기하고 포화가 나지 않는 부하에서 다시 쟀습니다.

| | 이전(포화) | 이후(포화 이하) |
|---|---|---|
| 세트 안 p95 변동계수 | 3.12% | **9.6 ~ 15.8%** |
| 세트 안 p95 표준편차 | 369ms | **27 ~ 58ms** |
| 세트 간 p95 차이 | 45~48% (하루 안에 오르내림) | **1.5%** (4시간 간격, 댓글 목록 p95) |

세트 안 변동계수는 커졌지만 그것이 실제 편차입니다. 표준편차는 6~14배 줄었고, 세트 간 차이는
48% 에서 1.5% 로 줄어 세트 안 편차보다 작아졌습니다. 세트 간 차이가 세트 안 편차보다 작아야
세트 안 변동계수로 최소 검출 가능 효과를 정할 수 있습니다. 이제 그 조건을 만족합니다.

이 구분을 못 하면 측정 환경을 고쳤더니 변동계수가 3배가 됐다는 잘못된 결론에 도달합니다.

<!-- FULL -->
### 5.4 노이즈 하한 재산정 (경보 피로 방지)

회귀 판정에는 이 절대값보다 작은 변화는 회귀로 보지 않는다는 하한선이 있었습니다. 그런데 그
값이 실측 노이즈의 1/4~1/11 이라 아무것도 걸러내지 못했습니다. 노이즈에 불과한 변화가 평균 93ms,
+26.4% 로 리포트에 회귀처럼 표시되고 있었습니다.

반복 세트의 표준편차를 근거로 재산정했습니다(p95 기준 5ms → 115ms). 규칙은 맞았고 값만
오래된 경우입니다. 표본이 아직 적다는 것을 주석으로 남겨 재검토 대상으로 표시했습니다.
=======
  <div class="fig-cap">그림 6. 개선이라고 적기까지의 순서. 하나라도 통과하지 못하면 그 수치를 인용하지 않는다.</div>
</div>
```

### 6.1 확정했던 값을 무효 처리한 일

처음 확정한 변동계수는 2026-08-16의 5회 세트에서 나온 3.12%였습니다. 그런데 이 값이 포화 상태에서 잰 것임을 뒤늦게 알았습니다. 그래서 그 값을 무효로 하고 포화 이하에서 다시 쟀습니다.

3.12%는 한자리에서 몰아 잰 5회 안의 값입니다. 몇 시간 뒤에 같은 조건을 다시 재면 25~45% 차이가 났습니다. 포화에서는 노이즈의 크기 자체가 재현되지 않아서, 그 값으로 정한 기준이 다음 실행에서 유지되지 않았습니다.

| | 이전(포화) | 이후(포화 이하) |
|---|---|---|
| p95의 변동계수 | 3.12% | **9.6~15.8%** |
| p95의 절대 표준편차 | 369ms | **27~58ms** |

퍼센트는 나빠졌지만 실제 흔들림은 6~14배 줄었습니다. 분모인 평균 p95가 1만 ms대에서 200~300ms대로 내려갔기 때문입니다. 이 구분을 못 하면 "측정 환경을 고쳤더니 재현성이 3배 나빠졌다"는 반대 결론에 이릅니다.

다시 잰 값에서 나온 검출 한계는 약 16%입니다. 댓글 목록 API의 개선폭 40.1%는 이 한계를 넘습니다.

<!-- FULL -->
### 6.2 경보 하한선 재산정

회귀 판정에는 "이 절대값보다 작은 변화는 회귀로 보지 않는다"는 하한선이 있었습니다. 그런데 그 값이 실측 노이즈의 1/4~1/11이라 아무것도 걸러내지 못했습니다. 순수한 노이즈가 "평균 93ms ▲ +26.4%"처럼 굵은 퍼센트로 리포트에 실리고 있었습니다.
>>>>>>> Stashed changes

반복 세트의 표준편차를 근거로 재산정했습니다(p95 기준 5ms → 115ms). 장치는 맞았고 값만 낡은 경우였습니다. 표본이 아직 얇다는 것을 주석으로 남겨 재검토 대상으로 표시해 두었습니다.
<!-- /FULL -->
<<<<<<< Updated upstream
### 5.5 6장과의 관계

다음 장의 개선 수치는 전부 이 세 조건을 통과한 값입니다. 개선폭 40.1% 는 5회 세트의 검출
한계 약 16% 를 넘으므로 노이즈로 설명되지 않습니다.

**이 장의 요약**: 반복 실험의 자연 편차를 재어 개선을 주장할 수 있는 최소 폭을 정했고,
포화 상태에서 낸 첫 확정치를 폐기하고 다시 산출했습니다.
=======
>>>>>>> Stashed changes

---

```html-raw
<div class="pagebreak"></div>
```

<<<<<<< Updated upstream
## 6. 댓글 목록 API N+1 제거 (요청당 쿼리 1,507 → 3.9개)

### 6.1 문제 (코드에 보이지 않는 쿼리)

댓글 목록 API 한 번에 쿼리가 1,507개 나갔습니다. 이 엔드포인트의 p95 는 226.7ms 로 다른 읽기
API 보다 크게 느렸고, 쿼리 수가 댓글 수와 작성자 수에 비례해 데이터가 쌓일수록 나빠지는
구조였습니다. 그런데 서비스에도 컨트롤러에도 쿼리처럼 보이는 코드가 없었습니다.
=======
## 7. 댓글 목록 API N+1 제거, 요청당 쿼리 1,507개 → 4개

### 7.1 코드에 보이지 않던 쿼리 1,507개

댓글 목록 API 한 번에 쿼리가 1,507개 나갔습니다. 그런데 서비스에도 컨트롤러에도 쿼리처럼 보이는 코드가 없었습니다. 쿼리는 응답 DTO를 만드는 순간 나가고 있었습니다.
>>>>>>> Stashed changes

<!-- FULL -->
```java
// dtos/CommentDto.java · fromEntity
.userId(comment.getUser().getId())            // 지연 로딩 프록시 초기화 → SELECT 1회
.author(comment.getUser().getNicknameValue()) // 이미 초기화됨 → 추가 쿼리 없음
```

<<<<<<< Updated upstream
쿼리는 DTO 변환 시점에 실행되고 있었습니다. 두 종류였습니다.

- **내 반응 확인**: 댓글 한 건마다 좋아요·싫어요를 따로 조회 (댓글 수 곱하기 2)
- **작성자 조회**: 지연 로딩 프록시가 하나씩 초기화됨 (서로 다른 작성자 수만큼)

작성자 조회는 댓글 수에 비례하지 않고 작성자 수에 비례합니다. 같은 사람이 댓글을 여러 개
달았으면 두 번째부터는 영속성 컨텍스트의 1차 캐시에서 나오기 때문입니다. 이 구분은 코드로
알 수 있지만, 요청당 1,507개 중 각각 몇 개인지는 측정해야 압니다.

<!-- /FULL -->
그래서 먼저 엔드포인트별 요청당 쿼리 수를 재는 계측을 붙였습니다.

### 6.2 두 단계로 나눈 개선
=======
N+1(목록 1건을 읽은 뒤 항목마다 쿼리가 하나씩 더 나가는 문제)이 두 종류였습니다. 댓글 한 건마다 내 좋아요/싫어요를 따로 조회하는 것(댓글 수 × 2)과, 작성자 지연 로딩이 하나씩 풀리는 것입니다. 작성자 조회는 댓글 수 대신 서로 다른 작성자 수에 비례합니다.

같은 사람이 댓글을 여러 개 달았으면 두 번째부터는 영속성 컨텍스트의 1차 캐시에서 나오기 때문입니다. 코드를 읽으면 여기까지는 짐작할 수 있지만, 그것이 1,507개 중 몇 개인지는 세어 봐야 압니다. 그래서 개선보다 먼저 엔드포인트별 요청당 쿼리 수를 재는 계측을 붙였습니다.

### 7.2 두 번에 나눠 고친 과정
>>>>>>> Stashed changes

```html-raw
<div class="fig">
  <div class="bar-row"><span class="bar-label">최초</span><span class="bar-track"><span class="bar-fill" style="width:100%"></span></span><span class="bar-val">1,507</span></div>
  <div class="bar-row"><span class="bar-label">반응 일괄 조회 후</span><span class="bar-track"><span class="bar-fill" style="width:7.4%"></span></span><span class="bar-val">112</span></div>
<<<<<<< Updated upstream
  <div class="bar-row"><span class="bar-label">작성자 페치 조인 후</span><span class="bar-track"><span class="bar-fill after" style="width:0.26%"></span></span><span class="bar-val">3.9</span></div>
  <div class="fig-cap">그림 7. 댓글 목록 API 의 요청당 쿼리 수. 마지막 막대는 전체의 0.26% 라 선으로만 보인다.</div>
=======
  <div class="bar-row"><span class="bar-label">작성자 fetch join 후</span><span class="bar-track"><span class="bar-fill after" style="width:0.26%"></span></span><span class="bar-val">4 (3.9)</span></div>
  <div class="fig-cap">그림 7. 댓글 목록 API의 요청당 쿼리 수. 마지막 막대는 전체의 0.26%라 선으로만 보인다.</div>
>>>>>>> Stashed changes
</div>
```

| 단계 | 무엇을 바꿨나 | 요청당 쿼리 | p95 |
|---|---|---|---|
<<<<<<< Updated upstream
| 최초 | 변경 없음 | 1,507 | 226.7ms |
| 1차 | 반응 확인을 댓글별 조회에서 **일괄 조회**로 | **112** (−92.6%) | 57.2ms (−74.8%) |
| 2차 | 작성자를 목록 쿼리에서 **페치 조인**(fetch join)으로 함께 읽기 | **3.9** (−96.5%) | **34.3ms** (−40.1%) |

두 단계로 나눈 이유는 두 가지입니다. 한 번에 변수 하나만 바꾸는 원칙, 그리고 2차 대상을
재계측으로 정하기 위해서입니다. 1차 적용 후 다시 재니 남은 112개 중 약 108개가 작성자
조회였고, 이 값으로 2차 대상을 정했습니다. 코드만 봐서는 작성자를 작성자 수만큼 읽는다는
것은 알 수 있어도, 그것이 남은 비용의 96% 인지는 알 수 없습니다.

1차 문서에 없앨 쿼리 수를 약 108개로 예측해 적어 두었고, 2차 실측은 108.3개였습니다.
예측이 틀린 항목은 6.7 에 있습니다.

<!-- FULL -->
=======
| 최초 | | 1,507 | 226.7ms |
| 1차 | 내 반응 확인을 댓글별 조회에서 일괄 조회로 | **112** (−92.6%) | 57.2ms (−74.8%) |
| 2차 | 작성자를 목록 쿼리에서 fetch join으로 함께 읽기 | **4** (5회 평균 3.9, −96.5%) | **34.3ms** (−40.1%) |

두 번에 나눈 것은 "한 번에 변수 하나"를 지키려는 이유도 있었지만, 실제로 2차의 대상을 정한 것은 재계측이었습니다. 1차를 적용하고 다시 재니 남은 112개 중 약 108개가 작성자 조회였습니다. 코드만 봐서는 "작성자를 U번 읽는다"까지는 알 수 있어도 그것이 전체 비용의 96%인지는 알 수 없습니다.

1차 문서에 "없앨 쿼리 약 108개"라고 예측을 적어 두었는데, 2차 실측이 108.3개였습니다. 계측이 코드에 대한 설명을 검증한 자리입니다. 예측이 빗나간 자리도 있었고, 아래 7.6절에 같이 적었습니다.

1차는 2026년 9월 1일, 2차는 9월 4일에 측정했습니다. 기록은 [OPT-001](https://github.com/JangHyeok2909/highteenday-backend/blob/main/performance/optimizations/OPT-001-comment-reaction-batch.md)과 [OPT-002](https://github.com/JangHyeok2909/highteenday-backend/blob/main/performance/optimizations/OPT-002-comment-author-fetch-join.md) 문서에 있습니다. 2차 측정 실행은 `normal-day-2026-09-04T04-44-49` 외 4건입니다.

>>>>>>> Stashed changes
2차 변경의 실제 크기는 리포지토리 쿼리 한 줄입니다.

```java
// 변경 전
@Query("select c from Comment c where c.isValid=true and c.post=:post")
// 변경 후
@Query("select c from Comment c join fetch c.user where c.isValid=true and c.post=:post")
```

<<<<<<< Updated upstream
`@ManyToOne` 페치 조인이라 결과 행 수가 변하지 않습니다. 댓글 한 건에 작성자는 한 명뿐이라
조인으로 행이 늘지 않고, 컬렉션 페치 조인에서 필요한 중복 제거도, 페이징을 메모리에서
한다는 경고도 발생하지 않습니다. `left join` 대신 내부 조인을 쓴 것은 작성자 컬럼이
`nullable = false` 라 외부 조인이 걸러낼 행이 없기 때문입니다.

<!-- /FULL -->
### 6.3 결과 (쿼리 수가 데이터 크기와 무관)
=======
`@ManyToOne` 관계의 fetch join(연관 엔티티를 같은 쿼리로 함께 읽는 JPQL 조인)이라 결과 행 수가 변하지 않습니다. 댓글 한 건에 작성자는 한 명이라 조인이 행을 부풀리지 않고, 컬렉션 fetch join의 중복 제거나 메모리 페이징 경고도 없습니다. 작성자 컬럼이 `nullable = false`라 `left join` 대신 내부 조인을 썼습니다.

### 7.3 데이터 크기와 무관해진 쿼리 4개
>>>>>>> Stashed changes

<!-- FULL -->
```
요청당 쿼리 수 (회차별)
Before   120.5  109.8  114.4  109.5  106.9    ← 표본 게시글의 작성자 수에 따라 변동
After      3.9    3.9    3.9    3.9    3.9    ← 데이터와 무관한 상수
```

<<<<<<< Updated upstream
<!-- /FULL -->
| 게시글 | 댓글 수 | 서로 다른 작성자 | 개선 전 | **개선 후** |
=======
| 게시글 | 댓글 수 | 서로 다른 작성자 | 개선 전 | 개선 후 |
>>>>>>> Stashed changes
|---|---:|---:|---:|---:|
| A | 6 | 5 | 9 | **4** |
| B | 492 | 130 | 134 | **4** |
| C | 4,040 | 450 | 454 | **4** |

<<<<<<< Updated upstream
쿼리 수가 데이터 크기와 무관해진 것이 이 최적화의 실제 결과입니다. 남은 4개는 인증 1,
게시글 1, 댓글 목록 1, 반응 일괄 1 이고, 여기에는 댓글 수에도 작성자 수에도 비례하는 항이
없습니다.

### 6.4 검토한 대안과 버린 이유

나중에 같은 코드를 볼 때 선택 이유를 확인하기 위한 표입니다.
=======
쿼리 수가 데이터 크기와 무관해진 것이 이 최적화의 실제 결과입니다. 남은 4개는 인증 1, 게시글 1, 댓글 목록 1, 반응 일괄 조회 1로, 댓글 수에도 작성자 수에도 비례하는 항이 없습니다.

### 7.4 검토하고 버린 대안
>>>>>>> Stashed changes

| 대안 | 예상 효과 (요청당 쿼리) | 버린 이유와 부정적 결과 |
|---|---|---|
<<<<<<< Updated upstream
| `@BatchSize(100)` | 1 + ⌈U/100⌉ | **1 로 내려가지 않습니다.** 작성자 450명이면 5개가 남습니다. 게다가 엔티티에 붙는 설정이라 그 연관을 쓰는 **모든 경로**의 동작이 함께 바뀝니다 |
| 전역 배치 페치 크기 | 1 + ⌈U/n⌉ | 같은 문제에 영향 범위만 넓습니다. 애플리케이션 전체의 지연 로딩 방식이 바뀌어 **"한 번에 변수 하나" 원칙**을 지킬 수 없습니다 |
| `@EntityGraph` | 1 | 효과는 같습니다. 다만 이 메서드는 이미 JPQL 을 직접 쓰고 있어, 필터 조건(JPQL)과 함께 읽을 연관(애너테이션)이 두 곳에 나뉩니다 |
| DTO 프로젝션 | 1 | **가장 좋은 안입니다.** 필요한 컬럼만 읽어 전송량까지 줄어듭니다. 그런데 호출부 셋이 엔티티를 받아야 동작해서 같이 고쳐야 하고, 그러면 **변수가 둘 이상이 되어 측정이 무의미해집니다.** 별도 과제로 남겼습니다 |
| 작성자만 2차 일괄 조회 | 2 | 사용자 행이 중복 없이 전송됩니다. 왕복이 하나 더 필요한 대가로 얻는 것이 전송량뿐이라 지금은 버렸습니다. 6.6 의 조건이 바뀌면 이 안을 채택합니다 |

### 6.5 검증 (세 가지)

**① 실패해야 하는 테스트**: 여기서 지켜야 할 조건은 결과 값이 맞는 것에 더해 작성자를 함께
읽는다는 것입니다. 그래서 Hibernate 통계로 실행된 문장 수 자체를 테스트로 고정했고, 페치
조인을 다시 빼면 문장 수가 1 에서 4 로 늘며 테스트가 실패하는 것까지 확인했습니다.

> 이 검증에서 가장 중요한 코드 한 줄은 영속성 컨텍스트를 비우는 `em.clear()` 입니다.
> 비우지 않으면 준비 단계에서 저장한 사용자들이 1차 캐시에 남아 페치 조인이 없어도 추가
> 쿼리가 나가지 않습니다. 그 상태의 테스트는 통과하지만 아무것도 검증하지 못합니다.

<!-- FULL -->
**② 부하 없는 단일 요청 실측**: 부하가 없어 측정 편차가 0이라 통계가 필요 없습니다. 위 표의 세 게시글에서
모델과 실측의 오차가 0 이었습니다.

**③ 응답 정합성 전량 대조**: 쿼리 모양이 바뀌었으므로 응답이 같은 값을 내는지 DB 와 직접
맞췄습니다. 댓글 4,046건짜리 게시글에서
=======
| `@BatchSize(100)` | 1 + ⌈U/100⌉ | 1로 내려가지 않습니다(작성자 450명이면 5개). 엔티티에 붙는 설정이라 그 연관을 쓰는 모든 경로가 함께 바뀝니다 |
| 전역 배치 페치 크기 | 1 + ⌈U/n⌉ | 같은 문제에 영향 범위만 넓습니다. 애플리케이션 전체의 지연 로딩 방식이 바뀌어 "한 번에 변수 하나"를 지킬 수 없습니다 |
| `@EntityGraph` | 1 | 효과는 같지만, 이 메서드는 이미 JPQL을 직접 쓰고 있어 조건(JPQL)과 함께 읽을 대상(애너테이션)이 두 곳으로 갈립니다 |
| DTO 프로젝션 | 1 | 가장 좋은 안입니다. 필요한 컬럼만 읽어 전송량까지 줄어듭니다. 그런데 호출부 셋을 같이 고쳐야 해서 변수가 둘 이상이 되고 측정이 무의미해집니다. 별도 과제로 남겼습니다 |
| 작성자만 2차 일괄 조회 | 2 | 사용자 행이 중복 없이 전송됩니다. 왕복이 하나 더 필요한 대가로 얻는 것이 전송량뿐이라 지금은 버렸습니다. 중복 읽기 비용이 이득을 넘으면 이 안으로 돌아옵니다 |

### 7.5 검증 세 가지

**① fetch join을 빼면 실패하는 테스트.** 지키려는 계약이 "작성자를 함께 읽는다"라서, Hibernate 통계로 실행된 문장 수를 테스트로 고정했습니다. fetch join을 빼면 문장 수가 1에서 4로 늘며 실패하는 것까지 확인했습니다.

여기서 중요한 한 줄은 영속성 컨텍스트를 비우는 `em.clear()`입니다. 비우지 않으면 준비 단계의 사용자들이 1차 캐시에 남아, fetch join이 없어도 추가 쿼리가 나가지 않습니다. 그 상태의 테스트는 통과하지만 아무것도 검증하지 못합니다.

**② 부하 없는 단일 요청 실측.** 잡음이 0이라 통계가 필요 없습니다. 위 표의 세 게시글에서 모델 `3 + U + 1`(U는 작성자 수)과 실측이 정확히 일치했습니다.

**③ 응답 정합성 전량 대조.** 쿼리 모양이 바뀌었으므로 응답이 같은 값을 내는지 DB와 직접 맞췄습니다. 댓글 4,046건짜리 게시글에서 확인한 결과입니다.
>>>>>>> Stashed changes

```
응답 댓글 수 4,046건 = DB 4,046건
실명 댓글 1,586건의 (댓글 id, 작성자 id, 닉네임)  →  API에만 있는 조합 0건, DB에만 있는 조합 0건
익명 댓글 2,460건  →  작성자 식별자 노출 0건, 프로필 이미지 노출 0건
```

<<<<<<< Updated upstream
익명성 규칙을 최적화 검증의 기준으로 쓴 것이 이 대조의 핵심입니다. 쿼리를 바꿔도 익명성이
유지되는지는 성능과 별개로 반드시 확인해야 합니다.

<!-- /FULL -->
<!-- FULL -->
### 6.6 채택안의 부작용

페치 조인은 댓글 행마다 작성자 행을 붙여 읽습니다. 댓글 4,040개에 작성자 450명이면 같은
사용자 행을 평균 9회 중복해서 읽습니다. 착수 전에 이 중복 읽기가 이득을 상쇄할 수 있다고 예상했고,
측정으로 이득과 추가 비용을 둘 다 확인했습니다.
=======
쿼리를 바꿔도 익명성이 유지되는지는 성능과 별개로 확인해야 해서, 익명성 원칙을 그대로 검증 기준으로 썼습니다.

### 7.6 부작용과 빗나간 예측

fetch join은 댓글 행마다 작성자 행을 붙여 읽습니다. 댓글 4,040개에 작성자 450명이면 같은 사용자 행을 평균 9회 중복해 읽습니다. 착수 전에 이것이 이득을 상쇄할 수 있다고 봤고, 측정은 양쪽을 다 보여 줬습니다.
>>>>>>> Stashed changes

| 지표 | 개선 전 | 개선 후 | 변화 |
|---|---|---|---|
| MySQL 초당 읽은 행 | 5,935 | 7,294 | +22.9% (중복 읽기의 직접 증거) |
| MySQL 초당 쿼리 | 544.3 | 274.8 | −49.5% |
| 요청당 DB CPU 시간 | 8.43ms | 6.35ms | **−24.6%** |

<<<<<<< Updated upstream
행 읽기는 23% 늘었는데 DB CPU 시간은 25% 줄었습니다. 왕복 108회를 없앤 이득이 추가 행 읽기
비용보다 컸기 때문입니다. 행 읽기가 싼 이유는 버퍼풀 적중률이 100% 라 중복 읽기가 디스크
접근을 만들지 않는 데 있습니다. 데이터가 버퍼풀보다 커지면 이 균형은 달라질 수 있고, 그때는
6.4 표의 마지막 대안으로 바꿉니다.

쿼리당 DB 시간은 0.198ms 에서 1.272ms 로 6.4배가 됐습니다. 없앤 108개가 가장 싼 쿼리(기본 키
1행 조회)였기 때문입니다. 싼 쿼리가 분모에서 빠지면 남은 쿼리의 평균 비용은 올라갑니다.
그래서 쿼리당 비용은 이런 최적화의 판정 지표로 쓸 수 없습니다. 판정 지표는 요청당 총 DB
시간이고, 이 값은 22.22ms → 4.98ms 로 줄었습니다.

<!-- /FULL -->
### 6.7 예측과 실측의 차이

착수 전에 계산한 개선 상한과 실측을 대조했습니다.
=======
행 읽기는 23% 늘었는데 DB CPU 시간은 25% 줄었습니다. 왕복 108회를 없앤 이득이 추가 행 읽기 비용보다 컸기 때문입니다. 버퍼풀 적중률이 100%라 중복 읽기가 디스크 접근을 만들지 않은 덕도 있습니다.

데이터가 버퍼풀보다 커지면 이 균형은 달라질 수 있습니다. 그때는 작성자만 2차 일괄 조회하는 안으로 돌아갑니다.

쿼리당 DB 시간은 0.198ms에서 1.272ms로 6.4배가 됐습니다. 없앤 108개가 가장 싼 쿼리(기본 키 1행 조회)였기 때문입니다. 싼 쿼리가 분모에서 빠지면 남은 쿼리의 평균 단가는 올라갑니다.

그래서 쿼리당 비용으로는 이런 최적화의 성패를 판정할 수 없습니다. 판정에 쓸 값은 요청당 총량이고, 그것은 22.22ms에서 4.98ms로 줄었습니다.
>>>>>>> Stashed changes

착수 전에 적어 둔 예측과도 대조했습니다.

<<<<<<< Updated upstream
쿼리 수와 DB 시간 예측은 맞았고 종단 p95 개선폭만 틀렸습니다. 상한을 평균 절감치로 계산했기
때문입니다. p95 를 결정하는 것은 댓글이 많은 게시글의 요청이고, 그런 요청에서 없앤
쿼리는 평균 108개를 넘어 최대 450개입니다.

> 평균으로 계산한 상한은 평균 요청의 상한일 뿐입니다. 비용이 데이터 크기에 비례하는 문제는 가장 느린 쪽
> 요청에 몰려 있어서, 평균으로 환산한 예측이 구조적으로 개선폭을 과소평가합니다. 다음에 착수 여부를
> 판단할 때는 가장 느린 쪽 요청의 절감치를 따로 계산해야 합니다.

<!-- FULL -->
### 6.8 함께 확인된 것 (느린 쿼리 건수)

남아 있던 N+1 을 모두 제거했는데도 느린 쿼리 건수는 그대로였습니다(+1.1%). 느린 쿼리의
원인이 대부분 검색의 `LIKE` 라는 이전 판단이 다시 확인됐습니다. 개선이 다른 곳에 영향을
주지 않았다는 근거이기도 합니다.

### 6.9 게시글 검색 쿼리 진단 (미조치)

이 절은 진단만 있고 수정은 없습니다. 6.8 의 느린 쿼리 집계에서 대부분이 게시글 검색이었습니다.

두 병목은 성격이 정반대입니다.

| | 댓글 목록 (6장) | **게시글 검색** |
|---|---|---|
| 문제의 모양 | **싼 쿼리를 여러 번** | **비싼 쿼리 한 번** |
| 요청당 쿼리 수 | 112개 → 3.9개 | **6.2개** (원래 적다) |
| 쿼리당 DB 시간 | 1.27ms | **13.6ms** |
| 요청당 DB 시간 | 22.22ms | **81.37ms** |
| DB 시간 비중 | 61.5% | **95%** (애플리케이션에서 하는 일이 거의 없다는 뜻) |
| 고치는 방법 | 왕복을 줄인다 | 쿼리 자체를 바꿔야 한다 |

검색은 5회차 전부 최솟값이 65.7~78.9ms 로, 단 한 건도 30ms 아래로 내려간 적이 없습니다.
전체 요청의 1.06% 인데 응답 시간 총합의 6.1% 를 씁니다.

원인은 `LIKE '%키워드%'` 입니다. 앞이 와일드카드라 B-tree 인덱스를 탈 수 없고,
옵티마이저는 전체 스캔을 선택합니다. 데이터가 커질수록 선형으로 나빠집니다.

고치지 않았고 대안도 확정하지 않았습니다. 후보 비교까지만 했습니다 (2026-09 기준).
=======
| 항목 | 예측 | 실측 |
|---|---|---|
| 없앨 쿼리 수 | 약 108 | 108.3 |
| 없앨 DB 시간 | 약 21ms | 17.2ms |
| p95 개선폭 | 20% 안팎이 상한 | **40.1%** |

p95 개선폭만 상한을 2배 넘긴 이유는 상한을 평균 절감치로 계산했기 때문입니다. p95를 만드는 것은 댓글이 많은 게시글의 요청입니다. 그런 요청에서 없앤 쿼리는 최대 450개로, 평균 108개보다 훨씬 많았습니다.

비용이 데이터 크기에 비례하는 문제는 꼬리 요청에 몰려 있어서, 평균으로 환산한 예측이 개선폭을 과소평가합니다. 다음에 착수 여부를 판단할 때는 꼬리 요청의 절감치를 따로 계산합니다.

<!-- FULL -->
### 7.7 부수적으로 확인된 것

남아 있던 N+1을 마저 걷어냈는데도 느린 쿼리 건수는 +1.1%로 그대로였습니다. 느린 쿼리의 원인은 대부분 검색의 `LIKE`라는 앞선 판단이 두 번째로 확인된 것입니다. 개선이 예상 밖의 것을 건드리지 않았다는 근거이기도 합니다.
<!-- /FULL -->

### 7.8 같은 계측이 가리킨 다음 병목: 게시글 검색

느린 쿼리가 N+1과 무관하다는 결과는 다음에 볼 곳을 알려줬습니다. 게시글 검색입니다. 두 병목은 성격이 정반대입니다.

| | 댓글 목록 | 게시글 검색 |
|---|---|---|
| 문제의 모양 | 싼 쿼리를 여러 번 | 비싼 쿼리 한 번 |
| 요청당 쿼리 수 | 112개 → 4개 | 6.2개 (원래 적다) |
| 쿼리당 DB 시간 | 1.27ms | 13.6ms |
| 요청당 DB 시간 | 22.22ms | 81.37ms |
| DB 시간 비중 | 61.5% | 95% (앱에서 하는 일이 없다는 뜻) |
| 고치는 방법 | 왕복을 줄인다 | 쿼리 자체를 바꿔야 한다 |

검색은 5회차 전부 최솟값이 65.7~78.9ms로, 단 한 건도 30ms 아래로 내려간 적이 없습니다. 전체 요청의 1.06%인데 응답 시간 총합의 6.1%를 씁니다.

원인은 `LIKE '%키워드%'`입니다. 앞이 와일드카드라 B-tree 인덱스를 탈 수 없고, 옵티마이저에게 남는 선택지는 전체 스캔뿐입니다. 데이터가 커질수록 선형으로 나빠집니다.

<!-- FULL -->
아직 고치지 않았고 고르지도 않았습니다. 후보를 비교만 해 두었습니다.
>>>>>>> Stashed changes

| 후보 | 예상 효과 | 버리는 것과 부정적 결과 |
|---|---|---|
<<<<<<< Updated upstream
| **FULLTEXT 와 ngram 파서** | 전체 스캔 제거. 한국어는 n-gram 으로 쪼개야 하므로 ngram 파서가 필요합니다 | 검색 결과의 순서와 매칭 규칙이 달라집니다. 성능 변경을 넘어 기능 변경이라 별도 검증이 필요합니다 |
| 접두사 검색(`LIKE '키워드%'`) | 일반 인덱스 사용, 변경이 가장 작음 | 기능이 줄어듭니다. '시험' 으로 '기말시험' 을 못 찾습니다 |
| 검색 엔진 분리 | 가장 빠르고 랭킹·오타 보정까지 가능 | 운영 구성요소가 늘고 색인 동기화 문제가 생깁니다. 현재 규모에 맞지 않습니다 |
| 결과 캐싱 | 반복 키워드에 효과 | 검색어가 롱테일이면 적중률이 낮습니다. 근본 원인을 두고 증상만 가립니다 |

네 후보 중 전체 스캔을 없애면서 부분 일치 검색을 유지하는 것은 FULLTEXT 와 ngram 조합뿐입니다.
다만 검색 결과의 순서와 매칭 규칙이 바뀌므로 성능 변경이 아닌 기능 변경으로 검증해야 합니다.

### 6.10 쓰기 경로의 비-DB 시간

이 절도 진단만 있고 수정은 없습니다. 같은 계측에서 세 번째 문제를 확인했습니다. 쓰기
엔드포인트의 응답 시간 대부분이 DB 밖에서 나옵니다.
=======
| FULLTEXT + ngram 파서 | 전체 스캔 제거. 한국어는 형태소 대신 n-gram으로 쪼개므로 ngram이 필요 | 검색 결과의 순서와 매칭 규칙이 달라진다. 성능을 넘어 기능이 바뀌는 부분이라 별도 검증이 필요 |
| 접두사 검색(`LIKE '키워드%'`) | 일반 인덱스를 탄다. 변경이 가장 작다 | 기능 축소. "시험"으로 "기말시험"을 못 찾는다 |
| 검색 엔진 분리 | 가장 빠르고 랭킹·오타 보정까지 | 운영 구성요소가 늘고 색인 동기화 문제가 생긴다. 현재 규모에 맞지 않는다 |
| 결과 캐싱 | 반복 키워드에 효과 | 검색어가 롱테일이면 적중률이 낮다. 근본 원인을 두고 증상만 가린다 |

1순위는 FULLTEXT + ngram입니다. 검색 결과의 순서와 매칭 규칙이 달라지는 기능 변경이라 착수 전에 확인할 것이 남아 있습니다.
<!-- /FULL -->

### 7.9 응답 시간이 DB 시간으로 설명되지 않는 쓰기 경로

같은 계측이 세 번째 것을 드러냈습니다. 쓰기 엔드포인트의 응답 시간 대부분이 DB 밖에서 나옵니다.
>>>>>>> Stashed changes

| 엔드포인트 | 요청당 DB 시간 | 응답 시간 | 비-DB 시간 | 비중 |
|---|---:|---:|---:|---:|
| 댓글 작성 | 3.55ms | 41.66ms | **38.11ms** | **91%** |
| 게시글 작성 | 2.29ms | 23.89ms | 21.59ms | 90% |
| 반응 등록 | 5.81ms | 28.17ms | 22.36ms | 79% |
<<<<<<< Updated upstream
| *(대조) 읽기 엔드포인트* | 해당 없음 | 해당 없음 | *3~5ms* | 해당 없음 |

읽기는 비-DB 시간이 3~5ms 인데 쓰기는 21~38ms 입니다.

원인 후보가 둘이고, 각각이 차지하는 시간은 재지 않았습니다 (2026-09 기준).

**후보 A**: 응답에 필요 없는 후처리를 요청 스레드가 기다립니다. 댓글 생성 이벤트에 리스너가
둘 붙어 있는데(알림 생성, 인기글 점수 갱신) 둘 다 동기로 실행됩니다.
`@TransactionalEventListener` 는 동기가 기본이고, `AFTER_COMMIT` 은 커밋 뒤라는 뜻일 뿐
다른 스레드에서라는 뜻은 아닙니다. 클라이언트는 응답에 포함되지 않는 알림 저장과 점수
갱신이 끝날 때까지 기다립니다.

**후보 B**: 커밋 fsync 가 비-DB 시간으로 집계됩니다. `innodb_flush_log_at_trx_commit=1` 과
`sync_binlog=1` 이라 커밋 한 번에 fsync 두 번입니다. 그런데 댓글 생성은 커밋을 두 번
합니다. 본 트랜잭션 하나, 그리고 알림 저장이 `REQUIRES_NEW` 라 별도 트랜잭션으로 한 번 더.
요청 하나에 fsync 4회입니다.

두 원인이 각각 차지하는 시간을 재지 않고 고치면 어느 쪽이 효과였는지 알 수 없습니다. 그래서
고치지 않았습니다. 6.2 에서 지킨 원칙(한 번에 변수 하나)이 여기에도 적용됩니다.

=======
| (대조) 읽기 엔드포인트 | | | 3~5ms | |

읽기는 비-DB 시간이 3~5ms인데 쓰기만 한 자릿수가 다릅니다.

<!-- FULL -->
원인 후보가 둘이고, 각각의 몫은 아직 재지 않았습니다.

후보 A. 응답에 필요 없는 후처리를 요청 스레드가 기다립니다. 댓글 생성 이벤트에 리스너가 둘 붙어 있는데(알림 생성, 인기글 점수 갱신) 둘 다 비동기가 아닙니다. `@TransactionalEventListener`는 동기가 기본입니다. `AFTER_COMMIT`은 "커밋 뒤에"를 뜻할 뿐 "다른 스레드에서"를 뜻하지 않습니다.

후보 B. 커밋 fsync가 비-DB 시간에 숨습니다. `innodb_flush_log_at_trx_commit=1`과 `sync_binlog=1`이라 커밋 한 번에 fsync 두 번입니다. 댓글 생성은 알림 저장이 `REQUIRES_NEW`라 커밋을 두 번 하므로, 요청 하나에 fsync 4회입니다.

둘을 가르지 않은 채로 고치면 무엇이 효과였는지 알 수 없습니다. 그래서 아직 착수하지 않았습니다.
>>>>>>> Stashed changes
<!-- /FULL -->
**이 장의 요약**: 요청당 쿼리 수를 계측해 원인 두 곳을 특정했고, 두 단계로 나눠 고치며
단계마다 다시 쟀고, 검토한 대안 다섯과 버린 이유를 남겼습니다.

---

```html-raw
<div class="pagebreak"></div>
```

<<<<<<< Updated upstream
## 7. 전역 p99 30ms 목표 검토 (미결정)

3~5장이 개선을 주장할 수 있는 조건이었고, 6장이 그 조건을 만족하는 개선이었습니다. 이 장은
다음 목표를 어디에 둘지 계산해 본 기록입니다. 목표를 정하지는 않았습니다.

### 7.1 질문

OPT-002 로 전체 p95 가 34.3ms, p99 가 80.9ms 가 된 시점에 다음 질문을 세웠습니다. p99 를 30ms 안에
넣으려면 무엇을 더 해야 하는가.

### 7.2 전역 p99 30ms 의 하한 (BCrypt 해싱)

<!-- FULL -->
계산으로 먼저 확인했습니다.

```
측정 구간 전체 요청   34,471건 (After 5회 합계)
30ms 초과            4,053건 = 11.76%
목표                   345건 이하 = 1.00%
```

로그인 API 가 전역 p99 의 하한을 결정합니다.

```
login 최솟값   71.4  70.6  74.8  73.2  73.7 ms   (5회차 전부)
login 건수     585건 = 전체의 1.70%
```

<!-- /FULL -->
가장 빠른 로그인조차 목표의 2.4배이고, 로그인이 전체 요청의 1.70% 입니다. 목표 허용치는
1.00% 입니다. 1.70% 가 1.00% 보다 크므로 다른 모든 요청이 0ms 가 되어도 전역 p99 는 로그인
분포 안에 떨어집니다. 전역 p99 의 하한이 약 71ms 라는 뜻입니다.

원인은 쿼리 쪽에 있지 않습니다. 비밀번호 해싱입니다. BCrypt strength 10 에서 70~90ms 는
설계대로 나온 값입니다. 무차별 대입을 늦추려고 일부러 느린 알고리즘을 씁니다.

> strength 를 낮추면 목표에 가까워집니다. 그러나 그것은 비밀번호 해싱 강도를 낮추는 보안
> 결정이고, 지연 목표를 맞추려고 할 일이 아닙니다.

### 7.3 30ms 초과 요청의 구성

전역 목표가 산술적으로 불가능하다는 것을 확인한 뒤, 30ms 를 넘는 요청이 무엇으로 구성돼
있는지를 세어 두었습니다.

| 요청 | 30ms 초과 지분 | 진단 |
|---|---:|---|
| **댓글 목록** | **41.8%** | 쿼리는 상수 4개인데 **응답 크기가 댓글 수에 비례**. 4,046건 글의 응답이 1.6MB |
| 로그인 | 14.4% | BCrypt 해싱 (7.2) |
| 검색 | 9.0% | 6.9 |
| 댓글 작성 | 7.6% | 6.10 |
| 그 외 | 27.2% | 일부 미진단 |

가장 큰 항목은 여전히 댓글 목록이고, 성격이 바뀌었습니다. 쿼리 수를 1,507 → 3.9 로 줄여
이 엔드포인트의 DB 비용은 정리됐고, 이제 댓글을 DTO 로 만들고 익명화 루프를 돌고 JSON 으로 직렬화하는
애플리케이션 비용이 남았습니다. 중앙값은 7.1ms 로 이미 빠르고 댓글이 많은 글만 느립니다. 페이징이
없을 때 나오는 전형적인 형태입니다.

댓글 목록 페이징은 쿼리 튜닝을 넘어 도메인 설계 변경입니다. 익명 번호(익명3)의 숫자가 게시글
전체 댓글의 등장 순서라, 페이지로 자르면 2페이지의 익명3 이 1페이지의 익명3 과 다른 사람이
됩니다. 익명 번호를 페이지와 무관하게 정하는 방법을 먼저 결정해야 페이징을 할 수 있습니다.

> 초과 건수는 추정입니다. 개별 요청 시간을 세지 않고 회차별 p50·p95·p99 값 사이를 직선으로
> 이어 계산했습니다. 순위와 규모는 신뢰할 수 있지만 건수 자체를 인용할 때는
> 이 한계를 함께 적어야 합니다. 로그인과 검색의 100% 만은 최솟값이 30ms 를 넘으므로 추정을
> 거치지 않은 확정값입니다.

<!-- /FULL -->
엔드포인트 그룹별로 목표를 나누는 방법을 떠올려 봤지만, 대안을 제대로 검토하거나 결정을
내리지는 않았습니다. 지연 목표는 정해져 있지 않습니다.

**이 장의 요약**: 전역 p99 30ms 가 산술적으로 불가능하다는 것을 로그인 분포로 확인했고, 해싱
강도를 낮추는 것은 보안 결정이라 선택지에서 뺐고, 30ms 초과 요청의 구성을 세어 두었습니다.

---

```html-raw
<div class="pagebreak"></div>
```

## 8. 스크랩 토글 경쟁 상태와 게시글 상세 조회 장애

### 8.1 발생 경위

스크랩 토글 API 는 있으면 지우고 없으면 만드는 처리를 조회한 뒤 판단하는 구조였습니다. 동시에
두 요청이 들어오면 둘 다 없다는 결과를 보고 둘 다 만듭니다. 조회와 삽입 사이에 다른 요청이
끼어드는 경쟁 상태입니다.

부하 실험에서 이 중복 행이 실제로 만들어졌고, 이어서 더 큰 문제가 생겼습니다. 중복된 행 하나가
게시글 상세 조회 전체를 실패시켰습니다. 조회 쪽이 결과가 한 건이라고 가정하고 있었기
때문입니다.
=======
## 8. 스크랩 중복 행이 만든 게시글 조회 장애와 유니크 제약

### 8.1 증상

스크랩 토글 API는 "있으면 지우고 없으면 만든다"를 조회한 뒤 판단하는 구조였습니다. 동시에 두 요청이 들어오면 둘 다 "없다"를 보고 둘 다 만듭니다. 조회 후 삽입 경쟁 상태입니다.

부하 테스트에서 이 중복 행이 실제로 만들어졌고, 더 나쁜 일이 뒤따랐습니다. 게시글 상세 조회가 스크랩 여부를 한 건으로 가정하고 있어서, 중복 행이 있는 게시글은 상세 화면 전체가 실패했습니다. 쓰기 경로 하나의 경쟁 상태가 읽기 경로의 장애로 번졌습니다.
>>>>>>> Stashed changes

- **원인**: 스크랩 존재 확인과 삽입 사이에 다른 트랜잭션이 끼어들 수 있는 구조
- **계기**: 같은 사용자의 스크랩 토글 요청이 동시에 두 건 도착
- **감지**: 게시글 상세 조회가 실패하면서 드러남

<!-- FULL -->
```html-raw
<div class="fig">
<svg viewBox="0 0 760 248" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="Malgun Gothic, sans-serif">
  <defs>
    <marker id="a3" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#555"/></marker>
    <marker id="a3r" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#b00000"/></marker>
  </defs>

  <text x="95" y="26" text-anchor="middle" font-size="11" fill="#888">쓰기 경로</text>
  <text x="645" y="26" text-anchor="middle" font-size="11" fill="#888">읽기 경로</text>

  <rect x="25" y="42" width="105" height="32" rx="4" fill="#fff" stroke="#888" stroke-width="1.1"/>
  <text x="77" y="63" text-anchor="middle" font-size="11.5">동시 요청 A</text>
  <rect x="25" y="92" width="105" height="32" rx="4" fill="#fff" stroke="#888" stroke-width="1.1"/>
  <text x="77" y="113" text-anchor="middle" font-size="11.5">동시 요청 B</text>

  <line x1="132" y1="58" x2="166" y2="72" stroke="#555" stroke-width="1.2" marker-end="url(#a3)"/>
  <line x1="132" y1="108" x2="166" y2="94" stroke="#555" stroke-width="1.2" marker-end="url(#a3)"/>

  <rect x="170" y="42" width="150" height="82" rx="4" fill="#fff" stroke="#888" stroke-width="1.1"/>
  <text x="245" y="68" text-anchor="middle" font-size="12">① 있는지 조회</text>
<<<<<<< Updated upstream
  <text x="245" y="88" text-anchor="middle" font-size="10.5" fill="#666">둘 다 &ldquo;없다&rdquo; 를 본다</text>
  <text x="245" y="107" text-anchor="middle" font-size="10.5" fill="#666">조회와 삽입 사이의 경쟁 상태</text>
=======
  <text x="245" y="88" text-anchor="middle" font-size="10.5" fill="#666">둘 다 &ldquo;없다&rdquo;를 본다</text>
  <text x="245" y="107" text-anchor="middle" font-size="10.5" fill="#666">조회 후 삽입 경쟁 상태</text>
>>>>>>> Stashed changes

  <line x1="322" y1="83" x2="356" y2="83" stroke="#555" stroke-width="1.2" marker-end="url(#a3)"/>

  <rect x="360" y="52" width="130" height="62" rx="4" fill="#fff" stroke="#b00000" stroke-width="1.2"/>
  <text x="425" y="76" text-anchor="middle" font-size="12">② 둘 다 삽입</text>
  <text x="425" y="96" text-anchor="middle" font-size="11" fill="#b00000">중복 행 2건</text>

  <line x1="492" y1="83" x2="551" y2="83" stroke="#b00000" stroke-width="1.4" marker-end="url(#a3r)"/>
  <text x="521" y="104" text-anchor="middle" font-size="10.5" fill="#b00000">전파</text>

  <rect x="555" y="42" width="180" height="82" rx="4" fill="#fff" stroke="#b00000" stroke-width="1.2"/>
  <text x="645" y="66" text-anchor="middle" font-size="12">③ 게시글 상세 조회</text>
  <text x="645" y="85" text-anchor="middle" font-size="10.5" fill="#666">결과가 1건이라 가정</text>
  <text x="645" y="106" text-anchor="middle" font-size="12" fill="#b00000" font-weight="bold">화면 전체 실패</text>

  <line x1="425" y1="116" x2="425" y2="164" stroke="#1a7f4b" stroke-width="1.2" marker-end="url(#a3)"/>

  <rect x="170" y="166" width="565" height="54" rx="4" fill="#fafafa" stroke="#1a7f4b" stroke-width="1.2" stroke-dasharray="5 3"/>
<<<<<<< Updated upstream
  <text x="452" y="188" text-anchor="middle" font-size="12.5">해결: 유니크 제약과 upsert</text>
=======
  <text x="452" y="188" text-anchor="middle" font-size="12.5">해결: 유니크 제약 + upsert</text>
>>>>>>> Stashed changes
  <text x="452" y="207" text-anchor="middle" font-size="10.5" fill="#555">중복이 애초에 저장되지 않는다. 애플리케이션 락도, 재시도도 필요 없다.</text>

  <text x="25" y="240" font-size="10.5" fill="#888">스크랩 저장의 경쟁 상태가 게시글 조회 장애로 이어진 경로.</text>
</svg>
<<<<<<< Updated upstream
<div class="fig-cap">그림 8. 결함이 전파된 경로. 잘못 저장된 행이 그 값을 읽는 게시글 상세 조회를 실패시켰다.</div>
</div>
```

<!-- /FULL -->
### 8.2 쓰기 결함이 읽기 장애로 번진 경로

정합성 결함은 틀린 값이 저장되는 데서 끝나지 않습니다. 그 값을 읽는 다른 API 가 실패하면서
장애로 커집니다. 스크랩 쓰기 경로의 경쟁 상태가 게시글 상세 조회를 멈췄습니다.

### 8.3 검토한 대안과 유니크 제약 선택

**결정**: DB 유니크 제약을 걸고 삽입을 upsert 로 바꿨습니다. 분산 락은 쓰지 않았습니다.

| 대안 | 예상 효과 | 버린 이유와 부정적 결과 |
|---|---|---|
| 애플리케이션 동기화 | 단일 인스턴스에서만 중복 차단 | 인스턴스가 늘면 무력합니다 |
| 분산 락(Redis 등) | 인스턴스가 늘어도 중복 차단 | 구성 요소가 하나 늘고 락 획득 실패·만료·시계 문제를 새로 떠안습니다. 지금 구조에서 얻는 것보다 비용이 큽니다 |
| 격리 수준 상향 | 없음 | 이 경쟁 상태는 같은 키의 삽입 충돌이라 격리 수준을 올려도 막히지 않습니다 |
| **유니크 제약과 upsert** (채택) | 중복이 저장되지 않음, 재시도 불필요 | 제약 위반 예외를 호출부가 다뤄야 하고, 스키마 변경이라 마이그레이션이 필요합니다 |

유니크 제약은 인스턴스가 여러 대로 늘어도 그대로 유효합니다.

운이 작용한 부분: 이 경쟁 상태는 부하 실험에서 드러났습니다. 실사용 환경이었다면 같은
사용자의 동시 요청이 드물어 발견이 늦었을 것입니다.

**이 장의 요약**: 부하 실험에서 나온 중복 행 한 건이 게시글 상세 조회를 실패시킨 경위를 추적했고,
대안 넷을 비교해 유니크 제약과 upsert 를 골랐고, 격리 수준 상향이 이 경쟁 상태를 막지 못하는
이유를 기록했습니다.
=======
<div class="fig-cap">그림 8. 결함이 전파된 경로. 잘못 저장된 행이 그 자리에 머물지 않고, 그 값을 읽는 다른 API를 통해 장애로 커졌다.</div>
</div>
```

### 8.2 왜 유니크 제약인가

DB 유니크 제약 `UNIQUE(USR_id, PST_id)`를 Flyway V7 마이그레이션으로 걸었습니다. 삽입은 upsert(`INSERT ... ON DUPLICATE KEY UPDATE`)로 바꿨습니다. 분산 락은 쓰지 않았고, 반응 토글에도 같은 패턴을 적용했습니다.

| 방법 | 판단 |
|---|---|
| 애플리케이션 동기화 | 인스턴스가 늘면 무력합니다 |
| 분산 락(Redis 등) | 구성 요소를 하나 더 늘리고, 락 획득 실패·만료·시계 문제를 새로 떠안습니다. 지금 구조에서 얻는 것보다 비용이 큽니다 |
| 격리 수준 상향 | 이 경쟁 상태는 같은 키의 삽입 충돌이라 격리 수준을 올려도 막히지 않습니다 |
| **유니크 제약 + upsert (채택)** | DB가 이미 제공하는 직렬화 지점을 씁니다. 중복이 애초에 저장되지 않고 재시도도 필요 없습니다 |

기록은 [BTL-012](https://github.com/JangHyeok2909/highteenday-backend/blob/main/performance/bottlenecks/BTL-012-scrap-toggle-race-duplicate.md)에 있습니다. 제약은 커밋 `37c451c`, upsert는 커밋 `5e03ec7`입니다.
>>>>>>> Stashed changes

---

```html-raw
<div class="pagebreak"></div>
```

## 9. p99 30ms 전역 목표를 그룹별 목표로 재설정

<<<<<<< Updated upstream
동아리 프로젝트로 3명이 시작했고 제가 리드했습니다. 백엔드에서는 게시글·댓글·인기글·파일
업로드를 맡았고, 사용자 엔티티와 인증 설정은 다른 팀원이 맡았습니다. 4개월 뒤부터는 혼자
이어오고 있습니다. 전체 715 커밋 중 519건이 제 것이고, 성능 측정 디렉터리의 158 커밋은 전부
단독 구간에 만들었습니다.

아래 규칙은 두 구간을 모두 거쳐 남았습니다. 여럿일 때는 서로의 판단을 따라가기 위해,
혼자가 된 뒤에는 몇 달 전 제 판단을 따라가기 위해 필요했습니다.

### 9.1 결함 기록의 성격별 분리

결함 기록을 성격 셋으로 나눠 운영합니다. 분류 기준은 무엇이 잘못됐는지입니다.

| 기록 | 다루는 것 | 예 |
|---|---|---|
| 결함 | **틀린 것** | 카운터가 유실됨, 익명 정보가 노출됨 |
| 병목 | **느린 것** | 댓글 목록 N+1, 깊은 페이지 조회 |
| 측정 시스템 발견 | **잘못 재는 것** | 대조군 오선택, 노이즈 하한이 오래됨 |

셋을 한 문서에 모으면 현재 신뢰할 수 없는 항목을 한눈에 볼 수 없습니다. 읽는 목적이 다르면 문서를
나눕니다.

이 성격 셋을 실제 문서로는 여섯 종류로 나눠 씁니다. 병목(BTL) 14건, 실험(EXP) 7건,
최적화(OPT) 2건, 결함(KI), 결정 기록(ADR), 측정 시스템 발견입니다. 앞의 셋은 병목 기록에서
실험 기록으로, 실험 기록에서 최적화 기록으로 이어져야 하고, 그 연결이 끊긴 최적화는 목록에
올리지 않습니다.

<!-- FULL -->
### 9.2 설계 결정 기록(ADR) 운영
=======
댓글 목록 개선 이후 전체 p95는 34.3ms, p99는 80.9ms였습니다. p99를 30ms 안에 넣으려면 무엇을 더 해야 하는지 2026-09-04에 계산해 봤습니다.

```
측정 구간 전체 요청   34,471건 (개선 후 5회 합계)
30ms 초과            4,053건 = 11.76%
목표                   345건 이하 = 1.00%

login 최솟값   71.4  70.6  74.8  73.2  73.7 ms   (5회차 전부)
login 건수     585건 = 전체의 1.70%
```

가장 빠른 로그인조차 목표의 2.4배이고, 로그인이 전체 요청의 1.70%입니다. 목표 허용치가 1.00%이므로 다른 모든 요청이 0ms가 되어도 전역 p99는 로그인 분포 안에 떨어집니다. 전역 p99의 하한이 약 71ms라는 뜻입니다.

로그인이 느린 원인은 BCrypt strength 10의 해싱입니다. 70~90ms는 무차별 대입을 늦추려고 일부러 느리게 설계된 값입니다. strength를 낮추면 목표에 가까워지지만, 해싱 강도를 낮추는 보안 결정이라 하지 않았습니다.

### 9.1 검토하고 버린 대안

| 대안 | 버린 이유 |
|---|---|
| BCrypt strength 10 → 8 | 약 4배 빨라져 20ms대가 되지만 해싱 강도가 1/4이 됩니다. 지연 목표와 맞바꿀 값이 아닙니다 |
| 전역 목표를 80ms로 완화 | 숫자는 맞출 수 있지만 정보가 사라집니다. 게시판 목록(현재 p99 12ms)이 60ms로 나빠져도 통과합니다 |
| 로그인만 통계에서 제외 | 제외 규칙이 하나 생기면 다음 예외도 정당화됩니다. 로그인이 느린 것은 실제 사용자 경험이라 안 재는 것이 답이 아닙니다 |
| 로그인 결과 캐싱·세션 연장 | 인증 설계 변경입니다. 지연 목표 때문에 인증 수명을 늘리는 것은 순서가 거꾸로입니다 |

### 9.2 그룹별 목표

| 그룹 | 목표 p99 | 현재 | 도달하려면 |
|---|---|---|---|
| 읽기(상세·게시판 목록·채팅방) | **30ms** | 12~24ms | 유지 |
| 목록(댓글·게시글·인기글) | **30ms** | 48~97ms | 댓글 목록 페이징 |
| 쓰기(작성·반응) | **50ms** | 84~135ms | 동기 리스너·이중 커밋 정리 |
| 검색 | **30ms** | 206ms | FULLTEXT 전환 |
| 인증(로그인) | **150ms** | 910ms | 큐잉 완화. 해싱 강도는 유지 |

이렇게 나누면 목표마다 무엇을 고쳐야 도달하는지가 붙습니다. 전역 하나짜리 목표에서는 로그인 때문에 전체가 실패로 찍히고, 그 신호가 어디를 고치라는 것인지 가리키지 않았습니다. 쓰기만 50ms인 이유는 커밋 fsync가 하한을 만들기 때문입니다.

결정 기록은 [latency-slo-per-endpoint.md](https://github.com/JangHyeok2909/highteenday-backend/blob/main/performance/docs/decisions/latency-slo-per-endpoint.md)에 있습니다.

<!-- FULL -->
### 9.3 남은 30ms 초과 요청의 구성

전역 목표를 버린 대신, 남은 30ms 초과 요청이 무엇으로 구성돼 있는지를 같이 적었습니다.

| 요청 | 30ms 초과 지분 | 진단 |
|---|---:|---|
| 댓글 목록 | **41.8%** | 쿼리는 상수 4개인데 응답 크기가 댓글 수에 비례. 4,046건 글의 응답이 1.6MB |
| 로그인 | 14.4% | BCrypt 해싱 |
| 검색 | 9.0% | `LIKE '%키워드%'` 전체 스캔 |
| 댓글 작성 | 7.6% | 동기 리스너·이중 커밋 |
| 그 외 | 27.2% | 일부 미진단 |

가장 큰 항목은 여전히 댓글 목록이고, 성격이 바뀌었습니다. 쿼리 수는 상수 4개가 됐는데, 이제 댓글을 DTO로 만들고 익명화 루프를 돌고 JSON으로 직렬화하는 앱 비용이 남았습니다. 중앙값은 7.1ms로 이미 빠르고 꼬리만 느립니다.

댓글 목록 페이징은 쿼리 튜닝을 넘어 도메인 설계 변경입니다. 익명 번호("익명3")의 N은 게시글 전체 댓글의 등장 순서입니다. 페이지로 자르면 2페이지의 "익명3"이 1페이지의 "익명3"과 다른 사람이 되므로, 번호를 페이지와 무관하게 정하는 방법을 먼저 정해야 합니다.

초과 건수는 추정입니다. 개별 요청 시간을 세지 않고 회차별 분위수 사이를 선형보간해 계산했습니다. 로그인과 검색만은 최솟값이 30ms를 넘으므로 확정값입니다.
<!-- /FULL -->

---

```html-raw
<div class="pagebreak"></div>
```

## 10. 일하는 방식

동아리 프로젝트로 3명이 시작했고 제가 리드했습니다. 백엔드에서는 사용자 엔티티와 인증 설정을 제외한 게시글·댓글·인기글·파일 업로드를 맡았습니다. 4개월 뒤부터는 혼자 이어오고 있고, 전체 715 커밋 중 519건이 제 것입니다.

아래 규칙은 두 구간을 모두 거쳐 남았습니다. 여럿일 때는 서로의 판단을 따라가기 위해, 혼자가 된 뒤에는 몇 달 전의 제 판단을 따라가기 위해 필요했습니다.

### 10.1 계측 → 코드 → 계측

코드를 읽으면 무엇이 의심스러운지까지는 알 수 있어도, 그중 무엇이 실제로 비싼지는 알 수 없습니다. 댓글 목록의 N+1도 코드를 읽으면 찾을 수 있는 종류였습니다. 그것이 요청당 1,507개 중 몇 개인지는 세어야 나왔습니다.

그래서 순서를 이렇게 정했습니다. 계측이 어디를 볼지 알려주고, 코드가 왜 그런지 알려주고, 다시 계측이 그 설명이 맞는지 검증합니다. 세 번째 단계가 빠지면 "코드를 읽고 그럴듯한 설명을 붙였다"에서 끝납니다.

댓글 목록 개선이 이 왕복을 두 번 돈 기록입니다. 두 번 모두 마지막 단계에서 검증 가능한 예측을 남겼습니다. 없앨 쿼리 수 예측(약 108개)은 실측 108.3개로 맞았고, p95 개선폭 예측(20%)은 실측 40.1%로 빗나갔습니다.

### 10.2 결함·병목·측정 발견을 나눠 기록

| 기록 | 다루는 것 | 예 |
|---|---|---|
| 결함 | 틀린 것 | 카운터가 유실됨, 익명 정보가 노출됨 |
| 병목 | 느린 것 | 댓글 목록 N+1, 깊은 페이지 조회 |
| 측정 시스템 발견 | 잘못 재는 것 | 대조군 오선택, 노이즈 하한이 낡음 |

셋을 한 곳에 모으면 "지금 무엇을 믿을 수 없나"를 훑을 수 없어서 문서를 나눴습니다. 병목(BTL) 14건, 실험(EXP) 7건, 최적화(OPT) 2건은 병목 → 실험 → 최적화 순서로 번호가 이어집니다. 실험 없이 적용한 변경은 최적화 기록에 올리지 않습니다.

최적화 기록에는 채택안뿐 아니라 검토하고 버린 대안과 그 이유를 함께 적습니다. 채택안만 적힌 문서는 몇 달 뒤에 "왜 이렇게 했지"에 답하지 못합니다. 효과가 없었던 시도도 같은 형식으로 남깁니다.

### 10.3 설계 결정 기록(ADR)
>>>>>>> Stashed changes

성능 문서 밖에도 설계 결정 기록(ADR)이 넷 있습니다.

| ADR | 무엇을 정했나 |
|---|---|
| 반응 카운트에 락을 쓰지 않는다 | 정합성보다 처리량을 택한 지점과 그 근거 |
| 조회수는 Redis 버퍼를 거친다 | 인기 게시글 한 행에 쓰기가 몰리는 문제 |
| 게시글 목록은 커서+오프셋 하이브리드 | 이전/다음은 커서, 페이지 점프는 오프셋 |
| S3는 임시 업로드 후 승격 | 실패한 업로드가 고아 객체로 남지 않도록 |

<<<<<<< Updated upstream
하이브리드 페이징 ADR 에는 결정 당시의 기록 대신 README 와 코드에서 나중에
재구성한 기록이라는 표시가 붙어 있습니다. 나중에 복원한 기록과 당시 기록을 구분해 두지 않으면, 문서
전체의 신뢰도가 같은 수준으로 떨어지기 때문입니다.

<!-- /FULL -->
### 9.3 버린 대안의 기록

최적화 기록에는 채택안과 함께 검토하고 버린 대안, 그 이유를 적습니다(6.4). 채택안만 적힌
문서는 몇 달 뒤에 왜 이렇게 했는지에 답하지 못합니다. 효과가 없었던 시도도 같은 형식으로
남깁니다. 같은 시도를 반복하지 않기 위해서입니다.

### 9.4 구현보다 먼저 정하는 검증 조건

무엇을 만들지보다 먼저, 결과가 맞는지 확인할 방법을 정합니다.
=======
하이브리드 페이징 ADR은 README와 코드에서 나중에 재구성한 기록이라는 점을 문서 안에 밝혀 두었습니다. 당시 기록과 복원한 기록을 구분해야 문서 전체의 신뢰도가 같은 수준으로 떨어지지 않습니다. 원문은 [docs/adr](https://github.com/JangHyeok2909/highteenday-backend/tree/main/docs/adr)에 있습니다.

### 10.4 AI 도구 사용

AI 에이전트를 적극적으로 씁니다. 다만 무엇을 만들지와 그것이 맞는지 어떻게 확인할지를 먼저 정하고, 그다음에 위임합니다.
>>>>>>> Stashed changes

| 언제 | 무엇을 먼저 정했나 |
|---|---|
<<<<<<< Updated upstream
| 문제를 고를 때 | 이 병목을 지금 고칠 값이 있는지, 무엇을 바꾸고 무엇을 건드리지 않을지 |
| 대안을 고를 때 | 쿼리 수와 영향 범위로 비교한 표(6.4) |
| 구현하기 전 | 페치 조인을 빼면 실패해야 한다는 조건(6.5) |
| 측정하기 전 | 없앨 쿼리 수의 예측값(6.2)과 부작용 후보(6.6) |

6.5 의 대조 테스트는 페치 조인을 다시 빼면 실패해야 한다는 조건을 구현 전에 정해 둔
것입니다. 그 조건이 없었다면 `em.clear()` 를 빠뜨린 채 통과하는 테스트가 만들어졌을
것입니다. 통과하는 테스트는 쉽게 만들 수 있지만, 무엇이 실패해야 하는지는 미리 정해야 합니다.

<!-- FULL -->
### 9.5 작업 규칙

- **한 번에 변수 하나**: 두 가지를 같이 바꾸면 어느 쪽 효과인지 알 수 없습니다
- **수치 없는 최적화는 미기록**: 실험 없이 적용한 변경은 최적화 대장에 올리지 않습니다
- **스키마는 마이그레이션으로만 변경**: 운영에서 자동 DDL 을 쓰지 않습니다
- **테스트 725개 통과**

<!-- /FULL -->
**이 장의 요약**: 결함을 성격별로 나눠 기록하는 체계를 세웠고, 버린 대안을 본문으로
남기는 규칙을 두었고, 구현 전에 무엇이 실패해야 하는지를 정하는 순서를 고정했습니다.

---

## 10. 한계

이 장은 앞의 수치가 어디까지 유효한지를 적습니다.

### 10.1 조치한 항목

유형은 완화(증상을 줄임), 예방(원인을 없앰), 절차(같은 오판이 반복되지 않게 함)로 나눴습니다.

| 항목 | 유형 | 내용 |
|---|---|---|
| 댓글 목록 N+1 제거 | 완화 | 요청당 쿼리 1,507 → 3.9개 (6장) |
| 스크랩 중복 행 | 예방 | 유니크 제약과 upsert (8장) |
| Sorted Set 만료 누락 | 예방 | KI-20, 만료 부여 (2.3) |
| 포화 4단계 판정 | 절차 | 포화 실행을 다른 부하의 실행과 비교하지 않도록 차단 (3장) |
| 대조군 유효성 검사 | 절차 | 비교해도 되는 실행만 선택 (4장) |
| 개선 판정 문턱 | 절차 | 변동계수에서 최소 검출 가능 효과 산출 (5장) |

### 10.2 측정 결과의 유효 범위

| 한계 | 내용 |
|---|---|
| **운영 환경 측정이 아님** | 전부 부하 실험 환경의 측정입니다. 추적 과정은 같지만 실사용자 장애를 겪은 것은 아닙니다 |
| **작은 규모** | 단일 인스턴스, 단일 부하 생성기입니다. 판정 로직은 규모와 무관하지만, 부하 생성기 다중화와 노드 간 시계 동기화는 검증하지 않았습니다 |
| **코드 수준 프로파일링 부재** | 병목을 쿼리 수와 자원 지표까지는 좁히지만, 메서드 단위로는 내려가지 못합니다 |

<!-- FULL -->
### 10.3 의존성 장애 시의 반환값

이 절은 의존성마다 장애 시 거동을 코드에서 확인해 정리한 것입니다.
=======
| 무엇을 문제로 볼 것인가. 이 병목을 지금 고칠 가치가 있는가 | 코드 작성 |
| 기능 범위와 경계. 무엇을 바꾸고 무엇을 건드리지 않을 것인가 | 정형 변환, 반복 작업 |
| 대안 비교와 선택. 버린 대안 표는 제가 만든 판단입니다 | 테스트 골격 |
| 검증 방법. 단위·통합 테스트, 실패해야 하는 테스트, 응답 전량 대조 | 문서 초안, 보고 |

fetch join 테스트는 "빼면 실패해야 한다"는 조건을 구현 전에 정해 둔 것입니다. 그 조건이 없었다면 `em.clear()`를 빠뜨린 채 통과하는 테스트가 만들어졌을 것입니다. 실패 조건은 제가 정했고, 테스트 코드 작성은 위임했습니다.

위임하지 않은 것은 셋입니다. 대안 다섯 개를 쿼리 수와 영향 범위로 비교해 고른 것, 부작용을 먼저 예상하고 측정으로 확인한 것, 예측이 틀린 이유를 규명한 것입니다.

### 10.5 지키는 규칙

- 한 번에 변수 하나. 두 가지를 같이 바꾸면 어느 쪽 효과인지 알 수 없습니다. 댓글 목록의 두 최적화를 두 번에 나눈 이유입니다.
- 수치 없는 최적화는 기록하지 않습니다. 실험 없이 "좋아 보여서" 적용한 변경은 최적화 기록에 올리지 않습니다.
- 스키마는 Flyway 마이그레이션으로만 바꿉니다. 운영에서 자동 DDL을 쓰지 않습니다.
- 테스트 725개가 CI에서 통과합니다.

---

```html-raw
<div class="pagebreak"></div>
```

## 11. 한계와 다음 할 일

```html-raw
<table>
<colgroup><col style="width:20%"><col style="width:40%"><col></colgroup>
<thead><tr><th>한계</th><th>지금 상태</th><th>다음</th></tr></thead>
<tbody>
<tr><td>운영 트래픽이 아닙니다</td><td>전부 부하 테스트 환경의 측정입니다. 추적 과정은 같지만 실사용자 장애를 겪은 것은 아닙니다</td><td>운영 지표 수집과 경보 규칙 설계</td></tr>
<tr><td>단일 인스턴스입니다</td><td>여러 인스턴스에서의 스케줄러·이벤트 동작을 설계하지 않았습니다. 부하 생성기도 하나입니다</td><td>스케줄러 단일 실행 보장, 이벤트 유실 대응. 큰 환경으로 옮기려면 부하 생성기 다중화와 노드 간 시계 동기화가 필요하고, 판정 로직은 그대로 씁니다</td></tr>
<tr><td>코드 수준 프로파일링이 없습니다</td><td>병목을 쿼리 수와 자원 지표까지는 좁히지만 메서드 단위로는 내려가지 못합니다</td><td>프로파일러 계층 추가</td></tr>
<tr><td>깊은 페이지 조회에 상한이 없습니다</td><td>이전/다음 탐색은 커서라 상수 성능이지만, 페이지 점프와 좋아요·조회순 정렬은 오프셋이라 뒤쪽 페이지는 수만 건을 스캔합니다. <code>page</code> 값에 상한 방어가 없습니다</td><td>상한 방어 먼저, 그다음 정렬별 커서</td></tr>
<tr><td>댓글 목록 페이징 없음</td><td>쿼리는 4개로 고정됐지만 응답 크기가 댓글 수에 비례합니다(30ms 초과 요청의 41.8%)</td><td>익명 번호가 게시글 전체 댓글의 등장 순서라 페이지로 자르면 어긋납니다. 번호 규칙부터 정해야 합니다</td></tr>
<tr><td>검색·쓰기 경로 미개선</td><td>진단과 대안 비교까지 끝났습니다</td><td>검색은 FULLTEXT 검증, 쓰기는 두 원인의 몫부터 가르기</td></tr>
<tr><td>토글 API가 멱등하지 않음</td><td>응답이 유실되어 클라이언트가 재시도하면 좋아요가 취소됩니다</td><td>상태를 명시하는 API로 재설계</td></tr>
<tr><td>판정을 자동 차단에 연결하지 않았습니다</td><td>판정은 붙지만 CI에서 병합을 막지는 않습니다</td><td>회귀 게이트 연결</td></tr>
<tr><td>세션 간 용량 차이의 원인을 모릅니다</td><td>세션 A에서 C로 가며 처리량이 25% 떨어진 것은 실측인데, 무엇이 흔들었는지는 미규명입니다. 호스트는 두 실험(상관 −0.006, 클럭 고정 세트)으로 후보에서 뺐습니다</td><td>앱 내부(GC, 커넥션 재수립, 캐시 콜드 스타트)와 컨테이너 재시작 직후 과도 상태를 후보별로 실험</td></tr>
<tr><td>대조군 계열이 갈라진 뒤의 절차가 없습니다</td><td>조건 표 버전이 바뀌면 계열이 갈라지는 것은 알 수 있습니다</td><td>과거 실행을 새 기준으로 옮기는 절차</td></tr>
<tr><td>측정 시스템 자체의 결함이 남아 있습니다</td><td>발견한 것을 전부 목록에 등록해 두었고 일부는 미해결입니다</td><td>우선순위대로 처리 중</td></tr>
</tbody></table>
```

```html-raw
<div class="pagebreak"></div>
```

### 11.1 의존성이 죽으면 무엇을 반환하는가

의존성마다 실패 시 거동을 코드에서 확인해 한 장으로 모았습니다.
>>>>>>> Stashed changes

```html-raw
<div class="fig">
<svg viewBox="0 0 760 330" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="Malgun Gothic, sans-serif">
  <defs>
    <marker id="f8" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#555"/></marker>
    <marker id="f8r" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#b00000"/></marker>
  </defs>

  <rect x="20" y="14" width="720" height="30" rx="4" fill="#f4f4f4" stroke="#888" stroke-width="1.1"/>
  <text x="380" y="34" text-anchor="middle" font-size="12.5" fill="#333">HighTeenDay 앱 (단일 인스턴스)</text>

  <g stroke="#555" stroke-width="1.2" marker-end="url(#f8)">
    <line x1="102" y1="44" x2="102" y2="64"/>
    <line x1="287" y1="44" x2="287" y2="64"/>
    <line x1="472" y1="44" x2="472" y2="64"/>
    <line x1="657" y1="44" x2="657" y2="64"/>
  </g>

  <g fill="#fff" stroke="#888" stroke-width="1.1">
    <rect x="20" y="66" width="165" height="30" rx="4"/>
    <rect x="205" y="66" width="165" height="30" rx="4" stroke="#b00000"/>
    <rect x="390" y="66" width="165" height="30" rx="4"/>
    <rect x="575" y="66" width="165" height="30" rx="4" stroke="#b00000"/>
  </g>
  <g font-size="12" text-anchor="middle" fill="#333">
    <text x="102" y="86">Redis</text>
    <text x="287" y="86" fill="#b00000">MySQL</text>
    <text x="472" y="86">NEIS 급식 API</text>
    <text x="657" y="86" fill="#b00000">클라이언트 응답</text>
  </g>

  <g font-size="10.5" text-anchor="middle" fill="#888">
    <text x="102" y="112">장애</text>
    <text x="287" y="112">포화·지연</text>
    <text x="472" y="112">장애</text>
    <text x="657" y="112">유실</text>
  </g>

  <g stroke="#555" stroke-width="1.2" marker-end="url(#f8)">
    <line x1="102" y1="116" x2="102" y2="132"/>
    <line x1="472" y1="116" x2="472" y2="132"/>
  </g>
  <g stroke="#b00000" stroke-width="1.2" marker-end="url(#f8r)">
    <line x1="287" y1="116" x2="287" y2="132"/>
    <line x1="657" y1="116" x2="657" y2="132"/>
  </g>

  <g fill="#fff" stroke="#888" stroke-width="1.1">
    <rect x="20" y="134" width="165" height="34" rx="4"/>
    <rect x="390" y="134" width="165" height="34" rx="4"/>
  </g>
  <g fill="#fff" stroke="#b00000" stroke-width="1.1" stroke-dasharray="4 3">
    <rect x="205" y="134" width="165" height="34" rx="4"/>
    <rect x="575" y="134" width="165" height="34" rx="4"/>
  </g>
  <g font-size="11" text-anchor="middle">
    <text x="102" y="150" fill="#333">방어 두 층</text>
    <text x="102" y="163" fill="#666" font-size="10">AOP 기본값 + DB 폴백</text>
    <text x="287" y="156" fill="#b00000">방어 없음</text>
    <text x="472" y="150" fill="#333">예외를 무시</text>
    <text x="472" y="163" fill="#666" font-size="10">모은 데까지만 반환</text>
    <text x="657" y="156" fill="#b00000">방어 없음</text>
  </g>

  <g stroke="#555" stroke-width="1.2" marker-end="url(#f8)">
    <line x1="102" y1="168" x2="102" y2="186"/>
    <line x1="472" y1="168" x2="472" y2="186"/>
  </g>
  <g stroke="#b00000" stroke-width="1.2" marker-end="url(#f8r)">
    <line x1="287" y1="168" x2="287" y2="186"/>
    <line x1="657" y1="168" x2="657" y2="186"/>
  </g>

  <g fill="#fafafa" stroke="#888" stroke-width="1.1">
    <rect x="20" y="188" width="165" height="76" rx="4"/>
    <rect x="390" y="188" width="165" height="76" rx="4"/>
  </g>
  <g fill="#fff8f8" stroke="#b00000" stroke-width="1.1">
    <rect x="205" y="188" width="165" height="76" rx="4"/>
    <rect x="575" y="188" width="165" height="76" rx="4"/>
  </g>

  <g font-size="10.5" fill="#333">
    <text x="30" y="206">조회수 : 증가 안 함</text>
    <text x="30" y="221" fill="#666">유실은 되지만 중복은 없다</text>
    <text x="30" y="240">인기글 : DB에서 읽음</text>
    <text x="30" y="255" fill="#666">daily_hot_post로 폴백</text>

    <text x="215" y="206" fill="#b00000">커넥션을 30초 기다린 뒤</text>
    <text x="215" y="221" fill="#b00000">500을 반환한다</text>
    <text x="215" y="240" fill="#666">HikariCP 설정을 안 했으므로</text>
    <text x="215" y="255" fill="#666">기본값(풀 10 · 타임아웃 30초)</text>

    <text x="400" y="206">급식 : 빈 목록</text>
    <text x="400" y="221" fill="#666">앱은 계속 동작</text>
    <text x="400" y="240" fill="#b00000">다만 "급식이 없는 날"과</text>
    <text x="400" y="255" fill="#b00000">"못 가져옴"이 같은 응답이다</text>

    <text x="585" y="206" fill="#b00000">재시도가 상태를 뒤집는다</text>
    <text x="585" y="221" fill="#666">토글 API라 두 번 보내면</text>
    <text x="585" y="236" fill="#666">좋아요가 취소된다</text>
<<<<<<< Updated upstream
    <text x="585" y="255" fill="#666">KI-54 · 방어 없음</text>
=======
    <text x="585" y="255" fill="#666">미구현</text>
>>>>>>> Stashed changes
  </g>

  <line x1="20" y1="280" x2="740" y2="280" stroke="#ddd" stroke-width="1"/>
  <g font-size="10.5" fill="#888">
    <text x="20" y="298">근거 : ResilientRedisAspect(기본값) · HotPostService(DB 폴백) · SchoolMealService(예외 삼킴)</text>
    <text x="20" y="313">회색 = 장애 시에도 응답 반환 · 빨강 = 폴백이 없거나 응답이 사실과 다름</text>
  </g>
</svg>
<div class="fig-cap">그림 9. 의존성 장애 시 반환값. 넷 중 Redis 만 방어가 두 층이다.</div>
</div>
```

<<<<<<< Updated upstream
Redis 만 방어가 두 층입니다. `@ResilientRedis` 애스펙트가 `DataAccessException` 을 잡아
반환 타입의 기본값을 돌려주고, 그 위에 인기글은 Sorted Set 이 비면 DB 의 `daily_hot_post` 에서
읽는 별도 폴백이 하나 더 있습니다. 조회수의 경우 기본값 false 가 이미 본 글로 해석되어
카운트가 올라가지 않습니다. 카운트 유실은 중복 증가보다 안전한 방향입니다. 안전한 쪽이 기본값이
되도록 호출부를 구성했습니다.

나머지 셋은 방어가 없습니다.

| 지점 | 지금 거동 | 무엇이 문제인가 |
|---|---|---|
| **MySQL 포화** | 커넥션을 30초 기다린 뒤 500 | HikariCP 를 설정하지 않아 기본값(풀 10 · 타임아웃 30초)입니다. 사용자가 30초를 기다리는 것은 즉시 실패보다 나쁩니다. 타임아웃 상한과 실패 시 응답 형식을 정하지 않았습니다 |
| **외부 API 장애** | 예외를 로그로 남기고 모은 데까지 반환 | 앱은 계속 동작하지만 **호출자가 부분 응답인지 모릅니다.** "급식이 원래 없는 날"과 "API 가 죽어서 못 가져옴"이 같은 빈 목록으로 나갑니다 |
| **응답 유실** | 클라이언트가 재시도하면 토글 상태가 반대로 바뀜 | 서버가 멱등하지 않아 재시도가 사용자 의도를 되돌립니다(KI-54). **클라이언트로는 닫을 수 없는 문제**입니다. 확인 요청의 응답도 유실될 수 있기 때문입니다 |

세 항목 모두 원인이 같습니다. 실패 시 반환값을 정하지 않고 성공 경로만 구현했습니다. Redis 쪽만 실패 시 반환값을 정해 두었고, 정해 두었기 때문에 장애가 나도
응답이 나갑니다.

<!-- /FULL -->
**전체 요약**: 인기글 랭킹 경로를 구현했고, 부하 실험 결과를 두 번 잘못 판단한 경위를
기록했고, 같은 오판을 막는 판정 규칙을 코드로 넣었고, 그 규칙을 만족하는 측정으로 병목 하나를
측정 오차보다 큰 폭으로 고쳤습니다.
=======
Redis만 방어가 두 층입니다. `@ResilientRedis` 애스펙트가 `DataAccessException`을 잡아 반환 타입의 기본값을 돌려줍니다. 그 위에 인기글은 ZSET이 비면 DB의 `daily_hot_post`에서 읽는 명시적 폴백이 하나 더 있습니다.

조회수는 기본값 `false`가 "이미 본 글"로 해석되어 카운트가 올라가지 않습니다. 유실되는 방향이라 중복 증가보다 안전합니다. 안전한 쪽이 기본값이 되도록 호출부를 배치했습니다.

나머지 셋은 아직 공백입니다.

| 지점 | 지금 거동 | 무엇이 문제인가 |
|---|---|---|
| MySQL 포화 | 커넥션을 30초 기다린 뒤 500 | HikariCP를 설정하지 않아 기본값(풀 10, 타임아웃 30초)입니다. 사용자가 30초를 기다리는 것은 실패보다 나쁩니다. 타임아웃 예산을 정하고 그 안에서 부분 응답을 돌려주는 설계가 필요합니다 |
| 외부 API 장애 | 예외를 로그로 남기고 모은 데까지 반환 | 앱은 죽지 않지만 호출자가 부분 응답인지 모릅니다. "급식이 원래 없는 날"과 "API가 죽어서 못 가져옴"이 같은 빈 목록으로 나갑니다 |
| 응답 유실 | 클라이언트가 재시도하면 토글이 뒤집힘 | 서버가 멱등하지 않아 재시도가 사용자 의도를 되돌립니다. 확인 요청의 응답도 유실될 수 있어 클라이언트 쪽에서는 닫을 수 없는 문제입니다 |

세 줄 모두 "실패했을 때 무엇을 돌려줄 것인가"를 정하지 않은 채 성공 경로만 만들어 둔 것입니다. Redis 쪽만 그것을 정해 두었고, 정해 두었기 때문에 장애가 나도 응답이 나갑니다.
>>>>>>> Stashed changes

<!-- CUT -->

---
---

# 여기부터는 PDF에 들어가지 않는다 (초안 메모)

## 구현이 끝나면 8장에 넣을 절 (2026-09-11~13 예정)

### 8.3 토글 API를 멱등하게 (KI-54)

> 같은 요청을 두 번 보내면 상태가 뒤집히는 토글 API를 멱등하게 재설계했습니다.
> 네트워크 재시도 한 번에 사용자가 의도하지 않은 상태가 되는 문제입니다.
> PUT/DELETE로 의미를 나눠 "무엇을 원하는가"를 클라이언트가 말하게 했고,
> 수정 전에는 실패하고 수정 후에는 통과하는 재현 테스트를 먼저 만들었습니다.
> 대안: 요청 식별자 기반 중복 제거(상태 저장 비용), 낙관적 버전(사용자 의도와 무관)

### 8.4 카운터 lost update (KI-53)

구현은 2026-08-14에 끝났다(`PostRepository.incrementCommentCount()`의 원자 UPDATE, GAPS.md C-2 정정 참고).
저장소에 동시 요청 재현 테스트가 없어 본문에 올리지 않았다. 테스트가 들어가면 아래 문단을 올린다.

> 동시에 댓글이 달릴 때 댓글 수 카운터가 유실되는 lost update를 재현 테스트로 먼저
> 증명하고 원자 증감으로 해결했습니다. 읽고 더하고 쓰는 방식은 두 트랜잭션이 같은 값을
> 읽으면 한쪽 증가가 사라집니다.
> 대안 비교: 비관 락(경합 시 대기), 낙관 락(재시도 폭풍), 원자 UPDATE(선택)
> 같은 코드의 다른 문제와 구분: 락 대기는 느려지는 것, lost update는 틀려지는 것

## 보류한 것

- 스크랩 경쟁 상태의 규모 수치 `409 응답 519,288건`. 출처 run-id를 찾지 못해(2026-09-04 재확인) 8장 본문에서 숫자를 뺐다. 찾으면 8.1 첫 문단에 넣는다.
- 커서 페이징(BTL-001). 구현 전이라 11장 표에 한계로만 적었다.
- 도착률만 바꾼 대비 상자(p95 10,685ms 대 278ms, 옛 그림 4). 같은 초당 4요청 조건에 402ms(용량 곡선)와 278ms 두 값이 있어 2026-09-05에 뺐다. 278ms의 실행을 찾아 두 값의 조건 차이가 설명되면 다시 넣는다.

## 어투 메모

- 문장 규칙은 루트 `CLAUDE.md`의 Documentation Rules와 `docs/WRITING.md`를 따른다. 사건 서술이라 "~습니다"를 유지한다.
- 장별 "남은 한계" 절은 11장 표로 모았다(2026-09-05).
- 장 번호와 장 제목을 축약본 `portfolio-short.md`와 맞췄다. 수치를 고치면 두 원고를 같이 고친다.
- `<!-- FULL -->` 구간은 면접용 깊이다. `--short` 빌드에서 빠진다.
