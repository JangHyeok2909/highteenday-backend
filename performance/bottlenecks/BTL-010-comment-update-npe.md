# BTL-010: 이미지 없는 댓글 수정 시 NPE (`comment update` 전면 장애)

> 유형: Correctness (성능이 아니라 가용성 버그 — 부하 테스트 스크립트 검증 중 실측으로 발견)
> 상태: **해소** — `processUpdateCommentMedia()`에 null 가드 추가 + 단위 테스트 (커밋 `346fb17`)
> 관련: 없음. `scripts/comments.js`의 `updateComment()` 실행 중 100% 재현됨

## 증상

`PATCH /api/posts/{postId}/comments/{commentId}`로 **이미지가 없는 댓글**(가장 흔한
케이스 — 텍스트만 있는 댓글)의 내용만 수정하려 하면 항상 500:

```json
{"code":"INTERNAL_SERVER_ERROR",
 "message":"서버 내부 오류가 발생했습니다. message=Cannot invoke \"String.isEmpty()\" because \"deleteUrl\" is null"}
```

## 원인

`services/domain/MediaProcessingService.java` `processUpdateCommentMedia()`:

```java
@Transactional
public void processUpdateCommentMedia(Comment comment, RequestCommentDto dto) {
    if (dto.getUrl() == null || dto.getUrl().isEmpty()) {
        String deleteUrl = comment.getS3Url();
        if (!deleteUrl.isEmpty()) {                    // ← comment.getS3Url()이 null이면 NPE
            fileStorage.deleteByUrl(deleteUrl);
            mediaService.deleteMediaByUrl(deleteUrl);
            comment.removeImage();
        }
    } else if (!dto.getUrl().equals(comment.getS3Url())) {
        if (!comment.getS3Url().isEmpty()) {            // ← 같은 패턴의 두 번째 NPE 지점
            ...
```

수정 요청에 `url`이 없으면(이미지 없는 댓글의 일반적인 텍스트 수정) 첫 번째 분기로
들어가 `comment.getS3Url()`을 가져오는데, **댓글에 이미지가 없으면 이 값은 null이다.**
null 체크 없이 바로 `.isEmpty()`를 호출해 `NullPointerException`이 발생한다.
같은 패턴이 `else if` 분기(97~99번째 줄)에도 한 번 더 있다
(`dto.getUrl()`이 있고 기존 값과 다른데, 기존 댓글에 이미지가 없던 경우).

## 영향

- **이미지 없이 작성된 모든 댓글의 "내용만 수정"이 100% 실패한다** — 댓글 대부분이
  텍스트만 있는 커뮤니티 특성상, 댓글 수정 기능이 사실상 전면 장애 상태.
- 재현 조건: 이미지 없는 댓글 + 수정 요청 바디에 `url` 필드 없음(또는 빈 문자열) —
  프런트엔드가 이미지 없는 댓글 수정 시 `url`을 아예 안 보내는 게 일반적이므로
  실사용 트래픽에서 곧바로 발현될 가능성이 높다.

## 재현 방법

```bash
k6 run scripts/comments.js -e VUS=3 -e DURATION=15s -e DATASET=smoke -e BASE_URL=http://localhost:18080
# "comment update not 5xx" check 실패로 확인됨 (재현 시점 실패율 100%)
```

또는 직접:
```bash
# 로그인 후 이미지 없는 댓글 하나 만들고 곧바로 PATCH
curl -X PATCH localhost:18080/api/posts/1/comments/<id> \
  -H 'Content-Type: application/json' -b cookies.txt \
  -d '{"content":"수정된 내용"}'
# → 500, "Cannot invoke \"String.isEmpty()\" because \"deleteUrl\" is null"
```

## 해결 방법

`MediaProcessingService.processUpdateCommentMedia()`의 두 지점에 null 체크 추가:

```java
if (dto.getUrl() == null || dto.getUrl().isEmpty()) {
    String deleteUrl = comment.getS3Url();
    if (deleteUrl != null && !deleteUrl.isEmpty()) {   // null 체크 추가
        ...
    }
} else if (!dto.getUrl().equals(comment.getS3Url())) {
    String existing = comment.getS3Url();
    if (existing != null && !existing.isEmpty()) {     // null 체크 추가
        ...
```

참고: 게시글(Post) 쪽 `processUpdatePostMedia()`는 다른 구현 방식(본문 텍스트에서
S3 URL을 정규식으로 추출해 `List<String>`으로 비교)이라 이 NPE와 같은 클래스의
버그는 없다 — null이 아니라 항상 빈 리스트가 반환되는 구조라 `.isEmpty()` 호출이
안전하다. 이 버그는 댓글(Comment) 경로에만 있다.
