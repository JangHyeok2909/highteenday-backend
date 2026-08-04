#!/usr/bin/env bash
# Redis 순단 반복 주입 — chaos 시나리오와 함께 사용.
# 사용: tools/chaos-redis-flap.sh [반복횟수=3] [정지초=10] [간격초=60]
set -euo pipefail
COUNT=${1:-3}
DOWN=${2:-10}
GAP=${3:-60}
for i in $(seq 1 "$COUNT"); do
  echo "$(date +%T) [flap $i/$COUNT] redis stop (${DOWN}s)"
  docker stop perf-redis >/dev/null
  sleep "$DOWN"
  docker start perf-redis >/dev/null
  echo "$(date +%T) [flap $i/$COUNT] redis started — 다음 주입까지 ${GAP}s"
  [ "$i" -lt "$COUNT" ] && sleep "$GAP"
done
echo "완료 — 주입 시각을 실험 문서와 Grafana annotation에 기록할 것"
