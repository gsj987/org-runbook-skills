#!/usr/bin/env bash
# =============================================================================
# pi-adapter E2E Test Suite - Deploy Script Tests
# =============================================================================
# Tests deploy.sh script functionality:
# - TC-DP-001: deploy.sh --project basic (P0)
# - TC-DP-002: deploy.sh --project --force (P0)
# - TC-DP-003: deploy.sh clean state (P0)
# - TC-DP-004: deploy.sh --remove (P1)
# - TC-DP-005: deploy.sh --help (P2)
# - TC-DP-006: deploy.sh invalid-path error (P1)
# - TC-DP-007: deploy.sh --global (P2)
# - TC-DP-008 to TC-DP-010: Verify deployment content
# =============================================================================

set -euo pipefail

# Source libraries
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/setup.sh"
source "$SCRIPT_DIR/lib/assert.sh"

# Configuration
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEPLOY_SCRIPT="$PROJECT_ROOT/deploy.sh"

# Expected skills
EXPECTED_SKILLS=(
    "runbook-org"
    "runbook-multiagent"
    "runbook-brainstorm"
    "orchestrator-skill"
    "exception-routing"
)

# Expected adapter files
EXPECTED_ADAPTER_FILES=(
    "index.ts"
    "protocol.ts"
    "package.json"
)

# =============================================================================
# Setup/Teardown
# =============================================================================

# Create temporary test directory
setup_test_dir() {
    local test_dir
    test_dir=$(mktemp -d)
    echo "$test_dir"
}

# Cleanup test directory
cleanup_test_dir() {
    local test_dir="$1"
    rm -rf "$test_dir"
}

