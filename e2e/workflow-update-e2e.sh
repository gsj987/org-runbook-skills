#!/usr/bin/env bash
# =============================================================================
# pi-adapter E2E Test Suite - workflow.update Error Handling
# =============================================================================
# Tests workflow.update error messages with correct parameter info:
# - Positive: workflow.update succeeds with existing file
# - Negative: workflow.update fails with missing file and shows correct error
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

# =============================================================================
# Positive Tests (should succeed)
# =============================================================================

# -----------------------------------------------------------------------------
# TC-WU-POS-001: workflow.update succeeds with existing file
# -----------------------------------------------------------------------------
test_wu_pos_001() {
    test_start "workflow.update succeeds with existing file" "TC-WU-POS-001"
    
    local workflow_path="$TEST_WORKFLOW_DIR/tc-wu-pos-001.org"
    local finding_content="Test finding for positive case"
    local finding_rating="★★★"
    
    # Create workflow file
    create_test_workflow "$workflow_path" "Positive Test 001"
    
    # Verify file exists
    assert_file_exists "$workflow_path" "Workflow file should exist"
    
    # Prepare finding JSON
    local finding_uuid="F-$(date +%s)-pos001"
    local timestamp
    timestamp=$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)
    
    local findings_json
    findings_json=$(jq -n \
        --arg uuid "$finding_uuid" \
        --arg content "$finding_content" \
        --arg rating "$finding_rating" \
        --arg ts "$timestamp" \
        '[{
            id: $uuid,
            content: $content,
            rating: $rating,
            timestamp: $ts
        }]')
    
    # Call workflow.update API
    local response
    response=$(api_workflow_update "$workflow_path" "$findings_json")
    
    # Verify success
    assert_contains "$response" '"success":true' "API should return success"
    
    # Verify finding was appended to file
    assert_file_contains "$workflow_path" "$finding_uuid" "Finding ID should be in file"
    assert_file_contains "$workflow_path" "$finding_content" "Finding content should be in file"
    assert_file_contains "$workflow_path" "$finding_rating" "Finding rating should be in file"
    
    # Cleanup
    rm -f "$workflow_path"
    
    # Only fail if there were actual failures
    if [[ $ASSERT_FAILED -gt 0 ]]; then
        test_fail "TC-WU-POS-001 failed ($ASSERT_FAILED assertions failed)"
        return 1
    fi
    test_pass
}

# -----------------------------------------------------------------------------
# TC-WU-POS-002: workflow.update preserves existing content
# -----------------------------------------------------------------------------
test_wu_pos_002() {
    test_start "workflow.update preserves existing content" "TC-WU-POS-002"
    
    local workflow_path="$TEST_WORKFLOW_DIR/tc-wu-pos-002.org"
    
    # Create workflow file
    create_test_workflow "$workflow_path" "Positive Test 002"
    
    # Capture original title
    local original_title
    original_title=$(grep "#+title:" "$workflow_path")
    
    # Add finding
    local findings_json='[{"id":"F-test-002","content":"Preservation test","rating":"★★★","timestamp":"2026-03-30T00:00:00.000Z"}]'
    api_workflow_update "$workflow_path" "$findings_json" > /dev/null
    
    # Verify original content still exists
    local new_title
    new_title=$(grep "#+title:" "$workflow_path")
    assert_equals "$original_title" "$new_title" "Original title should be preserved"
    
    # Verify project name preserved
    assert_file_contains "$workflow_path" "Positive Test 002" "Project name should be preserved"
    
    # Verify finding was appended
    assert_file_contains "$workflow_path" "F-test-002" "Finding should be appended"
    
    # Cleanup
    rm -f "$workflow_path"
    
    if [[ $ASSERT_FAILED -gt 0 ]]; then
        test_fail "TC-WU-POS-002 failed ($ASSERT_FAILED assertions failed)"
        return 1
    fi
    test_pass
}

# =============================================================================
# Negative Tests (should fail with correct error message)
# =============================================================================

# -----------------------------------------------------------------------------
# TC-WU-NEG-001: workflow.update with non-existent file returns 404
# -----------------------------------------------------------------------------
test_wu_neg_001() {
    test_start "workflow.update with non-existent file returns 404" "TC-WU-NEG-001"
    
    local workflow_path="$TEST_WORKFLOW_DIR/tc-wu-neg-001-nonexistent.org"
    
    # Ensure file does NOT exist
    rm -f "$workflow_path"
    assert_file_not_exists "$workflow_path" "Workflow file should not exist"
    
    # Call workflow.update API - should return 404
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" \
        -X POST "${SUPERVISOR_URL}/workflow/update" \
        -H "Content-Type: application/json" \
        -d "{\"workflowPath\":\"$workflow_path\",\"findings\":[]}")
    
    assert_equals "404" "$http_code" "Should return HTTP 404 for missing file"
    
    if [[ $ASSERT_FAILED -gt 0 ]]; then
        test_fail "TC-WU-NEG-001 failed ($ASSERT_FAILED assertions failed)"
        return 1
    fi
    test_pass
}

