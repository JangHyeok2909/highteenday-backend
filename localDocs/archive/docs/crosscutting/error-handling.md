# Error Handling — ErrorCode, CustomException, GlobalExceptionHandler

## 이 문서가 답하는 질문

- 도메인 에러는 어떤 구조로 정의되고 HTTP 상태로 매핑되는가?
- GlobalExceptionHandler는 어떤 예외를 어떤 응답으로 바꾸는가?
- 요청 본문 검증(@Valid)은 실제로 어디에 적용되어 있는가?
- 에러 응답 스키마는 왜 한 가지가 아닌가?

## 3줄 요약

- 정상 설계는 `CustomException(ErrorCode)` 한 갈래다: `enums/ErrorCode`(44개 상수)가 HTTP 상태와 메시지를 갖고, `GlobalExceptionHandler`가 `{"code", "message"}`로 변환한다.
- 그 외 표준 예외 6개 그룹(400/403/404/405/409/500)을 잡는 범용 핸들러는 코드별 고정 문구만 내려보내고 원인 문자열은 서버 로그에만 남긴다 (예전에는 `e.getMessage()`가 그대로 나가 스키마·제약 조건 이름이 새어 나갔다 — [KI-13](../KNOWN-ISSUES.md#ki-13-globalexceptionhandler의-죽은-핸들러와-내부-메시지-노출) 갱신).
- `@Valid`는 모든 컨트롤러 `@RequestBody`(31개 파라미터)에 붙어 있고, 빠진 곳이 생기면 `controllers/RequestBodyValidationTest`가 구조적으로 잡는다. 어떤 제약을 걸지는 DTO마다 별도 판단이다 ([KI-16](../KNOWN-ISSUES.md#ki-16-요청-본문-검증이-사실상-미적용) 갱신).


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
| `handleCustomException` | `CustomException` | ErrorCode의 상태 + `{"code": 상수명, "message": e.getMessage()}` — 상세를 넣어 던지면 그 상세가, 안 넣으면 ErrorCode 기본 메시지가 나간다. 5xx는 스택까지, 4xx는 한 줄만 로깅 |
| `handleBadRequest` | `org.springframework.validation.BindException`, `MissingServletRequestParameterException`, `HttpMessageNotReadableException`, `IllegalArgumentException` | 400 `{"code":"BAD_REQUEST", "message": 고정 문구}` |
| `handleForbidden` | `SecurityException` | 403 고정 문구 |
| `handleNotFound` | `ResourceNotFoundException`, `NoSuchElementException`, `EntityNotFoundException`, `NoSuchKeyException`(S3), `NoResourceFoundException` | 404 고정 문구 |
| `handleMethodNotAllowed` | `HttpRequestMethodNotSupportedException` | 405 고정 문구 |
| `handleConflict` | `DataIntegrityViolationException` | 409 고정 문구 |
| `handleValidation` | `MethodArgumentNotValidException` | 400 `{"code":"VALIDATION_ERROR", "errors": {필드: 메시지}}` — 클라이언트가 고칠 수 있는 정보라 필드별 사유를 그대로 돌려준다 |
| `handleInternalServerError` | `Exception` (그 외 전부) | 500 고정 문구 |

- `exceptions/ResourceNotFoundException`은 ErrorCode 체계 밖의 별도 RuntimeException으로, 서비스 다수가 "id로 못 찾음"에 사용한다 (`services/domain/ScrapService · toggleScrap` 등). 결과적으로 404가 `CustomException(RESOURCE_NOT_FOUND)` 경로와 `ResourceNotFoundException` 경로 두 갈래로 난다.
- `CustomException` 상세 메시지를 응답에 실어도 되는 근거: 현재 상세를 붙이는 지점은 전부 고정 문구이거나 호출자가 방금 보낸 값(email·nickname·commentId)을 되돌려 주는 것이라 새 정보가 나가지 않는다. 이 조건이 핸들러 주석에 규칙으로 적혀 있다. 회귀 방지: `exceptions/GlobalExceptionHandlerTest`(응답 본문에 `uk_users_email` 같은 내부 문자열이 없는지 단언).

## 응답 스키마가 3갈래인 현황

컨트롤러 안 예외만 위 표를 탄다. 필터 단계와 인가 실패는 다른 모양의 응답을 만든다 — 3갈래 표와 각 경로의 설명은 [04-request-flow.md의 "예외 → 응답 경로"](../04-request-flow.md#예외--응답-경로-3갈래)가 단일 출처다. 요약하면 `{"code","message"}` / `{"error":"Unauthorize request"}` / `{"error": ...}`(설계상)의 세 스키마가 공존한다.

`TokenService`가 raw `RuntimeException`을 던져 리프레시 토큰 만료가 500으로 응답되던 갈래는 2026-08-28에 `CustomException(TOKEN_EXPIRED | INVALID_TOKEN | USER_NOT_FOUND)`으로 정리됐다 ([KI-14](../KNOWN-ISSUES.md#ki-14-tokenservice가-errorcode-없이-raw-runtimeexception을-던짐) 갱신). 만료와 무효를 한 코드로 합치지 않은 이유는 클라이언트가 해야 할 일(재로그인 vs 저장된 자격증명 삭제)이 다르기 때문이다.


## 요청 검증(@Valid)의 실제 적용 범위

2026-08-28부터 컨트롤러의 모든 `@RequestBody` 파라미터(31개)에 `@Valid`가 붙어 있다. `ChatController`의 `Map<String, String>` 본문 한 곳만 제외했다 — `Map`은 Bean Validation이 걸 제약이 없는 타입이다. 서비스 메서드에 붙어 있던 무효한 `@Valid`(`PostService.updatePost`)는 제거했다.

- **서비스에 `@Validated`를 붙이는 안을 버린 이유**: 검증 실패가 `ConstraintViolationException`으로 서비스 계층에서 나와 `MethodArgumentNotValidException` 경로와 응답 모양이 갈린다. 검증 실패 응답이 두 가지 모양이 되는 것은 그 자체로 결함이다.
- **DTO에 새 제약 애노테이션은 붙이지 않았다.** 결함의 본질은 "제약을 붙여도 조용히 무시된다"는 함정이었고 그 함정만 없앴다. 어떤 제약을 걸지는 도메인 판단이라 별도 작업이다.
- 회귀 방지: `controllers/RequestBodyValidationTest`가 리플렉션으로 모든 `@RestController`를 훑어 `@Valid`가 빠진 `@RequestBody`가 없는지 단언한다. 검증이 실제로 400을 내는지는 `controllers/PostControllerWebSliceTest.blankTitleIsRejected()`가 본다. 상세는 [KI-16](../KNOWN-ISSUES.md#ki-16-요청-본문-검증이-사실상-미적용).

실질 검증은 여전히 (1) VO 생성자 (`Nickname`, `Password`), (2) 서비스의 수동 if 검사, (3) DB 제약 위반 → 409 경로가 담당한다. VO가 던진 400대 `CustomException`을 `UserService`가 500으로 바꿔 던지던 경로는 `catch (CustomException e) { throw e; }`가 앞에 들어가 해소됐다 ([KI-15](../KNOWN-ISSUES.md#ki-15-userservice가-검증-실패-400을-500으로-변환) 갱신).

## 코드 좌표

| 개념 | 위치 |
|---|---|
| 에러 코드 정의 | `enums/ErrorCode.java` |
| 도메인 예외 | `exceptions/CustomException.java`, `exceptions/ResourceNotFoundException.java` |
| 전역 핸들러 | `exceptions/GlobalExceptionHandler.java` |
| 검증 실패 응답 | `GlobalExceptionHandler · handleValidation()` |
| VO 검증 | `domain/users/vo/Nickname.java`, `domain/users/vo/Password.java · validateRaw()` |
| 도메인 예외를 그대로 올리는 catch 순서 | `services/domain/UserService · updateNickname() / updatePassword()` |
| 토큰 검증 실패의 ErrorCode 매핑 | `services/domain/TokenService · findByRefreshTokenOrThrow()` |


## 알려진 문제·미확인 사항

- [KI-13](../KNOWN-ISSUES.md#ki-13-globalexceptionhandler의-죽은-핸들러와-내부-메시지-노출) 죽은 BindException 핸들러, `e.getMessage()` 노출, CustomException 상세 메시지 미반영 — 해소
- [KI-14](../KNOWN-ISSUES.md#ki-14-tokenservice가-errorcode-없이-raw-runtimeexception을-던짐) 토큰 갱신 실패가 500으로 응답 — 해소
- [KI-15](../KNOWN-ISSUES.md#ki-15-userservice가-검증-실패-400을-500으로-변환) catch(Exception)에 의한 상태코드 훼손 — 해소
- [KI-16](../KNOWN-ISSUES.md#ki-16-요청-본문-검증이-사실상-미적용) @Valid 적용 공백 — 배관은 해소, DTO별 제약 정의는 별도 작업
- 응답 스키마 3갈래는 그대로다: [04-request-flow.md](../04-request-flow.md) 및 [KI-07](../KNOWN-ISSUES.md#ki-07-tokenauthenticationfilter가-예외를-삼켜-tokenexceptionfilter가-사실상-동작하지-않음)

마지막 검증일: 2026-09-05

