# E2E Test Inventory

> **Document**: pi-adapter End-to-End Test Suite Inventory
> **Last Updated**: 2026-03-30
> **Location**: `/home/gsj987/Workspace/org-runbook-skills/e2e/`

---

## 1. E2E Directory Structure

```
e2e/
├── lib/                      # Shared test libraries
│   ├── api.sh               # HTTP API helper functions
│   ├── assert.sh            # Assertion helpers
│   └── setup.sh             # Setup/teardown utilities
├── supervisor-lifecycle.sh   # Supervisor lifecycle tests (TC-SUP-*)
├── workflow-operations.sh    # Workflow operations tests (TC-WF-*)
├── worker-spawn-cycle.sh     # Worker management tests (TC-WK-*)
├── fencing.sh               # Role-based access control tests (TC-FN-*)
├── state-machine.sh         # Task/phase state transitions (TC-ST-*)
├── deploy-script.sh         # Deploy script tests (TC-DP-*)
├── run-all.sh               # Master test runner
├── TEST-CASES.org           # Test case specifications
└── README.md                # Test suite documentation
```

---

## 2. All E2E Directories Found

| Directory | Purpose |
|-----------|---------|
| `./e2e/` | Main e2e test suite root |
| `./e2e/lib/` | Shared library functions |

---

## 3. Test Files Summary

### 3.1 `lib/api.sh` - HTTP API Library

**Purpose**: Provides wrapper functions for all supervisor HTTP API endpoints.

**Key Functions**:
| Function | Description |
|----------|-------------|
| `api_health` | GET /health - Health check |
| `api_spawn <role> <task> <taskId> <workflowPath>` | POST /worker/spawn - Spawn worker |
| `api_status <workerId>` | GET /worker/:id/status - Worker status |
| `api_await <workerId> [timeout]` | POST /worker/:id/await - Await result |
| `api_workers` | GET /workers - List active workers |
| `api_results` | GET /results - Get all results |
| `api_workflow_update <path> <findings>` | POST /workflow/update - Update workflow |
| `api_workflow_append <path> <content> <rating>` | Append finding to workflow |
| `api_worker_count` | Count active workers |
| `api_worker_exists <workerId>` | Check if worker exists |

**Default Configuration**:
- Port: 3847
- URL: `http://localhost:3847`
- Timeout: 60 seconds

---

### 3.2 `lib/assert.sh` - Assertion Library

**Purpose**: Provides assertion functions for test validation.

**Key Functions**:
| Function | Description |
|----------|-------------|
| `assert_equals <expected> <actual> [msg]` | Assert two values are equal |
| `assert_contains <string> <substring> [msg]` | Assert string contains substring |
| `assert_file_exists <path> [msg]` | Assert file exists |
| `assert_dir_exists <path> [msg]` | Assert directory exists |
| `assert_http_ok <url> [msg]` | Assert HTTP 200 OK |
| `assert_http_status <url> <code> [msg]` | Assert specific HTTP status |
| `assert_pid_alive <pid> [msg]` | Assert process is running |
| `assert_pid_dead <pid> [msg]` | Assert process is dead |
| `assert_json_equals <json> <key> <val> [msg]` | Assert JSON key value |
| `assert_json_has_key <json> <key> [msg]` | Assert JSON contains key |
| `assert_not_empty <value> [msg]` | Assert value is not empty |
| `assert_success <command> [msg]` | Assert command succeeds (exit 0) |
| `assert_failure <command> [msg]` | Assert command fails (exit != 0) |
| `assert_matches <command> <regex> [msg]` | Assert output matches regex |
| `assert_summary` | Print assertion summary |
| `assert_reset` | Reset assertion counters |

---

### 3.3 `lib/setup.sh` - Setup/Teardown Library

**Purpose**: Provides common setup/teardown functions for E2E tests.

