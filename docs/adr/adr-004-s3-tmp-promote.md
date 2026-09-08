# ADR-004. 이미지는 S3 임시 업로드 후 게시글 확정 시 영구 승격한다

상태: 소급 채록 (결정 당시 기록이 아니라 README·코드에서 재구성) — 마지막 검증일: 2026-09-07

## 배경

게시글 본문은 HTML로 저장되고 이미지는 `<img src>`로 들어간다. 문제는 순서다 — 이미지는 게시글 작성 "중"에 업로드되는데, 그 시점에는 게시글 id가 없어 최종 저장 위치(`post-file/{postId}/...`)를 정할 수 없다. 또 작성을 포기한 사용자의 이미지가 스토리지에 남는 문제도 있다 (README "게시글 작성 (S3 이미지 업로드)" — "생성 API는 이미지 파일을 받지 않습니다").

## 검토한 대안

`[미확인: 대안 비교 기록이 저장소에 없다 — 아래는 README 서사에서 역산한 선택지]`

- 게시글 생성 API가 multipart로 이미지를 함께 받기: 단일 요청으로 끝나지만 본문 HTML과 파일의 정합 관리가 복잡하고, 에디터에서 즉시 미리보기용 URL을 줄 수 없다.
- 업로드 즉시 영구 경로 저장: id 없이는 경로를 못 정하고, 작성 포기 시 고아 객체가 영구 경로에 쌓인다.
- 임시 경로 업로드 → 확정 시 승격(copy) + 임시 정리: 채택.

## 결정

2단계 프로토콜을 쓴다:

1. `POST /api/media` — `tmp/{userId}/{UUID}-{원본파일명}` 키로 업로드하고 임시 URL을 `Location` 헤더로 반환 (`services/global/S3FileStorageAdapter.java · tmpUpload()`).
2. `POST /api/posts` — 본문 HTML에서 S3 URL을 파싱(`MediaUtils.extractS3Urls`, Jsoup)해 각 임시 객체를 `CopyObject`로 `{owner}-file/{entityId}/...` 영구 키로 복사하고, `Media` 행을 만들어 게시글과 연결하고, 본문 문자열의 임시 URL을 영구 URL로 치환한 뒤, 이번 요청에서 승격한 임시 객체만 삭제한다 (`services/domain/MediaProcessingService.java · processCreatePostMedia()` → `FileStoragePort.deletePromotedTmpFiles(urls)`).


수정 시에는 신구 본문의 URL 목록을 diff해 추가분만 승격, 제거분은 S3에서 삭제한다 (`processUpdatePostMedia()`). 같은 패턴이 댓글 이미지(`processCreateCommentMedia`)와 프로필 이미지(`updateProfileImage`)에도 적용된다. 스토리지 접근은 `FileStoragePort` 인터페이스 뒤에 있어 테스트에서 mock/인메모리로 대체 가능하다.

## 결과·트레이드오프

- 얻은 것: 게시글 id 확정 후 결정적인 키 구조, 에디터 미리보기용 즉시 URL, 작성 포기 시 임시 객체만 남음, 도메인-스토리지 결합 차단(Port).
- 트레이드오프·한계 (코드로 확인되는 것):
  - 게시글 저장과 S3 복사가 한 트랜잭션 흐름에 있지만 S3는 트랜잭션에 참여하지 않는다 — 복사 후 커밋 실패 시 영구 객체가 고아로 남을 수 있다 `[미확인: 보상 로직은 발견하지 못함]` ([KI-21](../KNOWN-ISSUES.md#ki-21-s3-원격-호출이-트랜잭션-내부에서-실행됨)).
  - 처음에는 승격 시점에 `tmp/{userId}/` 전체를 지웠는데, 같은 사용자가 두 글을 동시에 작성하면 먼저 확정된 글이 나중 글의 임시 이미지를 지웠다. 2026-08-28에 이번 요청이 승격한 URL만 지우도록 시그니처째 바꿨다 ([KI-36](../KNOWN-ISSUES.md)). 그 대가로 승격되지 않은 초안의 tmp 파일이 남으며, 정리는 S3 라이프사이클 규칙의 몫이다.

  - 승격을 검증할 통합 테스트(`PostMediaFlowTest`)는 실 S3가 필요해 `@Disabled` 상태다 ([06-testing.md](../06-testing.md)).

## 근거 좌표

| 근거 | 위치 |
|---|---|
| 임시 업로드·승격·삭제 S3 구현 | `services/global/S3FileStorageAdapter.java · tmpUpload() / copyToFinalLocation() / deletePromotedTmpFiles()` |

| 승격 오케스트레이션 | `services/domain/MediaProcessingService.java · processCreatePostMedia() / processUpdatePostMedia()` |
| Port 인터페이스 | `services/global/FileStoragePort.java` |
| 게시글 생성에서의 호출 | `services/domain/PostService.java · createPost()` |
| 프로토콜·키 규칙 서사 | `README.md · "게시글 작성 (S3 이미지 업로드)"` (시퀀스 다이어그램 포함) |
| 단위 테스트 | `src/test/.../services/domain/MediaProcessingServiceTest.java` (FileStoragePort mock) |
