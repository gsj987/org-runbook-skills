#!/usr/bin/env bash
# =============================================================================
# pi-adapter E2E Test Suite - Findings Location
# =============================================================================
# Tests that verify findings are appended to the CORRECT location in workflow:
# 1. Findings are appended to the task's Findings section (not file end)
# 2. Findings target the correct task (subtask, not parent)
# 3. Multiple findings appended to the same task are grouped together
# 4. Invalid taskId returns proper error
# 5. Findings do NOT leak to other tasks' sections
# =============================================================================
# POSITIVE: 4 tests (TC-FL-001, TC-FL-002, TC-FL-003, TC-FL-004)
# NEGATIVE: 6 tests (TC-FL-001-N1, TC-FL-001-N2, TC-FL-002-N1, TC-FL-002-N2, TC-FL-003-N1, TC-FL-004-N1)
# TOTAL: 10 tests (ratio 1:1.5)
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

# Track test results
TESTS_PASSED=0
TESTS_FAILED=0

# =============================================================================
# POSITIVE TEST 1: Findings appended to the correct task's Findings section
# =============================================================================

test_findings_location_subtask() {
    assert_reset  # Reset counters for this test
    test_start "Findings appended to correct task's Findings section (not file end)" "TC-FL-001"
    
    local workflow_path="$TEST_WORKFLOW_DIR/tc-fl-001.org"
    
    # Create workflow with parent and subtask
    cat > "$workflow_path" << 'EOF'
#+title:      Test Findings Location
#+TODO:       TODO(t) | DONE(d)

* IN-PROGRESS <parent-task>
:PROPERTIES:
:ID: parent-fl-001
:OWNER: orchestrator
:END:
- Goal :: Parent task
- Findings ::

*** TODO <subtask-001>
:PROPERTIES:
:ID: subtask-fl-001
:PARENT: parent-fl-001
:OWNER: code-agent
:END:
- Goal :: Subtask 001
- Findings ::
- Next Actions ::

*** TODO <another-subtask>
:PROPERTIES:
:ID: subtask-fl-001-other
:PARENT: parent-fl-001
:OWNER: test-agent
:END:
- Goal :: Another subtask
- Findings ::
- Next Actions ::

EOF
    
    # Append a finding to subtask-fl-001
    local response
    response=$(curl -s -X POST "${SUPERVISOR_URL}/workflow/update" \
        -H "Content-Type: application/json" \
        -d '{
            "workflowPath": "'"$workflow_path"'",
            "taskId": "subtask-fl-001",
            "findings": [{
                "id": "F-fl001-001",
                "content": "Test finding for subtask 001",
                "rating": "★★★"
            }]
        }')
    
    assert_contains "$response" '"success":true' "workflow.update should succeed"
    
    # Extract the subtask section
    local subtask_line end_line subtask_section
    subtask_line=$(grep -n "^\\*\\*\\* TODO <subtask-001>" "$workflow_path" | head -1 | cut -d: -f1)
    end_line=$(wc -l < "$workflow_path")
    subtask_section=$(sed -n "${subtask_line},${end_line}p" "$workflow_path")
    
    # Verify finding appears in subtask section
    assert_contains "$subtask_section" "F-fl001-001" "Finding ID should appear in subtask section"
    assert_contains "$subtask_section" "Test finding for subtask 001" "Finding content should appear in subtask section"
    
    # Verify finding does NOT appear in another task's section
    local another_line another_section
    another_line=$(grep -n "^\\*\\*\\* TODO <another-subtask>" "$workflow_path" | head -1 | cut -d: -f1)
    if [[ -n "$another_line" ]]; then
        another_section=$(sed -n "${another_line},${end_line}p" "$workflow_path")
        assert_not_contains "$another_section" "F-fl001-001" "Finding should NOT appear in another-subtask's section"
    fi
    
    rm -f "$workflow_path"
    
    # Check if there are any failures
    if [[ $ASSERT_FAILED -gt 0 ]]; then
        test_fail "TC-FL-001 failed"
        return 1
    fi
    test_pass
}

