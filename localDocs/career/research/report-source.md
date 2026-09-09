# 200 VU closed model 세션 드리프트 원인 조사

작성일: 2026-09-08

## 결론

현재 보관된 실행 자료만으로는 세션별 처리 능력이 달라진 최초 원인을 규명할 수 없다.
확인된 것은 다음 두 가지다.

1. 같은 코드와 초기 데이터로 실행했어도 200 VU `closed model`의 포화 구간에서 p95가 10,979ms와 16,269ms로 48.2% 달라졌다.
2. 포화 이하 반복에서는 같은 크기의 세션 간 편차가 재현되지 않았다.

따라서 포화는 편차의 최초 원인으로 쓰면 안 된다. `closed model`과 자원 포화가 이미 존재하던 세션별 처리 능력 차이를 대기열과 긴 꼬리 지연으로 확대해 드러낸 조건이라고 쓰는 것이 증거에 맞다.

또한 “같은 환경”이라는 표현은 피해야 한다. 코드와 DB 초기 상태는 같았지만, k6 요청 난수열·JVM 및 InnoDB의 재시작 후 상태·가상화 계층의 CPU 스케줄링까지 같았다고 보장하지 못했기 때문이다.

## 근거 구분

### 확인된 사실

- 비교한 두 실행은 같은 코드, 같은 DB 스냅샷, 같은 초기 데이터 지문으로 시작했다.
- 200 VU 실행에서 앱 CPU와 커넥션 풀이 포화됐고, p95가 10,978.8ms와 16,269.4ms로 달랐다.
- 처리량이 낮은 실행에서 p95가 더 컸다. 그러나 이는 원인 규명이 아니라 `closed model`의 피드백과 함께 나타난 상관관계다.
- 포화 이하의 시간 간격 반복에서는 세트 간 p95 평균 차이가 1.5%였다.
- 사전 CPU 벤치마크와 앱 p95의 상관은 거의 없었고(r=-0.006), 클럭 고정 실험도 기존 가설과 반대 방향이었다. 단순한 호스트 CPU 클럭 저하를 원인으로 지목할 근거는 없다.
- 느린 실행에서 GC 총시간, JIT 컴파일량, DB row lock 지표가 더 크지 않았다. 이 지표들도 단독 원인을 뒷받침하지 않는다.

### 문헌으로 설명되는 메커니즘

Grafana k6 문서에 따르면 closed model에서는 다음 반복이 이전 반복 종료 뒤 시작하므로 응답시간과 도착률이 결합된다. 시스템이 느려지면 실제 요청 투입률도 함께 낮아지는 coordinated omission이 발생한다. 따라서 처리율 감소와 p95 증가의 동행은 포화 구간의 피드백을 보여 주지만, 처리 능력을 처음 흔든 외생 원인을 알려 주지는 않는다.

Little의 법칙은 평균 재고량, 평균 도착률, 평균 체류시간의 관계다. 이를 HTTP 요청 p95에 직접 적용하거나, 여러 요청과 think time을 포함한 iteration 처리량으로 요청 p95를 역산할 수 없다. 그러므로 “처리율 31% 감소 → p95 45% 증가”는 원인 설명에서 빼는 편이 안전하다.

## 남은 원인 후보

| 후보 | 현재 판단 | 이유 |
|---|---|---|
| k6 요청 난수열과 대상 선택 | 우선 제거할 미통제 변수 | 스크립트가 `Math.random()`을 사용하지만 `randomSeed()`를 설정하지 않았다. 상위 기능 비중은 비슷했지만 세부 대상과 분기 순서는 기록되지 않았다. |
| JVM·InnoDB 재시작 후 워밍업 상태 | 가능하지만 미입증 | 실행마다 앱과 DB가 재시작됐다. HotSpot 계층형 컴파일과 InnoDB buffer pool 복원은 시간에 따라 상태가 변한다. 다만 집계된 GC/JIT 지표는 느린 실행의 악화를 설명하지 못했다. |
| WSL2/Hyper-V 및 cgroup CPU 스케줄링 | 가능하지만 미입증 | `cpus: 2.0`은 CPU 시간을 제한할 뿐 동일 물리 코어 실행을 보장하지 않는다. 현재 기록은 실행 중 vCPU 배치와 스케줄링 지연을 인과적으로 추적하지 못했다. |
| 호스트 CPU 클럭 저하 | 현재 증거로는 기각에 가까움 | 사전 벤치마크 상관이 없고 후속 클럭 실험이 가설과 일치하지 않았다. |
| GC, JIT 총량, DB row lock | 단독 원인 근거 없음 | 문제 실행에서 해당 집계치가 일관되게 증가하지 않았다. 순간 이벤트나 상호작용까지 배제한 것은 아니다. |

