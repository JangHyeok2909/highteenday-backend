# Dan Luu — 측정 기반 사례 연구의 문서 구조

> **확보일** 2026-09-07 · **원문 언어** 영어 · **저장 범위** 색인 페이지 구조, 사례 연구 두 편의 절 구조·첫 문장·수치 전부
>
> | 출처 | 주소 | 확보 방법 |
> |---|---|---|
> | 색인(홈) | https://danluu.com/ | WebFetch |
> | *The container throttling problem* (2021-12) | https://danluu.com/cgroup-throttling/ | WebFetch (절 구조·수치 추출) |
> | *Some latency measurement pitfalls* (2021-12) | https://danluu.com/latency-pitfalls/ | WebFetch (절 구조·수치 추출) |

## 누구이고 왜 모범 사례인가

- **누구** Dan Luu. Twitter 인프라·성능 엔지니어(확보한 두 글이 2019년 사내 문서와 2021년 결과 추가분이다), 그전 Microsoft·Google. 블로그가 "측정하고 데이터로 말하는 글"의 대명사로 통한다. 대표 글: *Files are hard*, *Computer latency: 1977-2017*, *A decade of major cache incidents at Twitter*, *Measurement, benchmarking, and data analysis are underrated*.
- **왜 모범 사례인가** 두 편 다 **사내 문서를 공개용으로 옮긴 것**이라, 회사 안에서 성능 조사가 어떤 문서 구조로 돌아가는지 보여준다. 특히 *latency pitfalls*는 "측정이 거짓말한 세 가지 방식"을 다루므로 사용자 포트폴리오 3~5장의 직접적 선례다.
- **한계** Twitter 규모(수천 대, 수백 서비스)의 이야기다. 구조만 가져온다.

---

## 1. 색인 페이지 뼈대

- 제목 없이 **`월/연도 · 글 제목`** 한 줄씩, 최신순. 설명 없음. 공개 글 약 120편 아래 Patreon 글 목록이 별도.
- 특이 항목: *Major errors on this blog (and their corrections)* (2021-11) — **자기 글의 큰 오류와 정정을 모아 둔 페이지**가 색인에 같은 급으로 올라 있다.
- 사용자와 겹치는 제목들: *Some latency measurement pitfalls* · *The container throttling problem* · *95%-ile isn't that good* · *Goodhearting IQ, cholesterol, and tail latency* · *Sampling v. tracing* · *A simple way to get more value from metrics* · *Why is it so hard to measure things?* 류의 "Exercises in benchmarking and experimental design" 연작(Patreon, 6부).

## 2. *The container throttling problem* — 사내 성능 조사 문서의 뼈대

첫 문장(원문): *"This is an excerpt from an internal document David Mackey and I co-authored in April 2019. The document is excerpted since much of the original doc was about comparing possible approaches to increasing efficency at Twitter, which is mostly information that's meaningless outside of Twitter without a large amount of additional explanation/context."*

| # | 절 | 역할 | 수치·근거 |
|---|---|---|---|
| 1 | The problem, in theory | 메커니즘을 먼저 설명 | CFS bandwidth control, 스레드 풀이 예약 코어보다 큼, 1초 미만 GC 정지가 벽시계로 수 초 |
| 2 | The problem, in practice [case study] | **가장 큰 서비스 하나로 실증** | service-1: 예약 20코어, 평균 사용 8코어(할당량의 40%), 샘플링 10ms vs 할당 주기 100ms, 이전 히스토그램 대비 1.6배 부하, 조정 후 약 2배 용량 또는 지연 20% 감소, 절감액 연 7자리 중반 달러(복제본 포함 8자리 초반) |
| 3 | Thread usage across the fleet | **한 사례가 아니라 전체 경향임을 보임** | 100샤드 이상 서비스 대부분이 예약 코어보다 실행 가능 스레드가 많음. 코어당 1.5~2 runnable threads. 관행 "스레드 풀 = 논리 코어 2배" |
| 4 | Potential Solutions (a~i) | **대안 9개, 각각 "Potential impact:" 한 줄** | 4a 기본값 개선(*small gains*), 4b 공유 라이브러리로 풀 크기 협상(*can mostly mitigate the problem for most services*), 4c CFS period 조정(기본 100ms, 최악 95ms 스로틀), 4d slice 조정(기본 5ms), 4e 기타 스케줄러 튜닝, 4f CFS 개선, 4g CPU 핀닝·격리(k8s CPU Manager, Intel·Facebook 사례), 4h 클러스터 스케줄러 과할당, 4i CFS quota 비활성화(shares로 대체) |
| 5 | Results | **2년 반 뒤에 덧붙인 결과** (*"This section was not in the original document from April 2019; it was written in December 2021"*) | Finagle Offload Filter: 서비스별 15~60% 비용 절감. 커널 패치: 튜닝 안 된 풀을 가진 전형 서비스에서 약 50% 절감. 샤드 작업: CPU 0~20%·메모리 10~40% 절감 |
| 6 | Appendix | 관련 외부 작업 | 참고 목록 |
| 7 | 감사 | 검토자 이름 나열 | 14명 |

