# BTL-XXX: (병목 이름)

> 유형: CPU | GC | DB | Redis | Thread Pool | Connection Pool | Index | Lock | N+1 |
>       Network | Serialization | WebSocket | Scheduler | Event | Cache | Deadlock
> 상태: 의심 | 확정 | 해소 | 기각
> 관련: EXP-XXX / OPT-XXX

## 증상

사용자/지표 관점에서 무엇이 어떻게 나빠지는가.

## 원인

코드/구조 수준의 근본 원인. 파일:라인 또는 설정 키를 특정한다.

## 영향

- 어떤 시나리오에서, 어느 규모부터 발현되는가
- 영향 반경 (해당 기능만? 전체 서비스로 전파?)

## 재현 방법

이 저장소의 명령만으로 재현 가능해야 한다.

```bash
(명령)
```

관찰 지표: (metrics/README.md의 지표명)

## 해결 방법

후보 나열 + 각각의 트레이드오프. 채택안은 optimizations/OPT-XXX로.
