# 운영체제

판정 기준과 칸 설명은 [README](README.md)에 있다.

사례는 스레드 풀과 블로킹 I/O, 컨테이너 정지에 몰려 있다. 프로세스 구조·메모리 관리·스케줄링은
사례도 정리도 없다. 개념 문서에 운영체제 장이 없기 때문이다.

| # | 질문 | 겪은 사례 | 정리한 곳 | 판정 |
|---|---|---|---|:-:|
| OS-01 | 프로세스와 스레드의 차이는? 무엇을 공유하고 무엇을 따로 갖나? | | | |
| OS-02 | 멀티프로세스와 멀티스레드의 장단점은? | | | |
| OS-03 | 프로세스의 메모리 구조(코드·데이터·힙·스택)는? | | | |
| OS-04 | 컨텍스트 스위칭이란? 비용은 어디서 나오나? | | | |
| OS-05 | 프로세스의 상태(준비·실행·대기)와 전이 조건은? | | | |
| OS-06 | PCB에는 무엇이 들어 있나? | | | |
| OS-07 | CPU 스케줄링 알고리즘(FCFS·SJF·RR·우선순위)과 선점·비선점의 차이는? | | | |
| OS-08 | 경쟁 조건과 임계 영역이란? | DB 수준의 경쟁 조건: [카운터 경합][lost-update] | | |
| OS-09 | 뮤텍스·세마포어·모니터의 차이는? | | | |
| OS-10 | 데드락 발생 조건 네 가지는? | | [concepts 2.4][concepts] (InnoDB 쪽만) | |
| OS-11 | 데드락 예방·회피·탐지·회복은 각각 무엇인가? | | | |
| OS-12 | 가상 메모리와 페이징이란? | | | |
| OS-13 | 페이지 폴트와 페이지 교체 알고리즘(FIFO·LRU)은? | | | |
| OS-14 | 페이징과 세그멘테이션, 내부 단편화와 외부 단편화는? | | | |
| OS-15 | 스래싱이란? 왜 생기나? | | | |
| OS-16 | 캐시의 시간 지역성과 공간 지역성이란? | | | |
| OS-17 | 사용자 모드와 커널 모드, 시스템 콜이란? | | | |
| OS-18 | 블로킹·논블로킹과 동기·비동기 I/O의 차이는? | 스레드가 응답 없는 소켓 읽기에 묶임: [freeze 대기][freeze-gap], [DB 무응답 대기][unavailable] | | |
| OS-19 | I/O 멀티플렉싱(select·poll·epoll)이란? | | | |
| OS-20 | 인터럽트란? 폴링과 무엇이 다른가? | | | |
| OS-21 | 프로세스 간 통신(IPC) 방식에는 무엇이 있나? | | | |
| OS-22 | 스레드 풀은 왜 쓰고 크기는 어떻게 정하나? | Tomcat 스레드 50개 포화로 전 기능 지연: [DB 느림][mysql-slow] | [concepts 7.3][concepts], [concepts 1.5][concepts] (Little's Law) | |
| OS-23 | SIGTERM과 SIGKILL의 차이는? 프로세스를 멈추는 것과 죽이는 것은 어떻게 다른가? | `docker stop -t 1`은 SIGTERM 뒤 1초 안에 안 끝나면 SIGKILL: [DB 무응답 대기][unavailable]의 crash 실행. `docker pause`는 신호가 아니라 cgroup freezer로 얼림: [freeze 대기][freeze-gap] | | |
| OS-24 | 컨테이너는 가상 머신과 어떻게 다른가? cgroup과 namespace는 각각 무엇을 격리하나? | `docker pause`의 cgroup freezer: [freeze 대기][freeze-gap]. 회사: 쿠버네티스 파드 | [concepts 7.4][concepts] (CPU throttling) | |

[concepts]: ../career/toss-interview-concepts.md
[lost-update]: ../../performance/cases/reaction-counter-lost-update.md
[freeze-gap]: ../../performance/cases/mysql-freeze-timeout-gap.md
[unavailable]: ../../performance/cases/mysql-unavailable-wait-bound.md
[mysql-slow]: ../../performance/cases/mysql-slow-latency-amplification.md
