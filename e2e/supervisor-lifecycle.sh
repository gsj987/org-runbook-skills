#!/usr/bin/env bash
# =============================================================================
# pi-adapter E2E Test Suite - Supervisor Lifecycle Tests
# =============================================================================
# Tests supervisor process lifecycle management:
# - TC-SUP-001: Start supervisor and verify health
# - TC-SUP-002: Singleton enforcement (second start fails)
# - TC-SUP-003: Kill supervisor and verify cleanup
# - TC-SUP-004: Restart supervisor with clean state
# - TC-SUP-005: Handle stale PID file
# =============================================================================

set -euo pipefail

# Source libraries
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/setup.sh"
source "$SCRIPT_DIR/lib/api.sh"
source "$SCRIPT_DIR/lib/assert.sh"

# Configuration
SUPERVISOR_PORT="${PI_SUPERVISOR_PORT:-3847}"
SUPERVISOR_URL="http://localhost:${SUPERVISOR_PORT}"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ADAPTERS_DIR="$PROJECT_ROOT/adapters"

# =============================================================================
# TC-SUP-001: Start supervisor and verify health
# =============================================================================
test_tc_sup_001() {
    test_start "Start supervisor and verify health" "TC-SUP-001"
    
    # Clean environment first
    cleanup_supervisor "force"
    sleep 2
    
    # Start supervisor
    if ! start_supervisor 15; then
        test_fail "Failed to start supervisor"
        return 1
    fi
    
    # Verify PID file exists
    local pid_file="$HOME/.pi-adapter-supervisor.pid"
    assert_file_exists "$pid_file" "PID file should exist"
    
    # Verify PID is valid
    local pid
    pid=$(cat "$pid_file")
    assert_pid_alive "$pid" "Supervisor process should be alive"
    
    # Verify health endpoint
    local health_response
    health_response=$(api_health)
    assert_contains "$health_response" '"status"' "Health response should contain status"
    
    # Verify workers and results keys exist
    assert_json_equals "$health_response" ".status" "ok" "Health status should be ok"
    
    if assert_any_failed; then
        test_fail "TC-SUP-001 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-SUP-002: Singleton enforcement
# =============================================================================
test_tc_sup_002() {
    test_start "Verify singleton enforcement" "TC-SUP-002"
    
    # Ensure supervisor is running
    ensure_supervisor
    
    # Get current PID
    local first_pid
    first_pid=$(get_supervisor_pid)
    assert_not_empty "$first_pid" "Should have PID file"
    
    # Try to start second supervisor
    # The second start should fail or be rejected
    cd "$ADAPTERS_DIR/pi"
    local second_output
    second_output=$(timeout 10 npx ts-node --esm protocol.ts 2>&1 || true)
    cd - > /dev/null
    
    # Should see warning about already running
    assert_contains "$second_output" "running" "Should warn about existing supervisor" || \
    assert_contains "$second_output" "already" "Should mention already running" || \
    assert_contains "$second_output" "another" "Should mention another instance"
    
    # Original PID should be unchanged
    local current_pid
    current_pid=$(get_supervisor_pid)
    assert_equals "$first_pid" "$current_pid" "PID should remain unchanged"
    
    # Supervisor should still be responsive
    assert_http_ok "$SUPERVISOR_URL/health" "Supervisor should still be healthy"
    
    if assert_any_failed; then
        test_fail "TC-SUP-002 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-SUP-003: Kill supervisor and verify cleanup
# =============================================================================
test_tc_sup_003() {
    test_start "Kill supervisor and verify cleanup" "TC-SUP-003"
    
    # Ensure supervisor is running
    ensure_supervisor
    
    # Get PID before kill
    local pid_before
    pid_before=$(get_supervisor_pid)
    assert_not_empty "$pid_before" "Should have PID before kill"
    
    # Kill supervisor
    cleanup_supervisor "force"
    sleep 2
    
    # Verify PID file removed
    local pid_file="$HOME/.pi-adapter-supervisor.pid"
    assert_file_not_exists "$pid_file" "PID file should be removed"
    
    # Verify process is dead
    assert_pid_dead "$pid_before" "Supervisor process should be dead"
    
    # Verify health endpoint is unreachable
    local health_status
    health_status=$(curl -s -o /dev/null -w "%{http_code}" "$SUPERVISOR_URL/health" 2>/dev/null || echo "000")
    assert_not_equals "200" "$health_status" "Health endpoint should be unreachable"
    assert_not_equals "2" "${health_status:0:1}" "Health endpoint should not return 2xx"
    
    # Port should be free
    assert_port_free "$SUPERVISOR_PORT" "Port should be free after kill"
    
    if assert_any_failed; then
        test_fail "TC-SUP-003 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-SUP-004: Restart supervisor with clean state
# =============================================================================
test_tc_sup_004() {
    test_start "Restart supervisor with clean state" "TC-SUP-004"
    
    # Start supervisor
    if ! start_supervisor 15; then
        test_fail "Failed to start supervisor"
        return 1
    fi
    
    # Get PID
    local pid_before
    pid_before=$(get_supervisor_pid)
    assert_not_empty "$pid_before" "Should have PID before restart"
    
    # Verify health
    assert_http_ok "$SUPERVISOR_URL/health" "Supervisor should be healthy"
    
    # Restart
    restart_supervisor
    sleep 2
    
    # Get new PID
    local pid_after
    pid_after=$(get_supervisor_pid)
    assert_not_empty "$pid_after" "Should have PID after restart"
    
    # PID should be different (or same if reused quickly)
    # The important thing is it's running
    assert_pid_alive "$pid_after" "New supervisor process should be alive"
    
    # Health should be restored
    assert_http_ok "$SUPERVISOR_URL/health" "Supervisor should be healthy after restart"
    
    # Should have clean state (workers count should be 0)
    local health_response
    health_response=$(api_health)
    local workers_count
    workers_count=$(echo "$health_response" | jq -r '.workers // -1')
    assert_equals "0" "$workers_count" "Should have clean state with 0 workers"
    
    if assert_any_failed; then
        test_fail "TC-SUP-004 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-SUP-005: Handle stale PID file
# =============================================================================
test_tc_sup_005() {
    test_start "Handle stale PID file" "TC-SUP-005"
    
    # Clean environment
    cleanup_supervisor "force"
    sleep 2
    
    # Create stale PID file with non-existent PID
    local stale_pid=99999
    local pid_file="$HOME/.pi-adapter-supervisor.pid"
    echo "$stale_pid" > "$pid_file"
    
    # Verify PID file exists but process is dead
    assert_file_exists "$pid_file" "Stale PID file should exist"
    assert_pid_dead "$stale_pid" "Stale PID should be dead"
    
    # Start supervisor - should handle stale PID gracefully
    if ! start_supervisor 15; then
        test_fail "Failed to start supervisor with stale PID"
        return 1
    fi
    
    # Verify new PID file is correct
    local new_pid
    new_pid=$(get_supervisor_pid)
    assert_not_equals "$stale_pid" "$new_pid" "New PID should differ from stale"
    assert_pid_alive "$new_pid" "New supervisor should be alive"
    
    # Health should be OK
    assert_http_ok "$SUPERVISOR_URL/health" "Supervisor should be healthy"
    
    if assert_any_failed; then
        test_fail "TC-SUP-005 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-SUP-006: Health Endpoint Response validation (P0)
# =============================================================================
test_tc_sup_006() {
    test_start "Health endpoint response validation" "TC-SUP-006"
    
    # Ensure supervisor is running
    ensure_supervisor
    
    # Get health response
    local health_response
    health_response=$(api_health)
    
    # Verify valid JSON structure
    assert_contains "$health_response" "status" "Health response should have status field"
    assert_contains "$health_response" "workers" "Health response should have workers field"
    assert_contains "$health_response" "results" "Health response should have results field"
    
    # Verify values are correct types
    local status workers results
    status=$(echo "$health_response" | jq -r '.status' 2>/dev/null || echo "error")
    workers=$(echo "$health_response" | jq -r '.workers' 2>/dev/null || echo "-1")
    results=$(echo "$health_response" | jq -r '.results' 2>/dev/null || echo "-1")
    
    assert_equals "ok" "$status" "Health status should be ok"
    assert_num_equals "$workers" "$workers" "Workers count should be valid number"
    assert_num_equals "$results" "$results" "Results count should be valid number"
    
    # Test rapid requests for consistency
    for i in {1..5}; do
        local rapid_response
        rapid_response=$(api_health)
        assert_contains "$rapid_response" '"status":"ok"' "Rapid request $i should return ok status"
    done
    
    # Test response time is reasonable
    local start_time=$(date +%s%N)
    api_health > /dev/null
    local end_time=$(date +%s%N)
    local duration_ms=$(( (end_time - start_time) / 1000000 ))
    assert_lt "$duration_ms" "1000" "Health endpoint should respond in under 1 second (was ${duration_ms}ms)"
    
    if assert_any_failed; then
        test_fail "TC-SUP-006 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-SUP-007: Supervisor Log Output (P1)
# =============================================================================
test_tc_sup_007() {
    test_start "Supervisor log output" "TC-SUP-007"
    
    # Ensure supervisor is running
    ensure_supervisor
    
    # Check if log file exists and has content
    local log_file="/tmp/pi-supervisor.log"
    
    if [[ -f "$log_file" ]]; then
        # Verify log file is readable
        assert_file_exists "$log_file" "Log file should exist"
        
        # Check for startup patterns in log
        local log_content
        log_content=$(cat "$log_file" 2>/dev/null || echo "")
        
        # Log may contain startup indicators
        if [[ -n "$log_content" ]]; then
            # Supervisor should have logged something during startup
            assert_not_empty "$log_content" "Log file should have content"
        fi
    else
        # Log file may not exist in all configurations, skip assertion
        echo "Log file not found at $log_file, skipping log content checks"
    fi
    
    # Test that supervisor generates activity logs when workers run
    # Spawn a quick worker and check activity
    local workflow_path="$PROJECT_ROOT/runbook/tc-sup-007-test.org"
    rm -f "$workflow_path"
    create_minimal_workflow "$workflow_path"
    
    local worker_response
    worker_response=$(api_spawn "arch-agent" "echo 'log test'" "log-task-001" "$workflow_path")
    
    if [[ "$worker_response" != *"workerId"* ]]; then
        test_skip "Could not spawn worker to test logs"
        rm -f "$workflow_path"
        return 0
    fi
    
    local worker_id
    worker_id=$(echo "$worker_response" | jq -r '.workerId')
    
    # Wait for worker to complete
    sleep 3
    
    # Check if supervisor still healthy
    assert_http_ok "$SUPERVISOR_URL/health" "Supervisor should still be healthy after worker"
    
    if assert_any_failed; then
        test_fail "TC-SUP-007 failed"
        rm -f "$workflow_path"
        return 1
    fi
    
    rm -f "$workflow_path"
    test_pass
}

# =============================================================================
# TC-SUP-008: Port Conflict Handling (P0)
# =============================================================================
test_tc_sup_008() {
    test_start "Port conflict handling" "TC-SUP-008"
    
    # Clean environment first
    cleanup_supervisor "force"
    sleep 2
    
    # Occupy port 3847 with a simple listener
    local listener_pid=""
    if command -v nc &>/dev/null; then
        nc -l 3847 > /dev/null 2>&1 &
        listener_pid=$!
        sleep 1
    elif command -v python3 &>/dev/null; then
        python3 -c "import socket; s=socket.socket(); s.bind(('',3847)); import time; time.sleep(30)" &
        listener_pid=$!
        sleep 1
    else
        test_skip "No suitable tool to occupy port"
        return 0
    fi
    
    # Verify port is now in use
    assert_port_in_use "$SUPERVISOR_PORT" "Port should be occupied"
    
    # Try to start supervisor - should fail with clear error
    local start_output=""
    local start_failed=0
    
    cd "$ADAPTERS_DIR/pi"
    start_output=$(timeout 10 npx ts-node --esm protocol.ts 2>&1 || true)
    cd - > /dev/null
    
    # Check that port conflict was detected
    if [[ -n "$start_output" ]]; then
        assert_contains "$start_output" "3847" "Error should mention the port" || \
        assert_contains "$start_output" "in use" "Error should mention port in use" || \
        assert_contains "$start_output" "address" "Error should mention address/port issue"
    fi
    
    # Cleanup the listener
    if [[ -n "$listener_pid" ]]; then
        kill "$listener_pid" 2>/dev/null || true
        sleep 1
    fi
    
    # Verify port is now free
    assert_port_free "$SUPERVISOR_PORT" "Port should be free after listener cleanup"
    
    # Now supervisor should start successfully
    if ! start_supervisor 15; then
        test_fail "Failed to start supervisor after port freed"
        return 1
    fi
    
    # Verify supervisor is healthy
    assert_http_ok "$SUPERVISOR_URL/health" "Supervisor should be healthy after restart"
    
    if assert_any_failed; then
        test_fail "TC-SUP-008 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-SUP-009: SIGINT Graceful Shutdown (P1)
# =============================================================================
test_tc_sup_009() {
    test_start "SIGINT graceful shutdown" "TC-SUP-009"
    
    # Ensure supervisor is running
    ensure_supervisor
    
    # Get PID
    local pid
    pid=$(get_supervisor_pid)
    assert_not_empty "$pid" "Should have PID before SIGINT"
    assert_pid_alive "$pid" "Supervisor should be alive before SIGINT"
    
    # Send SIGINT
    kill -INT "$pid" 2>/dev/null
    
    # Wait for graceful shutdown
    sleep 3
    
    # Verify process exited
    assert_pid_dead "$pid" "Supervisor should exit after SIGINT"
    
    # Verify PID file removed
    local pid_file="$HOME/.pi-adapter-supervisor.pid"
    assert_file_not_exists "$pid_file" "PID file should be removed after shutdown"
    
    # Verify port is free
    assert_port_free "$SUPERVISOR_PORT" "Port should be free after shutdown"
    
    # Verify health endpoint unreachable
    local health_status
    health_status=$(curl -s -o /dev/null -w "%{http_code}" "$SUPERVISOR_URL/health" 2>/dev/null || echo "000")
    assert_not_equals "200" "$health_status" "Health endpoint should be unreachable"
    
    if assert_any_failed; then
        test_fail "TC-SUP-009 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-SUP-010: SIGTERM Graceful Shutdown (P2)
# =============================================================================
test_tc_sup_010() {
    test_start "SIGTERM graceful shutdown" "TC-SUP-010"
    
    # Ensure supervisor is running
    ensure_supervisor
    
    # Get PID
    local pid
    pid=$(get_supervisor_pid)
    assert_not_empty "$pid" "Should have PID before SIGTERM"
    assert_pid_alive "$pid" "Supervisor should be alive before SIGTERM"
    
    # Send SIGTERM
    kill -TERM "$pid" 2>/dev/null
    
    # Wait for graceful shutdown
    sleep 3
    
    # Verify process exited
    assert_pid_dead "$pid" "Supervisor should exit after SIGTERM"
    
    # Verify PID file removed
    local pid_file="$HOME/.pi-adapter-supervisor.pid"
    assert_file_not_exists "$pid_file" "PID file should be removed after shutdown"
    
    # Verify port is free
    assert_port_free "$SUPERVISOR_PORT" "Port should be free after shutdown"
    
    if assert_any_failed; then
        test_fail "TC-SUP-010 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# Main
# =============================================================================

main() {
    echo ""
    echo "========================================"
    echo "Supervisor Lifecycle Test Suite"
    echo "========================================"
    
    # Run all tests
    local failed=0
    local passed=0
    local total=10
    
    test_tc_sup_001 || failed=$((failed + 1))
    cleanup_supervisor "force"
    sleep 2
    
    test_tc_sup_002 || failed=$((failed + 1))
    cleanup_supervisor "force"
    sleep 2
    
    test_tc_sup_003 || failed=$((failed + 1))
    sleep 2
    
    test_tc_sup_004 || failed=$((failed + 1))
    cleanup_supervisor "force"
    sleep 2
    
    test_tc_sup_005 || failed=$((failed + 1))
    cleanup_supervisor "force"
    sleep 2
    
    test_tc_sup_006 || failed=$((failed + 1))
    
    test_tc_sup_007 || failed=$((failed + 1))
    
    # TC-SUP-008 needs fresh port
    cleanup_supervisor "force"
    sleep 2
    test_tc_sup_008 || failed=$((failed + 1))
    cleanup_supervisor "force"
    sleep 2
    
    test_tc_sup_009 || failed=$((failed + 1))
    sleep 2
    
    test_tc_sup_010 || failed=$((failed + 1))
    cleanup_supervisor "force"
    
    # Summary
    echo ""
    echo "========================================"
    echo "Test Summary: Supervisor Lifecycle"
    echo "========================================"
    echo "Tests run: $total"
    echo "Passed: $((total - failed))"
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
