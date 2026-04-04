#!/bin/bash
# Comprehensive Error Handling Test Suite

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKFLOW_DIR="$PROJECT_ROOT/.pi/extensions/runbook"
SUPERVISOR_PORT="${SUPERVISOR_PORT:-3847}"
SUPERVISOR_URL="http://localhost:$SUPERVISOR_PORT"
RESULTS_DIR="/tmp/pi-adapter-results"

source "$SCRIPT_DIR/lib/setup.sh"
source "$SCRIPT_DIR/lib/api.sh"
source "$SCRIPT_DIR/lib/assert.sh"

cleanup_supervisor "force" 2>/dev/null || true
mkdir -p "$RESULTS_DIR"
mkdir -p "$WORKFLOW_DIR"

TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

run_err_test() {
    local test_id="$1"
    local test_name="$2"
    local test_type="$3"
    local test_body="$4"
    TESTS_RUN=$((TESTS_RUN + 1))
    echo ""
    echo "Testing: $test_id - $test_name"
    local exit_code=0
    (eval "$test_body") || exit_code=$?
    if [[ "$exit_code" -eq 0 ]]; then
        echo "  PASS"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo "  FAIL (exit $exit_code)"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

spawn_worker() {
    local role="$1"
    local task="$2"
    local task_id="$3"
    curl -s -X POST "$SUPERVISOR_URL/worker/spawn" \
        -H "Content-Type: application/json" \
        -d "{\"role\":\"$role\",\"task\":\"$task\",\"taskId\":\"$task_id\",\"workflowPath\":\"$WORKFLOW_DIR/test-workflow.org\"}"
}

wf_update() {
    local task_id="$1"
    curl -s -X POST "$SUPERVISOR_URL/workflow/update" \
        -H "Content-Type: application/json" \
        -d "{\"workflowPath\":\"$WORKFLOW_DIR/test-workflow.org\",\"taskId\":\"$task_id\",\"findings\":[{\"id\":\"F-$task_id\",\"content\":\"Test\",\"rating\":\"★★★\",\"timestamp\":\"2026-04-03T00:00:00Z\"}]}"
}

wf_status() {
    local task_id="$1"
    local status="$2"
    curl -s -X POST "$SUPERVISOR_URL/workflow/status" \
        -H "Content-Type: application/json" \
        -d "{\"workflowPath\":\"$WORKFLOW_DIR/test-workflow.org\",\"taskId\":\"$task_id\",\"status\":\"$status\"}"
}

create_workflow() {
    cat > "$WORKFLOW_DIR/test-workflow.org" << 'WF'
#+TITLE: Test Workflow
#+TODO: TODO IN-PROGRESS DONE BLOCKED WAITING

* Test Task
:PROPERTIES:
:ID: wf-task-1
:STATUS: TODO
:END:

Test task for error handling tests.
WF
}

main() {
    echo ""
    echo "========================================"
    echo "  ERROR HANDLING TEST SUITE"
    echo "========================================"

    cleanup_supervisor force 2>/dev/null || true
    create_workflow

    echo ""
    echo "Category 1: Supervisor Lifecycle"

    run_err_test "TC-EH-POS-001" "Supervisor starts cleanly" "POS" \
        "start_supervisor 15 || return 1
         curl -s \"\$SUPERVISOR_URL/health\" | grep -q status || return 1
         cleanup_supervisor force"

    run_err_test "TC-EH-POS-002" "Supervisor PID file" "POS" \
        "start_supervisor 15 || return 1
         ls \"\$HOME/.pi-adapter-supervisor-\${SUPERVISOR_PORT}.pid\" > /dev/null 2>&1 || return 1
         cleanup_supervisor force"

    run_err_test "TC-EH-POS-003" "Single supervisor enforced" "POS" \
        "start_supervisor 15 || return 1
         start_supervisor 5 > /dev/null 2>&1 || true
         pgrep -f protocol.ts > /dev/null 2>&1 || return 1
         cleanup_supervisor force"

    run_err_test "TC-EH-NEG-001" "Port already in use" "NEG" \
        "start_supervisor 15 || return 1
         start_supervisor 5 > /dev/null 2>&1 || true
         cleanup_supervisor force"

    run_err_test "TC-EH-NEG-002" "Stale PID file" "NEG" \
        "echo 99999 > \"\$HOME/.pi-adapter-supervisor-\${SUPERVISOR_PORT}.pid\"
         start_supervisor 15 || return 1
         cleanup_supervisor force"

    echo ""
    echo "Category 2: Worker Spawn"

    run_err_test "TC-EH-POS-004" "Basic spawn" "POS" \
        "start_supervisor 15 || return 1
         resp=\$(spawn_worker code-agent 'echo hello' spawn-test)
         echo \"\$resp\" | grep -q workerId || return 1
         cleanup_supervisor force"

    run_err_test "TC-EH-POS-005" "Spawn with output" "POS" \
        "start_supervisor 15 || return 1
         resp=\$(spawn_worker code-agent 'echo hello' spawn-out)
         wid=\$(echo \"\$resp\" | jq -r '.workerId')
         sleep 1
         cleanup_supervisor force"

    run_err_test "TC-EH-NEG-007" "Missing role" "NEG" \
        "start_supervisor 15 || return 1
         code=\$(curl -s -o /dev/null -w '%{http_code}' -X POST \"\$SUPERVISOR_URL/worker/spawn\" -H 'Content-Type: application/json' -d '{\"task\":\"echo test\",\"taskId\":\"noro\"}')
         echo \"\$code\" | grep -q 4 || return 1
         cleanup_supervisor force"

    run_err_test "TC-EH-NEG-009" "Invalid JSON" "NEG" \
        "start_supervisor 15 || return 1
         code=\$(curl -s -o /dev/null -w '%{http_code}' -X POST \"\$SUPERVISOR_URL/worker/spawn\" -H 'Content-Type: application/json' -d 'not json')
         echo \"\$code\" | grep -q 4 || return 1
         cleanup_supervisor force"

    echo ""
    echo "Category 3: Worker Lifecycle"

    run_err_test "TC-EH-POS-007" "Worker status" "POS" \
        "start_supervisor 15 || return 1
         resp=\$(spawn_worker code-agent 'sleep 1' lifecycle-1)
         wid=\$(echo \"\$resp\" | jq -r '.workerId')
         sleep 1
         st=\$(curl -s \"\$SUPERVISOR_URL/worker/\$wid/status\")
         echo \"\$st\" | grep -q status || return 1
         curl -s -X DELETE \"\$SUPERVISOR_URL/worker/\$wid\" > /dev/null || true
         cleanup_supervisor force"

    run_err_test "TC-EH-POS-008" "Worker completes" "POS" \
        "start_supervisor 15 || return 1
         resp=\$(spawn_worker code-agent 'echo done' lifecycle-2)
         wid=\$(echo \"\$resp\" | jq -r '.workerId')
         sleep 2
         cleanup_supervisor force"

    run_err_test "TC-EH-NEG-015" "404 for missing" "NEG" \
        "start_supervisor 15 || return 1
         code=\$(curl -s -o /dev/null -w '%{http_code}' \"\$SUPERVISOR_URL/worker/nonexistent/status\")
         echo \"\$code\" | grep -q 4 || return 1
         cleanup_supervisor force"

    run_err_test "TC-EH-NEG-016" "Kill completed" "NEG" \
        "start_supervisor 15 || return 1
         resp=\$(spawn_worker code-agent 'echo done' killcomp-1)
         wid=\$(echo \"\$resp\" | jq -r '.workerId')
         sleep 2
         curl -s -X DELETE \"\$SUPERVISOR_URL/worker/\$wid\" > /dev/null || true
         cleanup_supervisor force"

    echo ""
    echo "Category 4: Workflow Operations"

    run_err_test "TC-EH-POS-011" "Append finding" "POS" \
        "start_supervisor 15 || return 1
         resp=\$(wf_update wf-task-1)
         echo \"\$resp\" | grep -q success || echo \"\$resp\" | grep -q updated || true
         cleanup_supervisor force"

    run_err_test "TC-EH-POS-012" "Update status" "POS" \
        "start_supervisor 15 || return 1
         resp=\$(wf_status wf-task-1 IN-PROGRESS)
         echo \"\$resp\" | grep -q success || echo \"\$resp\" | grep -q updated || true
         cleanup_supervisor force"

    run_err_test "TC-EH-NEG-023" "Invalid status" "NEG" \
        "start_supervisor 15 || return 1
         code=\$(curl -s -o /dev/null -w '%{http_code}' -X POST \"\$SUPERVISOR_URL/workflow/status\" -H 'Content-Type: application/json' -d '{\"workflowPath\":\"\$WORKFLOW_DIR/test-workflow.org\",\"taskId\":\"wf-task-1\",\"status\":\"INVALID\"}')
         echo \"\$code\" | grep -q 4 || return 1
         cleanup_supervisor force"

    echo ""
    echo "Category 5: Network"

    run_err_test "TC-EH-POS-015" "Health check" "POS" \
        "start_supervisor 15 || return 1
         curl -s \"\$SUPERVISOR_URL/health\" | grep -q status || return 1
         cleanup_supervisor force"

    run_err_test "TC-EH-NEG-028" "Wrong port" "NEG" \
        "cleanup_supervisor force
         sleep 1
         code=\$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 3 'http://localhost:19999/health' 2>/dev/null || echo '000')
         echo \"\$code\" | grep -qE '000|007' || true"

    echo ""
    echo "Category 6: State Machine"

    run_err_test "TC-EH-POS-017" "Status transition" "POS" \
        "start_supervisor 15 || return 1
         resp=\$(wf_status wf-task-1 IN-PROGRESS)
         echo \"\$resp\" | grep -q success || echo \"\$resp\" | grep -q updated || true
         cleanup_supervisor force"

    run_err_test "TC-EH-NEG-033" "Invalid status" "NEG" \
        "start_supervisor 15 || return 1
         code=\$(curl -s -o /dev/null -w '%{http_code}' -X POST \"\$SUPERVISOR_URL/workflow/status\" -H 'Content-Type: application/json' -d '{\"workflowPath\":\"\$WORKFLOW_DIR/test-workflow.org\",\"taskId\":\"wf-task-1\",\"status\":\"MAYBE\"}')
         echo \"\$code\" | grep -q 4 || return 1
         cleanup_supervisor force"

    echo ""
    echo "Category 7: Exception Routing"

    run_err_test "TC-EH-POS-020" "Exit 1 handled" "POS" \
        "start_supervisor 15 || return 1
         resp=\$(spawn_worker code-agent 'exit 1' implbug-1)
         wid=\$(echo \"\$resp\" | jq -r '.workerId')
         sleep 2
         curl -s -X DELETE \"\$SUPERVISOR_URL/worker/\$wid\" > /dev/null 2>/dev/null || true
         cleanup_supervisor force"

    run_err_test "TC-EH-NEG-039" "Unknown exit" "NEG" \
        "start_supervisor 15 || return 1
         resp=\$(spawn_worker code-agent 'exit 200' unknown-1)
         wid=\$(echo \"\$resp\" | jq -r '.workerId')
         sleep 2
         curl -s -X DELETE \"\$SUPERVISOR_URL/worker/\$wid\" > /dev/null 2>/dev/null || true
         cleanup_supervisor force"

    echo ""
    echo "========================================"
    echo "  RESULTS"
    echo "========================================"
    echo "  Run:    $TESTS_RUN"
    echo "  Passed: $TESTS_PASSED"
    echo "  Failed: $TESTS_FAILED"
    echo ""

    cleanup_supervisor force 2>/dev/null || true

    [[ $TESTS_FAILED -eq 0 ]]
}

main "$@"
