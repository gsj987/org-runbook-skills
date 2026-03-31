#!/usr/bin/env bash
# =============================================================================
# pi-adapter E2E Test Suite - Master Test Runner
# =============================================================================
# Runs all E2E test suites and reports aggregated results:
# - supervisor-lifecycle.sh
# - workflow-operations.sh
# - worker-spawn-cycle.sh
# - fencing.sh
# - state-machine.sh
# - deploy-script.sh
# =============================================================================

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Source setup library for shared functions
source "$SCRIPT_DIR/lib/setup.sh"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Test suite definitions
declare -A TEST_SUITES=(
    ["supervisor-lifecycle.sh"]="Supervisor Lifecycle"
    ["workflow-operations.sh"]="Workflow Operations"
    ["worker-spawn-cycle.sh"]="Worker Spawn Cycle"
    ["fencing.sh"]="Security/Fencing"
    ["state-machine.sh"]="State Machine"
    ["deploy-script.sh"]="Deploy Script"
)

# Statistics
TOTAL_SUITES=0
PASSED_SUITES=0
FAILED_SUITES=0
SKIPPED_SUITES=0
TOTAL_TESTS=0
TOTAL_PASSED=0
TOTAL_FAILED=0
TOTAL_SKIPPED=0

# =============================================================================
# Print functions
# =============================================================================

print_banner() {
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║             pi-adapter E2E Test Suite - Master Runner                  ║${NC}"
    echo -e "${CYAN}║                                                                      ║${NC}"
    echo -e "${CYAN}║  This runs all E2E tests for the pi-adapter including:               ║${NC}"
    echo -e "${CYAN}║  - Supervisor lifecycle management                                     ║${NC}"
    echo -e "${CYAN}║  - Workflow operations                                               ║${NC}"
    echo -e "${CYAN}║  - Worker spawn and completion cycles                                 ║${NC}"
    echo -e "${CYAN}║  - Security and access control                                        ║${NC}"
    echo -e "${CYAN}║  - Task state transitions                                             ║${NC}"
    echo -e "${CYAN}║  - Deploy script functionality                                         ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_suite_header() {
    local suite_name="$1"
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}▶ Running: ${YELLOW}$suite_name${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

print_suite_result() {
    local suite_name="$1"
    local result="$2"  # PASS, FAIL, SKIP
    local tests_run="$3"
    local passed="$4"
    local failed="$5"
    local skipped="$6"
    
    local color="$GREEN"
    local symbol="✓"
    
    case "$result" in
        FAIL)
            color="$RED"
            symbol="✗"
            ;;
        SKIP)
            color="$YELLOW"
            symbol="⊘"
            ;;
    esac
    
    echo -e "${color}$symbol $suite_name:${NC} $passed passed, $failed failed, $skipped skipped"
}

print_final_summary() {
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║                          FINAL SUMMARY                                  ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  ${BLUE}Test Suites:${NC}"
    echo -e "    Total:    $TOTAL_SUITES"
    echo -e "    ${GREEN}Passed:    $PASSED_SUITES${NC}"
    echo -e "    ${RED}Failed:    $FAILED_SUITES${NC}"
    echo -e "    ${YELLOW}Skipped:   $SKIPPED_SUITES${NC}"
    echo ""
    echo -e "  ${BLUE}Individual Tests:${NC}"
    echo -e "    Total:    $TOTAL_TESTS"
    echo -e "    ${GREEN}Passed:    $TOTAL_PASSED${NC}"
    echo -e "    ${RED}Failed:    $TOTAL_FAILED${NC}"
    echo -e "    ${YELLOW}Skipped:   $TOTAL_SKIPPED${NC}"
    echo ""
    
    if [[ $FAILED_SUITES -gt 0 ]] || [[ $TOTAL_FAILED -gt 0 ]]; then
        echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${RED}                         RESULT: FAILED                                   ${NC}"
        echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        return 1
    else
        echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${GREEN}                         RESULT: ALL PASSED                               ${NC}"
        echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        return 0
    fi
}

# =============================================================================
# Parse test results from output
# =============================================================================

parse_test_results() {
    local output="$1"
    
    local passed=0
    local failed=0
    local skipped=0
    
    # Look for summary patterns
    if [[ "$output" =~ "Passed:"[[:space:]]*([0-9]+) ]]; then
        passed="${BASH_REMATCH[1]}"
    fi
    if [[ "$output" =~ "Failed:"[[:space:]]*([0-9]+) ]]; then
        failed="${BASH_REMATCH[1]}"
    fi
    if [[ "$output" =~ "Skipped:"[[:space:]]*([0-9]+) ]]; then
        skipped="${BASH_REMATCH[1]}"
    fi
    
    # Alternative pattern: "Tests run: X"
    if [[ "$output" =~ "Tests run:"[[:space:]]*([0-9]+) ]]; then
        passed="${BASH_REMATCH[1]}"
    fi
    
    echo "$passed $failed $skipped"
}

# =============================================================================
# Run individual test suite
# =============================================================================

