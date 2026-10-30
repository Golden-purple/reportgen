#!/usr/bin/env bash
# End-to-end smoke test: starts the real backend, which runs the real engine image through the
# real Docker flags in backend/engineCaller.js, and checks what comes back over HTTP.
#
# Preconditions (CI satisfies them in earlier steps; this script does none of them):
#   - the image reportgen-engine:dev exists (docker build --tag reportgen-engine:dev .)
#   - backend/node_modules is installed (npm ci in backend/)
#   - port 3000 is free
#   - Docker is reachable
#
# Run from anywhere: bash ci/smoke.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="http://127.0.0.1:3000"

# Never kill a process we did not start, so refuse to run if something already answers.
if curl -s -o /dev/null "$BASE_URL/api/health"; then
    echo "FAIL: something already answers on $BASE_URL; stop it and run this again."
    exit 1
fi

WORK="$(mktemp -d)"
LOG="$WORK/backend.log"
BACKEND_PID=""

cleanup() {
    local status=$?
    if [ -n "$BACKEND_PID" ]; then
        kill "$BACKEND_PID" 2>/dev/null || true
        wait "$BACKEND_PID" 2>/dev/null || true
    fi
    if [ "$status" -ne 0 ] && [ -f "$LOG" ]; then
        echo "---- last 100 lines of the backend log ----"
        tail -n 100 "$LOG" || true
    fi
    rm -rf "$WORK"
}
trap cleanup EXIT

fail() {
    echo "FAIL: $1"
    exit 1
}

pass() {
    echo "PASS: $1"
}

# post_files <output file> <file>...  -> prints the HTTP status code.
# Paths are relative to ci/fixtures (see the cd below), so Git Bash path conversion stays out of the way.
post_files() {
    local out="$1"
    shift
    local args=()
    local f
    for f in "$@"; do
        args+=(-F "files=@$f")
    done
    curl -sS --max-time 90 -o "$out" -w '%{http_code}' "${args[@]}" "$BASE_URL/api/upload"
}

node "$ROOT/backend/server.js" > "$LOG" 2>&1 &
BACKEND_PID=$!

ready=""
for _ in $(seq 1 60); do
    kill -0 "$BACKEND_PID" 2>/dev/null || fail "the backend exited during startup"
    if [ "$(curl -s "$BASE_URL/api/health" || true)" = "OK" ]; then
        ready=1
        break
    fi
    sleep 0.5
done
[ -n "$ready" ] || fail "the backend did not answer /api/health within 30 seconds"
pass "backend is healthy"

cd "$ROOT/ci/fixtures"

# 1. Four programs, one of which never finishes: the per-file timeout must not break the report.
code="$(post_files "$WORK/report.pdf" ok.py ok.c ok.cpp loop.py)"
[ "$code" = "200" ] || fail "upload of ok.py ok.c ok.cpp loop.py returned HTTP $code, expected 200"
[ "$(head -c 4 "$WORK/report.pdf")" = "%PDF" ] || fail "the response body does not start with %PDF"
pass "four programs (one infinite loop) produce a PDF"

# 2. Emoji output cannot be typeset by pdflatex: the engine exits 3, the backend maps it to 422.
code="$(post_files "$WORK/emoji.json" emoji.py)"
[ "$code" = "422" ] || fail "upload of emoji.py returned HTTP $code, expected 422"
grep -qF "REPORT_RENDER_FAILED" "$WORK/emoji.json" || fail "the emoji response body lacks REPORT_RENDER_FAILED"
pass "emoji output is reported as REPORT_RENDER_FAILED (422)"

# 3. Validation in the route, before any container starts.
code="$(post_files "$WORK/note.json" note.txt)"
[ "$code" = "422" ] || fail "upload of note.txt returned HTTP $code, expected 422"
grep -qF "Only Python, C and C++ files are supported" "$WORK/note.json" || fail "the note.txt response body lacks the unsupported-file message"
pass "note.txt is rejected as an unsupported file (422)"

# 4. The metrics recorded exactly what happened above.
curl -sS --max-time 30 -o "$WORK/metrics.txt" "$BASE_URL/metrics"
for line in \
    'reportgen_jobs_total{outcome="success"} 1' \
    'reportgen_jobs_total{outcome="render_failed"} 1' \
    'reportgen_upload_rejections_total{reason="unsupported_extension"} 1' \
    'reportgen_active_jobs 0'
do
    grep -Fx -- "$line" "$WORK/metrics.txt" > /dev/null || fail "/metrics lacks the line: $line"
done
pass "/metrics counted the success, the render failure and the rejection"

# 5. --rm must have removed every job container.
leaked="$(docker ps -aq --filter name=reportgen-job-)"
[ -z "$leaked" ] || fail "leaked job containers: $leaked"
pass "no job containers are left behind"

echo "Smoke test passed."