**Key Functions**:
| Function | Description |
|----------|-------------|
| `start_supervisor [wait_time]` | Start supervisor process |
| `cleanup_supervisor [force]` | Kill supervisor and cleanup |
| `restart_supervisor` | Restart with clean state |
| `ensure_supervisor` | Start if not running |
| `wait_for_health [timeout]` | Wait for supervisor health |
| `get_supervisor_pid` | Get current supervisor PID |
| `create_test_workflow <path> <name> [phases]` | Create test workflow file |
| `create_minimal_workflow <path>` | Create minimal workflow |
| `full_cleanup` | Clean supervisor, results, workflows |
| `test_start <name> <id>` | Start test reporting |
| `test_pass` | Mark test as passed |
| `test_fail [reason]` | Mark test as failed |
| `test_summary` | Print test summary |

**Logging Functions**: `log_info`, `log_success`, `log_error`, `log_warn`, `log_debug`

---

### 3.4 `supervisor-lifecycle.sh` - Supervisor Lifecycle Tests

**Test Cases**: TC-SUP-001 to TC-SUP-005

| Test ID | Description | Priority |
|---------|-------------|----------|
| TC-SUP-001 | Start supervisor and verify health endpoint | P0 |
| TC-SUP-002 | Singleton enforcement (second start fails) | P0 |
| TC-SUP-003 | Kill supervisor and verify PID/port cleanup | P0 |
| TC-SUP-004 | Restart supervisor with clean state | P0 |
| TC-SUP-005 | Handle stale PID file gracefully | P1 |

**Port Used**: 3847

**Key Validations**:
- PID file creation and validation
- Health endpoint JSON structure
- Singleton enforcement
- Graceful and forceful shutdown
- Stale PID file handling

---

### 3.5 `workflow-operations.sh` - Workflow Operations Tests

**Test Cases**: TC-WF-001 to TC-WF-015

| Test ID | Description | Priority |
|---------|-------------|----------|
| TC-WF-001 | workflow.init - Default phases | P0 |
| TC-WF-002 | workflow.init - Custom phases | P0 |
| TC-WF-003 | workflow.init - Explicit project ID | P1 |
| TC-WF-004 | workflow.init - Reject existing path | P0 |
| TC-WF-005 | workflow.init - Reject invalid path (no sequence) | P0 |
| TC-WF-006 | workflow.init - Create parent directories | P1 |
| TC-WF-007 | workflow.update - Append findings | P0 |
| TC-WF-008 | workflow.update - Preserve existing content | P0 |
| TC-WF-009 | workflow.update - Handle missing file | P1 |
| TC-WF-010 | workflow.appendFinding - Valid task | P0 |
| TC-WF-011 | workflow.appendFinding - Invalid task | P0 |
| TC-WF-012 | workflow.attachEvidence - Valid finding | P0 |
| TC-WF-013 | workflow.attachEvidence - Invalid finding ID | P1 |
| TC-WF-014 | workflow.setStatus - Valid transitions | P0 |
| TC-WF-015 | workflow.advancePhase - Valid progression | P0 |

**Port Used**: 3848

**Key Validations**:
- Org-mode workflow file creation
- Finding/evidence attachment
- Task status state transitions
- Phase advancement
- Error handling for invalid inputs

---

### 3.6 `worker-spawn-cycle.sh` - Worker Management Tests

**Test Cases**: TC-WK-001 to TC-WK-020

| Test ID | Description | Priority |
|---------|-------------|----------|
| TC-WK-001 | Spawn code-agent worker | P0 |
| TC-WK-002 | Spawn test-agent worker | P0 |
| TC-WK-003 | Spawn ops-agent worker | P0 |
| TC-WK-004-015 | Spawn various agents (arch, pm, research, ux, api, qa, integration, deploy, deps, security, perf, data) | P1-P2 |
| TC-WK-016 | Spawn orchestrator worker | P0 |
| TC-WK-017 | worker.awaitResult - Success | P0 |
| TC-WK-018 | worker.awaitResult - Timeout | P0 |
| TC-WK-019 | worker.status - Running/Completed states | P0 |
| TC-WK-020 | Multiple workers - Isolation | P0 |

**Port Used**: 3849