웹 조사는 가능한 메커니즘을 좁힐 뿐, 당시 로컬 실행의 최초 원인을 소급해서 식별하지 못한다. 요청 난수열, 세부 대상별 호출 수, JVM 이벤트, buffer pool 복원 완료 시점, CPU 스케줄링 지연이 같은 시간축으로 기록되지 않았기 때문이다.

## 포트폴리오 추천 문안

### 포화 환경에서 커진 세션 간 편차

같은 코드와 초기 데이터로 200 VU 부하를 반복했지만, p95는 하루 안에 10,979ms에서 16,269ms까지 48% 달랐습니다. 호스트·JVM·DB 지표를 추적했지만 세션별 처리 능력이 달라진 원인은 규명하지 못했습니다.

큰 편차는 앱 CPU와 커넥션 풀이 포화된 `closed model`에서 관측됐고, 포화 이하 반복에서는 같은 크기로 재현되지 않았습니다. 이를 근거로 포화를 편차의 원인이 아니라, 미확인된 실행 차이를 대기 누적으로 확대하는 조건으로 분류했습니다.

포화 구간을 나누기 위해 같은 코드와 초기 데이터에서 초당 요청 수만 바꿔 측정했습니다.

표 뒤 마무리 문장:

실행마다 CPU 사용률, 커넥션 대기, 목표 요청 수 달성률로 포화 여부를 판정했습니다. 이후 포화 실행은 코드 변경에 따른 성능 차이를 비교하는 기준선에서 제외했습니다.

### 문장에서 피할 주장

- “포화가 세션 드리프트를 일으켰다.”: 최초 원인은 확인하지 못했다.
- “같은 환경이었다.”: 런타임 상태와 요청 난수열은 통제하지 못했다.
- “처리율 감소가 p95 증가의 원인이다.”: closed model에서 두 값은 서로 결합되며, 최초 원인을 설명하지 않는다.
- “Little의 법칙으로 p95 증가를 설명했다.”: Little의 법칙은 평균값 관계이며 p95에 직접 적용할 수 없다.

## 원인을 더 찾기 위한 최소 실험

1. 포화 200 VU 조건은 유지하되 k6 `randomSeed()`를 고정하고, journey·endpoint·대상 ID별 호출 수와 분기 횟수를 실행마다 저장한다.
2. 같은 seed와 snapshot으로 최소 5회 반복해 드리프트가 남는지 확인한다. 실행 순서는 무작위화한다.
3. 드리프트가 남으면 현재 3분 워밍업과, JIT 활동 및 InnoDB buffer pool 복원 완료 뒤 시작하는 긴 워밍업을 비교한다. JFR의 compilation·safepoint·GC·thread park를 동일 시간축으로 보존한다.
4. 그래도 남으면 native Linux 또는 물리 코어가 균질한 별도 호스트에서 재현한다. `cpu.stat`, PSI, run queue와 코어별 실행 정보를 함께 수집해 가상화·스케줄링 가설을 분리한다.

첫 실험은 seed 고정과 세부 요청 카운트 기록이다. 현재 실제로 통제되지 않은 변수를 가장 적은 비용으로 제거할 수 있기 때문이다.

## 출처

1. Grafana k6, Open and closed models: https://grafana.com/docs/k6/latest/using-k6/scenarios/concepts/open-vs-closed/
2. Grafana k6, randomSeed: https://grafana.com/docs/k6/latest/javascript-api/k6/random-seed/
3. John D. C. Little, A Proof for the Queuing Formula L = λW: https://fisherp.scripts.mit.edu/wordpress/wp-content/uploads/2015/11/ContentServer.pdf
4. Barrett et al., Virtual Machine Warmup Blows Hot and Cold: https://arxiv.org/abs/1602.00602
5. Oracle, Java HotSpot VM Performance Enhancements: https://docs.oracle.com/en/java/javase/17/vm/java-hotspot-virtual-machine-performance-enhancements.html
6. MySQL 8.0, Saving and Restoring the Buffer Pool State: https://dev.mysql.com/doc/refman/8.0/en/innodb-preload-buffer-pool.html
7. Docker, Resource constraints: https://docs.docker.com/engine/containers/resource_constraints/
8. Linux kernel, CFS Bandwidth Control: https://docs.kernel.org/scheduler/sched-bwc.html
9. Microsoft, Manage Hyper-V hypervisor scheduler types: https://learn.microsoft.com/en-us/windows-server/virtualization/hyper-v/manage/manage-hyper-v-scheduler-types