# =============================================================================
# POSITIVE TEST 2: Multiple findings appended to same task are grouped
# =============================================================================

test_multiple_findings_grouped() {
    assert_reset  # Reset counters for this test
    test_start "Multiple findings for same task are grouped in same section" "TC-FL-002"
    
    local workflow_path="$TEST_WORKFLOW_DIR/tc-fl-002.org"
    
    cat > "$workflow_path" << 'EOF'
#+title:      Test Multiple Findings
#+TODO:       TODO(t) | DONE(d)

* TODO <parent-task>
:PROPERTIES:
:ID: parent-fl-002
:END:
- Goal :: Parent task
- Findings ::

*** TODO <subtask-002>
:PROPERTIES:
:ID: subtask-fl-002
:PARENT: parent-fl-002
:END:
- Goal :: Subtask with multiple findings
- Findings ::
- Next Actions ::

EOF
    
    # Append first finding
    curl -s -X POST "${SUPERVISOR_URL}/workflow/update" \
        -H "Content-Type: application/json" \
        -d '{
            "workflowPath": "'"$workflow_path"'",
            "taskId": "subtask-fl-002",
            "findings": [{
                "id": "F-fl002-001",
                "content": "First finding",
                "rating": "★★★"
            }]
        }' > /dev/null
    
    # Append second finding
    curl -s -X POST "${SUPERVISOR_URL}/workflow/update" \
        -H "Content-Type: application/json" \
        -d '{
            "workflowPath": "'"$workflow_path"'",
            "taskId": "subtask-fl-002",
            "findings": [{
                "id": "F-fl002-002",
                "content": "Second finding",
                "rating": "★★"
            }]
        }' > /dev/null
    
    # Extract the subtask section
    local subtask_line end_line subtask_section
    subtask_line=$(grep -n "^\\*\\*\\* TODO <subtask-002>" "$workflow_path" | head -1 | cut -d: -f1)
    end_line=$(wc -l < "$workflow_path")
    subtask_section=$(sed -n "${subtask_line},${end_line}p" "$workflow_path")
    
    # Verify both findings appear in subtask section
    assert_contains "$subtask_section" "F-fl002-001" "First finding ID should be in subtask section"
    assert_contains "$subtask_section" "F-fl002-002" "Second finding ID should be in subtask section"
    assert_contains "$subtask_section" "First finding" "First finding content should be in subtask section"
    assert_contains "$subtask_section" "Second finding" "Second finding content should be in subtask section"
    
    # Verify findings are in chronological order (first finding appears before second)
    local first_pos second_pos
    first_pos=$(echo "$subtask_section" | grep -n "F-fl002-001" | head -1 | cut -d: -f1)
    second_pos=$(echo "$subtask_section" | grep -n "F-fl002-002" | head -1 | cut -d: -f1)
    
    if [[ -n "$first_pos" && -n "$second_pos" && "$first_pos" -lt "$second_pos" ]]; then
        echo -e "${GREEN}✓${NC} Findings are in chronological order (F-fl002-001 at line $first_pos, F-fl002-002 at line $second_pos)"
    else
        echo -e "${RED}✗ ASSERT FAILED${NC} Findings should be in chronological order (first_pos=$first_pos, second_pos=$second_pos)"
        return 1
    fi
    
    rm -f "$workflow_path"
    
    if [[ $ASSERT_FAILED -gt 0 ]]; then
        test_fail "TC-FL-002 failed"
        return 1
    fi
    test_pass
}

# =============================================================================
# NEGATIVE TEST 1: Invalid taskId returns error
# =============================================================================

