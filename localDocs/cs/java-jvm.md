# Java·JVM·동시성

판정 기준과 칸 설명은 [README](README.md)에 있다.

JVM 메모리와 GC는 개념 정리가 있다. 자바 동시성(JV-12 ~ JV-15, JV-17, JV-18)은 사례도 정리도 없다.
[toss-gap-analysis.md](../career/toss-gap-analysis.md) G3이 짚은 "JMM, volatile, CAS"가 이 줄들이다.

개념 문서 마지막 줄에 `volatile`·`CAS`가 나오지만 범위 밖이라는 언급이라 정리로 치지 않았다.

JV-19(가상 스레드)는 이어 묻기 좋은 질문이다. Tomcat 스레드 50개가 DB 응답을 기다리며 다 묶인
사례가 있다. "가상 스레드면 그 문제가 사라지나"에는 커넥션 풀이 다음 병목이 된다는 답을 그 사례로
댈 수 있다.

| # | 질문 | 겪은 사례 | 정리한 곳 | 판정 |
|---|---|---|---|:-:|
| JV-01 | JVM의 구조(클래스 로더·런타임 데이터 영역·실행 엔진)는? | | | |
| JV-02 | JVM 메모리 영역(힙·스택·메서드 영역)에는 각각 무엇이 들어가나? | | [concepts 7.1][concepts] | |
| JV-03 | GC는 어떻게 동작하나? Young과 Old 영역을 왜 나누나? | | [concepts 7.2][concepts] | |
| JV-04 | GC 종류(Serial·Parallel·G1·ZGC)의 차이는? | GC 정지 시간 히스토그램을 켜 둠(`application.properties`의 `jvm.gc.pause`) | [concepts 7.2][concepts] | |
| JV-05 | Stop-the-world란? 줄이려면? | | [concepts 7.2][concepts] | |
| JV-06 | 컨테이너 안에서 JVM 힙 크기는 어떻게 정해지나? | | [concepts 7.1][concepts] | |
| JV-07 | `equals`와 `hashCode`를 함께 재정의해야 하는 이유는? | | | |
| JV-08 | String은 왜 불변이고 String pool은 무엇인가? | | | |
| JV-09 | checked 예외와 unchecked 예외의 차이와 쓰는 기준은? | | | |
| JV-10 | 인터페이스와 추상 클래스의 차이는? | | | |
| JV-11 | 제네릭과 타입 소거는? | | | |
| JV-12 | `synchronized`와 `volatile`의 차이는? | | | |
| JV-13 | Java 메모리 모델과 happens-before 관계는? | | | |
| JV-14 | CAS와 Atomic 클래스는 락 없이 어떻게 원자성을 보장하나? | | | |
| JV-15 | `ConcurrentHashMap`은 어떻게 동시성을 보장하나? | | | |
| JV-16 | `ThreadLocal`은 언제 쓰나? 스레드 풀에서 무엇을 조심해야 하나? | 요청당 쿼리 수를 `ThreadLocal`로 누적하는 계측(`QueryCountMetricsTest`가 그 배선을 검사). OSIV가 영속성 컨텍스트를 요청 스레드에 묶음: [Redis 대기 중 커넥션 점유][conn-held] | | |
| JV-17 | 스레드를 만드는 방법과 `ExecutorService`는? | | | |
| JV-18 | `CompletableFuture`는 무엇을 해결하나? | | | |
| JV-19 | 가상 스레드(Java 21)는 무엇을 바꾸나? 스레드 풀 포화 문제가 사라지나? | 비교 대상: Tomcat 스레드 50개가 DB 응답을 기다리며 포화 [DB 느림][mysql-slow] | | |
| JV-20 | 스트림 API와 람다는? | | | |
| JV-21 | `Optional`은 어디에 쓰고 어디에 안 쓰나? | | | |
| JV-22 | 리플렉션과 동적 프록시는? | Spring AOP 프록시(`ResilientRedisAspect` 등) | [concepts 3.6][concepts] | |

[concepts]: ../career/toss-interview-concepts.md
[conn-held]: ../../performance/cases/db-connection-held-during-redis-wait.md
[mysql-slow]: ../../performance/cases/mysql-slow-latency-amplification.md