# =============================================================================
# TC-DP-001: deploy.sh --project - Basic
# =============================================================================
test_tc_dp_001() {
    test_start "Deploy.sh --project basic" "TC-DP-001"
    
    local test_dir
    test_dir=$(setup_test_dir)
    
    # Execute deploy
    local output
    output=$("$DEPLOY_SCRIPT" --project "$test_dir" 2>&1)
    local exit_code=$?
    
    # Verify success
    assert_equals "0" "$exit_code" "Deploy should succeed with exit code 0" || { cleanup_test_dir "$test_dir"; return 1; }
    
    # Verify .pi directory created
    local pi_dir="$test_dir/.pi"
    assert_dir_exists "$pi_dir" ".pi directory should be created" || { cleanup_test_dir "$test_dir"; return 1; }
    
    # Verify skills directory exists
    local skills_dir="$pi_dir/skills"
    assert_dir_exists "$skills_dir" ".pi/skills directory should exist" || { cleanup_test_dir "$test_dir"; return 1; }
    
    # Verify adapter directory exists
    local adapter_dir="$pi_dir/extensions/pi-adapter"
    assert_dir_exists "$adapter_dir" ".pi/extensions/pi-adapter should exist" || { cleanup_test_dir "$test_dir"; return 1; }
    
    # Verify settings.json exists
    local settings_file="$pi_dir/settings.json"
    assert_file_exists "$settings_file" "settings.json should be created" || { cleanup_test_dir "$test_dir"; return 1; }
    
    # Verify success message in output
    assert_contains "$output" "complete" "Output should indicate deployment complete"
    
    cleanup_test_dir "$test_dir"
    
    if assert_any_failed; then
        test_fail "TC-DP-001 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-DP-002: deploy.sh --project --force - Overwrite
# =============================================================================
test_tc_dp_002() {
    test_start "Deploy.sh --project --force overwrite" "TC-DP-002"
    
    local test_dir
    test_dir=$(setup_test_dir)
    
    # First deploy
    "$DEPLOY_SCRIPT" --project "$test_dir" > /dev/null 2>&1
    
    # Modify a skill file
    local skill_file="$test_dir/.pi/skills/runbook-org/SKILL.md"
    echo "# Modified for testing" >> "$skill_file"
    
    # Deploy again without force - should skip
    local output1
    output1=$("$DEPLOY_SCRIPT" --project "$test_dir" 2>&1)
    
    # Verify skip message
    assert_contains "$output1" "exists" "Should warn about existing skill"
    assert_contains "$output1" "--force" "Should suggest using --force"
    
    # Deploy with force - should overwrite
    local output2
    output2=$("$DEPLOY_SCRIPT" --project "$test_dir" --force 2>&1)
    local exit_code=$?
    
    assert_equals "0" "$exit_code" "Force deploy should succeed"
    
    # Verify file was overwritten (no longer contains our modification marker)
    local content
    content=$(cat "$skill_file")
    assert_not_contains "$content" "Modified for testing" "Modified content should be overwritten"
    
    cleanup_test_dir "$test_dir"
    
    if assert_any_failed; then
        test_fail "TC-DP-002 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-DP-003: deploy.sh --project - Clean State
# =============================================================================
test_tc_dp_003() {
    test_start "Deploy.sh clean state" "TC-DP-003"
    
    local test_dir
    test_dir=$(setup_test_dir)
    
    # Deploy to fresh directory
    local output
    output=$("$DEPLOY_SCRIPT" --project "$test_dir" 2>&1)
    local exit_code=$?
    
    # Verify no errors
    assert_equals "0" "$exit_code" "Clean deploy should succeed"
    
    # Verify no warning messages about existing files
    assert_not_contains "$output" "exists" "Clean state should not show exists warnings"
    assert_not_contains "$output" "already" "Clean state should not show already warnings"
    
    # Verify clean completion message
    assert_contains "$output" "complete" "Should show complete message"
    
    cleanup_test_dir "$test_dir"
    
    if assert_any_failed; then
        test_fail "TC-DP-003 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-DP-004: deploy.sh --remove - Cleanup
# =============================================================================
test_tc_dp_004() {
    test_start "Deploy.sh --remove cleanup" "TC-DP-004"
    
    local test_dir
    test_dir=$(setup_test_dir)
    
    # First deploy
    "$DEPLOY_SCRIPT" --project "$test_dir" > /dev/null 2>&1
    
    local pi_dir="$test_dir/.pi"
    assert_dir_exists "$pi_dir" ".pi should exist before removal"
    
    # Remove
    local output
    output=$("$DEPLOY_SCRIPT" --project "$test_dir" --remove 2>&1)
    local exit_code=$?
    
    assert_equals "0" "$exit_code" "Remove should succeed"
    
    # Verify skills removed
    local skills_dir="$pi_dir/skills"
    for skill in "${EXPECTED_SKILLS[@]}"; do
        assert_file_not_exists "$skills_dir/$skill/SKILL.md" "Skill $skill should be removed"
    done
    
    # Verify adapter removed
    local adapter_dir="$pi_dir/extensions/pi-adapter"
    assert_dir_not_exists "$adapter_dir" "pi-adapter should be removed"
    
    # Verify success message
    assert_contains "$output" "Removed" "Output should indicate removal"
    
    cleanup_test_dir "$test_dir"
    
    if assert_any_failed; then
        test_fail "TC-DP-004 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-DP-005: deploy.sh --help - Help Output
# =============================================================================
test_tc_dp_005() {
    test_start "Deploy.sh --help output" "TC-DP-005"
    
    # Execute help
    local output
    output=$("$DEPLOY_SCRIPT" --help 2>&1)
    local exit_code=$?
    
    assert_equals "0" "$exit_code" "Help should succeed with exit code 0"
    
    # Verify usage message
    assert_contains "$output" "Usage" "Output should show usage"
    
    # Verify all options documented
    assert_contains "$output" "--project" "Should document --project"
    assert_contains "$output" "--global" "Should document --global"
    assert_contains "$output" "--force" "Should document --force"
    assert_contains "$output" "--remove" "Should document --remove"
    assert_contains "$output" "--help" "Should document --help"
    
    # Verify examples documented
    assert_contains "$output" "Example" "Should show examples"
    
    if assert_any_failed; then
        test_fail "TC-DP-005 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-DP-006: deploy.sh invalid-path error
# =============================================================================
test_tc_dp_006() {
    test_start "Deploy.sh invalid-path error handling" "TC-DP-006"
    
    local invalid_path="/nonexistent/path/that/does/not/exist"
    
    # Execute with invalid path
    local output
    output=$("$DEPLOY_SCRIPT" --project "$invalid_path" 2>&1)
    local exit_code=$?
    
    # Should fail with non-zero exit
    assert_not_equals "0" "$exit_code" "Deploy should fail with invalid path"
    
    # Should show error message
    assert_contains "$output" "Error" "Output should contain error message"
    
    # Should NOT crash (exit cleanly)
    assert_not_contains "$output" "traceback" "Should not produce Python traceback"
    
    if assert_any_failed; then
        test_fail "TC-DP-006 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-DP-007: deploy.sh --global - Global Install
# =============================================================================
test_tc_dp_007() {
    test_start "Deploy.sh --global installation" "TC-DP-007"
    
    # Skip if PI_DIR doesn't exist
    if [[ ! -d "$HOME/.pi/agent" ]]; then
        test_skip "Global install requires ~/.pi/agent to exist"
        return 0
    fi
    
    # Backup existing settings if any
    local settings_backup=""
    if [[ -f "$HOME/.pi/agent/settings.json" ]]; then
        settings_backup="$HOME/.pi/agent/settings.json.bak.$(date +%s)"
        cp "$HOME/.pi/agent/settings.json" "$settings_backup"
    fi
    
    # Execute global deploy
    local output
    output=$("$DEPLOY_SCRIPT" --global 2>&1)
    local exit_code=$?
    
    # Should succeed
    assert_equals "0" "$exit_code" "Global deploy should succeed"
    
    # Verify global skills directory exists
    local global_skills="$HOME/.pi/agent/skills"
    assert_dir_exists "$global_skills" "Global skills directory should exist"
    
    # Verify global adapter exists
    local global_adapter="$HOME/.pi/agent/extensions/pi-adapter"
    assert_dir_exists "$global_adapter" "Global adapter directory should exist"
    
    # Restore backup if we made one
    if [[ -n "$settings_backup" && -f "$settings_backup" ]]; then
        mv "$settings_backup" "$HOME/.pi/agent/settings.json"
    fi
    
    if assert_any_failed; then
        test_fail "TC-DP-007 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-DP-008: Verify all skills deployed
# =============================================================================
test_tc_dp_008() {
    test_start "Verify all skills deployed" "TC-DP-008"
    
    local test_dir
    test_dir=$(setup_test_dir)
    
    # Deploy
    "$DEPLOY_SCRIPT" --project "$test_dir" > /dev/null 2>&1
    
    local skills_dir="$test_dir/.pi/skills"
    
    # Verify each expected skill
    for skill in "${EXPECTED_SKILLS[@]}"; do
        local skill_dir="$skills_dir/$skill"
        assert_dir_exists "$skill_dir" "Skill directory $skill should exist"
        
        # Verify SKILL.md exists
        local skill_file="$skill_dir/SKILL.md"
        assert_file_exists "$skill_file" "SKILL.md should exist for $skill"
        
        # Verify skill file has content
        local content_size
        content_size=$(wc -c < "$skill_file")
        assert_gt "$content_size" 100 "SKILL.md for $skill should have content"
    done
    
    cleanup_test_dir "$test_dir"
    
    if assert_any_failed; then
        test_fail "TC-DP-008 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-DP-009: Verify adapter files deployed
# =============================================================================
test_tc_dp_009() {
    test_start "Verify adapter files deployed" "TC-DP-009"
    
    local test_dir
    test_dir=$(setup_test_dir)
    
    # Deploy
    "$DEPLOY_SCRIPT" --project "$test_dir" > /dev/null 2>&1
    
    local adapter_dir="$test_dir/.pi/extensions/pi-adapter"
    
    # Verify each expected file
    for file in "${EXPECTED_ADAPTER_FILES[@]}"; do
        local file_path="$adapter_dir/$file"
        assert_file_exists "$file_path" "Adapter file $file should exist"
        
        # Verify file has content
        local content_size
        content_size=$(wc -c < "$file_path")
        assert_gt "$content_size" 10 "Adapter file $file should have content"
    done
    
    # Verify package.json has valid JSON
    if command -v node &>/dev/null; then
        node -e "JSON.parse(require('fs').readFileSync('$adapter_dir/package.json'))" 2>/dev/null
        assert_equals "0" "$?" "package.json should be valid JSON"
    fi
    
    cleanup_test_dir "$test_dir"
    
    if assert_any_failed; then
        test_fail "TC-DP-009 failed"
        return 1
    fi
    
    test_pass
}

# =============================================================================
# TC-DP-010: Verify settings.json updated
# =============================================================================
test_tc_dp_010() {
    test_start "Verify settings.json updated correctly" "TC-DP-010"
    
    local test_dir
    test_dir=$(setup_test_dir)
    
    # Deploy
    "$DEPLOY_SCRIPT" --project "$test_dir" > /dev/null 2>&1
    
    local settings_file="$test_dir/.pi/settings.json"
    
    # Verify settings file exists
    assert_file_exists "$settings_file" "settings.json should exist"
    
    # Read settings
    local settings_content
    settings_content=$(cat "$settings_file")
    
    # Verify it's valid JSON
    if command -v python3 &>/dev/null; then
        python3 -c "import json; json.load(open('$settings_file'))" 2>/dev/null
        assert_equals "0" "$?" "settings.json should be valid JSON"
    fi
    
    # Verify skills are configured
    assert_contains "$settings_content" "skills" "Settings should contain skills"
    assert_contains "$settings_content" "runbook-org" "Settings should reference runbook-org"
    assert_contains "$settings_content" "orchestrator-skill" "Settings should reference orchestrator-skill"
    
    # Verify skill commands enabled
    assert_contains "$settings_content" "enableSkillCommands" "Settings should enable skill commands"
    
    cleanup_test_dir "$test_dir"
    
    if assert_any_failed; then
        test_fail "TC-DP-010 failed"
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
    echo "Deploy Script Test Suite"
    echo "========================================"
    
    # Ensure deploy script exists
    if [[ ! -f "$DEPLOY_SCRIPT" ]]; then
        log_error "Deploy script not found: $DEPLOY_SCRIPT"
        exit 1
    fi
    
    # Run all tests
    local failed=0
    
    test_tc_dp_001 || failed=$((failed + 1))
    
    test_tc_dp_002 || failed=$((failed + 1))
    
    test_tc_dp_003 || failed=$((failed + 1))
    
    test_tc_dp_004 || failed=$((failed + 1))
    
    test_tc_dp_005 || failed=$((failed + 1))
    
    test_tc_dp_006 || failed=$((failed + 1))
    
    test_tc_dp_007 || failed=$((failed + 1))
    
    test_tc_dp_008 || failed=$((failed + 1))
    
    test_tc_dp_009 || failed=$((failed + 1))
    
    test_tc_dp_010 || failed=$((failed + 1))
    
    # Summary
    echo ""
    echo "========================================"
    echo "Test Summary: Deploy Script"
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
