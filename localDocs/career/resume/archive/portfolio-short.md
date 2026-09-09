# HighTeenDay 백엔드 포트폴리오

```html-raw
<p class="lead">동아리에서 시작한 커뮤니티 서비스의 백엔드를 1년 넘게 만들고 있습니다. 측정값이 실행마다 25~45% 흔들려 닷새를 날린 일, 댓글 API 쿼리 1,507개를 4개로 줄인 일, 중복 행 하나가 상세 화면을 죽인 일을 적었습니다.</p>
<p class="meta">장혁 · wkdgur456789@gmail.com · <a href="https://github.com/JangHyeok2909/highteenday-backend">github.com/JangHyeok2909/highteenday-backend</a> · janghyeok.tistory.com</p>
```

기능 목록과 API 명세는 [저장소 README](https://github.com/JangHyeok2909/highteenday-backend)에, 측정 결과는 [공개 대시보드](https://janghyeok2909.github.io/highteenday-backend/)에, 실험·최적화 기록은 저장소의 [performance/](https://github.com/JangHyeok2909/highteenday-backend/tree/main/performance) 디렉터리에 있습니다.

```html-raw
<div class="toc">
  <div><span class="num">1</span>프로젝트 개요</div>
  <div><span class="num">2</span>시스템 구조와 인기글 랭킹 파이프라인</div>
  <div><span class="num">3</span>부하 테스트 환경과 계측 시스템</div>
  <div><span class="num">4</span>트러블슈팅 1 · 실행마다 25~45% 흔들려 개선을 판정할 수 없던 측정</div>
  <div><span class="num">5</span>트러블슈팅 2 · 회귀 판정기의 잘못된 대조군 선택</div>
  <div><span class="num">6</span>노이즈를 먼저 재서 정한 개선 판정 기준</div>
  <div><span class="num">7</span>댓글 목록 API N+1 제거, 요청당 쿼리 1,507개 → 4개</div>
  <div><span class="num">8</span>스크랩 중복 행이 만든 게시글 조회 장애와 유니크 제약</div>
  <div><span class="num">9</span>p99 30ms 전역 목표를 그룹별 목표로 재설정</div>
  <div><span class="num">10</span>일하는 방식</div>
  <div><span class="num">11</span>한계와 다음 할 일</div>
</div>
```

---

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
<tr><td>상태</td><td>운영 배포는 비용 문제로 중단. 실사용자 지표는 없고, 이 문서의 수치는 전부 부하 테스트 환경에서 잰 값</td></tr>
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

## 2. 시스템 구조와 인기글 랭킹 파이프라인

### 2.1 요청 하나가 지나는 길

```html-raw
<div class="fig">
<svg viewBox="0 0 760 250" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="Malgun Gothic, sans-serif">
  <defs>
    <marker id="a1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#555"/></marker>
    <marker id="a1r" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#b00000"/></marker>
  </defs>

  <text x="551" y="26" text-anchor="middle" font-size="12" fill="#b00000">트러블슈팅 1: 여기서 커넥션을 6,364ms 기다렸다 (4장)</text>
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
  <text x="470" y="216" text-anchor="middle" font-size="12" fill="#b00000">성능 개선: 여기서 지연 로딩으로 쿼리가 추가로 나갔다 (7장)</text>

  <text x="46" y="240" font-size="10.5" fill="#888">* 조회수 버퍼와 인기글 랭킹은 Redis를 거치며, 이 그림에서는 생략했습니다.</text>
</svg>
<div class="fig-cap">그림 2. 댓글 목록 요청 하나가 지나는 길. 4장의 문제는 커넥션 풀에서, 7장의 문제는 응답 DTO를 만드는 자리에서 일어났다.</div>
</div>
```

4장과 7장의 두 문제는 같은 요청 경로의 서로 다른 지점에서 일어났고, 둘 다 측정으로 먼저 잡았습니다.

### 2.2 인기글 랭킹 파이프라인

사용자가 가장 자주 보는 화면이 인기글 목록이라 이 경로를 먼저 설명합니다. 사용자 행동을 모아 점수로 바꾸고, 점수 순으로 정렬해 내보내는 파이프라인입니다.

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
  <text x="100" y="60" text-anchor="middle" font-size="11">명시적</text>
  <text x="100" y="76" text-anchor="middle" font-size="9.6" fill="#666">댓글 · 반응 · 스크랩</text>

  <rect x="25" y="104" width="150" height="42" rx="4" fill="#fff" stroke="#888" stroke-width="1.1"/>
  <text x="100" y="122" text-anchor="middle" font-size="11">암시적</text>
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
  <text x="670" y="60" text-anchor="middle" font-size="11">정렬 집합</text>
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
<div class="fig-cap">그림 3. 인기글 랭킹 파이프라인. 두 종류의 행동 신호를 다른 방식으로 모아 하나의 점수로 만들고, 시간 버킷 단위의 Sorted Set에 쌓아 목록으로 내보낸다.</div>
</div>
```

- 댓글·반응·스크랩처럼 사용자가 직접 한 행동은 트랜잭션이 커밋된 뒤(`AFTER_COMMIT`) 이벤트로 받아 점수에 반영합니다. 커밋 전에 반영하면 롤백된 행동이 순위에 남기 때문입니다.
- 조회수는 요청마다 DB에 쓰면 인기 게시글 한 행에 쓰기가 몰리므로, Redis에 모아 두었다가 1분 주기로 DB에 반영합니다. 반영에 실패한 게시글만 버퍼에 남겨 다음 주기에 다시 시도하고, 삭제된 게시글은 재시도해도 성공할 수 없으므로 반영된 것으로 처리해 버퍼에서 뺍니다.
- 인기 점수는 5분 주기로 다시 계산해 Redis Sorted Set에 넣습니다. 일별 리더보드와 5분 단위 실시간 버킷을 따로 두고, 버킷마다 TTL을 걸어 지난 순위가 메모리에 남지 않게 했습니다.

TTL은 Redis 어댑터가 키 이름을 보고 정하는 대신 수명을 아는 호출자가 넘기게 했습니다. 어댑터가 정하면 버킷 종류를 하나 추가할 때마다 어댑터도 같이 고쳐야 하기 때문입니다.

이 경로에 개인화나 추천은 없습니다. 점수는 모든 사용자에게 같고 인스턴스도 하나입니다. 여러 인스턴스에서의 스케줄러·이벤트 동작은 아직 설계하지 않았습니다.

## 3. 부하 테스트 환경과 계측 시스템

로컬에서 애플리케이션만 띄우고 재면 무엇이 느린지는 알 수 있어도 왜 느린지는 알기 어렵습니다. DB가 느린지, 커넥션이 모자란지, 컨테이너 CPU 한도에 걸렸는지를 가르려면 애플리케이션 바깥의 지표가 같이 필요했습니다. 그래서 컨테이너 9개(애플리케이션, MySQL, Redis, Prometheus, Grafana, exporter 3종, cAdvisor)로 부하와 관측을 함께 세운 환경을 따로 만들었고, 부하 생성기 k6는 밖에서 띄웁니다.

### 3.1 측정 한 번이 지나는 길

측정은 명령 한 번으로 시작해 리포트까지 자동으로 갑니다. 사람은 명령과 결과 사이에 개입하지 않습니다. 단계마다 무엇이 무슨 일을 하는지는 그림 아래 표에 적었습니다.

```html-raw
<div class="fig">
<svg viewBox="0 0 760 282" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="Malgun Gothic, sans-serif">
  <defs>
    <marker id="a9" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#555"/></marker>
  </defs>

  <text x="100" y="26" text-anchor="middle" font-size="10.5" fill="#888">① 준비</text>
  <text x="300" y="26" text-anchor="middle" font-size="10.5" fill="#888">② 부하와 관측</text>
  <text x="500" y="26" text-anchor="middle" font-size="10.5" fill="#888">③ 수집과 판정</text>
  <text x="675" y="26" text-anchor="middle" font-size="10.5" fill="#888">④ 산출</text>

  <g fill="#fff" stroke="#888" stroke-width="1.1">
    <rect x="25" y="40" width="150" height="44" rx="4"/>
    <rect x="25" y="96" width="150" height="44" rx="4"/>
    <rect x="25" y="152" width="150" height="44" rx="4"/>
  </g>
  <g text-anchor="middle" font-size="11" fill="#1a1a1a">
    <text x="100" y="58">데이터셋 복원</text>
    <text x="100" y="114">사전 점검</text>
    <text x="100" y="170">호스트 기록</text>
  </g>
  <g text-anchor="middle" font-size="9.6" fill="#666">
    <text x="100" y="74">검증된 DB 사본으로 되돌림</text>
    <text x="100" y="130">지금 재도 되는 상태인가</text>
    <text x="100" y="186">실행 직전 CPU 속도 측정</text>
  </g>

  <g fill="#fff" stroke="#888" stroke-width="1.1">
    <rect x="215" y="40" width="170" height="44" rx="4"/>
    <rect x="215" y="96" width="170" height="44" rx="4"/>
    <rect x="215" y="152" width="170" height="44" rx="4"/>
  </g>
  <g text-anchor="middle" font-size="11" fill="#1a1a1a">
    <text x="300" y="58">부하 생성기</text>
    <text x="300" y="114">측정 대상</text>
    <text x="300" y="170">지표 저장소</text>
  </g>
  <g text-anchor="middle" font-size="9.6" fill="#666">
    <text x="300" y="74">초당 요청 수를 고정해 보냄</text>
    <text x="300" y="130">애플리케이션 · MySQL · Redis</text>
    <text x="300" y="186">앱 · DB · Redis · 컨테이너 · 호스트</text>
  </g>

  <rect x="425" y="40" width="150" height="184" rx="4" fill="#fafafa" stroke="#888" stroke-width="1.1"/>
  <text x="500" y="56" text-anchor="middle" font-size="11" fill="#1a1a1a">수집기</text>
  <g fill="#fff" stroke="#bbb" stroke-width="1">
    <rect x="433" y="64" width="134" height="22" rx="3"/>
    <rect x="433" y="90" width="134" height="22" rx="3"/>
    <rect x="433" y="116" width="134" height="22" rx="3"/>
    <rect x="433" y="142" width="134" height="22" rx="3"/>
    <rect x="433" y="168" width="134" height="22" rx="3"/>
    <rect x="433" y="194" width="134" height="22" rx="3"/>
  </g>
  <g text-anchor="middle" font-size="10" fill="#1a1a1a">
    <text x="500" y="79">지표 조회 · 측정 구간만</text>
    <text x="500" y="105">쿼리 계측 · 요청당 쿼리 수</text>
    <text x="500" y="131">포화 판정 (4장)</text>
    <text x="500" y="157">대조군 선택 (5장)</text>
    <text x="500" y="183">회귀 판정 (6장)</text>
    <text x="500" y="209">리포트 생성</text>
  </g>

  <rect x="615" y="40" width="120" height="56" rx="4" fill="#fff" stroke="#444" stroke-width="1.2"/>
  <text x="675" y="59" text-anchor="middle" font-size="11.5" fill="#1a1a1a">실행 기록 1건</text>
  <text x="675" y="74" text-anchor="middle" font-size="9.6" fill="#666">결과 · 지표 · 조건 · 판정</text>
  <text x="675" y="87" text-anchor="middle" font-size="9.6" fill="#666">지금 108건</text>
  <g fill="#fff" stroke="#888" stroke-width="1.1">
    <rect x="615" y="112" width="120" height="32" rx="4"/>
    <rect x="615" y="152" width="120" height="32" rx="4"/>
    <rect x="615" y="192" width="120" height="32" rx="4"/>
  </g>
  <g text-anchor="middle" font-size="11" fill="#1a1a1a">
    <text x="675" y="126">리포트</text>
    <text x="675" y="166">이력 · 추세</text>
    <text x="675" y="206">공개 대시보드</text>
  </g>
  <g text-anchor="middle" font-size="9.6" fill="#666">
    <text x="675" y="139">실행 한 건의 HTML</text>
    <text x="675" y="179">전 실행을 한 화면에</text>
    <text x="675" y="219">민감 정보 지운 뒤 게시</text>
  </g>

  <g stroke="#555" stroke-width="1.2" marker-end="url(#a9)">
    <line x1="177" y1="62" x2="211" y2="62"/>
    <line x1="300" y1="86" x2="300" y2="92"/>
    <line x1="300" y1="142" x2="300" y2="148"/>
    <line x1="387" y1="62" x2="421" y2="62"/>
    <line x1="387" y1="174" x2="421" y2="174"/>
    <line x1="577" y1="68" x2="611" y2="68"/>
    <line x1="675" y1="98" x2="675" y2="108"/>
    <line x1="675" y1="146" x2="675" y2="148"/>
    <line x1="675" y1="186" x2="675" y2="188"/>
  </g>
  <g font-size="9.6" fill="#888">
    <text x="404" y="56" text-anchor="middle">부하 결과</text>
    <text x="404" y="168" text-anchor="middle">지표</text>
    <text x="306" y="147">지표</text>
  </g>

  <text x="25" y="252" font-size="10.5" fill="#888">명령 한 번이 ①부터 ④까지 순서대로 돈다. 같은 조건을 N회 반복하는 도구와 밤새 무인으로 돌리는 도구는 이 길을 여러 번 도는 것이다.</text>
  <text x="25" y="268" font-size="10.5" fill="#888">판정 셋(포화 · 대조군 · 회귀)은 사고를 겪은 뒤 하나씩 붙었다. 다음 세 장의 이야기다.</text>
</svg>
<div class="fig-cap">그림 4. 측정 한 번이 지나는 길. 명령 한 번이 준비, 부하와 관측, 수집과 판정, 산출을 순서대로 거치고 사람은 명령과 결과 사이에 개입하지 않는다.</div>
</div>
```

| 단계 | 구성 요소 | 하는 일 |
|---|---|---|
| ① 준비 | 데이터셋 복원 | 검증해 둔 DB 사본으로 되돌립니다. 앞선 실행이 남긴 데이터가 섞이지 않습니다 |
| | 사전 점검 | 지표 수집 경로, 데이터셋, 부하 크기가 측정에 맞는지 확인합니다. 통과해야 시작합니다 |
| | 호스트 기록 | 실행 직전에 CPU 속도를 5초 재 둡니다. 느려진 원인이 앱인지 환경인지 가를 때 씁니다 |
| ② 부하와 관측 | 부하 생성기 | k6가 초당 요청 수를 고정해 보냅니다. 시스템이 못 따라가면 도달률 미달로 드러납니다 |
| | 지표 저장소 | 앱, MySQL, Redis, 컨테이너, 호스트의 지표를 Prometheus가 모읍니다 |
| ③ 수집과 판정 | 지표 조회 | 부하를 건 구간만 잘라 지표를 읽습니다. 지표 정의는 표 한 곳에 있어 추가가 한 줄입니다 |
| | 쿼리 계측 | 엔드포인트마다 요청 하나에 쿼리가 몇 개 나갔는지, 어느 SQL이 몇 번 돌았는지 셉니다 |
| | 포화 판정 | 이 실행이 용량을 넘긴 상태였는지 다섯 신호로 판정합니다 |
| | 대조군 선택 | 이력에서 같은 조건의 실행만 골라 기준선으로 삼습니다 |
| | 회귀 판정 | 기준선과 비교해 나빠졌는지, 노이즈 안인지 판정합니다 |
| ④ 산출 | 실행 기록 | 결과, 지표, 조건, 판정이 한 묶음으로 남습니다. 지금 108건입니다 |
| | 리포트와 이력 | 실행 한 건의 HTML 리포트, 전체 추세 화면, 민감 정보를 지운 공개 대시보드를 만듭니다 |

### 3.2 실행 기록 하나에 남는 것

기록 하나에는 네 가지가 들어갑니다. k6가 잰 지연과 처리량과 도달률, Prometheus에서 읽은 자원과 DB 지표, 실행 조건, 판정입니다. 조건에는 시나리오, 데이터셋 스냅샷과 내용 해시, 부하 설정, 커밋이 들어갑니다.

판정은 값만 남기지 않습니다. 포화 판정은 신호마다 왜 그렇게 봤는지를 문장으로 같이 저장합니다. 커넥션 대기 신호에는 "커넥션 풀 앞에 대기줄이 생겼다. 요청 지연에 대기 시간이 포함된다"가 붙어 있습니다.

판정 셋은 각각 사고를 겪은 뒤에 붙였습니다. 그 이야기가 다음 세 장입니다.

## 4. 트러블슈팅 1 · 동일한 조건으로 반복 측정했을때 심각한 세션 드리프트가 발생

### 4.1 증상

같은 코드, 같은 데이터셋, 같은 커밋인데 며칠뒤 다시 부하/측정을 하니 세션 간 차이가 40% 까지 벌어졌습니다.

동일한 조건에서 편차가 40%의 차이가 난다면 대부분의 개선/악화가 편차에 묻혀 측정시스템 자체가 무의미해지는 심각한 문제였습니다.

저는 대부분의 조건이 동일하니 이러한 드리프트의 원인을 환경에서 찾으려 했습니다. 
호스트 CPU 주파수, 코어 배치, 하이퍼바이저 스케줄링, 전원 관리, 가상 디스크까지 확인했습니다. 여기에 오랜시간을 보냈고 결국 원인을 밝혀내지 못했습니다.

### 4.2 가설

원인을 다른 스크립트를 보고 추측했습니다. 

부하가 적은 시나리오는 반복 측정을 했을때 편차가 10% 내로 안정적으로 나오는 것을 확인하고선 자원이 포화 상태일때 모종의 이유로 편차가 극대화 되는것은 아닌지 의심했습니다.

기존 VU 200 고정으로 요청을 보내던 것에서 초당 고정적으로 요청 수를 보내는 것으로 수정하여 점진적으로 요청 수를 늘려보았습니다.

| 목표 도착률 | 실제 도달률 | p95 | 앱 CPU | 커넥션 대기 |
|---|---|---|---|---|
| 초당 3요청 | 99% | 690ms | 37% | 2건 |
| **초당 4요청** | **101%** | **402ms** | 52% | **0건** |
| 초당 5요청 | **77%** | **11,871ms** | 97% | 65건 |

부하를 25% 올리면 p95가 30배가 됩니다. 
자원이 고갈된 상태에서는 대기 큐에 계속 대기가 생기고 이는 처리량이 조금만 변해도 응답시간의 편차를 크게 증폭시키는 문제를 발생 시킵니다.

//여기는 넣을지 말지 고민중
대기행렬에서 이용률이 1에 가까워지면 대기 시간이 `1/(1-ρ)`로 발산하기 때문.(리틀의 법칙)  

### 4.3 원인

200 VU의 사용자 수를 고정한 환경에서는 리틀의 법칙에 따라 응답 시간이 `사용자 수 ÷ 처리량`으로 결정된다는 것을 알게되었습니다.

따라서 사용자의 수가 고정이니 응답시간은 오로지 처리량에 의해서 결정되고 처리량에 조금의 변동만 생겨도 응답시간의 편차를 크게 증폭시키는 문제가 생긴 것이었습니다.


| 지표 | 값 | 뜻 |
|---|---|---|
| 커넥션 획득 p95 | 6,364ms | p95 10,685ms 중 6,364ms가 커넥션을 기다린 시간 |
| 커넥션 대기 건수 평균 | 145 | 커넥션 10개를 145개 요청이 기다림 |
| 사용 코어 | 1.998 / 2.0 | CPU 상한에 붙어 있음 |
| 시나리오 기대 처리량 | 45~55 RPS (실측 17~28) | 계획한 부하를 소화하지 못하는 중 |

//위의 결과표를 잘 활용하지 못하겠음. 포화상태일때의 응답시간이 앱자체의 품질로 인한 지연이 아닌 하드웨어 자원이 부족하여 이를 기다리느라 대부분의 지연이 발생하기에 둘은 어느정도 분리하여 해석할 필요가 있다는 것은 맞지만 이게 세션 드리프트를 설명할때 필요한 것이 맞는지 이해가 안됨.



### 4.4 고친 것 

- **Closed model -> Open model.** 기존에 사용자 수를 고정하여 부하를 주던 방식을 초당 요청 도착률로 변경하여 고정적으로 부하가 가해지도록 했습니다.
- **성능변화 판정용 부하에서는 자원이 포화되지 않는 부하로 고정** 자원이 포화되지 않을 만큼의 부하만 가해 CV의 편차를 낮춰 개선의 정도를 더 명확하게 판단 가능하도록.
- **포화여부를 판정하고 알려줌.** 커넥션 대기, CPU 상한 도달, CPU 사용률, 커넥션 획득 시간 비중, 도달률 다섯 신호를 보고 리포트에서 포화 여부를 판정해 알려줌으로서 사용자가 이 결과를 성능개선의 자료로 사용하는데에 주의할 것을 알려줌.


```html-raw
<div class="fig">
  <div class="flow">
    <div class="flow-step"><b>HEADROOM</b><span>여유 있음<br>지연으로 읽어도 됨</span></div>
    <div class="flow-arrow">›</div>
    <div class="flow-step"><b>NEAR_LIMIT</b><span>큐가 생기기 시작<br>해석 주의</span></div>
    <div class="flow-arrow">›</div>
    <div class="flow-step"><b>SATURATED</b><span>p95는 대기 시간<br><b style="display:inline">인용 금지</b></span></div>
    <div class="flow-arrow">›</div>
    <div class="flow-step"><b>UNKNOWN</b><span>판정에 필요한<br>지표가 없음</span></div>
  </div>
  <div class="fig-cap">그림 5. 실행마다 붙는 포화 판정. SATURATED로 판정된 실행의 지연값은 리포트에서 성능 근거로 인용되지 않는다.</div>
</div>
```

포화된 테스트를 실패로 판정하여 이전 대조군과의 비교를 막지는 않았다.
기준선을 별도로 분리하는 경우는 이전 대조군과의 비교가 무의미할때만 분리하는 것이 옳다고 판단했다.

포화상태는 자연스러운 상태이며 비포화상태/포화상태를 비교하여 얻는 정보는 유의미하다.
그렇기에 비교는 하되 WARN으로 표시하여 사용자에게 온전한 성능 비교를 하기엔 위험하다는 것만 알린다.


## 5. 트러블슈팅 2 · 회귀 판정기의 잘못된 대조군 선택

### 5.1 증상

성능 회귀를 자동으로 잡는 판정기를 만들었고 이 판정기가 p95가 101ms에서 60,001ms로 나빠졌다고, +59,000% 회귀라고 보고하는 사건 발생. 

### 5.2 원인

데이터의 규모가 전혀 다른 데이터셋을 사용하여 100배 이상 차이가 나는 이력을 이전 실행이라는 이유만으로 대조군으로 선정.

여기서 회귀 테스트는 단순히 이전 실행과 비교하는게 아닌 대조군으로서의 조건을 충족해야만 비교할 수 있도록 해야한다고 판단함.


### 5.3 고친 것

어디까지는 비교를 허용하고 어디까지는 허용하지 않을 것인가를 선택.

비교 불가능조건
-데이터 변경(DB 스냅샷 상태)
-부하 시나리오 변경()
-부하 정도 변경
-환경조건 변경
-성능 측정 구간 변경

비교 가능조건
-

실행 조건을 두 종류로 나눴습니다. 부하 크기나 데이터 규모처럼 비교 자체를 무효로 만드는 조건과, 신뢰도만 낮추는 조건입니다. 앞의 조건만으로 "같은 실험"을 식별하는 해시를 만들고, 대조군은 그 해시가 같은 실행 중에서만 고르게 했습니다.

조건 목록은 표로 빼 두어, 조건이 하나 늘면 표에 한 줄을 더하는 것으로 대조군 선택과 리포트, 추세 그래프 분리가 함께 따라오게 했습니다.

## 6. 노이즈를 먼저 재서 정한 개선 판정 기준

"p95가 20% 나빠지면 회귀"라고 말하려면, 아무것도 바꾸지 않고 같은 조건을 반복했을 때의 편차가 20%보다 작아야 합니다. 그 편차를 모르면 20%는 근거 없는 숫자입니다.

그래서 같은 조건을 5회 반복 실행해 변동계수(표준편차 ÷ 평균)를 재고, 거기서 최소 검출 가능 효과를 구했습니다. 그보다 작은 변화는 개선으로 인정하지 않습니다.

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
  <div class="fig-cap">그림 6. 개선이라고 적기까지의 순서. 하나라도 통과하지 못하면 그 수치를 인용하지 않는다.</div>
</div>
```

### 6.1 제가 확정했던 값을 무효 처리한 일

처음 확정한 변동계수는 3.12%였습니다. 그런데 이 값이 포화 상태에서 잰 것임을 뒤늦게 알았습니다. 그래서 그 값을 무효로 하고 포화 이하에서 다시 쟀습니다.

3.12%는 한자리에서 몰아 잰 5회 안의 값입니다. 몇 시간 뒤에 같은 조건을 다시 재면 25~45% 차이가 났습니다. 포화에서는 노이즈의 크기 자체가 재현되지 않아서, 그 값으로 정한 기준이 다음 실행에서 유지되지 않았습니다.

| | 이전(포화) | 이후(포화 이하) |
|---|---|---|
| p95의 변동계수 | 3.12% | **9.6~15.8%** |
| p95의 절대 표준편차 | 369ms | **27~58ms** |

퍼센트는 나빠졌지만 실제 흔들림은 6~14배 줄었습니다. 분모인 평균 p95가 1만 ms대에서 200~300ms대로 내려갔기 때문입니다. 이 구분을 못 하면 "측정 환경을 고쳤더니 재현성이 3배 나빠졌다"는 반대 결론에 이릅니다.

다시 잰 값에서 나온 검출 한계는 약 16%입니다. 댓글 목록 API의 개선폭 40.1%는 이 한계를 넘습니다.

## 7. 댓글 목록 API N+1 제거, 요청당 쿼리 1,507개 → 4개

### 7.1 코드에 보이지 않던 쿼리 1,507개

댓글 목록 API 한 번에 쿼리가 1,507개 나갔습니다. 그런데 서비스에도 컨트롤러에도 쿼리처럼 보이는 코드가 없었습니다. 쿼리는 DTO를 만드는 순간 나가고 있었습니다.

```java
// dtos/CommentDto.java · fromEntity
.userId(comment.getUser().getId())            // 지연 로딩 프록시 초기화 → SELECT 1회
.author(comment.getUser().getNicknameValue()) // 이미 초기화됨 → 추가 쿼리 없음
```

두 종류였습니다. 댓글 한 건마다 내 좋아요/싫어요를 따로 조회하는 것(댓글 수 × 2)과, 작성자 지연 로딩이 하나씩 풀리는 것(서로 다른 작성자 수만큼. 같은 사람의 두 번째 댓글부터는 1차 캐시에서 나옵니다)입니다. 코드를 읽으면 여기까지는 짐작할 수 있지만, 그것이 1,507개 중 몇 개인지는 세어 봐야 압니다. 그래서 개선보다 먼저 엔드포인트별 요청당 쿼리 수를 재는 계측을 붙였습니다.

### 7.2 두 번의 개선

```html-raw
<div class="fig">
  <div class="bar-row"><span class="bar-label">최초</span><span class="bar-track"><span class="bar-fill" style="width:100%"></span></span><span class="bar-val">1,507</span></div>
  <div class="bar-row"><span class="bar-label">반응 일괄 조회 후</span><span class="bar-track"><span class="bar-fill" style="width:7.4%"></span></span><span class="bar-val">112</span></div>
  <div class="bar-row"><span class="bar-label">작성자 fetch join 후</span><span class="bar-track"><span class="bar-fill after" style="width:0.26%"></span></span><span class="bar-val">4 (3.9)</span></div>
  <div class="fig-cap">그림 7. 댓글 목록 API의 요청당 쿼리 수. 마지막 막대는 전체의 0.26%라 선으로만 보인다.</div>
</div>
```

| 단계 | 무엇을 바꿨나 | 요청당 쿼리 | p95 |
|---|---|---|---|
| 최초 | | 1,507 | 226.7ms |
| 1차 | 내 반응 확인을 댓글별 조회에서 일괄 조회로 | **112** (−92.6%) | 57.2ms (−74.8%) |
| 2차 | 작성자를 목록 쿼리에서 fetch join으로 함께 읽기 | **4** (5회 평균 3.9, −96.5%) | **34.3ms** (−40.1%) |

두 번에 나눈 것은 "한 번에 변수 하나"를 지키려는 이유도 있었지만, 실제로 2차의 대상을 정한 것은 재계측이었습니다. 1차를 적용하고 다시 재니 남은 112개 중 약 108개가 작성자 조회였습니다. 1차 문서에 "없앨 쿼리 약 108개"라고 예측을 적어 두었는데, 2차 실측이 108.3개였습니다. 1차는 2026년 9월 1일, 2차는 9월 4일에 측정했고, 기록은 [OPT-001](https://github.com/JangHyeok2909/highteenday-backend/tree/main/performance/optimizations)과 [OPT-002 문서](https://github.com/JangHyeok2909/highteenday-backend/blob/main/performance/optimizations/OPT-002-comment-author-fetch-join.md)에 있습니다.



```java
// 변경 전
@Query("select c from Comment c where c.isValid=true and c.post=:post")
// 변경 후
@Query("select c from Comment c join fetch c.user where c.isValid=true and c.post=:post")
```

`@ManyToOne` 관계의 fetch join이라 결과 행 수가 변하지 않고, 컬렉션 fetch join에서 생기는 중복 제거나 메모리 페이징 경고도 없습니다. 작성자 컬럼이 `nullable = false`라 `left join` 대신 내부 조인을 썼습니다.

### 7.3 데이터 크기와 무관해진 쿼리 4개

| 게시글 | 댓글 수 | 서로 다른 작성자 | 개선 전 | 개선 후 |
|---|---:|---:|---:|---:|
| A | 6 | 5 | 9 | **4** |
| B | 492 | 130 | 134 | **4** |
| C | 4,040 | 450 | 454 | **4** |

남은 4개는 인증 1, 게시글 1, 댓글 목록 1, 반응 일괄 조회 1로, 댓글 수에도 작성자 수에도 비례하는 항이 없습니다.

### 7.4 검토하고 버린 대안

| 대안 | 쿼리 수 | 버린 이유 |
|---|---|---|
| `@BatchSize(100)` | 1 + ⌈U/100⌉ | 1로 내려가지 않습니다(작성자 450명이면 5개). 엔티티에 붙는 설정이라 그 연관을 쓰는 모든 경로가 함께 바뀝니다 |
| 전역 배치 페치 크기 | 1 + ⌈U/n⌉ | 같은 문제에 영향 범위만 넓습니다. "한 번에 변수 하나"를 지킬 수 없습니다 |
| `@EntityGraph` | 1 | 효과는 같지만, 이 메서드는 이미 JPQL을 직접 쓰고 있어 조건(JPQL)과 함께 읽을 대상(애너테이션)이 두 곳으로 갈립니다 |
| DTO 프로젝션 | 1 | 가장 좋은 안입니다. 전송량까지 줄어듭니다. 그런데 호출부 셋을 같이 고쳐야 해서 변수가 둘 이상이 되고 측정이 무의미해집니다. 별도 과제로 남겼습니다 |
| 작성자만 2차 일괄 조회 | 2 | 왕복이 하나 더 필요한 대가로 얻는 것이 전송량뿐이라 지금은 버렸습니다. 중복 읽기 비용이 이득을 넘으면 이 안으로 돌아옵니다 |

### 7.5 검증 세 가지

**① fetch join을 빼면 실패하는 테스트.** 지키려는 계약이 "작성자를 함께 읽는다"라서, Hibernate 통계로 실행된 문장 수를 테스트로 고정했습니다. fetch join을 빼면 문장 수가 1에서 4로 늘며 실패하는 것까지 확인했습니다. 여기서 중요한 한 줄은 `em.clear()`입니다. 영속성 컨텍스트를 비우지 않으면 준비 단계의 사용자들이 1차 캐시에 남아 fetch join이 없어도 추가 쿼리가 나가지 않고, 그 테스트는 통과하지만 아무것도 검증하지 못합니다.

**② 부하 없는 단일 요청 실측.** 잡음이 0이라 통계가 필요 없습니다. 위 표의 세 게시글에서 예측과 실측이 정확히 일치했습니다.

**③ 응답 정합성 전량 대조.** 쿼리 모양이 바뀌었으므로 응답이 같은 값을 내는지 DB와 직접 맞췄습니다. 댓글 4,046건짜리 게시글에서 확인한 결과입니다.

```
응답 댓글 수 4,046건 = DB 4,046건
실명 댓글 1,586건의 (댓글 id, 작성자 id, 닉네임)  →  API에만 있는 조합 0건, DB에만 있는 조합 0건
익명 댓글 2,460건  →  작성자 식별자 노출 0건, 프로필 이미지 노출 0건
```

쿼리를 바꿔도 익명성이 유지되는지는 성능과 별개로 확인해야 해서, 익명성 원칙을 그대로 검증 기준으로 썼습니다.

### 7.6 부작용과 빗나간 예측

fetch join은 댓글 행마다 작성자 행을 붙여 읽어서, 댓글 4,040개에 작성자 450명이면 같은 사용자 행을 평균 9회 중복해 읽습니다. 착수 전에 이것이 이득을 상쇄할 수 있다고 봤고, 측정은 양쪽을 다 보여 줬습니다.

| 지표 | 개선 전 | 개선 후 | 변화 |
|---|---|---|---|
| MySQL 초당 읽은 행 | 5,935 | 7,294 | +22.9% (중복 읽기의 직접 증거) |
| MySQL 초당 쿼리 | 544.3 | 274.8 | −49.5% |
| 요청당 DB CPU 시간 | 8.43ms | 6.35ms | **−24.6%** |

행 읽기는 23% 늘었는데 DB CPU 시간은 25% 줄었습니다. 왕복 108회를 없앤 이득이 더 컸기 때문입니다. 버퍼풀 적중률이 100%라 중복 읽기가 디스크 접근을 만들지 않은 덕도 있어서, 데이터가 버퍼풀보다 커지면 작성자만 2차 일괄 조회하는 안으로 돌아갈 수 있습니다.

착수 전에 적어 둔 예측과도 대조했습니다.

| 항목 | 예측 | 실측 |
|---|---|---|
| 없앨 쿼리 수 | 약 108 | 108.3 |
| 없앨 DB 시간 | 약 21ms | 17.2ms |
| p95 개선폭 | 20% 안팎이 상한 | **40.1%** |

쿼리 수와 DB 시간은 맞았는데 p95 개선폭만 상한을 2배 넘겼습니다. 상한을 평균 절감치로 계산했기 때문입니다. p95를 만드는 것은 댓글이 많은 게시글의 요청이고, 그런 요청에서 없앤 쿼리는 평균 108개가 아니라 최대 450개였습니다.

### 7.7 같은 계측이 가리킨 다음 병목

남은 N+1을 다 걷어낸 뒤에도 느린 쿼리 건수는 그대로였습니다(+1.1%). 같은 계측이 성격이 다른 병목 둘을 더 보여 줬습니다.

- 게시글 검색은 요청당 쿼리가 6.2개로 적지만 쿼리 하나에 13.6ms가 걸립니다. 5회차 전부 최솟값이 65.7~78.9ms입니다. 원인은 `LIKE '%키워드%'`라 인덱스를 못 타는 것입니다. FULLTEXT + ngram, 접두사 검색, 검색 엔진 분리, 결과 캐싱을 비교했고 1순위는 FULLTEXT + ngram입니다. 검색 결과의 순서와 매칭 규칙이 달라지는 기능 변경이라 착수 전에 확인할 것이 남아 있습니다.
- 댓글 작성은 요청당 DB 시간이 3.55ms인데 응답 시간은 41.66ms입니다. 91%가 DB 밖의 시간입니다(읽기 API는 3~5ms). 후보는 둘입니다. 알림 생성·인기 점수 갱신 리스너가 동기로 실행되어 요청 스레드가 기다리는 것, 그리고 알림 저장이 `REQUIRES_NEW`라 요청 하나에 커밋이 두 번(fsync 4회) 일어나는 것입니다. 둘의 몫을 가르지 않고 고치면 무엇이 효과였는지 알 수 없어서 아직 착수하지 않았습니다.

## 8. 스크랩 중복 행이 만든 게시글 조회 장애와 유니크 제약

### 8.1 증상

스크랩 토글 API는 "있으면 지우고 없으면 만든다"를 조회한 뒤 판단하는 구조였습니다. 동시에 두 요청이 들어오면 둘 다 "없다"를 보고 둘 다 만듭니다. 부하 테스트에서 이 중복 행이 실제로 만들어졌고, 더 나쁜 일이 뒤따랐습니다. 게시글 상세 조회가 스크랩 여부를 한 건으로 가정하고 있어서, 중복 행이 있는 게시글은 상세 화면 전체가 실패했습니다.

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
  <text x="245" y="88" text-anchor="middle" font-size="10.5" fill="#666">둘 다 &ldquo;없다&rdquo;를 본다</text>
  <text x="245" y="107" text-anchor="middle" font-size="10.5" fill="#666">조회 후 삽입 경쟁 상태</text>

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
  <text x="452" y="188" text-anchor="middle" font-size="12.5">해결: 유니크 제약 + upsert</text>
  <text x="452" y="207" text-anchor="middle" font-size="10.5" fill="#555">중복이 애초에 저장되지 않는다. 애플리케이션 락도, 재시도도 필요 없다.</text>

  <text x="25" y="240" font-size="10.5" fill="#888">스크랩 저장의 경쟁 상태가 게시글 조회 장애로 이어진 경로.</text>
</svg>
<div class="fig-cap">그림 8. 결함이 전파된 경로. 잘못 저장된 행이 그 자리에 머물지 않고, 그 값을 읽는 다른 API를 통해 장애로 커졌다.</div>
</div>
```

### 8.2 왜 유니크 제약인가

DB 유니크 제약을 걸고 삽입을 upsert로 바꿔 해결했습니다. 분산 락은 쓰지 않았습니다.

| 방법 | 판단 |
|---|---|
| 애플리케이션 동기화 | 인스턴스가 늘면 무력합니다 |
| 분산 락(Redis 등) | 구성 요소를 하나 더 늘리고, 락 획득 실패·만료·시계 문제를 새로 떠안습니다. 지금 구조에서 얻는 것보다 비용이 큽니다 |
| 격리 수준 상향 | 이 경쟁 상태는 같은 키의 삽입 충돌이라 격리 수준을 올려도 막히지 않습니다 |
| **유니크 제약 + upsert (채택)** | DB가 이미 제공하는 직렬화 지점을 씁니다. 중복이 애초에 저장되지 않고 재시도도 필요 없습니다 |


## 9. p99 30ms 전역 목표를 그룹별 목표로 재설정

7장 이후 p99는 80.9ms였습니다. p99를 30ms 안에 넣으려면 무엇을 더 해야 하는지 계산해 봤습니다.

```
측정 구간 전체 요청   34,471건 (개선 후 5회 합계)
30ms 초과            4,053건 = 11.76%
목표                   345건 이하 = 1.00%

login 최솟값   71.4  70.6  74.8  73.2  73.7 ms   (5회차 전부)
login 건수     585건 = 전체의 1.70%
```

가장 빠른 로그인조차 목표의 2.4배이고 로그인이 전체 요청의 1.70%입니다. 목표 허용치가 1.00%이므로 다른 모든 요청이 0ms가 되어도 전역 p99는 로그인 분포 안에 떨어집니다. 그리고 로그인이 느린 원인은 BCrypt strength 10의 해싱이고, 70~90ms는 무차별 대입을 늦추려고 일부러 느리게 설계된 값입니다. strength를 낮추면 목표에 가까워지지만, 해싱 강도를 낮추는 보안 결정이라 하지 않았습니다. 전역 목표를 80ms로 완화하는 안, 로그인만 통계에서 빼는 안, 세션을 늘려 로그인 횟수를 줄이는 안도 검토했지만, 각각 다른 API의 회귀를 숨기거나 예외 규칙을 만들거나 지연 목표 때문에 인증 설계를 바꾸는 것이라 버렸습니다.

대신 그룹별 목표로 나눴습니다.

| 그룹 | 목표 p99 | 현재 | 도달하려면 |
|---|---|---|---|
| 읽기(상세·게시판 목록·채팅방) | 30ms | 12~24ms | 유지 |
| 목록(댓글·게시글·인기글) | 30ms | 48~97ms | 댓글 목록 페이징 |
| 쓰기(작성·반응) | 50ms | 84~135ms | 동기 리스너·이중 커밋 정리 |
| 검색 | 30ms | 206ms | FULLTEXT 전환 |
| 인증(로그인) | 150ms | 910ms | 큐잉 완화. 해싱 강도는 유지 |

이렇게 나누면 목표마다 무엇을 고쳐야 도달하는지가 붙습니다. 쓰기만 50ms인 이유는 커밋 fsync가 하한을 만들기 때문입니다.

## 10. 일하는 방식

### 10.1 기록

혼자 개발하는 기간이 길어지면서 몇 달 전의 제 판단을 따라가기 위한 기록이 필요했습니다. 결함(틀린 것), 병목(느린 것), 측정 시스템 발견(잘못 재는 것)으로 나눠 관리하고, 병목 → 실험 → 최적화를 하나의 사슬로 연결합니다(병목 14건, 실험 7건, 최적화 2건). 실험 없이 적용한 변경은 최적화 기록에 올리지 않고, 채택안뿐 아니라 검토하고 버린 대안과 그 이유를 같이 적습니다.

### 10.2 AI 도구는 이렇게 씁니다

AI 에이전트를 적극적으로 씁니다. 다만 무엇을 만들지와 그것이 맞는지 어떻게 확인할지를 먼저 정하고, 그다음에 위임합니다.

| 제가 먼저 정하는 것 | 위임하는 것 |
|---|---|
| 무엇을 문제로 볼 것인가. 이 병목을 지금 고칠 가치가 있는가 | 코드 작성 |
| 기능 범위와 경계. 무엇을 바꾸고 무엇을 건드리지 않을 것인가 | 정형 변환, 반복 작업 |
| 대안 비교와 선택. 버린 대안 표는 제가 만든 판단입니다 | 테스트 골격 |
| 검증 방법. 단위·통합 테스트, 실패해야 하는 테스트, 응답 전량 대조 | 문서 초안, 보고 |

fetch join 테스트는 "빼면 실패해야 한다"는 조건을 구현 전에 정해 둔 것입니다. 그 조건이 없었다면 `em.clear()`를 빠뜨린 채 통과하는 테스트가 만들어졌을 것입니다. 실패 조건은 제가 정했고, 테스트 코드 작성은 위임했습니다.

## 11. 한계와 다음 할 일

```html-raw
<table>
<colgroup><col style="width:20%"><col style="width:37%"><col></colgroup>
<thead><tr><th>한계</th><th>지금 상태</th><th>다음</th></tr></thead>
<tbody>
<tr><td>운영 트래픽이 아닙니다</td><td>전부 부하 테스트 환경의 측정입니다</td><td>운영 지표 수집과 경보 규칙 설계</td></tr>
<tr><td>단일 인스턴스입니다</td><td>여러 인스턴스에서의 스케줄러·이벤트 동작을 설계하지 않았습니다</td><td>스케줄러 단일 실행 보장, 이벤트 유실 대응</td></tr>
<tr><td>댓글 목록 페이징 없음</td><td>쿼리는 4개로 고정됐지만 응답 크기가 댓글 수에 비례합니다(30ms 초과 요청의 41.8%)</td><td>익명 번호가 게시글 전체 댓글의 등장 순서라 페이지로 자르면 어긋납니다. 번호 규칙부터 정해야 합니다</td></tr>
<tr><td>검색·쓰기 경로 미개선</td><td>진단과 대안 비교까지 끝났습니다</td><td>검색은 FULLTEXT 검증, 쓰기는 두 원인의 몫부터 가르기</td></tr>
<tr><td>토글 API가 멱등하지 않음</td><td>응답이 유실되어 클라이언트가 재시도하면 좋아요가 취소됩니다</td><td>상태를 명시하는 API로 재설계</td></tr>
</tbody></table>
```
