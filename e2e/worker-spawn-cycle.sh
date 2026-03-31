#!/usr/bin/env bash
# =============================================================================
# pi-adapter E2E Test Suite - Worker Spawn Cycle Tests
# =============================================================================
# Tests worker spawning and lifecycle management:
# - TC-WK-001 to TC-WK-016: Spawn different agent roles
# - TC-WK-017: worker.awaitResult success case
# - TC-WK-018: worker.awaitResult timeout
# - TC-WK-019: worker.status running/completed states
# - TC-WK-020: Multiple workers isolation
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
# TC-WK-001: worker.spawn - arch-agent
# =============================================================================
test_tc_wk_001() {
    test_start "worker.spawn - arch-agent" "TC-WK-001"
    ensure_supervisor
    
    # Create workflow first
    local workflow_path="$PROJECT_ROOT/runbook/tc-wk-001.org"
    create_minimal_workflow "$workflow_path"
    
    # Spawn worker
    local response
    response=$(api_spawn "arch-agent" "echo 'arch-agent-test'" "tc-wk-001" "$workflow_path")
    
    # Get worker ID and verify
    local worker_id
    worker_id=$(echo "$response" | jq -r '.workerId // empty')
    assert_not_empty "$worker_id" "Should receive workerId"
    
    # Await and verify
    local result
    result=$(api_await "$worker_id" 120)
    
    assert_equals "0" "$(echo "$result" | jq -r '.result.exitCode // -1')" "Worker should exit with 0"
    
    if assert_any_failed; then
        test_fail "TC-WK-001 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-WK-002: worker.spawn - code-agent
# =============================================================================
test_tc_wk_002() {
    test_start "worker.spawn - code-agent" "TC-WK-002"
    ensure_supervisor
    
    local workflow_path="$PROJECT_ROOT/runbook/tc-wk-002.org"
    create_minimal_workflow "$workflow_path"
    
    local response
    response=$(api_spawn "code-agent" "echo 'code-agent-test'" "tc-wk-002" "$workflow_path")
    
    local worker_id
    worker_id=$(echo "$response" | jq -r '.workerId // empty')
    assert_not_empty "$worker_id" "Should receive workerId"
    
    local result
    result=$(api_await "$worker_id" 120)
    
    assert_equals "0" "$(echo "$result" | jq -r '.result.exitCode // -1')" "Worker should exit with 0"
    
    if assert_any_failed; then
        test_fail "TC-WK-002 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-WK-003: worker.spawn - test-agent
# =============================================================================
test_tc_wk_003() {
    test_start "worker.spawn - test-agent" "TC-WK-003"
    ensure_supervisor
    
    local workflow_path="$PROJECT_ROOT/runbook/tc-wk-003.org"
    create_minimal_workflow "$workflow_path"
    
    local response
    response=$(api_spawn "test-agent" "echo 'test-agent-test'" "tc-wk-003" "$workflow_path")
    
    local worker_id
    worker_id=$(echo "$response" | jq -r '.workerId // empty')
    assert_not_empty "$worker_id" "Should receive workerId"
    
    local result
    result=$(api_await "$worker_id" 120)
    
    assert_equals "0" "$(echo "$result" | jq -r '.result.exitCode // -1')" "Worker should exit with 0"
    
    if assert_any_failed; then
        test_fail "TC-WK-003 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-WK-004: worker.spawn - ops-agent
# =============================================================================
test_tc_wk_004() {
    test_start "worker.spawn - ops-agent" "TC-WK-004"
    ensure_supervisor
    
    local workflow_path="$PROJECT_ROOT/runbook/tc-wk-004.org"
    create_minimal_workflow "$workflow_path"
    
    local response
    response=$(api_spawn "ops-agent" "echo 'ops-agent-test'" "tc-wk-004" "$workflow_path")
    
    local worker_id
    worker_id=$(echo "$response" | jq -r '.workerId // empty')
    assert_not_empty "$worker_id" "Should receive workerId"
    
    local result
    result=$(api_await "$worker_id" 120)
    
    assert_equals "0" "$(echo "$result" | jq -r '.result.exitCode // -1')" "Worker should exit with 0"
    
    if assert_any_failed; then
        test_fail "TC-WK-004 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-WK-005: worker.spawn - pm-agent
# =============================================================================
test_tc_wk_005() {
    test_start "worker.spawn - pm-agent" "TC-WK-005"
    ensure_supervisor
    
    local workflow_path="$PROJECT_ROOT/runbook/tc-wk-005.org"
    create_minimal_workflow "$workflow_path"
    
    local response
    response=$(api_spawn "pm-agent" "echo 'pm-agent-test'" "tc-wk-005" "$workflow_path")
    
    local worker_id
    worker_id=$(echo "$response" | jq -r '.workerId // empty')
    assert_not_empty "$worker_id" "Should receive workerId"
    
    local result
    result=$(api_await "$worker_id" 120)
    
    assert_equals "0" "$(echo "$result" | jq -r '.result.exitCode // -1')" "Worker should exit with 0"
    
    if assert_any_failed; then
        test_fail "TC-WK-005 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-WK-006: worker.spawn - research-agent
# =============================================================================
test_tc_wk_006() {
    test_start "worker.spawn - research-agent" "TC-WK-006"
    ensure_supervisor
    
    local workflow_path="$PROJECT_ROOT/runbook/tc-wk-006.org"
    create_minimal_workflow "$workflow_path"
    
    local response
    response=$(api_spawn "research-agent" "echo 'research-agent-test'" "tc-wk-006" "$workflow_path")
    
    local worker_id
    worker_id=$(echo "$response" | jq -r '.workerId // empty')
    assert_not_empty "$worker_id" "Should receive workerId"
    
    local result
    result=$(api_await "$worker_id" 120)
    
    assert_equals "0" "$(echo "$result" | jq -r '.result.exitCode // -1')" "Worker should exit with 0"
    
    if assert_any_failed; then
        test_fail "TC-WK-006 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-WK-007: worker.spawn - ux-agent
# =============================================================================
test_tc_wk_007() {
    test_start "worker.spawn - ux-agent" "TC-WK-007"
    ensure_supervisor
    
    local workflow_path="$PROJECT_ROOT/runbook/tc-wk-007.org"
    create_minimal_workflow "$workflow_path"
    
    local response
    response=$(api_spawn "ux-agent" "echo 'ux-agent-test'" "tc-wk-007" "$workflow_path")
    
    local worker_id
    worker_id=$(echo "$response" | jq -r '.workerId // empty')
    assert_not_empty "$worker_id" "Should receive workerId"
    
    local result
    result=$(api_await "$worker_id" 120)
    
    assert_equals "0" "$(echo "$result" | jq -r '.result.exitCode // -1')" "Worker should exit with 0"
    
    if assert_any_failed; then
        test_fail "TC-WK-007 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-WK-008: worker.spawn - api-agent
# =============================================================================
test_tc_wk_008() {
    test_start "worker.spawn - api-agent" "TC-WK-008"
    ensure_supervisor
    
    local workflow_path="$PROJECT_ROOT/runbook/tc-wk-008.org"
    create_minimal_workflow "$workflow_path"
    
    local response
    response=$(api_spawn "api-agent" "echo 'api-agent-test'" "tc-wk-008" "$workflow_path")
    
    local worker_id
    worker_id=$(echo "$response" | jq -r '.workerId // empty')
    assert_not_empty "$worker_id" "Should receive workerId"
    
    local result
    result=$(api_await "$worker_id" 120)
    
    assert_equals "0" "$(echo "$result" | jq -r '.result.exitCode // -1')" "Worker should exit with 0"
    
    if assert_any_failed; then
        test_fail "TC-WK-008 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-WK-009: worker.spawn - qa-agent
# =============================================================================
test_tc_wk_009() {
    test_start "worker.spawn - qa-agent" "TC-WK-009"
    ensure_supervisor
    
    local workflow_path="$PROJECT_ROOT/runbook/tc-wk-009.org"
    create_minimal_workflow "$workflow_path"
    
    local response
    response=$(api_spawn "qa-agent" "echo 'qa-agent-test'" "tc-wk-009" "$workflow_path")
    
    local worker_id
    worker_id=$(echo "$response" | jq -r '.workerId // empty')
    assert_not_empty "$worker_id" "Should receive workerId"
    
    local result
    result=$(api_await "$worker_id" 120)
    
    assert_equals "0" "$(echo "$result" | jq -r '.result.exitCode // -1')" "Worker should exit with 0"
    
    if assert_any_failed; then
        test_fail "TC-WK-009 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-WK-010: worker.spawn - integration-agent
# =============================================================================
test_tc_wk_010() {
    test_start "worker.spawn - integration-agent" "TC-WK-010"
    ensure_supervisor
    
    local workflow_path="$PROJECT_ROOT/runbook/tc-wk-010.org"
    create_minimal_workflow "$workflow_path"
    
    local response
    response=$(api_spawn "integration-agent" "echo 'integration-agent-test'" "tc-wk-010" "$workflow_path")
    
    local worker_id
    worker_id=$(echo "$response" | jq -r '.workerId // empty')
    assert_not_empty "$worker_id" "Should receive workerId"
    
    local result
    result=$(api_await "$worker_id" 120)
    
    assert_equals "0" "$(echo "$result" | jq -r '.result.exitCode // -1')" "Worker should exit with 0"
    
    if assert_any_failed; then
        test_fail "TC-WK-010 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-WK-011: worker.spawn - deploy-agent
# =============================================================================
test_tc_wk_011() {
    test_start "worker.spawn - deploy-agent" "TC-WK-011"
    ensure_supervisor
    
    local workflow_path="$PROJECT_ROOT/runbook/tc-wk-011.org"
    create_minimal_workflow "$workflow_path"
    
    local response
    response=$(api_spawn "deploy-agent" "echo 'deploy-agent-test'" "tc-wk-011" "$workflow_path")
    
    local worker_id
    worker_id=$(echo "$response" | jq -r '.workerId // empty')
    assert_not_empty "$worker_id" "Should receive workerId"
    
    local result
    result=$(api_await "$worker_id" 120)
    
    assert_equals "0" "$(echo "$result" | jq -r '.result.exitCode // -1')" "Worker should exit with 0"
    
    if assert_any_failed; then
        test_fail "TC-WK-011 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-WK-012: worker.spawn - deps-agent
# =============================================================================
test_tc_wk_012() {
    test_start "worker.spawn - deps-agent" "TC-WK-012"
    ensure_supervisor
    
    local workflow_path="$PROJECT_ROOT/runbook/tc-wk-012.org"
    create_minimal_workflow "$workflow_path"
    
    local response
    response=$(api_spawn "deps-agent" "echo 'deps-agent-test'" "tc-wk-012" "$workflow_path")
    
    local worker_id
    worker_id=$(echo "$response" | jq -r '.workerId // empty')
    assert_not_empty "$worker_id" "Should receive workerId"
    
    local result
    result=$(api_await "$worker_id" 120)
    
    assert_equals "0" "$(echo "$result" | jq -r '.result.exitCode // -1')" "Worker should exit with 0"
    
    if assert_any_failed; then
        test_fail "TC-WK-012 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-WK-013: worker.spawn - security-agent
# =============================================================================
test_tc_wk_013() {
    test_start "worker.spawn - security-agent" "TC-WK-013"
    ensure_supervisor
    
    local workflow_path="$PROJECT_ROOT/runbook/tc-wk-013.org"
    create_minimal_workflow "$workflow_path"
    
    local response
    response=$(api_spawn "security-agent" "echo 'security-agent-test'" "tc-wk-013" "$workflow_path")
    
    local worker_id
    worker_id=$(echo "$response" | jq -r '.workerId // empty')
    assert_not_empty "$worker_id" "Should receive workerId"
    
    local result
    result=$(api_await "$worker_id" 120)
    
    assert_equals "0" "$(echo "$result" | jq -r '.result.exitCode // -1')" "Worker should exit with 0"
    
    if assert_any_failed; then
        test_fail "TC-WK-013 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-WK-014: worker.spawn - perf-agent
# =============================================================================
test_tc_wk_014() {
    test_start "worker.spawn - perf-agent" "TC-WK-014"
    ensure_supervisor
    
    local workflow_path="$PROJECT_ROOT/runbook/tc-wk-014.org"
    create_minimal_workflow "$workflow_path"
    
    local response
    response=$(api_spawn "perf-agent" "echo 'perf-agent-test'" "tc-wk-014" "$workflow_path")
    
    local worker_id
    worker_id=$(echo "$response" | jq -r '.workerId // empty')
    assert_not_empty "$worker_id" "Should receive workerId"
    
    local result
    result=$(api_await "$worker_id" 120)
    
    assert_equals "0" "$(echo "$result" | jq -r '.result.exitCode // -1')" "Worker should exit with 0"
    
    if assert_any_failed; then
        test_fail "TC-WK-014 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-WK-015: worker.spawn - data-agent
# =============================================================================
test_tc_wk_015() {
    test_start "worker.spawn - data-agent" "TC-WK-015"
    ensure_supervisor
    
    local workflow_path="$PROJECT_ROOT/runbook/tc-wk-015.org"
    create_minimal_workflow "$workflow_path"
    
    local response
    response=$(api_spawn "data-agent" "echo 'data-agent-test'" "tc-wk-015" "$workflow_path")
    
    local worker_id
    worker_id=$(echo "$response" | jq -r '.workerId // empty')
    assert_not_empty "$worker_id" "Should receive workerId"
    
    local result
    result=$(api_await "$worker_id" 120)
    
    assert_equals "0" "$(echo "$result" | jq -r '.result.exitCode // -1')" "Worker should exit with 0"
    
    if assert_any_failed; then
        test_fail "TC-WK-015 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-WK-016: worker.spawn - orchestrator
# =============================================================================
test_tc_wk_016() {
    test_start "worker.spawn - orchestrator" "TC-WK-016"
    ensure_supervisor
    
    local workflow_path="$PROJECT_ROOT/runbook/tc-wk-016.org"
    create_minimal_workflow "$workflow_path"
    
    local response
    response=$(api_spawn "orchestrator" "echo 'orchestrator-test'" "tc-wk-016" "$workflow_path")
    
    local worker_id
    worker_id=$(echo "$response" | jq -r '.workerId // empty')
    assert_not_empty "$worker_id" "Should receive workerId"
    
    local result
    result=$(api_await "$worker_id" 120)
    
    assert_equals "0" "$(echo "$result" | jq -r '.result.exitCode // -1')" "Worker should exit with 0"
    
    if assert_any_failed; then
        test_fail "TC-WK-016 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-WK-017: worker.awaitResult - Success (P0)
# =============================================================================
test_tc_wk_017() {
    test_start "worker.awaitResult - Success" "TC-WK-017"
    ensure_supervisor
    
    local workflow_path="$PROJECT_ROOT/runbook/tc-wk-017.org"
    create_minimal_workflow "$workflow_path"
    
    # Spawn worker with simple task
    local spawn_response
    spawn_response=$(api_spawn "code-agent" "echo 'success'" "tc-wk-017" "$workflow_path")
    
    local worker_id
    worker_id=$(echo "$spawn_response" | jq -r '.workerId // empty')
    assert_not_empty "$worker_id" "Should receive workerId"
    
    # Await result with 60 second timeout
    local result
    result=$(api_await "$worker_id" 60)
    
    # Verify result structure
    assert_json_has_key "$result" "exitCode" "Result should contain exitCode"
    assert_json_has_key "$result" "workerId" "Result should contain workerId"
    assert_equals "0" "$(echo "$result" | jq -r '.result.exitCode')" "Exit code should be 0"
    assert_equals "$worker_id" "$(echo "$result" | jq -r '.workerId')" "WorkerId should match"
    
    # Verify stdout contains expected output
    local stdout
    stdout=$(echo "$result" | jq -r '.stdout // empty')
    assert_contains "$stdout" "success" "Stdout should contain expected output"
    
    if assert_any_failed; then
        test_fail "TC-WK-017 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-WK-018: worker.awaitResult - Timeout (P0)
# =============================================================================
test_tc_wk_018() {
    test_start "worker.awaitResult - Timeout" "TC-WK-018"
    ensure_supervisor
    
    local workflow_path="$PROJECT_ROOT/runbook/tc-wk-018.org"
    create_minimal_workflow "$workflow_path"
    
    # Spawn long-running worker
    local spawn_response
    spawn_response=$(api_spawn "code-agent" "sleep 30" "tc-wk-018" "$workflow_path")
    
    local worker_id
    worker_id=$(echo "$spawn_response" | jq -r '.workerId // empty')
    assert_not_empty "$worker_id" "Should receive workerId"
    
    # Await with short timeout (5 seconds)
    local start_time
    start_time=$(date +%s)
    
    local result
    local timeout_result
    timeout_result=$(api_await "$worker_id" 5) || true
    
    local end_time
    end_time=$(date +%s)
    local elapsed=$((end_time - start_time))
    
    # Verify timeout occurred (should take close to 5 seconds, not 30)
    assert_gt 10 "$elapsed" "Should timeout before worker completes"
    assert_lt 30 "$elapsed" "Should not wait for full worker duration"
    
    # Verify timeout error in response
    local has_error
    has_error=$(echo "$timeout_result" | jq -r '.error // empty')
    assert_not_empty "$has_error" "Should have error in timeout response"
    
    # Clean up - kill the hung worker
    # Find and kill the sleep process
    pkill -f "sleep 30" 2>/dev/null || true
    
    if assert_any_failed; then
        test_fail "TC-WK-018 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-WK-019: worker.status - Running/Completed States (P0)
# =============================================================================
test_tc_wk_019() {
    test_start "worker.status - Running/Completed States" "TC-WK-019"
    ensure_supervisor
    
    local workflow_path="$PROJECT_ROOT/runbook/tc-wk-019.org"
    create_minimal_workflow "$workflow_path"
    
    # Spawn a worker that takes a moment
    local spawn_response
    spawn_response=$(api_spawn "code-agent" "sleep 2 && echo 'done'" "tc-wk-019" "$workflow_path")
    
    local worker_id
    worker_id=$(echo "$spawn_response" | jq -r '.workerId // empty')
    assert_not_empty "$worker_id" "Should receive workerId"
    
    # Poll status while running
    local status_running=false
    local status_completed=false
    
    for i in {1..5}; do
        local status_response
        status_response=$(api_status "$worker_id")
        local status
        status=$(echo "$status_response" | jq -r '.status // empty')
        
        if [[ "$status" == "running" ]]; then
            status_running=true
        elif [[ "$status" == "completed" ]]; then
            status_completed=true
            break
        fi
        
        sleep 1
    done
    
    # Verify we observed running state (at least once)
    assert_equals "true" "$status_running" "Should observe running state"
    
    # Now wait for completion
    local final_status_response
    final_status_response=$(api_status "$worker_id")
    local final_status
    final_status=$(echo "$final_status_response" | jq -r '.status // empty')
    
    assert_equals "completed" "$final_status" "Final status should be completed"
    
    # Verify the result has correct exit code
    local result
    result=$(api_await "$worker_id" 30)
    assert_equals "0" "$(echo "$result" | jq -r '.result.exitCode')" "Worker should exit with 0"
    
    if assert_any_failed; then
        test_fail "TC-WK-019 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-WK-020: Multiple Workers - Isolation (P0)
# =============================================================================
test_tc_wk_020() {
    test_start "Multiple Workers - Isolation" "TC-WK-020"
    ensure_supervisor
    
    local workflow_path="$PROJECT_ROOT/runbook/tc-wk-020.org"
    create_minimal_workflow "$workflow_path"
    
    # Spawn 3 workers in parallel with different tasks
    local response1
    local response2
    local response3
    
    response1=$(api_spawn "code-agent" "echo 'worker-1-result'" "tc-wk-020-1" "$workflow_path")
    response2=$(api_spawn "test-agent" "echo 'worker-2-result'" "tc-wk-020-2" "$workflow_path")
    response3=$(api_spawn "ops-agent" "echo 'worker-3-result'" "tc-wk-020-3" "$workflow_path")
    
    # Extract worker IDs
    local worker_id1
    local worker_id2
    local worker_id3
    
    worker_id1=$(echo "$response1" | jq -r '.workerId // empty')
    worker_id2=$(echo "$response2" | jq -r '.workerId // empty')
    worker_id3=$(echo "$response3" | jq -r '.workerId // empty')
    
    assert_not_empty "$worker_id1" "Should receive workerId1"
    assert_not_empty "$worker_id2" "Should receive workerId2"
    assert_not_empty "$worker_id3" "Should receive workerId3"
    
    # Verify worker IDs are unique
    assert_not_equals "$worker_id1" "$worker_id2" "Worker IDs should be unique"
    assert_not_equals "$worker_id1" "$worker_id3" "Worker IDs should be unique"
    assert_not_equals "$worker_id2" "$worker_id3" "Worker IDs should be unique"
    
    # Await all results
    local result1
    local result2
    local result3
    
    result1=$(api_await "$worker_id1" 120)
    result2=$(api_await "$worker_id2" 120)
    result3=$(api_await "$worker_id3" 120)
    
    # Verify each result matches original task
    local stdout1
    local stdout2
    local stdout3
    
    stdout1=$(echo "$result1" | jq -r '.stdout // empty')
    stdout2=$(echo "$result2" | jq -r '.stdout // empty')
    stdout3=$(echo "$result3" | jq -r '.stdout // empty')
    
    assert_contains "$stdout1" "worker-1-result" "Worker 1 stdout should match"
    assert_contains "$stdout2" "worker-2-result" "Worker 2 stdout should match"
    assert_contains "$stdout3" "worker-3-result" "Worker 3 stdout should match"
    
    # Verify results are isolated (no cross-contamination)
    assert_not_contains "$stdout1" "worker-2" "Worker 1 should not contain worker 2 output"
    assert_not_contains "$stdout1" "worker-3" "Worker 1 should not contain worker 3 output"
    assert_not_contains "$stdout2" "worker-1" "Worker 2 should not contain worker 1 output"
    assert_not_contains "$stdout2" "worker-3" "Worker 2 should not contain worker 3 output"
    assert_not_contains "$stdout3" "worker-1" "Worker 3 should not contain worker 1 output"
    assert_not_contains "$stdout3" "worker-2" "Worker 3 should not contain worker 2 output"
    
    # Verify exit codes
    assert_equals "0" "$(echo "$result1" | jq -r '.result.exitCode')" "Worker 1 exit code should be 0"
    assert_equals "0" "$(echo "$result2" | jq -r '.result.exitCode')" "Worker 2 exit code should be 0"
    assert_equals "0" "$(echo "$result3" | jq -r '.result.exitCode')" "Worker 3 exit code should be 0"
    
    # Verify results directory isolation
    local results_dir="${PI_RESULTS_DIR:-/tmp/pi-adapter-results}"
    assert_file_exists "${results_dir}/${worker_id1}.json" "Worker 1 result file should exist"
    assert_file_exists "${results_dir}/${worker_id2}.json" "Worker 2 result file should exist"
    assert_file_exists "${results_dir}/${worker_id3}.json" "Worker 3 result file should exist"
    
    if assert_any_failed; then
        test_fail "TC-WK-020 failed"
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
    echo "Worker Spawn Cycle Test Suite"
    echo "========================================"
    
    # Run all tests
    local failed=0
    
    # TC-WK-001 to TC-WK-016: Agent role spawning
    test_tc_wk_001 || failed=$((failed + 1))
    cleanup_workflows
    sleep 1
    
    test_tc_wk_002 || failed=$((failed + 1))
    cleanup_workflows
    sleep 1
    
    test_tc_wk_003 || failed=$((failed + 1))
    cleanup_workflows
    sleep 1
    
    test_tc_wk_004 || failed=$((failed + 1))
    cleanup_workflows
    sleep 1
    
    test_tc_wk_005 || failed=$((failed + 1))
    cleanup_workflows
    sleep 1
    
    test_tc_wk_006 || failed=$((failed + 1))
    cleanup_workflows
    sleep 1
    
    test_tc_wk_007 || failed=$((failed + 1))
    cleanup_workflows
    sleep 1
    
    test_tc_wk_008 || failed=$((failed + 1))
    cleanup_workflows
    sleep 1
    
    test_tc_wk_009 || failed=$((failed + 1))
    cleanup_workflows
    sleep 1
    
    test_tc_wk_010 || failed=$((failed + 1))
    cleanup_workflows
    sleep 1
    
    test_tc_wk_011 || failed=$((failed + 1))
    cleanup_workflows
    sleep 1
    
    test_tc_wk_012 || failed=$((failed + 1))
    cleanup_workflows
    sleep 1
    
    test_tc_wk_013 || failed=$((failed + 1))
    cleanup_workflows
    sleep 1
    
    test_tc_wk_014 || failed=$((failed + 1))
    cleanup_workflows
    sleep 1
    
    test_tc_wk_015 || failed=$((failed + 1))
    cleanup_workflows
    sleep 1
    
    test_tc_wk_016 || failed=$((failed + 1))
    cleanup_workflows
    sleep 1
    
    # TC-WK-017 to TC-WK-020: Lifecycle tests
    test_tc_wk_017 || failed=$((failed + 1))
    cleanup_workflows
    sleep 1
    
    test_tc_wk_018 || failed=$((failed + 1))
    cleanup_workflows
    sleep 1
    
    test_tc_wk_019 || failed=$((failed + 1))
    cleanup_workflows
    sleep 1
    
    test_tc_wk_020 || failed=$((failed + 1))
    cleanup_workflows
    
    # Summary
    echo ""
    echo "========================================"
    echo "Test Summary: Worker Spawn Cycle"
    echo "========================================"
    echo "Tests run: 20"
    echo "Passed: $((20 - failed))"
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
