# HighTeenDay Backend — 문서 인덱스

신입 개발자가 입사 첫 주에 혼자 읽고 전체를 이해하는 것을 목표로 하는 온보딩 문서 체계다.
모든 문서는 실제 코드를 읽고 검증한 내용만 담으며, 확인하지 못한 것은 `[미확인]`으로 표시한다.
코드 결함이나 문서-코드 불일치는 본문에 쓰지 않고 [KNOWN-ISSUES.md](KNOWN-ISSUES.md)에만 기록한다.

## 권장 읽기 순서

### 1일차 코스 (약 2시간)

| 순서 | 문서 | 얻는 것 |
|---|---|---|
| 1 | [00-quickstart.md](00-quickstart.md) | 로컬에서 서버를 띄우고 시드 계정으로 로그인까지 |
| 2 | [01-overview.md](01-overview.md) | 서비스가 무엇인지, 도메인 지도, 용어집 |
| 3 | [02-architecture.md](02-architecture.md) | 레이어 구조, Port/Adapter, 이벤트, 배포 토폴로지 |
| 4 | [04-request-flow.md](04-request-flow.md) | 요청 하나가 시스템을 통과하는 전 구간 |

### 1주차 코스 (전체)

1일차 코스 이후, 순서대로:

| 순서 | 문서 | 내용 |
|---|---|---|
| 5 | [03-package-guide.md](03-package-guide.md) | 패키지별 역할과 함정 8건 |
| 6 | [05-data-model.md](05-data-model.md) | ERD, 명명 규칙, soft delete, 비정규화 |
| 7 | [crosscutting/security.md](crosscutting/security.md) | 토큰·쿠키 구조, 엔드포인트 × 인가 전수 표 |
| 8 | [crosscutting/error-handling.md](crosscutting/error-handling.md) | ErrorCode 체계, 예외 → 응답 경로 |
| 9 | [crosscutting/redis.md](crosscutting/redis.md) | Redis 키 인벤토리, 장애 격리 정책 |
| 10 | [crosscutting/transactions-events.md](crosscutting/transactions-events.md) | 트랜잭션 경계, 이벤트 7종 전수 표 |
| 11 | [crosscutting/schedulers.md](crosscutting/schedulers.md) | 배치 4종 상세 |
| 12 | domains/ (아래 표) | 도메인별 심층 |
| 13 | [06-testing.md](06-testing.md) | 테스트 인벤토리·컨벤션·작성 가이드 |
| 14 | [07-performance.md](07-performance.md) | 성능 개선 이력과 재현 가능성 |
| 15 | operations/ (아래 표) | 배포·환경·런북 |
| 16 | [08-troubleshooting.md](08-troubleshooting.md) | 로컬 개발 문제 해결 (증상별) |
| 17 | adr/ (아래 표) | 의사결정 기록 (소급 채록) |

### 도메인 문서

| 문서 | 다루는 것 |
|---|---|
| [domains/auth.md](domains/auth.md) | 일반/소셜 로그인, 토큰 3중 저장, refresh 회전 |
| [domains/post-board.md](domains/post-board.md) | 게시글 CRUD, S3 업로드 흐름, 페이징·캐시, 조회수 |
| [domains/reaction-hotpost.md](domains/reaction-hotpost.md) | 반응 토글, 핫스코어 산식, Redis ZSET 랭킹 |
| [domains/comment.md](domains/comment.md) | 대댓글, 익명화 규칙, 댓글 반응 |
| [domains/chat.md](domains/chat.md) | 멱등성, 읽음 추적, 역할 모델, 브로드캐스트 |
| [domains/notification.md](domains/notification.md) | 이벤트 → 알림 생성, 실시간 push |
| [domains/friend.md](domains/friend.md) | 친구 상태 머신, 차단 정책 |
| [domains/school-timetable.md](domains/school-timetable.md) | NEIS 연동, 급식, 시간표 구조 |

### 운영 문서 / ADR

| 문서 | 다루는 것 |
|---|---|
| [operations/deploy.md](operations/deploy.md) | CI/CD 파이프라인, 환경변수 전체 표 |
| [operations/environments.md](operations/environments.md) | local/dev/prod 프로파일 비교 |
| [operations/runbook.md](operations/runbook.md) | Redis 장애·배포 실패·스키마 변경·로그 |
| [adr/adr-001-reaction-count-no-lock.md](adr/adr-001-reaction-count-no-lock.md) | 좋아요 카운트에 락을 걸지 않은 결정 |
| [adr/adr-002-viewcount-redis-buffer.md](adr/adr-002-viewcount-redis-buffer.md) | 조회수 Redis 버퍼링 |
| [adr/adr-003-hybrid-pagination.md](adr/adr-003-hybrid-pagination.md) | 커서 + 오프셋 하이브리드 페이징 |
| [adr/adr-004-s3-tmp-promote.md](adr/adr-004-s3-tmp-promote.md) | S3 임시 업로드 후 확정 패턴 |

성능 테스트·병목 분석 체계는 별도 트리로 관리된다 — [../performance/README.md](../performance/README.md)에서 시작
(실측된 병목 기록은 `performance/bottlenecks/`, 측정 시스템 설계는 `performance/PERFORMANCE-MANAGEMENT.md`).

프론트엔드 문서는 `highteenday-frontend/docs/INDEX.md`에서 시작한다.

## 문서 체계 규칙

- 번호(00~08)가 붙은 문서는 읽기 순서를 나타낸다. 폴더(domains/, crosscutting/, operations/, adr/)는 필요할 때 찾아 읽는 레퍼런스다.
- 모든 기술 서술에는 코드 좌표(`파일경로 · 클래스/메서드명`)가 붙는다. 행 번호는 코드 변경으로 금방 어긋나므로 쓰지 않는다.
- 같은 사실은 한 문서에만 있다. 다른 문서에서는 링크한다.
- 결함·불일치는 [KNOWN-ISSUES.md](KNOWN-ISSUES.md)가 단일 출처다 (KI-01~52). 본문은 결함을 정상 동작처럼 서술하지 않는다.
- 각 문서 하단의 "마지막 검증일"은 그 문서의 서술을 실제 코드와 대조한 날짜다.

## 기존 문서와의 관계

`docs/`에 이미 있던 문서들은 새 체계로 흡수되었다 (원본 보존, 상단에 통합 안내 추가됨):

| 기존 문서 | 흡수 위치 |
|---|---|
| GROUP_CHAT.md | [domains/chat.md](domains/chat.md) |
| HOT_POST_SYSTEM.md | [domains/reaction-hotpost.md](domains/reaction-hotpost.md) |
| POST_REACTION_MIGRATION.md | [domains/reaction-hotpost.md](domains/reaction-hotpost.md), [05-data-model.md](05-data-model.md) |
| SYSTEM_ARCHITECTURE.md | [02-architecture.md](02-architecture.md)가 현행 기준 ([KI-10](KNOWN-ISSUES.md#ki-10-system_architecturemd가-구버전-상태로-방치됨)) |

마지막 검증일: 2026-07-30
