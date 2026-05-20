#!/bin/bash
# k6 부하 테스트 실행 래퍼
# 토큰 갱신 → 즉시 테스트 시작 (토큰 만료 방지)
#
# 사용법:
#   ./k6/scripts/run-test.sh                          # main.js 실행
#   ./k6/scripts/run-test.sh k6/scenarios/03-viral-post.js  # 특정 시나리오
#   K6_BASE_URL=http://api.example.com ./k6/scripts/run-test.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
K6_DIR="$(dirname "$SCRIPT_DIR")"
TOKENS_FILE="$K6_DIR/data/tokens.json"
TEST_FILE="${1:-$K6_DIR/main.js}"
BASE_URL="${K6_BASE_URL:-http://localhost:8080}"

# tokens.json 존재 확인
if [ ! -f "$TOKENS_FILE" ]; then
  echo "[run-test] tokens.json not found. Run 'node k6/scripts/register-users.js register --count 500' first."
  exit 1
fi

# 토큰 갱신
echo "[run-test] Refreshing tokens..."
node "$SCRIPT_DIR/register-users.js" refresh --base-url "$BASE_URL"

# 갱신 직후 즉시 테스트 시작
echo "[run-test] Starting k6: $TEST_FILE"
k6 run "$TEST_FILE"
