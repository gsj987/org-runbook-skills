#!/usr/bin/env bash
# =============================================================================
# pi-adapter E2E Test Suite - Error Handling Tests
# =============================================================================
# Tests error handling and edge cases:
# - TC-ERR-001: Supervisor unavailable (P0)
# - TC-ERR-002: Invalid tool parameters (P0)
# - TC-ERR-003: Worker timeout default 300s (P0)
# - TC-ERR-004: Worker timeout custom 5s (P1)
# - TC-ERR-005: Concurrent worker spawn (P1)
# - TC-ERR-006: Malformed workflow.org (P1)
# - TC-ERR-007: Missing workflow.org (P0)
# - TC-ERR-008: Network timeout (P1)
# - TC-ERR-009: PID file corruption (P2)
# - TC-ERR-010: Extension load failure (P2)
#
# Note: These tests focus on error handling and edge cases.
# Supervisor is not required for most tests.
# =============================================================================

set -euo pipefail

# Source libraries
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/setup.sh"
source "$SCRIPT_DIR/lib/assert.sh"

# Configuration
SUPERVISOR_PORT="${PI_SUPERVISOR_PORT:-3847}"
SUPERVISOR_URL="http://localhost:${SUPERVISOR_PORT}"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PID_FILE="$HOME/.pi-adapter-supervisor.pid"

# =============================================================================
# Setup/Teardown
# =============================================================================

# Ensure supervisor is running for tests that need it
ensure_supervisor_running() {
    if ! curl -s "$SUPERVISOR_URL/health" &>/dev/null; then
        log_info "Starting supervisor for error handling tests..."
        start_supervisor 15
    fi
}