# -----------------------------------------------------------------------------
# TC-WU-NEG-002: workflow.update 404 response contains parameter name and value
# -----------------------------------------------------------------------------
test_wu_neg_002() {
    test_start "workflow.update 404 response contains parameter info" "TC-WU-NEG-002"
    
    local workflow_path="$TEST_WORKFLOW_DIR/tc-wu-neg-002-test.org"
    
    # Ensure file does NOT exist
    rm -f "$workflow_path"
    
    # Call workflow.update API and capture response
    local response
    response=$(curl -s -X POST "${SUPERVISOR_URL}/workflow/update" \
        -H "Content-Type: application/json" \
        -d "{\"workflowPath\":\"$workflow_path\",\"findings\":[]}")
    
    # Verify response contains the workflowPath value
    assert_contains "$response" "$workflow_path" "Response should contain the workflowPath value"
    
    # Verify response mentions "not found"
    local lowercase_response
    lowercase_response=$(echo "$response" | tr '[:upper:]' '[:lower:]')
    assert_contains "$lowercase_response" "not found" "Response should mention 'not found'"
    
    # Verify response contains "workflowPath" as parameter name (in JSON key)
    assert_contains "$response" '"workflowPath"' "Response should include workflowPath key"
    
    if [[ $ASSERT_FAILED -gt 0 ]]; then
        test_fail "TC-WU-NEG-002 failed ($ASSERT_FAILED assertions failed)"
        echo "Response was: $response"
        return 1
    fi
    test_pass
}

# -----------------------------------------------------------------------------
# TC-WU-NEG-003: workflow.update with empty workflowPath
# -----------------------------------------------------------------------------
test_wu_neg_003() {
    test_start "workflow.update with empty workflowPath" "TC-WU-NEG-003"
    
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" \
        -X POST "${SUPERVISOR_URL}/workflow/update" \
        -H "Content-Type: application/json" \
        -d '{"workflowPath":"","findings":[]}')
    
    # Should return 404 (file not found for empty path) or 400 (bad request)
    assert_contains "404,400" "$http_code" "Should return 404 or 400 for empty path"
    
    if [[ $ASSERT_FAILED -gt 0 ]]; then
        test_fail "TC-WU-NEG-003 failed ($ASSERT_FAILED assertions failed)"
        return 1
    fi
    test_pass
}

# -----------------------------------------------------------------------------
# TC-WU-NEG-004: workflow.update with malformed JSON returns 400
# -----------------------------------------------------------------------------
test_wu_neg_004() {
    test_start "workflow.update with missing workflowPath field" "TC-WU-NEG-004"
    
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" \
        -X POST "${SUPERVISOR_URL}/workflow/update" \
        -H "Content-Type: application/json" \
        -d '{"findings":[]}')
    
    # Should return 400 (bad request) for missing workflowPath
    assert_equals "400" "$http_code" "Should return HTTP 400 for missing workflowPath"
    
    if [[ $ASSERT_FAILED -gt 0 ]]; then
        test_fail "TC-WU-NEG-004 failed ($ASSERT_FAILED assertions failed)"
        return 1
    fi
    test_pass
}

# -----------------------------------------------------------------------------
# TC-WU-NEG-005: workflow.update error message shows exact path used
# -----------------------------------------------------------------------------
test_wu_neg_005() {
    test_start "workflow.update error message shows exact path used" "TC-WU-NEG-005"
    
    local workflow_path="runbook/tc-wu-neg-005-very-specific-path.org"
    local full_path="$PROJECT_ROOT/$workflow_path"
    
    # Ensure file does NOT exist
    rm -f "$full_path"
    
    # Call API with specific path
    local response
    response=$(curl -s -X POST "${SUPERVISOR_URL}/workflow/update" \
        -H "Content-Type: application/json" \
        -d "{\"workflowPath\":\"$workflow_path\",\"findings\":[]}")
    
    # Error message should contain the exact path
    assert_contains "$response" "$workflow_path" "Error should show exact workflowPath: $workflow_path"
    
    # Cleanup
    rm -f "$full_path"
    
    if [[ $ASSERT_FAILED -gt 0 ]]; then
        test_fail "TC-WU-NEG-005 failed ($ASSERT_FAILED assertions failed)"
        echo "Response was: $response"
        return 1
    fi
    test_pass
}

# =============================================================================
# Run all tests
# =============================================================================

run_tests() {
    echo "========================================"
    echo "workflow.update E2E Test Suite"
    echo "========================================"
    
    # Ensure supervisor is running
    ensure_supervisor
    
    local passed=0
    local failed=0
    
    echo ""
    echo "━━━ Positive Tests ━━━"
    for test in test_wu_pos_001 test_wu_pos_002; do
        if $test; then
            passed=$((passed + 1))
        else
            failed=$((failed + 1))
        fi
    done
    
    echo ""
    echo "━━━ Negative Tests ━━━"
    for test in test_wu_neg_001 test_wu_neg_002 test_wu_neg_003 test_wu_neg_004 test_wu_neg_005; do
        if $test; then
            passed=$((passed + 1))
        else
            failed=$((failed + 1))
        fi
    done
    
    echo ""
    echo "========================================"
    echo "Results: $passed passed, $failed failed"
    echo "========================================"
    
    return $failed
}

# Run if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    run_tests
fi
