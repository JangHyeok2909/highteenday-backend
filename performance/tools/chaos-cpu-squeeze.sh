#!/usr/bin/env bash
# 앱 컨테이너 CPU 제한 주입 — GC/스레드 압박 재현.
# 사용: tools/chaos-cpu-squeeze.sh [제한코어=1] [지속초=300] [원복코어=2]
set -euo pipefail
LIMIT=${1:-1}
DURATION=${2:-300}
RESTORE=${3:-2}
echo "$(date +%T) app CPU를 ${LIMIT} 코어로 제한 (${DURATION}s)"
docker update --cpus "$LIMIT" perf-app >/dev/null
sleep "$DURATION"
docker update --cpus "$RESTORE" perf-app >/dev/null
echo "$(date +%T) 원복 완료 (${RESTORE} 코어)"
