# 인증·보안

판정 기준과 칸 설명은 [README](README.md)에 있다.

토큰과 쿠키는 사례가 있다. 둘 다 설계대로 동작하지 않은 경우라 개념 설명보다 구체적으로 답할 수
있다. 웹 공격(WS-07 ~ WS-09)과 CORS는 사례도 정리도 없다.

[toss-gap-analysis.md](../career/toss-gap-analysis.md) 1-2가 이 영역을 "찔리면 가장 아픈 영역"으로
적어 두었다. 그래서 C는 남기지 않는 편이 좋다.

| # | 질문 | 겪은 사례 | 정리한 곳 | 판정 |
|---|---|---|---|:-:|
| WS-01 | 인증과 인가의 차이는? | | [concepts 5.5][concepts] | |
| WS-02 | 세션 방식과 토큰(JWT) 방식의 장단점은? | | [concepts 5.1][concepts] | |
| WS-03 | JWT의 구조와 서명 검증은? 토큰이 탈취되면 어떻게 하나? | | [concepts 5.1][concepts] | |
| WS-04 | Access Token과 Refresh Token을 왜 나누나? 재발급 흐름과 회전(rotation)은? | 재발급이 옛 토큰을 즉시 무효로 만들어, 응답이 유실된 뒤 재시도하면 `INVALID_TOKEN` 401로 로그인이 풀림: [응답 유실 뒤 재시도][retry], [TODO.md][todo] 1번. 회사: 로그인 실패 조건 재현과 Refresh Token 처리 수정 | | |
| WS-05 | OAuth2 Authorization Code Flow는 어떻게 흐르나? | 프로젝트 소셜 로그인 | [concepts 5.3][concepts] | |
| WS-06 | 쿠키 속성(HttpOnly·Secure·SameSite·Domain)은 각각 무엇을 막나? | 쿠키 Domain·Secure가 실험 환경과 맞지 않아 k6가 쿠키를 재전송하지 않고 인증 요청이 전부 401: `application-perf.properties` 머리 주석 | [concepts 5.2][concepts] | |
| WS-07 | CSRF란? 어떻게 막나? | | | |
| WS-08 | XSS란? 어떻게 막나? | | | |
| WS-09 | SQL Injection이란? 어떻게 막나? | | | |
| WS-10 | CORS 설정은 왜 필요하고 어떻게 하나? | | | |
| WS-11 | 비밀번호는 어떻게 저장하나? 해시에 솔트를 넣는 이유는? | | [concepts 5.4][concepts] | |
| WS-12 | HTTPS가 막는 공격과 못 막는 공격은? | | | |
| WS-13 | 레이트 리미팅은 어떻게 구현하나? | | | |
| WS-14 | 멀티테넌트 시스템에서 고객사 간 데이터 격리는 어떻게 보장하나? | 회사: 쿠버네티스 파드 간 공유 Redis의 이벤트가 다른 고객사로 새던 것을 키를 배포 단위로 재설계해 막음 | | |
| WS-15 | 로그에 남기면 안 되는 것은? | 금지 규칙: [저장소 규칙][rules] 보안 절 | | |
| WS-16 | 인증 실패와 인프라 실패를 같은 상태 코드로 내면 무엇이 문제인가? | 503으로 분리한 이유: [GlobalExceptionHandler][handler] 주석 | 규칙: [저장소 규칙][rules] 보안 절 | |

[concepts]: ../career/toss-interview-concepts.md
[todo]: ../TODO.md
[rules]: ../../CLAUDE.md
[retry]: ../../performance/cases/retry-after-lost-response.md
[handler]: ../../src/main/java/com/example/highteenday_backend/exceptions/GlobalExceptionHandler.java