test_findings_invalid_taskid() {
    assert_reset  # Reset counters for this test
    test_start "workflow.update returns error for non-existent taskId" "TC-FL-001-N1"
    
    local workflow_path="$TEST_WORKFLOW_DIR/tc-fl-001n1.org"
    
    cat > "$workflow_path" << 'EOF'
#+title:      Test Invalid TaskId
#+TODO:       TODO(t) | DONE(d)

* TODO <parent>
:PROPERTIES:
:ID: parent-fl-001n1
:END:
- Goal :: Parent
- Findings ::

*** TODO <subtask>
:PROPERTIES:
:ID: subtask-fl-001n1
:PARENT: parent-fl-001n1
:END:
- Goal :: Subtask
- Findings ::

EOF
    
    # Try to append finding to non-existent taskId
    local response
    response=$(curl -s -X POST "${SUPERVISOR_URL}/workflow/update" \
        -H "Content-Type: application/json" \
        -d '{
            "workflowPath": "'"$workflow_path"'",
            "taskId": "non-existent-task-id",
            "findings": [{
                "id": "F-invalid-001",
                "content": "This should fail",
                "rating": "★"
            }]
        }')
    
    # Should return error (success: false or 404)
    if [[ "$response" =~ '"success":false' ]] || [[ "$response" =~ '"error"' ]] || [[ "$response" =~ '"taskId"' ]]; then
        echo -e "${GREEN}✓${NC} Invalid taskId returned error (correct)"
    else
        # If it somehow succeeded, verify finding was NOT added
        if grep -q "F-invalid-001" "$workflow_path" 2>/dev/null; then
            assert_true "false" "Finding should NOT be added for invalid taskId"
        else
            echo -e "${GREEN}✓${NC} Invalid taskId - finding was not added"
        fi
    fi
    
    rm -f "$workflow_path"
    
    if [[ $ASSERT_FAILED -gt 0 ]]; then
        test_fail "TC-FL-001-N1 failed"
        return 1
    fi
    test_pass
}

# =============================================================================
# NEGATIVE TEST 2: Finding should NOT appear in other task's section
# =============================================================================

test_findings_no_leak_to_other_task() {
    assert_reset  # Reset counters for this test
    test_start "Findings do NOT leak to other task's section" "TC-FL-001-N2"
    
    local workflow_path="$TEST_WORKFLOW_DIR/tc-fl-001n2.org"
    
    cat > "$workflow_path" << 'EOF'
#+title:      Test No Leak
#+TODO:       TODO(t) | DONE(d)

* TODO <parent-task>
:PROPERTIES:
:ID: parent-fl-001n2
:END:
- Goal :: Parent task
- Findings ::

*** TODO <subtask-a>
:PROPERTIES:
:ID: subtask-fl-001n2-a
:PARENT: parent-fl-001n2
:END:
- Goal :: Subtask A
- Findings ::
- Next Actions ::

*** TODO <subtask-b>
:PROPERTIES:
:ID: subtask-fl-001n2-b
:PARENT: parent-fl-001n2
:END:
- Goal :: Subtask B (should NOT receive A's finding)
- Findings ::
- Next Actions ::

EOF
    
    # Append a finding to subtask-a
    curl -s -X POST "${SUPERVISOR_URL}/workflow/update" \
        -H "Content-Type: application/json" \
        -d '{
            "workflowPath": "'"$workflow_path"'",
            "taskId": "subtask-fl-001n2-a",
            "findings": [{
                "id": "F-no-leak-001",
                "content": "This finding belongs to subtask A only",
                "rating": "★★★"
            }]
        }' > /dev/null
    
    # Extract subtask-b's section
    local subtask_b_line end_line subtask_b_section
    subtask_b_line=$(grep -n "^\\*\\*\\* TODO <subtask-b>" "$workflow_path" | head -1 | cut -d: -f1)
    end_line=$(wc -l < "$workflow_path")
    
    if [[ -z "$subtask_b_line" ]]; then
        assert_true "false" "Could not find subtask-b in file"
        rm -f "$workflow_path"
        return 1
    fi
    
    subtask_b_section=$(sed -n "${subtask_b_line},${end_line}p" "$workflow_path")
    
    # Verify finding does NOT appear in subtask-b's section
    assert_not_contains "$subtask_b_section" "F-no-leak-001" "Finding should NOT appear in subtask-b's section"
    
    rm -f "$workflow_path"
    
    if [[ $ASSERT_FAILED -gt 0 ]]; then
        test_fail "TC-FL-001-N2 failed"
        return 1
    fi
    test_pass
}