## 3. *Some latency measurement pitfalls* — "측정이 숨기는 것" 세 가지

첫 문장(원문): *"This is a pseudo-transcript ... of a short lightning talk I did at Twitter a year or two ago, on pitfalls of how we use latency metrics ... Since this presentation, significant progress has been made on this on the infra side, so the situation is much improved over what was presented"*

| # | 절 | 무엇을 하고 있었나 → 무엇이 가려졌나 | 수치 |
|---|---|---|---|
| 1 | Opaque, uninstrumented, latency | 서버 자체가 잰 지연으로 대시보드·알림을 만든다 → 클라이언트가 본 지연이 다르다 | 서버 p99 약 16ms vs 클라이언트 p99 약 240ms (**15배**). 클라이언트의 99%ile 값이 서버에서는 99.9%ile 밖 |
| 2 | Lack of cluster-wide aggregation capability | 샤드별로 미리 집계한 지표만 있다 → 클러스터 전체 백분위를 복원할 수 없다 | 100노드 중 1노드의 꼬리 지연이 10배 되면 평균은 1.09배(0.99 + 0.01×10)만 움직인다 |
| 3 | Minutely resolution | 1분 단위로만 수집 → 1분 안의 사건이 지워진다 | 30초 저요청 구간 관찰. 보고된 p99 0.37ms vs 실제 p99 약 580ms (**세 자릿수 차이**) |
| 4 | Summary | **비용을 명시** | *"we have to have to provision a very large amount of slack and keep latency SLOs that are much stricter than the actual latencies we want to achieve"* — 온콜 수고와 과잉 프로비저닝 비용 |
| 5·6 | Appendix | 개방 루프 vs 폐쇄 루프 측정, 비가중 평균의 문제 | |

## 4. 뼈대에서 읽히는 것

- **이론 → 실증(한 사례) → 일반화(전체) → 대안 → 결정 → 결과.** 사내 성능 문서의 표준 순서다. 사용자 포트폴리오 6장(개선)이 이 순서와 거의 같고, 3~5장은 "실증" 부분이 사건 서사로 늘어난 형태다.
- **대안마다 "Potential impact" 한 줄.** 9개 대안이 모두 예상 효과의 크기를 갖는다. "버린 대안 표"에 **버린 이유** 외에 **예상 효과**를 열로 추가하면 이 형식이 된다.
- **결과는 시간이 지난 뒤 덧붙이고, 덧붙였다고 밝힌다.** 원 문서(2019)와 결과(2021)를 섞지 않는다.
- **비용을 돈이나 운영 부담으로 환산한다.** "느리다"가 아니라 "슬랙을 과하게 잡아 비용이 든다".
- **측정 함정 글의 구조**: 각 절이 "우리가 하던 방식 → 그 방식이 못 보는 것 → 두 값의 차이"다. 사용자의 "포화 상태의 p95는 코드가 아니라 대기줄"이 정확히 이 형식이다.
- **정정 페이지.** 틀렸던 글을 모아 둔 페이지가 신뢰의 근거로 작동한다. 사용자의 "스스로 무효 처리한 확정치"(5.3절)가 같은 종류다.
