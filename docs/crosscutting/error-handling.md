# Error Handling — ErrorCode, CustomException, GlobalExceptionHandler

## 이 문서가 답하는 질문

- 도메인 에러는 어떤 구조로 정의되고 HTTP 상태로 매핑되는가?
- GlobalExceptionHandler는 어떤 예외를 어떤 응답으로 바꾸는가?
- 요청 본문 검증(@Valid)은 실제로 어디에 적용되어 있는가?
- 에러 응답 스키마는 왜 한 가지가 아닌가?

## 3줄 요약

- 정상 설계는 `CustomException(ErrorCode)` 한 갈래다: `enums/ErrorCode`(44개 상수)가 HTTP 상태와 메시지를 갖고, `GlobalExceptionHandler`가 `{"code", "message"}`로 변환한다.
- 그 외 표준 예외 6개 그룹(400/403/404/405/409/500)을 잡는 범용 핸들러들이 있으나, 대부분 예외의 `getMessage()`를 그대로 응답에 싣는다 ([KI-13](../KNOWN-ISSUES.md#ki-13-globalexceptionhandler의-죽은-핸들러와-내부-메시지-노출)).
- `@Valid` 검증은 컨트롤러 `@RequestBody` 중 2곳에만 붙어 있고, 서비스 파라미터에 붙은 것은 무효라서 사실상 도메인 VO·수동 검사에 의존한다 ([KI-16](../KNOWN-ISSUES.md#ki-16-요청-본문-검증이-사실상-미적용)).

## ErrorCode — 도메인 에러의 단일 정의

`enums/ErrorCode.java`는 `HttpStatus` + 메시지 쌍을 갖는 enum이며 총 **44개** 상수가 6개 그룹으로 나뉜다.

| 그룹 | 개수 | 상태 분포 |
|---|---|---|
| auth | 5 | UNAUTHORIZED 4, NOT_ACCEPTABLE 1 |
| global | 5 | LOCKED, FORBIDDEN, NOT_FOUND, BAD_REQUEST, INTERNAL_SERVER_ERROR |
| user | 17 | BAD_REQUEST 8, CONFLICT 5, NOT_FOUND 2, UNAUTHORIZED 1, INTERNAL_SERVER_ERROR 1 |
| school / timetable / friend | 4 | BAD_REQUEST 1, NOT_FOUND 3 |
| chat | 13 | BAD_REQUEST 8, FORBIDDEN 2, CONFLICT 2, NOT_FOUND 1 |

던지는 쪽은 `exceptions/CustomException.java`를 쓴다. 생성자는 두 가지다: `CustomException(ErrorCode)`와 `CustomException(ErrorCode, "상세 메시지")`. 값 객체(`domain/users/vo/Nickname` 등)와 도메인 메서드(`domain/friends/FriendReq · validateReceiver()`)도 직접 `CustomException`을 던진다 — 검증이 엔티티/VO 계층까지 내려가 있는 구조다.

## GlobalExceptionHandler — 핸들러 목록

`exceptions/GlobalExceptionHandler.java` (`@RestControllerAdvice`)의 핸들러 전수:

| 핸들러 | 잡는 예외 | 응답 |
|---|---|---|
| `handleCustomException` | `CustomException` | ErrorCode의 상태 + `{"code": 상수명, "message": ErrorCode 기본 메시지}` |
| `handleBadRequest` | `BindException`(java.net — 죽은 등록, KI-13), `MissingServletRequestParameterException`, `HttpMessageNotReadableException`, `IllegalArgumentException` | 400 `{"code":"BAD_REQUEST", "message": e.getMessage()}` |
| `handleForbidden` | `SecurityException` | 403 |
| `handleNotFound` | `ResourceNotFoundException`, `NoSuchElementException`, `EntityNotFoundException`, `NoSuchKeyException`(S3), `NoResourceFoundException` | 404 |
| `handleMethodNotAllowed` | `HttpRequestMethodNotSupportedException` | 405 |
| `handleConflict` | `DataIntegrityViolationException` | 409 |
| `handleValidation` | `MethodArgumentNotValidException` | 400 `{"code":"VALIDATION_ERROR", "errors": {필드: 메시지}}` |
| `handleInternalServerError` | `Exception` (그 외 전부) | 500 |

- `exceptions/ResourceNotFoundException`은 ErrorCode 체계 밖의 별도 RuntimeException으로, 서비스 다수가 "id로 못 찾음"에 사용한다 (`services/domain/ScrapService · toggleScrap` 등). 결과적으로 404가 `CustomException(RESOURCE_NOT_FOUND)` 경로와 `ResourceNotFoundException` 경로 두 갈래로 난다.
- 403/404/405/409/500 응답의 `message`에 `e.getMessage()`가 연결되어 내부 정보가 노출될 수 있고, 500조차 예외 메시지를 그대로 내려보낸다 — [KI-13](../KNOWN-ISSUES.md#ki-13-globalexceptionhandler의-죽은-핸들러와-내부-메시지-노출).

## 응답 스키마가 3갈래인 현황

컨트롤러 안 예외만 위 표를 탄다. 필터 단계와 인가 실패는 다른 모양의 응답을 만든다 — 3갈래 표와 각 경로의 설명은 [04-request-flow.md의 "예외 → 응답 경로"](../04-request-flow.md#예외--응답-경로-3갈래)가 단일 출처다. 요약하면 `{"code","message"}` / `{"error":"Unauthorize request"}` / `{"error": ...}`(설계상)의 세 스키마가 공존한다.

여기에 이 문서에서 확인한 갈래가 더해진다: `TokenService`가 던지는 raw `RuntimeException`은 `handleInternalServerError`로 떨어져, 리프레시 토큰 만료라는 정상 시나리오가 401이 아니라 500으로 응답된다 ([KI-14](../KNOWN-ISSUES.md#ki-14-tokenservice가-errorcode-없이-raw-runtimeexception을-던짐)).

## 요청 검증(@Valid)의 실제 적용 범위

`src/main/java` 전체에서 `@Valid`는 3곳뿐이다 (grep으로 전수 확인):

| 위치 | 유효 여부 |
|---|---|
| `controllers/UserController · loginUser(@Valid @RequestBody LoginRequestDto)` | 유효 |
| `controllers/PostController · createPost(@Valid @RequestBody RequestPostDto)` | 유효 |
| `services/domain/PostService · updatePost(..., @Valid UpdatePostDto)` | **무효** — 클래스에 `@Validated`가 없어 메서드 검증 인터셉터가 동작하지 않는다 |

나머지 `@RequestBody` DTO들(댓글, 채팅, 친구, 회원가입 등)은 Bean Validation을 타지 않는다. 실질 검증은 (1) VO 생성자 (`Nickname`, `Password`), (2) 서비스의 수동 if 검사, (3) DB 제약 위반 → 409 경로에 의존한다. 상세와 영향은 [KI-16](../KNOWN-ISSUES.md#ki-16-요청-본문-검증이-사실상-미적용).

또한 VO가 던진 400대 `CustomException`을 `UserService`가 `catch (Exception)`으로 삼켜 `INTERNAL_ERROR`(500)로 바꿔 던지는 경로가 있다 — [KI-15](../KNOWN-ISSUES.md#ki-15-userservice가-검증-실패-400을-500으로-변환).

## 코드 좌표

| 개념 | 위치 |
|---|---|
| 에러 코드 정의 | `enums/ErrorCode.java` |
| 도메인 예외 | `exceptions/CustomException.java`, `exceptions/ResourceNotFoundException.java` |
| 전역 핸들러 | `exceptions/GlobalExceptionHandler.java` |
| 검증 실패 응답 | `GlobalExceptionHandler · handleValidation()` |
| VO 검증 | `domain/users/vo/Nickname.java`, `domain/users/vo/Password.java · validateRaw()` |
| 500 변환 사례 | `services/domain/UserService · updateNickname() / updatePassword()` |
| raw RuntimeException 사례 | `services/domain/TokenService · findByRefreshTokenOrThrow()` |

## 알려진 문제·미확인 사항

- [KI-13](../KNOWN-ISSUES.md#ki-13-globalexceptionhandler의-죽은-핸들러와-내부-메시지-노출) 죽은 BindException 핸들러, `e.getMessage()` 노출, CustomException 상세 메시지 미반영
- [KI-14](../KNOWN-ISSUES.md#ki-14-tokenservice가-errorcode-없이-raw-runtimeexception을-던짐) 토큰 갱신 실패가 500으로 응답
- [KI-15](../KNOWN-ISSUES.md#ki-15-userservice가-검증-실패-400을-500으로-변환) catch(Exception)에 의한 상태코드 훼손
- [KI-16](../KNOWN-ISSUES.md#ki-16-요청-본문-검증이-사실상-미적용) @Valid 적용 공백
- 응답 스키마 3갈래: [04-request-flow.md](../04-request-flow.md) 및 [KI-07](../KNOWN-ISSUES.md#ki-07-tokenauthenticationfilter가-예외를-삼켜-tokenexceptionfilter가-사실상-동작하지-않음)

마지막 검증일: 2026-07-30