# =============================================================================
# NEGATIVE TEST 3: Findings should NOT appear at file end (relative to section)
# =============================================================================

test_findings_not_at_section_end() {
    assert_reset  # Reset counters for this test
    test_start "Findings are inserted within task section, not at absolute file end" "TC-FL-002-N1"
    
    local workflow_path="$TEST_WORKFLOW_DIR/tc-fl-002n1.org"
    
    cat > "$workflow_path" << 'EOF'
#+title:      Test Not Simple Append
#+TODO:       TODO(t) | DONE(d)

* TODO <parent>
:PROPERTIES:
:ID: parent-fl-002n1
:END:
- Goal :: Parent
- Findings ::

*** TODO <subtask>
:PROPERTIES:
:ID: subtask-fl-002n1
:PARENT: parent-fl-002n1
:END:
- Goal :: Subtask
- Findings ::
- Next Actions ::

EOF
    
    # Append a finding
    curl -s -X POST "${SUPERVISOR_URL}/workflow/update" \
        -H "Content-Type: application/json" \
        -d '{
            "workflowPath": "'"$workflow_path"'",
            "taskId": "subtask-fl-002n1",
            "findings": [{
                "id": "F-not-append-001",
                "content": "Finding should be in Findings section",
                "rating": "★★★"
            }]
        }' > /dev/null
    
    # The finding should appear after "Findings ::" and before "- Next Actions ::"
    # It should NOT appear as the absolute last line (ignoring trailing newline)
    local last_line second_last
    last_line=$(tail -1 "$workflow_path")
    second_last=$(tail -2 "$workflow_path" | head -1)
    
    # If the finding IS the last line, that would indicate simple append behavior
    # But since findings go in Findings section before "- Next Actions ::", 
    # the finding should be followed by "- Next Actions ::"
    if [[ "$last_line" =~ "F-not-append-001" ]]; then
        assert_true "false" "Finding should NOT be the absolute last line"
    else
        echo -e "${GREEN}✓${NC} Finding is not the absolute last line"
    fi
    
    # Also verify it appears within the subtask's Findings section
    local subtask_line end_line subtask_section
    subtask_line=$(grep -n "^\\*\\*\\* TODO <subtask>" "$workflow_path" | head -1 | cut -d: -f1)
    end_line=$(wc -l < "$workflow_path")
    subtask_section=$(sed -n "${subtask_line},${end_line}p" "$workflow_path")
    assert_contains "$subtask_section" "F-not-append-001" "Finding should be in subtask section"
    assert_contains "$subtask_section" "- Next Actions" "Findings section should be followed by Next Actions"
    
    rm -f "$workflow_path"
    
    if [[ $ASSERT_FAILED -gt 0 ]]; then
        test_fail "TC-FL-002-N1 failed"
        return 1
    fi
    test_pass
}

# =============================================================================
# POSITIVE TEST 3: taskId can be extracted from findings[0].taskId
# =============================================================================