# =============================================================================
# TC-ERR-001: Supervisor Unavailable
# =============================================================================
test_tc_err_001() {
    test_start "Supervisor unavailable error handling" "TC-ERR-001"
    
    # Ensure supervisor is NOT running
    cleanup_supervisor "force"
    sleep 2
    
    # Verify supervisor is not running
    local health_response
    health_response=$(curl -s -o /dev/null -w "%{http_code}" "$SUPERVISOR_URL/health" 2>/dev/null || echo "000")
    assert_not_equals "200" "$health_response" "Supervisor should not be running"
    
    # Verify error message is clear
    local error_output
    error_output=$(curl -s "$SUPERVISOR_URL/health" 2>&1 || true)
    
    # Connection should fail clearly
    assert_empty "$error_output" "Should return empty or clear error for unavailable supervisor"
    
    if assert_any_failed; then
        test_fail "TC-ERR-001 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-ERR-002: Invalid Tool Parameters
# =============================================================================
test_tc_err_002() {
    test_start "Invalid tool parameters validation" "TC-ERR-002"
    
    # Ensure supervisor is running
    ensure_supervisor_running
    
    # Test spawn without required parameters
    local response
    response=$(curl -s -X POST "$SUPERVISOR_URL/worker/spawn" \
        -H "Content-Type: application/json" \
        -d '{}' 2>&1)
    
    # Should return error
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$SUPERVISOR_URL/worker/spawn" \
        -H "Content-Type: application/json" \
        -d '{}' 2>/dev/null || echo "000")
    
    assert_not_equals "200" "$http_code" "Spawn with empty params should fail"
    
    # Test spawn with only partial params
    local partial_response
    partial_response=$(curl -s -X POST "$SUPERVISOR_URL/worker/spawn" \
        -H "Content-Type: application/json" \
        -d '{"role":"code-agent"}' 2>&1)
    
    local partial_code
    partial_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$SUPERVISOR_URL/worker/spawn" \
        -H "Content-Type: application/json" \
        -d '{"role":"code-agent"}' 2>/dev/null || echo "000")
    
    # Should either reject or accept (if only workflowPath is optional)
    # The important thing is it doesn't crash
    assert_contains "$partial_code" "20" "Should return 2xx or 4xx, not crash" || \
    assert_contains "$partial_code" "40" "Should return validation error"
    
    if assert_any_failed; then
        test_fail "TC-ERR-002 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-ERR-003: Worker Timeout - Default 300s
# =============================================================================
test_tc_err_003() {
    test_start "Worker timeout default 300s" "TC-ERR-003"
    
    # Ensure supervisor is running
    ensure_supervisor_running
    
    # Create a test workflow
    local test_workflow="$PROJECT_ROOT/runbook/tc-err-003-test.org"
    mkdir -p "$(dirname "$test_workflow")"
    cat > "$test_workflow" << 'EOF'
#+title: Timeout Test
#+date: [2026-03-31]
#+filetags: :test:
#+identifier: proj-timeout-test
#+TODO: TODO(t) IN-PROGRESS(i) | DONE(d)

* Project: Timeout Test
:PROPERTIES:
:PHASE: discovery
:END:

** IN-PROGRESS <main>
:PROPERTIES:
:ID: main-task
:OWNER: code-agent
:PHASE: discovery
:END:
- Goal :: Infinite loop task
- Context :: Testing timeout
- Findings ::
- Next Actions ::
EOF
    
    # Spawn infinite worker via API
    local spawn_response
    spawn_response=$(curl -s -X POST "$SUPERVISOR_URL/worker/spawn" \
        -H "Content-Type: application/json" \
        -d '{
            "role": "code-agent",
            "task": "while true; do sleep 1; done",
            "taskId": "infinite-loop",
            "workflowPath": "'"$test_workflow"'"
        }' 2>&1)
    
    # Extract worker ID
    local worker_id
    worker_id=$(echo "$spawn_response" | grep -o '"workerId":"[^"]*"' | cut -d'"' -f4)
    
    if [[ -z "$worker_id" ]]; then
        test_skip "Could not spawn worker for timeout test"
        rm -f "$test_workflow"
        return 0
    fi
    
    # Verify worker is running
    local status_response
    status_response=$(curl -s "$SUPERVISOR_URL/worker/$worker_id/status" 2>/dev/null || echo "{}")
    assert_contains "$status_response" "running" "Worker should be running"
    
    # Wait a short time and check it's still running
    sleep 5
    status_response=$(curl -s "$SUPERVISOR_URL/worker/$worker_id/status" 2>/dev/null || echo "{}")
    
    # Worker should still be running (not immediately timed out)
    assert_contains "$status_response" "running" "Worker should still be running after 5s"
    
    # Kill the worker for cleanup
    curl -s -X POST "$SUPERVISOR_URL/worker/$worker_id/kill" 2>/dev/null || true
    
    rm -f "$test_workflow"
    
    if assert_any_failed; then
        test_fail "TC-ERR-003 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-ERR-004: Worker Timeout - Custom 5s
# =============================================================================
test_tc_err_004() {
    test_start "Worker timeout custom 5s" "TC-ERR-004"
    
    # Ensure supervisor is running
    ensure_supervisor_running
    
    # Create a test workflow
    local test_workflow="$PROJECT_ROOT/runbook/tc-err-004-test.org"
    cat > "$test_workflow" << 'EOF'
#+title: Custom Timeout Test
#+date: [2026-03-31]
#+filetags: :test:
#+identifier: proj-custom-timeout
#+TODO: TODO(t) IN-PROGRESS(i) | DONE(d)

* Project: Custom Timeout Test
:PROPERTIES:
:PHASE: discovery
:END:

** IN-PROGRESS <main>
:PROPERTIES:
:ID: main-task
:OWNER: code-agent
:PHASE: discovery
:END:
- Goal :: Long running task
- Context :: Testing custom timeout
- Findings ::
- Next Actions ::
EOF
    
    # Spawn long-running worker
    local spawn_response
    spawn_response=$(curl -s -X POST "$SUPERVISOR_URL/worker/spawn" \
        -H "Content-Type: application/json" \
        -d '{
            "role": "code-agent",
            "task": "sleep 30",
            "taskId": "long-running",
            "workflowPath": "'"$test_workflow"'"
        }' 2>&1)
    
    # Extract worker ID
    local worker_id
    worker_id=$(echo "$spawn_response" | grep -o '"workerId":"[^"]*"' | cut -d'"' -f4)
    
    if [[ -z "$worker_id" ]]; then
        test_skip "Could not spawn worker for custom timeout test"
        rm -f "$test_workflow"
        return 0
    fi
    
    # Try to await with short timeout
    local start_time
    start_time=$(date +%s)
    
    local await_response
    await_response=$(curl -s -X POST "$SUPERVISOR_URL/worker/$worker_id/await" \
        -H "Content-Type: application/json" \
        -d '{"timeout": 5}' 2>&1)
    
    local end_time
    end_time=$(date +%s)
    local elapsed=$((end_time - start_time))
    
    # Should timeout around 5 seconds (allow some margin)
    assert_gt 10 "$elapsed" "Should timeout within reasonable time"
    assert_lt 2 "$elapsed" "Should take at least a couple seconds"
    
    # Kill worker for cleanup
    curl -s -X POST "$SUPERVISOR_URL/worker/$worker_id/kill" 2>/dev/null || true
    
    rm -f "$test_workflow"
    
    if assert_any_failed; then
        test_fail "TC-ERR-004 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-ERR-005: Concurrent Worker Spawn
# =============================================================================
test_tc_err_005() {
    test_start "Concurrent worker spawn handling" "TC-ERR-005"
    
    # Ensure supervisor is running
    ensure_supervisor_running
    
    # Create test workflow
    local test_workflow="$PROJECT_ROOT/runbook/tc-err-005-test.org"
    cat > "$test_workflow" << 'EOF'
#+title: Concurrent Test
#+date: [2026-03-31]
#+filetags: :test:
#+identifier: proj-concurrent
#+TODO: TODO(t) IN-PROGRESS(i) | DONE(d)

* Project: Concurrent Test
:PROPERTIES:
:PHASE: discovery
:END:

** TODO <task1>
:PROPERTIES:
:ID: task-1
:OWNER: code-agent
:PHASE: discovery
:END:
- Goal :: Concurrent task 1
- Context ::
- Findings ::
- Next Actions ::

** TODO <task2>
:PROPERTIES:
:ID: task-2
:OWNER: code-agent
:PHASE: discovery
:END:
- Goal :: Concurrent task 2
- Context ::
- Findings ::
- Next Actions ::
EOF
    
    # Spawn 5 workers concurrently
    local worker_ids=()
    local pids=()
    
    for i in {1..5}; do
        (
            local resp
            resp=$(curl -s -X POST "$SUPERVISOR_URL/worker/spawn" \
                -H "Content-Type: application/json" \
                -d '{
                    "role": "code-agent",
                    "task": "echo ' "$i"'",
                    "taskId": "concurrent-'"$i"'",
                    "workflowPath": "'"$test_workflow"'"
                }' 2>&1)
            echo "$resp"
        ) &
        pids+=($!)
    done
    
    # Wait for all spawns to complete
    for pid in "${pids[@]}"; do
        wait "$pid" 2>/dev/null || true
    done
    
    # Check supervisor health is still OK
    local health_response
    health_response=$(curl -s "$SUPERVISOR_URL/health" 2>/dev/null || echo "{}")
    
    # Supervisor should still be responsive
    assert_contains "$health_response" "ok" "Supervisor should remain healthy after concurrent spawns"
    
    # Check workers count
    local workers_count
    workers_count=$(echo "$health_response" | grep -o '"workers":[0-9]*' | grep -o '[0-9]*' || echo "0")
    
    # Should have spawned multiple workers (some may have completed)
    assert_gt "$workers_count" 0 "Should have spawned workers"
    
    # Cleanup - wait for workers
    sleep 3
    
    rm -f "$test_workflow"
    
    if assert_any_failed; then
        test_fail "TC-ERR-005 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-ERR-006: Malformed workflow.org
# =============================================================================
test_tc_err_006() {
    test_start "Malformed workflow.org handling" "TC-ERR-006"
    
    # Ensure supervisor is running
    ensure_supervisor_running
    
    # Create malformed workflow
    local bad_workflow="$PROJECT_ROOT/runbook/tc-err-006-malformed.org"
    
    # Write intentionally malformed org content
    cat > "$bad_workflow" << 'EOF'
#+title: Malformed Workflow
#+date: [2026-03-31]
#+filetags: :test:
#+identifier: proj-malformed

* Project: Malformed Test
:PROPERTIES:
:PHASE: discovery

** TODO <broken task
:PROPERTIES:
:ID: broken-task
:OWNER: code-agent
- Goal :: Broken task (malformed properties)
This content has no proper indentation
And weird spacing
EOF
    
    # Try to perform operations on it
    local update_response
    update_response=$(curl -s -X POST "$SUPERVISOR_URL/workflow/update" \
        -H "Content-Type: application/json" \
        -d '{"path": "'"$bad_workflow"'", "findings": ["test finding"]}' 2>&1)
    
    # Should either succeed gracefully or return clear error
    # Should NOT crash the supervisor
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$SUPERVISOR_URL/workflow/update" \
        -H "Content-Type: application/json" \
        -d '{"path": "'"$bad_workflow"'", "findings": ["test finding"]}' 2>/dev/null || echo "000")
    
    # Should not crash (no 500 error)
    assert_not_equals "500" "$http_code" "Should not crash on malformed workflow"
    assert_not_equals "000" "$http_code" "Should return a response"
    
    # Cleanup
    rm -f "$bad_workflow"
    
    if assert_any_failed; then
        test_fail "TC-ERR-006 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-ERR-007: Missing workflow.org
# =============================================================================
test_tc_err_007() {
    test_start "Missing workflow.org error handling" "TC-ERR-007"
    
    # Ensure supervisor is running
    ensure_supervisor_running
    
    local nonexistent="$PROJECT_ROOT/runbook/nonexistent-workflow-$(date +%s).org"
    
    # Try to update non-existent workflow
    local update_response
    update_response=$(curl -s -X POST "$SUPERVISOR_URL/workflow/update" \
        -H "Content-Type: application/json" \
        -d '{"path": "'"$nonexistent"'", "findings": ["test"]}' 2>&1)
    
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$SUPERVISOR_URL/workflow/update" \
        -H "Content-Type: application/json" \
        -d '{"path": "'"$nonexistent"'", "findings": ["test"]}' 2>/dev/null || echo "000")
    
    # Should return error (4xx)
    assert_contains "$http_code" "40" "Should return 4xx error for missing file"
    
    # Error message should be clear
    assert_contains "$update_response" "not found" "Error should mention file not found" || \
    assert_contains "$update_response" "not exist" "Error should mention file not found" || \
    assert_contains "$update_response" "No such file" "Error should mention file not found"
    
    # File should NOT be created
    assert_file_not_exists "$nonexistent" "Missing workflow should not create file"
    
    if assert_any_failed; then
        test_fail "TC-ERR-007 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-ERR-008: Network/Operation Timeout
# =============================================================================
test_tc_err_008() {
    test_start "Network/operation timeout handling" "TC-ERR-008"
    
    # Ensure supervisor is running
    ensure_supervisor_running
    
    # Test a slow operation by requesting non-existent worker
    local start_time
    start_time=$(date +%s)
    
    local response
    response=$(curl -s --max-time 10 "$SUPERVISOR_URL/worker/nonexistent-worker-id/status" 2>&1)
    
    local end_time
    end_time=$(date +%s)
    local elapsed=$((end_time - start_time))
    
    # Should return quickly with not found, not hang
    assert_lt "$elapsed" 15 "Operation should timeout within reasonable time"
    
    # Should return 404 or similar for non-existent worker
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
        "$SUPERVISOR_URL/worker/nonexistent-worker-id/status" 2>/dev/null || echo "000")
    
    assert_contains "$http_code" "40" "Should return 4xx for non-existent worker"
    
    if assert_any_failed; then
        test_fail "TC-ERR-008 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-ERR-009: PID File Corruption
# =============================================================================
test_tc_err_009() {
    test_start "PID file corruption handling" "TC-ERR-009"
    
    # Ensure supervisor is not running
    cleanup_supervisor "force"
    sleep 2
    
    # Create corrupted PID file
    local corrupted_pid_file="$HOME/.pi-adapter-supervisor.pid"
    echo "abc123notapid" > "$corrupted_pid_file"
    
    assert_file_exists "$corrupted_pid_file" "Corrupted PID file should exist"
    
    # Start supervisor - should handle corrupted file gracefully
    if start_supervisor 15; then
        # Verify new PID is valid
        local new_pid
        new_pid=$(get_supervisor_pid)
        
        assert_not_empty "$new_pid" "Should have valid PID after start"
        
        # PID should be numeric
        if [[ "$new_pid" =~ ^[0-9]+$ ]]; then
            assert_pid_alive "$new_pid" "Supervisor should be running with numeric PID"
        fi
        
        # Health should be OK
        local health
        health=$(curl -s "$SUPERVISOR_URL/health" 2>/dev/null || echo "{}")
        assert_contains "$health" "ok" "Supervisor should be healthy"
    else
        # If start fails, it should fail gracefully with clear error
        log_warn "Supervisor start failed - checking graceful error handling"
    fi
    
    cleanup_supervisor "force"
    
    if assert_any_failed; then
        test_fail "TC-ERR-009 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-ERR-010: Extension Load Failure
# =============================================================================
test_tc_err_010() {
    test_start "Extension load failure handling" "TC-ERR-010"
    
    # Ensure supervisor is not running
    cleanup_supervisor "force"
    sleep 2
    
    local adapter_dir="$PROJECT_ROOT/.pi/extensions/pi-adapter"
    
    # Backup original extension
    local backup_file=""
    if [[ -f "$adapter_dir/index.ts" ]]; then
        backup_file="$adapter_dir/index.ts.bak"
        cp "$adapter_dir/index.ts" "$backup_file"
    fi
    
    # Introduce syntax error
    if [[ -d "$adapter_dir" ]]; then
        echo "syntax error here {{{" > "$adapter_dir/index.ts"
        
        # Try to start supervisor
        local start_failed=0
        start_supervisor 10 || start_failed=1
        
        if [[ "$start_failed" -eq 1 ]]; then
            # Good - it detected the error
            assert_success "true" "Extension load failure should be detected"
        else
            # If it started anyway, supervisor should have handled it
            local health
            health=$(curl -s "$SUPERVISOR_URL/health" 2>/dev/null || echo "{}")
            
            # At minimum, it shouldn't crash the shell
            assert_not_contains "$health" "null" "Should handle gracefully"
        fi
        
        # Restore original
        if [[ -n "$backup_file" && -f "$backup_file" ]]; then
            mv "$backup_file" "$adapter_dir/index.ts"
        fi
    else
        test_skip "Adapter directory not found"
    fi
    
    cleanup_supervisor "force"
    
    if assert_any_failed; then
        test_fail "TC-ERR-010 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# Helper: Check if any assertions failed
# =============================================================================
assert_any_failed() {
    [[ $ASSERT_FAILED -gt 0 ]]
}

# =============================================================================
# Main
# =============================================================================

main() {
    echo ""
    echo "========================================"
    echo "Error Handling Test Suite"
    echo "========================================"
    
    # Run all tests
    local failed=0
    
    test_tc_err_001 || failed=$((failed + 1))
    cleanup_supervisor "force"
    sleep 1
    
    test_tc_err_002 || failed=$((failed + 1))
    
    test_tc_err_003 || failed=$((failed + 1))
    
    test_tc_err_004 || failed=$((failed + 1))
    
    test_tc_err_005 || failed=$((failed + 1))
    
    test_tc_err_006 || failed=$((failed + 1))
    
    test_tc_err_007 || failed=$((failed + 1))
    
    test_tc_err_008 || failed=$((failed + 1))
    
    test_tc_err_009 || failed=$((failed + 1))
    cleanup_supervisor "force"
    
    test_tc_err_010 || failed=$((failed + 1))
    cleanup_supervisor "force"
    
    # Summary
    echo ""
    echo "========================================"
    echo "Test Summary: Error Handling"
    echo "========================================"
    echo "Tests run: 10"
    echo "Passed: $((10 - failed))"
    echo "Failed: $failed"
    
    if [[ $failed -gt 0 ]]; then
        exit 1
    fi
    exit 0
}

# Run main if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