run_suite() {
    local suite_file="$1"
    local suite_name="$2"
    local full_path="$SCRIPT_DIR/$suite_file"
    
    TOTAL_SUITES=$((TOTAL_SUITES + 1))
    
    # Check if suite file exists
    if [[ ! -f "$full_path" ]]; then
        echo -e "${YELLOW}⊘ SKIP: $suite_name (file not found)${NC}"
        SKIPPED_SUITES=$((SKIPPED_SUITES + 1))
        return 1
    fi
    
    # Check if executable
    if [[ ! -x "$full_path" ]]; then
        chmod +x "$full_path"
    fi
    
    print_suite_header "$suite_name"
    
    # Run the suite
    local output
    local exit_code=0
    
    output=$("$full_path" 2>&1) || exit_code=$?
    
    # Parse results
    local results
    results=$(parse_test_results "$output")
    read -r passed failed skipped <<< "$results"
    
    # Handle cases where parsing didn't work
    passed=${passed:-0}
    failed=${failed:-0}
    skipped=${skipped:-0}
    
    # Update totals
    TOTAL_PASSED=$((TOTAL_PASSED + passed))
    TOTAL_FAILED=$((TOTAL_FAILED + failed))
    TOTAL_SKIPPED=$((TOTAL_SKIPPED + skipped))
    
    # Determine result
    local result="PASS"
    if [[ $exit_code -ne 0 ]]; then
        result="FAIL"
        FAILED_SUITES=$((FAILED_SUITES + 1))
    else
        PASSED_SUITES=$((PASSED_SUITES + 1))
    fi
    
    print_suite_result "$suite_name" "$result" "$((passed + failed + skipped))" "$passed" "$failed" "$skipped"
    
    # Show failure details if any
    if [[ $failed -gt 0 ]]; then
        echo -e "${RED}  Failed tests in $suite_name:${NC}"
        echo "$output" | grep -E "(FAIL|✗)" | head -5 | sed 's/^/    /'
    fi
    
    return $exit_code
}

# =============================================================================
# Pre-flight checks
# =============================================================================

preflight_checks() {
    echo -e "${BLUE}[INFO] Running pre-flight checks...${NC}"
    
    # Check project structure
    if [[ ! -d "$PROJECT_ROOT/adapters" ]]; then
        echo -e "${RED}[ERROR] adapters/ directory not found${NC}"
        return 1
    fi
    
    if [[ ! -d "$PROJECT_ROOT/adapters/pi" ]]; then
        echo -e "${RED}[ERROR] adapters/pi/ directory not found${NC}"
        return 1
    fi
    
    if [[ ! -f "$PROJECT_ROOT/adapters/pi/protocol.ts" ]]; then
        echo -e "${RED}[ERROR] adapters/pi/protocol.ts not found${NC}"
        return 1
    fi
    
    if [[ ! -f "$PROJECT_ROOT/deploy.sh" ]]; then
        echo -e "${RED}[ERROR] deploy.sh not found${NC}"
        return 1
    fi
    
    # Check for required commands
    for cmd in curl npx; do
        if ! command -v "$cmd" &>/dev/null; then
            echo -e "${RED}[ERROR] Required command '$cmd' not found${NC}"
            return 1
        fi
    done
    
    echo -e "${GREEN}[INFO] Pre-flight checks passed${NC}"
    return 0
}

# =============================================================================
# Cleanup before running
# =============================================================================

cleanup_before_run() {
    echo -e "${BLUE}[INFO] Cleaning up before test run...${NC}"
    
    # Kill any existing supervisor
    cleanup_supervisor "force"
    sleep 2
    
    # Clean results
    cleanup_results
    
    # Clean test workflows
    cleanup_workflows
    
    # Remove test .pi directories
    rm -rf "$PROJECT_ROOT/e2e-test-project-"* 2>/dev/null || true
    
    echo -e "${GREEN}[INFO] Cleanup complete${NC}"
}

# =============================================================================
# Main
# =============================================================================

main() {
    print_banner
    
    # Pre-flight checks
    if ! preflight_checks; then
        echo -e "${RED}Pre-flight checks failed. Aborting.${NC}"
        exit 1
    fi
    
    # Cleanup
    cleanup_before_run
    
    # Parse arguments
    local run_specific=""
    local verbose="${VERBOSE:-0}"
    
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -v|--verbose)
                verbose=1
                shift
                ;;
            -s|--suite)
                run_specific="$2"
                shift 2
                ;;
            -h|--help)
                echo "Usage: $0 [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  -v, --verbose      Show verbose output"
                echo "  -s, --suite NAME   Run specific suite only"
                echo "  -l, --list         List available suites"
                echo "  -h, --help         Show this help"
                echo ""
                echo "Available suites:"
                for suite in "${!TEST_SUITES[@]}"; do
                    echo "  - ${TEST_SUITES[$suite]}"
                done
                exit 0
                ;;
            -l|--list)
                echo "Available test suites:"
                echo ""
                for suite in "${!TEST_SUITES[@]}"; do
                    echo "  - ${TEST_SUITES[$suite]}"
                done
                echo ""
                exit 0
                ;;
            *)
                echo "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    # Run suites
    local exit_code=0
    
    if [[ -n "$run_specific" ]]; then
        # Run specific suite
        for suite_file in "${!TEST_SUITES[@]}"; do
            if [[ "${TEST_SUITES[$suite_file]}" == *"$run_specific"* ]]; then
                run_suite "$suite_file" "${TEST_SUITES[$suite_file]}" || exit_code=1
                break
            fi
        done
    else
        # Run all suites
        for suite_file in "${!TEST_SUITES[@]}"; do
            run_suite "$suite_file" "${TEST_SUITES[$suite_file]}" || exit_code=1
        done
    fi
    
    # Final cleanup
    cleanup_before_run
    
    # Print summary
    print_final_summary
    
    exit $exit_code
}

# Run main if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