**Key Validations**:
- Worker spawning for all roles
- Status polling (running/completed)
- Result retrieval
- Timeout handling
- Worker isolation

---

### 3.7 `fencing.sh` - Role-Based Access Control Tests

**Test Cases**: TC-FN-001 to TC-FN-010

| Test ID | Description | Priority |
|---------|-------------|----------|
| TC-FN-001 | code-agent tool restrictions | P0 |
| TC-FN-002 | test-agent tool restrictions | P0 |
| TC-FN-003 | ops-agent tool restrictions | P0 |
| TC-FN-004 | research-agent tool restrictions | P1 |
| TC-FN-005 | orchestrator - Full access | P0 |
| TC-FN-006 | Protected path: /path/to/secrets | P0 |
| TC-FN-007 | Protected path: /path/to/prod | P0 |
| TC-FN-008 | Protected path: /.pi/secrets | P1 |
| TC-FN-009 | Protected path: /.ssh | P1 |
| TC-FN-010 | Orchestrator non-execution rule | P1 |

**Port Used**: 3850

**Key Validations**:
- Allowed/forbidden tool enforcement per role
- Protected path access denial
- Orchestrator delegation patterns

---

### 3.8 `state-machine.sh` - State Machine Tests

**Test Cases**: TC-ST-001 to TC-ST-010

| Test ID | Description | Priority |
|---------|-------------|----------|
| TC-ST-001 | Task claim: TODO -> IN-PROGRESS | P0 |
| TC-ST-002 | Task complete: IN-PROGRESS -> DONE | P0 |
| TC-ST-003 | Task block: IN-PROGRESS -> BLOCKED | P0 |
| TC-ST-004 | Task resume: BLOCKED -> IN-PROGRESS | P1 |
| TC-ST-005 | Phase advance: discovery -> design | P0 |
| TC-ST-006 | Phase advance: design -> implementation | P0 |
| TC-ST-007 | Phase advance: Full cycle | P0 |
| TC-ST-008 | Invalid transition: TODO -> DONE | P1 |
| TC-ST-009 | Invalid phase jump: discovery -> acceptance | P1 |
| TC-ST-010 | Finding traceability - F-uuid preservation | P1 |

**Port Used**: 3851

**Key Validations**:
- Task state transitions (TODO/IN-PROGRESS/DONE/BLOCKED)
- Phase progression (discovery/design/implementation/test/integration/deploy-check/acceptance)
- Invalid transition prevention
- Finding UUID traceability

---

### 3.9 `deploy-script.sh` - Deploy Script Tests

**Test Cases**: TC-DP-001 to TC-DP-010

| Test ID | Description | Priority |
|---------|-------------|----------|
| TC-DP-001 | deploy.sh --project - Basic deploy | P0 |
| TC-DP-002 | deploy.sh --project --force - Overwrite | P0 |
| TC-DP-003 | deploy.sh --project - Clean state | P0 |
| TC-DP-004 | deploy.sh --remove - Cleanup | P1 |
| TC-DP-005 | deploy.sh --help - Help output | P2 |
| TC-DP-006 | deploy.sh --project invalid-path - Error | P1 |
| TC-DP-007 | deploy.sh --global - Global install | P2 |
| TC-DP-008 | Verify skills deployed | P0 |
| TC-DP-009 | Verify adapter deployed | P0 |
| TC-DP-010 | Verify settings updated | P0 |

**Port Used**: N/A (no port required)

**Key Validations**:
- Skills directory deployment
- Adapter extension deployment
- Settings.json configuration
- Force overwrite behavior
- Cleanup with --remove

---

### 3.10 `run-all.sh` - Master Test Runner

**Purpose**: Executes all test suites sequentially with optional filtering.

**Usage**:
```bash
# Run all tests
./e2e/run-all.sh

# Run specific suite
./e2e/run-all.sh --suite=supervisor-lifecycle
./e2e/run-all.sh --suite=workflow

# List available suites
./e2e/run-all.sh --list

# Verbose/debug output
./e2e/run-all.sh --verbose
./e2e/run-all.sh --debug
```

