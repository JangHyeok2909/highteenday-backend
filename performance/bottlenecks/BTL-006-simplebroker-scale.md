# BTL-006: SimpleBroker 인메모리 브로커의 수평 확장 한계

> 유형: WebSocket / Architecture
> 상태: 의심
> 관련: chat-heavy 시나리오

## 증상

- 동시 WebSocket 세션 증가에 따라 힙 사용량과 브로드캐스트 지연(`chat_ws_rtt`) 상승
- **앱을 2대로 늘리는 순간 기능 장애**: A 서버 접속자가 보낸 메시지를
  B 서버 접속자가 못 받는다 (인메모리 브로커는 서버 간 공유가 없음)

## 원인

`WebSocketConfig`: `registry.enableSimpleBroker("/topic", "/queue")` —
Spring 내장 SimpleBroker는 구독 정보와 메시지 라우팅이 **해당 JVM 안에만** 존재.

- 세션·구독 레지스트리가 힙에 상주 → 세션 수 ∝ 힙
- 브로드캐스트는 broker 채널 스레드 풀에서 처리 → 방 인원 × 메시지율에 비례한 팬아웃 비용
- ALB 뒤에 인스턴스를 늘려도 채팅은 확장 불가 (스티키 세션으로도 방 단위 분산 불가)

## 영향

- 단일 인스턴스: chat-heavy에서 세션 수백~수천부터 RTT 저하 예상 (실측 필요)
- 수평 확장: 채팅 기능이 스케일 아웃의 구조적 차단벽

## 재현 방법

```bash
# 단일 인스턴스 한계: VU를 늘려가며 RTT 관찰
k6 run scenarios/chat-heavy.js -e VUS=400 -e DATASET=medium
k6 run scenarios/chat-heavy.js -e VUS=800 -e DATASET=medium
```

관찰 지표: `chat_ws_rtt` P95, `jvm_memory_used_bytes`(세션당 힙 증분),
`jvm_threads_live_threads`, 브로커 채널 큐 적체(스레드 덤프).

## 해결 방법

| 후보 | 효과 | 트레이드오프 |
|------|------|--------------|
| Redis Pub/Sub 릴레이 (이미 Redis 보유) | 서버 간 브로드캐스트 공유 — 최소 변경 스케일 아웃 | at-most-once (유실 가능), 구독 관리 직접 구현 |
| 외부 STOMP 브로커 (RabbitMQ) — `enableStompBrokerRelay` | 표준적 해법, 내구성 옵션 | 인프라 추가 운영 비용 |
| Kafka 기반 팬아웃 | 대규모·재생 가능 | 소규모 서비스엔 과설계 |

단일 인스턴스 실측 한계(세션 수)를 먼저 확정하고, 그 수치가 성장 로드맵보다
작을 때만 브로커 교체를 진행한다 — **측정 없는 아키텍처 교체 금지.**