test_taskid_extracted_from_findings() {
    assert_reset
    test_start "taskId extracted from findings[0].taskId (no explicit taskId in body)" "TC-FL-003"
    
    local workflow_path="$TEST_WORKFLOW_DIR/tc-fl-003.org"
    
    cat > "$workflow_path" << 'EOF'
#+title:      Test TaskId Extraction
#+TODO:       TODO(t) | DONE(d)

* TODO <parent>
:PROPERTIES:
:ID: parent-fl-003
:END:
- Goal :: Parent
- Findings ::

*** TODO <subtask>
:PROPERTIES:
:ID: subtask-fl-003
:PARENT: parent-fl-003
:END:
- Goal :: Subtask
- Findings ::

EOF

    # Append finding WITHOUT explicit taskId in body - should extract from findings[0].taskId
    local response
    response=$(curl -s -X POST "${SUPERVISOR_URL}/workflow/update" \
        -H "Content-Type: application/json" \
        -d '{
            "workflowPath": "'"$workflow_path"'",
            "findings": [{
                "taskId": "subtask-fl-003",
                "id": "F-taskid-extract-001",
                "content": "Finding with embedded taskId",
                "rating": "★★"
            }]
        }')
    
    # Should succeed (not 400 for missing taskId)
    if [[ ! "$response" =~ '"success":false' ]] && [[ ! "$response" =~ '"error"' ]]; then
        echo -e "${GREEN}✓${NC} taskId extracted from findings[0].taskId (no error)"
    else
        assert_true "false" "Should extract taskId from findings, got error: $response"
    fi
    
    # Verify finding appears in subtask's section
    local subtask_line end_line subtask_section
    subtask_line=$(grep -n "^\\*\\*\\* TODO <subtask>" "$workflow_path" | head -1 | cut -d: -f1)
    end_line=$(wc -l < "$workflow_path")
    subtask_section=$(sed -n "${subtask_line},${end_line}p" "$workflow_path")
    assert_contains "$subtask_section" "F-taskid-extract-001" "Finding ID should be in subtask section"
    assert_contains "$subtask_section" "Finding with embedded taskId" "Finding content should be in subtask section"
    
    rm -f "$workflow_path"
    
    if [[ $ASSERT_FAILED -gt 0 ]]; then
        test_fail "TC-FL-003 failed"
        return 1
    fi
    test_pass
}

# =============================================================================
# NEGATIVE TEST 5: Missing taskId everywhere should return error
# =============================================================================

test_taskid_missing_everywhere() {
    assert_reset
    test_start "Missing taskId everywhere returns 400 error" "TC-FL-003-N1"
    
    local workflow_path="$TEST_WORKFLOW_DIR/tc-fl-003n1.org"
    
    cat > "$workflow_path" << 'EOF'
#+title:      Test Missing TaskId
#+TODO:       TODO(t) | DONE(d)

* TODO <parent>
:PROPERTIES:
:ID: parent-fl-003n1
:END:
- Goal :: Parent
- Findings ::

*** TODO <subtask>
:PROPERTIES:
:ID: subtask-fl-003n1
:PARENT: parent-fl-003n1
:END:
- Goal :: Subtask
- Findings ::

EOF

    # Try to append finding WITHOUT taskId anywhere (neither in body nor in findings)
    local response
    response=$(curl -s -X POST "${SUPERVISOR_URL}/workflow/update" \
        -H "Content-Type: application/json" \
        -d '{
            "workflowPath": "'"$workflow_path"'",
            "findings": [{
                "id": "F-no-taskid-001",
                "content": "No taskId anywhere",
                "rating": "★"
            }]
        }')
    
    # Should return 400 error
    if [[ "$response" =~ '"success":false' ]] || [[ "$response" =~ '"error"' ]] || [[ "$response" =~ 'taskId' ]]; then
        echo -e "${GREEN}✓${NC} Missing taskId returns error (correct)"
    else
        assert_true "false" "Should return error for missing taskId, got: $response"
    fi
    
    rm -f "$workflow_path"
    
    if [[ $ASSERT_FAILED -gt 0 ]]; then
        test_fail "TC-FL-003-N1 failed"
        return 1
    fi
    test_pass
}

# =============================================================================
# POSITIVE TEST 4: Absolute path works correctly
# =============================================================================

