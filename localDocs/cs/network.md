# 네트워크·HTTP

판정 기준과 칸 설명은 [README](README.md)에 있다.

사례는 소켓 타임아웃·연결 재사용·연결 거부처럼 장애 실험에서 부딪힌 전송 계층 거동에 몰려 있다.
TCP 제어 방식, TLS, DNS 같은 표준 질문은 사례도 정리도 없다. 개념 문서에 네트워크 장이 없기
때문이다. NW-03·NW-04·NW-08은 장애 실험 중 패킷을 떠서 채울 수 있다([README](README.md) 실험 표).

| # | 질문 | 겪은 사례 | 정리한 곳 | 판정 |
|---|---|---|---|:-:|
| NW-01 | OSI 7계층과 TCP/IP 4계층은? 각 계층에 무엇이 있나? | | | |
| NW-02 | TCP와 UDP의 차이와 각각 쓰는 곳은? | | | |
| NW-03 | TCP 3-way handshake 과정은? 왜 세 번인가? | | | |
| NW-04 | TCP 4-way handshake와 TIME_WAIT는? 왜 기다리나? | | | |
| NW-05 | TCP는 신뢰성을 어떻게 보장하나(순서 번호·ACK·재전송)? | | | |
| NW-06 | 흐름 제어와 혼잡 제어의 차이는? | | | |
| NW-07 | 혼잡 제어 알고리즘(slow start·AIMD)은 어떻게 동작하나? | | | |
| NW-08 | 닫힌 포트에 연결하면 무엇이 오나? 상대가 답을 안 하는 경우와 어떻게 다른가? | crash는 연결 거부로 즉시 실패, freeze는 무응답으로 타임아웃까지 대기: [DB 무응답 대기][unavailable], [freeze 대기][freeze-gap] | | |
| NW-09 | 소켓의 연결 타임아웃과 읽기 타임아웃은 각각 무엇을 자르나? | `socketTimeout=2000` 뒤 커넥션이 pause 2,184ms에 끊김(`mysql-freeze-2026-09-22T08-33-55` 앱 로그). 연결·읽기·풀 대기 상한의 차이: [freeze 대기][freeze-gap] | | |
| NW-10 | HTTP Keep-Alive와 커넥션 재사용의 이점과 함정은? | 재사용 소켓에 남은 이전 요청의 타이머가 다음 요청을 1ms 만에 실패시킴: [헬스 폴러][poller] | | |
| NW-11 | HTTP 메서드별 멱등성과 안전성은? | [응답 유실 뒤 재시도][retry] (T-02) | | |
| NW-12 | HTTP 상태 코드 분류는? 500과 503은 왜 나누나? | [GlobalExceptionHandler][handler]의 503 분리, [부하 시 500][unmapped-500] | | |
| NW-13 | HTTP/1.1, HTTP/2, HTTP/3의 차이는? | | | |
| NW-14 | HTTPS와 TLS 핸드셰이크 과정은? | | | |
| NW-15 | 대칭키와 공개키 암호화의 차이는? TLS에서 둘을 어떻게 섞어 쓰나? | | | |
| NW-16 | DNS 조회 과정(재귀·반복, 캐시)은? | | | |
| NW-17 | 브라우저에 URL을 입력하면 응답을 받기까지 무슨 일이 일어나나? | | | |
| NW-18 | 쿠키와 세션의 차이는? | | [concepts 5.1, 5.2][concepts] | |
| NW-19 | CORS란 무엇이고 왜 필요한가? | | | |
| NW-20 | REST란? RESTful하게 설계한다는 것은? | | | |
| NW-21 | L4 로드밸런서와 L7 로드밸런서의 차이는? 헬스체크는 무엇을 보나? | ALB 타겟 그룹 헬스체크를 readiness로 옮긴 이유: [헬스 판정][readiness] | | |
| NW-22 | 프록시와 리버스 프록시의 차이는? | | | |
| NW-23 | WebSocket, 롱폴링, SSE의 차이는? | 프로젝트 채팅(STOMP) | [concepts 6.1][concepts] | |
| NW-24 | NAT와 포트 포워딩이란? | | | |
| NW-25 | 사설 IP와 공인 IP, 서브넷 마스크란? | | | |

[concepts]: ../career/toss-interview-concepts.md
[unavailable]: ../../performance/cases/mysql-unavailable-wait-bound.md
[freeze-gap]: ../../performance/cases/mysql-freeze-timeout-gap.md
[poller]: ../../performance/cases/health-poller-false-timeout.md
[retry]: ../../performance/cases/retry-after-lost-response.md
[unmapped-500]: ../../performance/cases/unmapped-500-under-load.md
[readiness]: ../../performance/cases/redis-health-readiness.md
[handler]: ../../src/main/java/com/example/highteenday_backend/exceptions/GlobalExceptionHandler.java
