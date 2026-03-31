#!/usr/bin/env bash
# =============================================================================
# pi-adapter E2E Test Suite - Setup and Teardown Library
# =============================================================================
# Provides common setup/teardown functions for E2E tests including:
# - Supervisor lifecycle management (start/stop/cleanup)
# - Results directory management
# - Workflow file creation
# - Logging and test reporting utilities
# =============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------

# Project root (parent of adapters/)
# Use caller-provided path or detect from script location
# LIB_DIR is e2e/lib/, so we need to go up 2 levels to get to project root
LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$LIB_DIR/../.." && pwd)"
ADAPTERS_DIR="$PROJECT_ROOT/adapters"
PROTOCOL_PATH="$ADAPTERS_DIR/pi/protocol.ts"

# Default paths
DEFAULT_PID_FILE="$HOME/.pi-adapter-supervisor.pid"
DEFAULT_RESULTS_DIR="/tmp/pi-adapter-results"
DEFAULT_SUPERVISOR_PORT="3847"
DEFAULT_SUPERVISOR_URL="http://localhost:$DEFAULT_SUPERVISOR_PORT"

# Extension path (deployed version)
EXTENSION_DIR="$PROJECT_ROOT/.pi/extensions/pi-adapter"
PROTOCOL_PATH="$EXTENSION_DIR/protocol.ts"

# Test workflow directory
TEST_WORKFLOW_DIR="$PROJECT_ROOT/runbook"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test statistics
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0
CURRENT_TEST_NAME=""

# -----------------------------------------------------------------------------
# Logging Functions
# -----------------------------------------------------------------------------

# Log info message
log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

# Log success message
log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*"
}

# Log error message
log_error() {
    echo -e "${RED}[ERROR]${NC} $*" >&2
}

# Log warning message
log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $*"
}

# Log debug message (only if DEBUG=1)
log_debug() {
    if [[ "${DEBUG:-0}" == "1" ]]; then
        echo -e "[DEBUG] $*"
    fi
}

# -----------------------------------------------------------------------------
# Test Reporting Functions
# -----------------------------------------------------------------------------

# Start a new test
test_start() {
    CURRENT_TEST_NAME="$1"
    local test_id="$2"
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}▶ Starting: ${YELLOW}$test_id${NC} - $CURRENT_TEST_NAME"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Mark test as passed
test_pass() {
    TESTS_PASSED=$((TESTS_PASSED + 1))
    echo -e "${GREEN}✓ PASS${NC}: $CURRENT_TEST_NAME"
}

# Mark test as failed
test_fail() {
    TESTS_FAILED=$((TESTS_FAILED + 1))
    echo -e "${RED}✗ FAIL${NC}: $CURRENT_TEST_NAME"
    echo -e "${RED}  Reason: $*${NC}" >&2
}

# Skip a test
test_skip() {
    TESTS_SKIPPED=$((TESTS_SKIPPED + 1))
    echo -e "${YELLOW}⊘ SKIP${NC}: $CURRENT_TEST_NAME - $*"
}

# Run a test and track results
# Usage: run_test <test_id> <test_name> <test_body>
# The test_body should be a bash code string that returns 0 for pass, 1 for fail
run_test() {
    local test_id="$1"
    local test_name="$2"
    local test_body="$3"
    
    test_start "$test_name" "$test_id"
    
    # Execute the test body in a subshell
    local exit_code=0
    (
        eval "$test_body"
    ) || exit_code=$?
    
    if [[ "$exit_code" -eq 0 ]]; then
        test_pass
        return 0
    else
        test_fail "Test body returned exit code $exit_code"
        return 1
    fi
}

# Print test summary
test_summary() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}                         TEST SUMMARY${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "  ${GREEN}Passed:  $TESTS_PASSED${NC}"
    echo -e "  ${RED}Failed:  $TESTS_FAILED${NC}"
    echo -e "  ${YELLOW}Skipped: $TESTS_SKIPPED${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    if [[ $TESTS_FAILED -gt 0 ]]; then
        exit 1
    fi
    exit 0
}

# Reset test counters (useful for sub-suites)
test_reset_counters() {
    TESTS_PASSED=0
    TESTS_FAILED=0
    TESTS_SKIPPED=0
}

# -----------------------------------------------------------------------------
# Supervisor PID Management
# -----------------------------------------------------------------------------

# Get current supervisor PID from file
get_supervisor_pid() {
    if [[ -f "$DEFAULT_PID_FILE" ]]; then
        cat "$DEFAULT_PID_FILE" 2>/dev/null || echo ""
    else
        echo ""
    fi
}

# Check if supervisor PID file exists
pid_file_exists() {
    [[ -f "$DEFAULT_PID_FILE" ]]
}

# -----------------------------------------------------------------------------
# Cleanup Functions
# -----------------------------------------------------------------------------