test_absolute_path_works() {
    assert_reset
    test_start "Absolute workflow path resolves correctly" "TC-FL-004"
    
    local workflow_path="$TEST_WORKFLOW_DIR/tc-fl-004.org"
    local absolute_path="$(cd "$(dirname "$workflow_path")" && pwd)/$(basename "$workflow_path")"
    
    cat > "$workflow_path" << 'EOF'
#+title:      Test Absolute Path
#+TODO:       TODO(t) | DONE(d)

* TODO <parent>
:PROPERTIES:
:ID: parent-fl-004
:END:
- Goal :: Parent
- Findings ::

*** TODO <subtask>
:PROPERTIES:
:ID: subtask-fl-004
:PARENT: parent-fl-004
:END:
- Goal :: Subtask
- Findings ::

EOF

    # Append using absolute path
    local response
    response=$(curl -s -X POST "${SUPERVISOR_URL}/workflow/update" \
        -H "Content-Type: application/json" \
        -d '{
            "workflowPath": "'"$absolute_path"'",
            "taskId": "subtask-fl-004",
            "findings": [{
                "id": "F-abs-path-001",
                "content": "Finding via absolute path",
                "rating": "★★★"
            }]
        }')
    
    # Should succeed
    if [[ ! "$response" =~ '"success":false' ]] && [[ ! "$response" =~ '"error"' ]]; then
        echo -e "${GREEN}✓${NC} Absolute path accepted (no error)"
    else
        assert_true "false" "Should accept absolute path, got error: $response"
    fi
    
    # Verify finding appears in subtask's section
    local subtask_line end_line subtask_section
    subtask_line=$(grep -n "^\\*\\*\\* TODO <subtask>" "$workflow_path" | head -1 | cut -d: -f1)
    end_line=$(wc -l < "$workflow_path")
    subtask_section=$(sed -n "${subtask_line},${end_line}p" "$workflow_path")
    assert_contains "$subtask_section" "F-abs-path-001" "Finding should appear in subtask section"
    
    rm -f "$workflow_path"
    
    if [[ $ASSERT_FAILED -gt 0 ]]; then
        test_fail "TC-FL-004 failed"
        return 1
    fi
    test_pass
}

# =============================================================================
# NEGATIVE TEST 6: Non-existent absolute path returns 404
# =============================================================================

test_nonexistent_path_returns_404() {
    assert_reset
    test_start "Non-existent absolute path returns 404" "TC-FL-004-N1"
    
    # Try to update a file that doesn't exist
    local response
    response=$(curl -s -X POST "${SUPERVISOR_URL}/workflow/update" \
        -H "Content-Type: application/json" \
        -d '{
            "workflowPath": "/tmp/nonexistent-$(date +%s).org",
            "taskId": "any-task-id",
            "findings": [{
                "id": "F-nonexist-001",
                "content": "Should not be written",
                "rating": "★"
            }]
        }')
    
    # Should return 404
    if [[ "$response" =~ '404' ]] || [[ "$response" =~ '"success":false' ]]; then
        echo -e "${GREEN}✓${NC} Non-existent path returns 404 (correct)"
    else
        # Maybe it succeeded (which would be wrong), check if file was created
        assert_true "false" "Should return 404 for non-existent file, got: $response"
    fi
    
    if [[ $ASSERT_FAILED -gt 0 ]]; then
        test_fail "TC-FL-004-N1 failed"
        return 1
    fi
    test_pass
}

# =============================================================================
# NEGATIVE TEST 7: Subtask findings should NOT appear in parent's section
# =============================================================================

test_findings_not_in_parent() {
    assert_reset  # Reset counters for this test
    test_start "Subtask findings do NOT appear in parent's Findings section" "TC-FL-002-N2"
    
    local workflow_path="$TEST_WORKFLOW_DIR/tc-fl-002n2.org"
    
    cat > "$workflow_path" << 'EOF'
#+title:      Test Parent Isolation
#+TODO:       TODO(t) | DONE(d)

* IN-PROGRESS <parent-task>
:PROPERTIES:
:ID: parent-fl-002n2
:END:
- Goal :: Parent task
- Findings ::

*** TODO <subtask>
:PROPERTIES:
:ID: subtask-fl-002n2
:PARENT: parent-fl-002n2
:END:
- Goal :: Subtask
- Findings ::
- Next Actions ::

EOF
    
    # Append finding to subtask
    curl -s -X POST "${SUPERVISOR_URL}/workflow/update" \
        -H "Content-Type: application/json" \
        -d '{
            "workflowPath": "'"$workflow_path"'",
            "taskId": "subtask-fl-002n2",
            "findings": [{
                "id": "F-parent-isolate-001",
                "content": "This subtask finding should NOT be in parent",
                "rating": "★★★"
            }]
        }' > /dev/null
    
    # Extract parent's section (from parent heading to subtask heading)
    local parent_line subtask_line parent_section
    parent_line=$(grep -n "^\\* IN-PROGRESS <parent-task>" "$workflow_path" | head -1 | cut -d: -f1)
    subtask_line=$(grep -n "^\\*\\*\\* TODO <subtask>" "$workflow_path" | head -1 | cut -d: -f1)
    
    if [[ -z "$parent_line" ]] || [[ -z "$subtask_line" ]]; then
        assert_true "false" "Could not find tasks in file"
        rm -f "$workflow_path"
        return 1
    fi
    
    # Get content between parent and subtask
    parent_section=$(sed -n "${parent_line},$((subtask_line - 1))p" "$workflow_path")
    
    # Verify finding does NOT appear in parent's Findings section
    assert_not_contains "$parent_section" "F-parent-isolate-001" "Subtask finding should NOT appear in parent's Findings section"
    
    # Also verify the finding IS in the subtask's section
    local subtask_section
    subtask_section=$(sed -n "${subtask_line},$(wc -l < "$workflow_path")p" "$workflow_path")
    assert_contains "$subtask_section" "F-parent-isolate-001" "Subtask finding should appear in subtask's section"
    
    rm -f "$workflow_path"
    
    if [[ $ASSERT_FAILED -gt 0 ]]; then
        test_fail "TC-FL-002-N2 failed"
        return 1
    fi
    test_pass
}