**Test Suites**:
1. `supervisor-lifecycle` (Port 3848)
2. `workflow-operations` (Port 3849)
3. `worker-spawn-cycle` (Port 3850)
4. `fencing` (Port 3851)
5. `state-machine` (Port 3852)
6. `deploy-script` (No port)

---

## 4. Test Case Specification

**File**: `TEST-CASES.org`

**Total Coverage**: 85 test cases across 7 categories

| Category | P0 | P1 | P2 | Total |
|----------|----|----|----|-------|
| Supervisor | 6 | 3 | 1 | 10 |
| Workflow | 8 | 5 | 2 | 15 |
| Worker | 10 | 7 | 3 | 20 |
| Fencing | 5 | 4 | 1 | 10 |
| State Machine | 5 | 4 | 1 | 10 |
| Deploy | 5 | 3 | 2 | 10 |
| Error Handling | 5 | 4 | 1 | 10 |
| **TOTAL** | **44** | **30** | **11** | **85** |

---

## 5. Testing Patterns Used

### 5.1 Test Format

```bash
run_test "TC-XXX" "Description" '
    # Test code
    if condition; then
        pass "Assertion passed"
        return 0
    else
        fail "Assertion failed"
        return 1
    fi
'
```

### 5.2 Helper Function Pattern

```bash
test_tc_xxx() {
    test_start "Test description" "TC-XXX"
    
    # Setup
    ensure_supervisor
    local workflow_path="$TEST_WORKFLOW_DIR/tc-xxx.org"
    create_minimal_workflow "$workflow_path"
    
    # Execute
    local response
    response=$(api_spawn "role" "task" "taskId" "$workflow_path")
    
    # Assert
    assert_equals "true" "$(echo "$response" | jq -r '.success')" "Spawn should succeed"
    
    if assert_any_failed; then
        test_fail "TC-XXX failed"
        return 1
    fi
    
    test_pass
}
```

### 5.3 Test Isolation

- Each suite uses a **unique port** (3848-3852) to prevent conflicts
- Each test creates its own workflow file with unique name
- Cleanup performed after each test
- No shared state between tests

### 5.4 Logging Pattern

```bash
log_info "Starting operation..."
log_success "Operation completed"
log_error "Operation failed"
log_warn "Potential issue"
debug "Detailed info (only if DEBUG=1)"
```

---

## 6. Key Testing Infrastructure

### 6.1 Port Allocation

| Suite | Port | Purpose |
|-------|------|---------|
| supervisor-lifecycle | 3848 | Supervisor process tests |
| workflow-operations | 3849 | Workflow management tests |
| worker-spawn-cycle | 3850 | Worker spawning tests |
| fencing | 3851 | Access control tests |
| state-machine | 3852 | State transition tests |
| deploy-script | N/A | No HTTP needed |

### 6.2 Required Tools

- `bash` 4.0+
- `curl` for HTTP requests
- `python3` for JSON validation
- `node` and `npx` for TypeScript supervisor
- `fuser` (optional) for port cleanup
- `jq` for JSON parsing

### 6.3 Cleanup Strategy

1. **Per-test cleanup**: Kill supervisor, clean results, remove workflows
2. **Port cleanup**: `fuser -k <port>/tcp`
3. **PID file cleanup**: `rm -f ~/.pi-adapter-supervisor.pid`
4. **Results cleanup**: `rm -rf /tmp/pi-adapter-results/*.json`

---

## 7. Exit Codes

| Code | Meaning |
|------|---------|
| `0` | All tests passed |
| `1` | One or more tests failed |
| `2` | Invalid arguments |
| `3` | Missing prerequisites |

---

## 8. References

- **README**: `/home/gsj987/Workspace/org-runbook-skills/e2e/README.md`
- **Test Spec**: `/home/gsj987/Workspace/org-runbook-skills/e2e/TEST-CASES.org`
- **Adapter Source**: `adapters/pi/protocol.ts`
- **Extension**: `adapters/pi/extension.ts`
- **Deploy Script**: `deploy.sh`