# Kill supervisor process on port and remove PID file
# Usage: cleanup_supervisor [force]
#   force - if set, kill any process on port regardless of PID file
cleanup_supervisor() {
    local force="${1:-}"
    
    log_debug "Cleaning up supervisor..."
    
    # Kill process on port 3847
    if command -v fuser &>/dev/null; then
        fuser -k ${DEFAULT_SUPERVISOR_PORT}/tcp 2>/dev/null || true
    fi
    
    # Also kill by PID if we have it
    local pid
    pid=$(get_supervisor_pid)
    if [[ -n "$pid" ]]; then
        if [[ -n "$force" ]] || kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
            sleep 1
            # Force kill if still alive
            kill -9 "$pid" 2>/dev/null || true
        fi
    fi
    
    # Remove PID file
    rm -f "$DEFAULT_PID_FILE"
    
    log_debug "Supervisor cleanup complete"
}

# Clean results directory
cleanup_results() {
    log_debug "Cleaning up results directory..."
    rm -rf "${PI_RESULTS_DIR:-$DEFAULT_RESULTS_DIR}"/*.json 2>/dev/null || true
    log_debug "Results cleanup complete"
}

# Clean test workflow files
cleanup_workflows() {
    log_debug "Cleaning up test workflows..."
    rm -f "$TEST_WORKFLOW_DIR"/test-*.org 2>/dev/null || true
    rm -f "$TEST_WORKFLOW_DIR"/tc-*.org 2>/dev/null || true
    log_debug "Workflow cleanup complete"
}

# Full cleanup - kill supervisor, clean results and workflows
full_cleanup() {
    cleanup_supervisor
    cleanup_results
    cleanup_workflows
}

# -----------------------------------------------------------------------------
# Supervisor Lifecycle Management
# -----------------------------------------------------------------------------

# Start supervisor from protocol.ts
# Usage: start_supervisor [wait_time]
# Returns: 0 if started successfully, 1 otherwise
start_supervisor() {
    local wait_time="${1:-10}"
    
    # Check if already running
    if curl -s "${DEFAULT_SUPERVISOR_URL}/health" &>/dev/null; then
        log_warn "Supervisor already running, skipping start"
        return 0
    fi
    
    log_info "Starting supervisor from $PROTOCOL_PATH..."
    
    # Start supervisor in background from the deployed extension directory
    cd "$EXTENSION_DIR"
    nohup npx ts-node --esm protocol.ts > /tmp/pi-supervisor.log 2>&1 &
    local pid=$!
    cd - > /dev/null
    
    # Wait for supervisor to be ready
    if wait_for_health "$wait_time"; then
        log_success "Supervisor started (PID: $pid)"
        return 0
    else
        log_error "Supervisor failed to start within ${wait_time}s"
        log_error "See /tmp/pi-supervisor.log for details"
        return 1
    fi
}

# Wait for supervisor to be healthy
# Usage: wait_for_health [timeout_seconds]
# Returns: 0 if healthy within timeout, 1 otherwise
wait_for_health() {
    local timeout="${1:-30}"
    local elapsed=0
    local interval=1
    
    log_debug "Waiting for supervisor health (timeout: ${timeout}s)..."
    
    while [[ $elapsed -lt $timeout ]]; do
        if curl -s "${DEFAULT_SUPERVISOR_URL}/health" &>/dev/null; then
            log_debug "Supervisor healthy after ${elapsed}s"
            return 0
        fi
        sleep $interval
        elapsed=$((elapsed + interval))
    done
    
    log_error "Supervisor not healthy after ${timeout}s"
    return 1
}

# Restart supervisor with clean state
restart_supervisor() {
    log_info "Restarting supervisor..."
    cleanup_supervisor
    sleep 2
    start_supervisor
}

# Ensure supervisor is running (start if not)
ensure_supervisor() {
    if ! curl -s "${DEFAULT_SUPERVISOR_URL}/health" &>/dev/null; then
        start_supervisor
    fi
}

# -----------------------------------------------------------------------------
# Workflow File Creation
# -----------------------------------------------------------------------------

# Create a test workflow.org file
# Usage: create_test_workflow <path> <project_name> [phases]
create_test_workflow() {
    local path="$1"
    local project_name="$2"
    local phases="${3:-discovery,design,implementation,test,integration,acceptance}"
    local timestamp
    timestamp=$(date -Iseconds)
    local project_id
    project_id="proj-$(date +%s)"
    
    cat > "$path" << EOF
#+title:      $project_name
#+date:       [$(date +%Y-%m-%d)]
#+filetags:   :project:
#+identifier: $project_id
#+TODO:       TODO(t) IN-PROGRESS(i) | DONE(d) BLOCKED(b) CANCELLED(c)

* Project: $project_name
:PROPERTIES:
:PHASE: discovery
:END:

** IN-PROGRESS <coordination>
:PROPERTIES:
:ID: parent-$project_id
:OWNER: orchestrator
:PHASE: discovery
:CREATED: $timestamp
:UPDATED: $timestamp
:EXIT_CRITERIA:
:  - [ ] Define project-specific exit criteria
:NON-GOALS:
:  - [ ] no scope expansion without approval
:END:

- Goal :: $project_name
- Context ::
- Findings ::
- Evidence ::
- Next Actions ::

*** IN-PROGRESS Discovery subtask
:PROPERTIES:
:ID: subtask-discovery-001
:PARENT: parent-$project_id
:OWNER: code-agent
:PHASE: discovery
:CREATED: $timestamp
:END:
- Goal :: Sample discovery task
- Context ::
- Findings :: Initial findings captured here
- Evidence ::
- Next Actions ::

*** TODO Phase: discovery → design
:PROPERTIES:
:ID: gate-discovery-design
:PARENT: parent-$project_id
:OWNER: orchestrator
:PHASE: discovery
:EXIT_CRITERIA:
:  - [ ] Exit criteria for discovery
:END:
- Gate :: Approval required to proceed
- Next Actions ::

EOF
    
    log_debug "Created test workflow: $path"
    echo "$path"
}

# Create a minimal workflow.org file
# Usage: create_minimal_workflow <path>
create_minimal_workflow() {
    local path="$1"
    local timestamp
    timestamp=$(date -Iseconds)
    
    cat > "$path" << EOF
#+title:      Minimal Test Workflow
#+date:       [$(date +%Y-%m-%d)]
#+filetags:   :test:
#+identifier: proj-test-minimal
#+TODO:       TODO(t) IN-PROGRESS(i) | DONE(d) BLOCKED(b) CANCELLED(c)

* Project: Minimal Test
:PROPERTIES:
:PHASE: discovery
:END:

** IN-PROGRESS <main>
:PROPERTIES:
:ID: main-task
:OWNER: orchestrator
:PHASE: discovery
:CREATED: $timestamp
:END:
- Goal :: Minimal test workflow
- Context ::
- Findings ::
- Evidence ::
- Next Actions ::

EOF
    
    log_debug "Created minimal workflow: $path"
    echo "$path"
}

# Create a workflow with custom phases
# Usage: create_phased_workflow <path> <project_name> <phases_csv>
create_phased_workflow() {
    local path="$1"
    local project_name="$2"
    local phases_csv="$3"
    local timestamp
    timestamp=$(date -Iseconds)
    local project_id
    project_id="proj-$(date +%s)"
    
    # Convert comma-separated to YAML list format
    local phases_yaml
    phases_yaml=$(echo "$phases_csv" | tr ',' '\n' | sed 's/^/  - /')
    
    cat > "$path" << EOF
#+title:      $project_name
#+date:       [$(date +%Y-%m-%d)]
#+filetags:   :project:
#+identifier: $project_id
#+TODO:       TODO(t) IN-PROGRESS(i) | DONE(d) BLOCKED(b) CANCELLED(c)

* Project: $project_name
:PROPERTIES:
:PHASE: $(echo "$phases_csv" | cut -d',' -f1)
:END:

** IN-PROGRESS <coordination>
:PROPERTIES:
:ID: parent-$project_id
:OWNER: orchestrator
:PHASE: $(echo "$phases_csv" | cut -d',' -f1)
:CREATED: $timestamp
:UPDATED: $timestamp
:END:
- Goal :: $project_name
- Context ::
- Findings ::
- Evidence ::
- Next Actions ::

EOF
    
    log_debug "Created phased workflow: $path with phases: $phases_csv"
    echo "$path"
}

# -----------------------------------------------------------------------------
# Setup/Teardown Hooks for Tests
# -----------------------------------------------------------------------------

# Setup before each test
setup_test() {
    log_debug "Setting up test environment..."
    ensure_supervisor
}

# Teardown after each test
teardown_test() {
    log_debug "Tearing down test environment..."
    # Default teardown does minimal cleanup
    # Override in specific tests if needed
}

# Export functions for use in subshells
export -f log_info log_success log_error log_warn log_debug
export -f test_start test_pass test_fail test_skip test_summary test_reset_counters
export -f cleanup_supervisor cleanup_results cleanup_workflows full_cleanup
export -f start_supervisor wait_for_health restart_supervisor ensure_supervisor
export -f create_test_workflow create_minimal_workflow create_phased_workflow
export -f get_supervisor_pid pid_file_exists
export -f setup_test teardown_test

# Source API library if it exists
if [[ -f "$LIB_DIR/api.sh" ]]; then
    source "$LIB_DIR/api.sh"
fi

# Source assertions library if it exists
if [[ -f "$LIB_DIR/assert.sh" ]]; then
    source "$LIB_DIR/assert.sh"
fi
