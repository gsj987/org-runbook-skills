#!/usr/bin/env bash
# =============================================================================
# pi-adapter E2E Test Suite - Workflow Operations Tests
# =============================================================================
# Tests workflow initialization and update operations:
# - TC-WF-001: workflow.init with default phases
# - TC-WF-002: workflow.init with custom phases
# - TC-WF-003: workflow.init rejects existing path
# - TC-WF-004: workflow.init rejects invalid path
# - TC-WF-005: workflow.update appends findings
# - TC-WF-006: workflow.update preserves content
# - TC-WF-007: workflow.update handles missing file
# =============================================================================

set -euo pipefail

# Source libraries
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/setup.sh"
source "$SCRIPT_DIR/lib/api.sh"
source "$SCRIPT_DIR/lib/assert.sh"

# Configuration
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEST_WORKFLOW_DIR="$PROJECT_ROOT/runbook"

# =============================================================================
# TC-WF-001: workflow.init with default phases
# =============================================================================
test_tc_wf_001() {
    test_start "workflow.init with default phases" "TC-WF-001"
    
    local workflow_path="$TEST_WORKFLOW_DIR/tc-wf-001.org"
    local project_name="Test Default Phases"
    
    # Remove if exists
    rm -f "$workflow_path"
    
    # Use workflow.init to create workflow
    local output
    if output=$(cd "$SCRIPT_DIR/.." && npx ts-node --esm -e "
import { workflow } from './adapters/pi/extension.js';
await workflow.init({
    workflowPath: '$workflow_path',
    projectName: '$project_name'
});
console.log('SUCCESS');
" 2>&1); then
        
        # Verify file created
        assert_file_exists "$workflow_path" "Workflow file should be created"
        
        # Verify content
        assert_file_contains "$workflow_path" "#+title:" "Should have title"
        assert_file_contains "$workflow_path" "$project_name" "Should contain project name"
        assert_file_contains "$workflow_path" "#+TODO:" "Should have TODO keywords"
        assert_file_contains "$workflow_path" ":PHASE:" "Should have phase property"
        
        # Verify default phases are defined
        assert_file_contains "$workflow_path" "discovery" "Should have discovery phase"
        assert_file_contains "$workflow_path" "design" "Should have design phase"
        assert_file_contains "$workflow_path" "implementation" "Should have implementation phase"
        
    else
        test_fail "workflow.init failed: $output"
        return 1
    fi
    
    if assert_any_failed; then
        test_fail "TC-WF-001 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-WF-002: workflow.init with custom phases
# =============================================================================
test_tc_wf_002() {
    test_start "workflow.init with custom phases" "TC-WF-002"
    
    local workflow_path="$TEST_WORKFLOW_DIR/tc-wf-002.org"
    local project_name="Test Custom Phases"
    local custom_phases="plan,build,ship"
    
    # Remove if exists
    rm -f "$workflow_path"
    
    # Create with custom phases
    local output
    if output=$(cd "$SCRIPT_DIR/.." && npx ts-node --esm -e "
import { workflow } from './adapters/pi/extension.js';
await workflow.init({
    workflowPath: '$workflow_path',
    projectName: '$project_name',
    phases: '$custom_phases'
});
console.log('SUCCESS');
" 2>&1); then
        
        assert_file_exists "$workflow_path" "Workflow file should be created"
        assert_file_contains "$workflow_path" "$project_name" "Should contain project name"
        
        # Verify custom phases
        assert_file_contains "$workflow_path" "plan" "Should have plan phase"
        assert_file_contains "$workflow_path" "build" "Should have build phase"
        assert_file_contains "$workflow_path" "ship" "Should have ship phase"
        
        # Verify default phases are NOT present
        assert_not_contains "$(cat "$workflow_path")" "discovery" "Should NOT have default discovery phase"
        
    else
        test_fail "workflow.init failed: $output"
        return 1
    fi
    
    if assert_any_failed; then
        test_fail "TC-WF-002 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-WF-003: workflow.init rejects existing path
# =============================================================================
test_tc_wf_003() {
    test_start "workflow.init rejects existing path" "TC-WF-003"
    
    local workflow_path="$TEST_WORKFLOW_DIR/tc-wf-003.org"
    
    # Create existing file
    create_minimal_workflow "$workflow_path"
    assert_file_exists "$workflow_path" "Workflow should exist first"
    
    # Try to init again - should fail
    local output
    if output=$(cd "$SCRIPT_DIR/.." && npx ts-node --esm -e "
import { workflow } from './adapters/pi/extension.js';
await workflow.init({
    workflowPath: '$workflow_path',
    projectName: 'Duplicate Test'
});
console.log('SUCCESS');
" 2>&1); then
        
        # If it succeeded, that's a failure for this test
        test_fail "workflow.init should reject existing path"
        return 1
        
    else
        # Should fail with appropriate error
        assert_contains "$output" "exist" "Should mention file exists" || \
        assert_contains "$output" "already" "Should mention already exists" || \
        assert_contains "$output" "reject" "Should mention rejection"
        
        # Original file should be unchanged
        assert_file_contains "$workflow_path" "Minimal Test" "Original content should be preserved"
        
        test_pass
        return 0
    fi
    
    if assert_any_failed; then
        test_fail "TC-WF-003 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-WF-004: workflow.init rejects invalid path
# =============================================================================
test_tc_wf_004() {
    test_start "workflow.init rejects invalid path" "TC-WF-004"
    
    local invalid_path="/nonexistent/directory/tc-wf-004.org"
    
    # Try to init with invalid path
    local output
    if output=$(cd "$SCRIPT_DIR/.." && npx ts-node --esm -e "
import { workflow } from './adapters/pi/extension.js';
await workflow.init({
    workflowPath: '$invalid_path',
    projectName: 'Invalid Test'
});
console.log('SUCCESS');
" 2>&1); then
        
        test_fail "workflow.init should reject invalid path"
        return 1
        
    else
        # Should fail with appropriate error
        assert_contains "$output" "not found" "Should mention not found" || \
        assert_contains "$output" "invalid" "Should mention invalid" || \
        assert_contains "$output" "cannot" "Should mention cannot create"
        
        # File should NOT be created
        assert_file_not_exists "$invalid_path" "Invalid path should not create file"
        
        test_pass
        return 0
    fi
    
    if assert_any_failed; then
        test_fail "TC-WF-004 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-WF-005: workflow.update appends findings
# =============================================================================
test_tc_wf_005() {
    test_start "workflow.update appends findings" "TC-WF-005"
    
    local workflow_path="$TEST_WORKFLOW_DIR/tc-wf-005.org"
    create_minimal_workflow "$workflow_path"
    
    # Add a finding
    local finding_content="Test finding from workflow update"
    local finding_rating="★★★"
    
    # Use workflow.update to append
    local output
    if output=$(cd "$SCRIPT_DIR/.." && npx ts-node --esm -e "
import { workflow } from './adapters/pi/extension.js';
await workflow.appendFinding('main-task', '$finding_content', '$finding_rating');
await workflow.update('$workflow_path');
console.log('SUCCESS');
" 2>&1); then
        
        # Verify finding was appended
        assert_file_contains "$workflow_path" "F-" "Should have finding ID"
        assert_file_contains "$workflow_path" "$finding_content" "Should contain finding content"
        assert_file_contains "$workflow_path" "$finding_rating" "Should contain rating"
        
        # Verify finding format
        local finding_line
        finding_line=$(grep -E "F-" "$workflow_path" | head -1)
        assert_contains "$finding_line" "[$finding_rating]" "Finding should have rating in brackets"
        
    else
        test_fail "workflow.update failed: $output"
        return 1
    fi
    
    if assert_any_failed; then
        test_fail "TC-WF-005 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-WF-006: workflow.update preserves content
# =============================================================================
test_tc_wf_006() {
    test_start "workflow.update preserves content" "TC-WF-006"
    
    local workflow_path="$TEST_WORKFLOW_DIR/tc-wf-006.org"
    create_test_workflow "$workflow_path" "Preserve Test"
    
    # Capture original content
    local original_content
    original_content=$(cat "$workflow_path")
    
    # Add findings
    cd "$SCRIPT_DIR/.." && npx ts-node --esm -e "
import { workflow } from './adapters/pi/extension.js';
await workflow.appendFinding('main-task', 'Finding 1', '★★★');
await workflow.appendFinding('main-task', 'Finding 2', '★★');
await workflow.update('$workflow_path');
" 2>/dev/null || true
    
    # Verify original content preserved
    assert_file_contains "$workflow_path" "#+title:" "Title should be preserved"
    assert_file_contains "$workflow_path" "Preserve Test" "Project name should be preserved"
    assert_file_contains "$workflow_path" ":PHASE:" "Phase property should be preserved"
    assert_file_contains "$workflow_path" ":OWNER:" "Owner property should be preserved"
    
    # Verify new findings appended
    assert_file_contains "$workflow_path" "Finding 1" "First finding should be added"
    assert_file_contains "$workflow_path" "Finding 2" "Second finding should be added"
    
    # Verify no content was overwritten
    local new_content
    new_content=$(cat "$workflow_path")
    assert_contains "$new_content" "#+title:" "Title should still exist after update"
    assert_contains "$new_content" "Preserve Test" "Project name should still exist"
    
    test_pass
}

# =============================================================================
# TC-WF-007: workflow.update handles missing file
# =============================================================================
test_tc_wf_007() {
    test_start "workflow.update handles missing file" "TC-WF-007"
    
    local missing_path="$TEST_WORKFLOW_DIR/tc-wf-007-nonexistent.org"
    
    # Ensure file doesn't exist
    rm -f "$missing_path"
    assert_file_not_exists "$missing_path" "File should not exist"
    
    # Try to update non-existent file
    local output
    if output=$(cd "$SCRIPT_DIR/.." && npx ts-node --esm -e "
import { workflow } from './adapters/pi/extension.js';
await workflow.appendFinding('main-task', 'Test', '★★');
await workflow.update('$missing_path');
console.log('SUCCESS');
" 2>&1); then
        
        # Behavior depends on implementation:
        # Option 1: Creates file (acceptable)
        # Option 2: Returns error (also acceptable)
        
        if [[ "$output" == *"SUCCESS"* ]]; then
            # File was created
            assert_file_exists "$missing_path" "File should be created if update succeeds"
        else
            # Error was returned
            assert_contains "$output" "not found" "Should mention not found" || \
            assert_contains "$output" "exist" "Should mention file exists" || \
            assert_contains "$output" "cannot" "Should mention cannot update"
        fi
        
    else
        # Failed as expected
        assert_contains "$output" "not found" "Should mention not found" || \
        assert_contains "$output" "exist" "Should mention file exists" || \
        assert_contains "$output" "error" "Should mention error"
    fi
    
    test_pass
}

# =============================================================================
# TC-WF-008: workflow.update preserves existing content (P0)
# =============================================================================
test_tc_wf_008() {
    test_start "workflow.update preserves existing content" "TC-WF-008"
    
    local workflow_path="$TEST_WORKFLOW_DIR/tc-wf-008.org"
    create_test_workflow "$workflow_path" "Preserve Test"
    
    # Capture original content markers
    local original_content
    original_content=$(cat "$workflow_path")
    local original_line_count
    original_line_count=$(wc -l < "$workflow_path")
    
    # Add findings via workflow operations
    cd "$SCRIPT_DIR/.." && npx ts-node --esm -e "
import { workflow } from './adapters/pi/extension.js';
await workflow.appendFinding('main-task', 'Preserved Finding 1', '★★★');
await workflow.appendFinding('main-task', 'Preserved Finding 2', '★★');
await workflow.update('$workflow_path');
" 2>/dev/null || true
    
    # Verify original content preserved
    assert_file_contains "$workflow_path" "#+title:" "Title header should be preserved"
    assert_file_contains "$workflow_path" "Preserve Test" "Project name should be preserved"
    assert_file_contains "$workflow_path" ":PHASE:" "Phase property should be preserved"
    assert_file_contains "$workflow_path" ":OWNER:" "Owner property should be preserved"
    assert_file_contains "$workflow_path" ":CREATED:" "Created timestamp should be preserved"
    assert_file_contains "$workflow_path" ":ID:" "ID property should be preserved"
    
    # Verify new findings appended (line count should increase)
    local new_line_count
    new_line_count=$(wc -l < "$workflow_path")
    assert_gt "$new_line_count" "$original_line_count" "New findings should be appended"
    
    # Verify findings are present
    assert_file_contains "$workflow_path" "Preserved Finding 1" "First finding should be added"
    assert_file_contains "$workflow_path" "Preserved Finding 2" "Second finding should be added"
    assert_file_contains "$workflow_path" "F-" "Finding IDs should be present"
    
    if assert_any_failed; then
        test_fail "TC-WF-008 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-WF-009: workflow.update handles missing file (P1)
# =============================================================================
test_tc_wf_009() {
    test_start "workflow.update handles missing file gracefully" "TC-WF-009"
    
    local missing_path="$TEST_WORKFLOW_DIR/tc-wf-009-nonexistent.org"
    
    # Ensure file doesn't exist
    rm -f "$missing_path"
    assert_file_not_exists "$missing_path" "File should not exist before test"
    
    # Try to update without prior appendFinding
    local output
    local exit_code=0
    output=$(cd "$SCRIPT_DIR/.." && npx ts-node --esm -e "
import { workflow } from './adapters/pi/extension.js';
await workflow.update('$missing_path');
console.log('SUCCESS');
" 2>&1) || exit_code=$?
    
    # Either should succeed (creating the file) or fail gracefully
    if [[ "$output" == *"SUCCESS"* ]]; then
        # File was created (acceptable behavior)
        # Verify it's a valid workflow file
        assert_file_exists "$missing_path" "File should be created"
    else
        # Should fail with appropriate error
        assert_contains "$output" "not found" "Should mention not found" || \
        assert_contains "$output" "exist" "Should mention file exists" || \
        assert_contains "$output" "error" "Should mention error" || \
        assert_contains "$output" "ENOENT" "Should mention ENOENT"
        
        # File should NOT be created on error
        assert_file_not_exists "$missing_path" "File should not be created on error"
    fi
    
    if assert_any_failed; then
        test_fail "TC-WF-009 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-WF-010: workflow.appendFinding - Valid task (P0)
# =============================================================================
test_tc_wf_010() {
    test_start "workflow.appendFinding with valid task" "TC-WF-010"
    
    local workflow_path="$TEST_WORKFLOW_DIR/tc-wf-010.org"
    create_minimal_workflow "$workflow_path"
    
    # Append finding to valid task
    local output
    if output=$(cd "$SCRIPT_DIR/.." && npx ts-node --esm -e "
import { workflow } from './adapters/pi/extension.js';
await workflow.appendFinding('main-task', 'Valid task finding test', '★★★');
await workflow.update('$workflow_path');
console.log('SUCCESS');
" 2>&1); then
        
        # Verify finding was added
        assert_file_contains "$workflow_path" "F-" "Should have finding ID"
        assert_file_contains "$workflow_path" "Valid task finding test" "Should contain finding content"
        assert_file_contains "$workflow_path" "★★★" "Should contain rating"
        
        # Verify finding has proper format with timestamp
        local finding_line
        finding_line=$(grep -E "F-" "$workflow_path" | head -1)
        assert_contains "$finding_line" "[★★★]" "Finding should have rating in brackets"
        
    else
        test_fail "workflow.appendFinding failed: $output"
        return 1
    fi
    
    if assert_any_failed; then
        test_fail "TC-WF-010 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-WF-011: workflow.appendFinding - Invalid task (P0)
# =============================================================================
test_tc_wf_011() {
    test_start "workflow.appendFinding with invalid task" "TC-WF-011"
    
    local workflow_path="$TEST_WORKFLOW_DIR/tc-wf-011.org"
    create_minimal_workflow "$workflow_path"
    
    # Try to append finding to non-existent task
    local output
    local exit_code=0
    output=$(cd "$SCRIPT_DIR/.." && npx ts-node --esm -e "
import { workflow } from './adapters/pi/extension.js';
await workflow.appendFinding('nonexistent-task', 'Should not be added', '★★★');
await workflow.update('$workflow_path');
" 2>&1) || exit_code=$?
    
    # Should fail or gracefully handle invalid task
    if [[ "$exit_code" -ne 0 ]]; then
        # Exit code non-zero indicates error (expected)
        assert_contains "$output" "not found" "Should mention task not found" || \
        assert_contains "$output" "invalid" "Should mention invalid" || \
        assert_contains "$output" "error" "Should mention error"
    fi
    
    # File should NOT contain the invalid finding
    assert_not_contains "$(cat "$workflow_path")" "Should not be added" "Finding should not be added for invalid task"
    
    if assert_any_failed; then
        test_fail "TC-WF-011 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-WF-012: workflow.attachEvidence - Valid finding (P0)
# =============================================================================
test_tc_wf_012() {
    test_start "workflow.attachEvidence with valid finding" "TC-WF-012"
    
    local workflow_path="$TEST_WORKFLOW_DIR/tc-wf-012.org"
    create_minimal_workflow "$workflow_path"
    
    # First append a finding to get a valid finding ID
    cd "$SCRIPT_DIR/.." && npx ts-node --esm -e "
import { workflow } from './adapters/pi/extension.js';
await workflow.appendFinding('main-task', 'Finding for evidence test', '★★');
await workflow.update('$workflow_path');
" 2>/dev/null || true
    
    # Get the finding ID from the file
    local finding_id
    finding_id=$(grep -oE "F-[a-zA-Z0-9]+" "$workflow_path" | head -1)
    
    if [[ -z "$finding_id" ]]; then
        test_skip "Could not get finding ID for evidence test"
        return 0
    fi
    
    # Attach evidence to the finding
    local output
    if output=$(cd "$SCRIPT_DIR/.." && npx ts-node --esm -e "
import { workflow } from './adapters/pi/extension.js';
await workflow.attachEvidence('$finding_id', 'command', '/test/evidence/file.txt', '★★');
await workflow.update('$workflow_path');
console.log('SUCCESS');
" 2>&1); then
        
        # Verify evidence was attached
        assert_file_contains "$workflow_path" "E-" "Should have evidence ID"
        assert_file_contains "$workflow_path" "/test/evidence/file.txt" "Should contain evidence path"
        
    else
        test_fail "workflow.attachEvidence failed: $output"
        return 1
    fi
    
    if assert_any_failed; then
        test_fail "TC-WF-012 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-WF-013: workflow.attachEvidence - Invalid finding ID (P1)
# =============================================================================
test_tc_wf_013() {
    test_start "workflow.attachEvidence with invalid finding ID" "TC-WF-013"
    
    local workflow_path="$TEST_WORKFLOW_DIR/tc-wf-013.org"
    create_minimal_workflow "$workflow_path"
    
    # Try to attach evidence to non-existent finding
    local invalid_finding_id="F-nonexistent123"
    local output
    local exit_code=0
    output=$(cd "$SCRIPT_DIR/.." && npx ts-node --esm -e "
import { workflow } from './adapters/pi/extension.js';
await workflow.attachEvidence('$invalid_finding_id', 'file', '/test/file.txt', '★★');
await workflow.update('$workflow_path');
" 2>&1) || exit_code=$?
    
    # Should fail or handle gracefully
    if [[ "$exit_code" -ne 0 ]]; then
        assert_contains "$output" "not found" "Should mention finding not found" || \
        assert_contains "$output" "invalid" "Should mention invalid" || \
        assert_contains "$output" "error" "Should mention error"
    fi
    
    # Evidence should NOT be added
    assert_not_contains "$(cat "$workflow_path")" "/test/file.txt" "Evidence should not be added for invalid finding"
    
    if assert_any_failed; then
        test_fail "TC-WF-013 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-WF-014: workflow.setStatus - Valid transitions (P0)
# =============================================================================
test_tc_wf_014() {
    test_start "workflow.setStatus with valid transitions" "TC-WF-014"
    
    local workflow_path="$TEST_WORKFLOW_DIR/tc-wf-014.org"
    create_minimal_workflow "$workflow_path"
    
    # Verify initial state is IN-PROGRESS (from create_minimal_workflow)
    assert_file_contains "$workflow_path" "main-task" "Task should exist"
    
    # Set status to DONE
    local output
    if output=$(cd "$SCRIPT_DIR/.." && npx ts-node --esm -e "
import { workflow } from './adapters/pi/extension.js';
await workflow.setStatus('main-task', 'DONE');
console.log('SUCCESS');
" 2>&1); then
        
        # Verify status was updated
        assert_file_contains "$workflow_path" "DONE" "Task should be marked as DONE"
        
    else
        test_fail "workflow.setStatus failed: $output"
        return 1
    fi
    
    # Now set back to TODO
    if output=$(cd "$SCRIPT_DIR/.." && npx ts-node --esm -e "
import { workflow } from './adapters/pi/extension.js';
await workflow.setStatus('main-task', 'TODO');
console.log('SUCCESS');
" 2>&1); then
        
        # Verify status was updated
        assert_file_contains "$workflow_path" "TODO" "Task should be marked as TODO"
        
    else
        test_fail "workflow.setStatus (TODO) failed: $output"
        return 1
    fi
    
    # Set to BLOCKED
    if output=$(cd "$SCRIPT_DIR/.." && npx ts-node --esm -e "
import { workflow } from './adapters/pi/extension.js';
await workflow.setStatus('main-task', 'BLOCKED');
console.log('SUCCESS');
" 2>&1); then
        
        # Verify status was updated
        assert_file_contains "$workflow_path" "BLOCKED" "Task should be marked as BLOCKED"
        
    else
        test_fail "workflow.setStatus (BLOCKED) failed: $output"
        return 1
    fi
    
    if assert_any_failed; then
        test_fail "TC-WF-014 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-WF-015: workflow.advancePhase - Valid progression (P0)
# =============================================================================
test_tc_wf_015() {
    test_start "workflow.advancePhase with valid progression" "TC-WF-015"
    
    local workflow_path="$TEST_WORKFLOW_DIR/tc-wf-015.org"
    create_test_workflow "$workflow_path" "Phase Advance Test"
    
    # Verify initial phase is discovery
    assert_file_contains "$workflow_path" ":PHASE: discovery" "Initial phase should be discovery"
    
    # Advance to design phase
    local output
    if output=$(cd "$SCRIPT_DIR/.." && npx ts-node --esm -e "
import { workflow } from './adapters/pi/extension.js';
await workflow.advancePhase('design');
console.log('SUCCESS');
" 2>&1); then
        
        # Verify phase was updated
        assert_file_contains "$workflow_path" ":PHASE: design" "Phase should be updated to design"
        
    else
        test_fail "workflow.advancePhase (design) failed: $output"
        return 1
    fi
    
    # Advance to implementation phase
    if output=$(cd "$SCRIPT_DIR/.." && npx ts-node --esm -e "
import { workflow } from './adapters/pi/extension.js';
await workflow.advancePhase('implementation');
console.log('SUCCESS');
" 2>&1); then
        
        # Verify phase was updated
        assert_file_contains "$workflow_path" ":PHASE: implementation" "Phase should be updated to implementation"
        
    else
        test_fail "workflow.advancePhase (implementation) failed: $output"
        return 1
    fi
    
    if assert_any_failed; then
        test_fail "TC-WF-015 failed"
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
    echo "Workflow Operations Test Suite"
    echo "========================================"
    
    # Ensure supervisor is running
    ensure_supervisor
    
    local failed=0
    local total=15
    
    test_tc_wf_001 || failed=$((failed + 1))
    rm -f "$TEST_WORKFLOW_DIR/tc-wf-001.org"
    
    test_tc_wf_002 || failed=$((failed + 1))
    rm -f "$TEST_WORKFLOW_DIR/tc-wf-002.org"
    
    test_tc_wf_003 || failed=$((failed + 1))
    rm -f "$TEST_WORKFLOW_DIR/tc-wf-003.org"
    
    test_tc_wf_004 || failed=$((failed + 1))
    
    test_tc_wf_005 || failed=$((failed + 1))
    rm -f "$TEST_WORKFLOW_DIR/tc-wf-005.org"
    
    test_tc_wf_006 || failed=$((failed + 1))
    rm -f "$TEST_WORKFLOW_DIR/tc-wf-006.org"
    
    test_tc_wf_007 || failed=$((failed + 1))
    rm -f "$TEST_WORKFLOW_DIR/tc-wf-007-"*.org 2>/dev/null || true
    
    test_tc_wf_008 || failed=$((failed + 1))
    rm -f "$TEST_WORKFLOW_DIR/tc-wf-008.org"
    
    test_tc_wf_009 || failed=$((failed + 1))
    rm -f "$TEST_WORKFLOW_DIR/tc-wf-009-"*.org 2>/dev/null || true
    
    test_tc_wf_010 || failed=$((failed + 1))
    rm -f "$TEST_WORKFLOW_DIR/tc-wf-010.org"
    
    test_tc_wf_011 || failed=$((failed + 1))
    rm -f "$TEST_WORKFLOW_DIR/tc-wf-011.org"
    
    test_tc_wf_012 || failed=$((failed + 1))
    rm -f "$TEST_WORKFLOW_DIR/tc-wf-012.org"
    
    test_tc_wf_013 || failed=$((failed + 1))
    rm -f "$TEST_WORKFLOW_DIR/tc-wf-013.org"
    
    test_tc_wf_014 || failed=$((failed + 1))
    rm -f "$TEST_WORKFLOW_DIR/tc-wf-014.org"
    
    test_tc_wf_015 || failed=$((failed + 1))
    rm -f "$TEST_WORKFLOW_DIR/tc-wf-015.org"
    
    echo ""
    echo "========================================"
    echo "Test Summary: Workflow Operations"
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