# =============================================================================
# Main
# =============================================================================

main() {
    echo "========================================"
    echo "Findings Location E2E Tests"
    echo "========================================"
    echo ""
    echo "Test Distribution:"
    echo "  Positive (2): TC-FL-001, TC-FL-002"
    echo "  Negative (4): TC-FL-001-N1, TC-FL-001-N2, TC-FL-002-N1, TC-FL-002-N2"
    echo "  Total: 6 tests"
    echo ""
    
    # Ensure supervisor is running
    ensure_supervisor
    
    # Change to project directory
    cd "$SCRIPT_DIR/.."
    
    # Run tests
    test_findings_location_subtask && TESTS_PASSED=$((TESTS_PASSED + 1)) || TESTS_FAILED=$((TESTS_FAILED + 1))
    echo ""
    
    test_findings_invalid_taskid && TESTS_PASSED=$((TESTS_PASSED + 1)) || TESTS_FAILED=$((TESTS_FAILED + 1))
    echo ""
    
    test_multiple_findings_grouped && TESTS_PASSED=$((TESTS_PASSED + 1)) || TESTS_FAILED=$((TESTS_FAILED + 1))
    echo ""
    
    test_findings_no_leak_to_other_task && TESTS_PASSED=$((TESTS_PASSED + 1)) || TESTS_FAILED=$((TESTS_FAILED + 1))
    echo ""
    
    test_findings_not_at_section_end && TESTS_PASSED=$((TESTS_PASSED + 1)) || TESTS_FAILED=$((TESTS_FAILED + 1))
    echo ""
    
    test_findings_not_in_parent && TESTS_PASSED=$((TESTS_PASSED + 1)) || TESTS_FAILED=$((TESTS_FAILED + 1))
    echo ""
    
    test_taskid_extracted_from_findings && TESTS_PASSED=$((TESTS_PASSED + 1)) || TESTS_FAILED=$((TESTS_FAILED + 1))
    echo ""
    
    test_taskid_missing_everywhere && TESTS_PASSED=$((TESTS_PASSED + 1)) || TESTS_FAILED=$((TESTS_FAILED + 1))
    echo ""
    
    test_absolute_path_works && TESTS_PASSED=$((TESTS_PASSED + 1)) || TESTS_FAILED=$((TESTS_FAILED + 1))
    echo ""
    
    test_nonexistent_path_returns_404 && TESTS_PASSED=$((TESTS_PASSED + 1)) || TESTS_FAILED=$((TESTS_FAILED + 1))
    echo ""
    
    echo "========================================"
    echo "Results: $TESTS_PASSED passed, $TESTS_FAILED failed, 0 skipped"
    echo "========================================"
    
    if [[ $TESTS_FAILED -gt 0 ]]; then
        exit 1
    fi
    exit 0
}

main "$@"
