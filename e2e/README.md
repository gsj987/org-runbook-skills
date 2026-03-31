# pi-adapter E2E Test Suite

End-to-end tests for the pi-adapter system, covering supervisor lifecycle, workflow operations, worker management, role-based access control, state machine transitions, and deploy script functionality.

## Overview

This test suite validates the complete pi-adapter integration:

| Suite | Description | Tests |
|-------|-------------|-------|
| `supervisor-lifecycle` | Supervisor startup, shutdown, singleton enforcement | 10 |
| `workflow-operations` | Workflow init, update, findings management | 10 |
| `worker-spawn-cycle` | Worker spawning, awaiting, status checks | 10 |
| `fencing` | Role-based tool restrictions, protected paths | 10 |
| `state-machine` | Task state transitions, phase progression | 10 |
| `deploy-script` | Deploy script functionality | 10 |

**Total: 60+ E2E tests**

## Prerequisites

### Required Tools

- `bash` 4.0+
- `curl` for HTTP requests
- `python3` for JSON validation
- `node` and `npx` for running TypeScript supervisor
- `fuser` (optional) for port cleanup

### System Requirements

- Available ports: 3847-3852 (used for test supervisors)
- Write access to `/tmp/` for test artifacts
- pi-adapter source at `adapters/pi/protocol.ts`

## Running Tests

### Run All Tests

```bash
cd /home/gsj987/Workspace/org-runbook-skills
./e2e/run-all.sh
```

### Run Specific Suite

```bash
# Run only supervisor lifecycle tests
./e2e/run-all.sh --suite=supervisor-lifecycle

# Run only deploy script tests
./e2e/run-all.sh --suite=deploy-script

# Partial match also works
./e2e/run-all.sh --suite=workflow
```

### List Available Suites

```bash
./e2e/run-all.sh --list
```

### Verbose Output

```bash
# Show all output (default)
./e2e/run-all.sh --verbose

# Enable debug mode
./e2e/run-all.sh --debug
```

### Run Individual Test File

```bash
# Run a single test suite directly
./e2e/supervisor-lifecycle.sh

# Run with environment variables
DEBUG=1 ./e2e/workflow-operations.sh
```

## Test Structure

```
e2e/
├── lib/
│   ├── setup.sh         # Setup/teardown, supervisor lifecycle
│   ├── api.sh           # HTTP API helper functions
│   └── assert.sh        # Assertion helpers
├── supervisor-lifecycle.sh  # TC-SUP-001 to TC-SUP-010
├── workflow-operations.sh   # TC-WF-001 to TC-WF-010
├── worker-spawn-cycle.sh    # TC-WK-001 to TC-WK-010
├── fencing.sh              # TC-FN-001 to TC-FN-010
├── state-machine.sh        # TC-ST-001 to TC-ST-010
├── deploy-script.sh        # TC-DP-001 to TC-DP-010
├── run-all.sh            # Master test runner
├── TEST-CASES.org        # Test case specification
└── README.md            # This file
```

## Test Patterns

### Test Format

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

### Available Helper Functions

From `lib/setup.sh`:
- `start_supervisor [port]` - Start the supervisor
- `cleanup_supervisor` - Stop supervisor and cleanup
- `full_cleanup` - Complete cleanup (supervisor, results, workflows)
- `create_test_workflow <path> <name>` - Create test workflow
- `test_workflow_init <path> <name>` - Initialize workflow
- `make_findings_json [count]` - Generate findings JSON

From `lib/api.sh`:
- `api_health [port]` - GET /health
- `api_spawn <role> <task> <taskId> <workflow> [port]` - Spawn worker
- `api_status <workerId> [port]` - GET /worker/:id/status
- `api_await <workerId> [timeout] [port]` - POST /worker/:id/await
- `api_workers [port]` - GET /workers
- `api_results [port]` - GET /results
- `api_workflow_update <path> <findings> [port]` - POST /workflow/update

From `lib/assert.sh`:
- `assert_equals <expected> <actual> [message]`
- `assert_contains <string> <substring> [message]`
- `assert_file_exists <path> [message]`
- `assert_http_ok <url> [message]`
- `assert_pid_alive <pid> [message]`
- `assert_json_has_key <json> <key> [message]`

### Logging Functions

```bash
log_info "Message"    # Blue [INFO]
log_success "Message" # Green [SUCCESS]
log_error "Message"    # Red [ERROR]
log_warn "Message"     # Yellow [WARN]
debug "Message"        # Only if DEBUG=1
pass "Message"        # Green ✓
fail "Message"        # Red ✗
```

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | All tests passed |
| `1` | One or more tests failed |
| `2` | Invalid arguments |
| `3` | Missing prerequisites |

## Test Isolation

Each test suite uses a **unique port** to prevent conflicts:

| Suite | Port |
|-------|------|
| supervisor-lifecycle | 3848 |
| workflow-operations | 3849 |
| worker-spawn-cycle | 3850 |
| fencing | 3851 |
| state-machine | 3852 |
| deploy-script | (no port needed) |

## Debugging Guide

### Common Issues

#### "Supervisor not ready"

```bash
# Check if supervisor is running
curl http://localhost:3847/health

# Check PID file
cat ~/.pi-adapter-supervisor.pid

# Check process
ps aux | grep ts-node

# Manual start
cd adapters/pi && npx ts-node --esm protocol.ts &
```

#### "Port already in use"

```bash
# Kill process on port
fuser -k 3847/tcp

# Or all test ports
fuser -k 384{7,8,9,0,1,2}/tcp
```

#### "Worker hung indefinitely"

```bash
# Find worker process
ps aux | grep "pi.*worker"

# Kill it
kill -9 <pid>

# Or all workers
pkill -f "pi.*worker"
```

### Verbose Debugging

```bash
# Enable debug output
DEBUG=1 ./e2e/run-all.sh --suite=workflow-operations

# Or for a single test
DEBUG=1 ./e2e/workflow-operations.sh
```

### Manual API Testing

```bash
# Start supervisor
cd adapters/pi && npx ts-node --esm protocol.ts &

# Wait for startup
sleep 5

# Test health
curl http://localhost:3847/health

# Test spawn
curl -X POST http://localhost:3847/worker/spawn \
  -H "Content-Type: application/json" \
  -d '{"role":"orchestrator","task":"echo test","taskId":"manual-1","workflowPath":"test.org"}'

# Check worker status
curl http://localhost:3847/worker/<worker-id>/status

# Get results
curl http://localhost:3847/results
```

### Test Workflow File

Create a minimal workflow for testing:

```bash
cat > test-manual.org << 'EOF'
#+title:      Manual Test
#+date:       [2026-03-30]
#+identifier: proj-manual
#+TODO:       TODO(t) IN-PROGRESS(i) | DONE(d) BLOCKED(b) CANCELLED(c)

* Project: Manual Test
:PROPERTIES:
:PHASE: discovery
:END:

** IN-PROGRESS <main>
:PROPERTIES:
:ID: main-task
:OWNER: orchestrator
:PHASE: discovery
:END:
- Goal :: Manual test
- Findings ::
- Evidence ::
- Next Actions ::
EOF
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: E2E Tests
on: [push, pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - name: Install dependencies
        run: npm ci
      - name: Run E2E tests
        run: |
          ./e2e/run-all.sh --verbose
```

### Pre-commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

echo "Running E2E tests..."
./e2e/run-all.sh --suite=supervisor-lifecycle

if [[ $? -ne 0 ]]; then
    echo "E2E tests failed. Commit aborted."
    exit 1
fi
```

## Adding New Tests

### 1. Add Test to Suite File

```bash
# In e2e/my-suite.sh

run_test "TC-NEW-001" "New test description" '
    # Test implementation
    if [[ "$condition" == "expected" ]]; then
        pass "Test passed"
        return 0
    else
        fail "Test failed"
        return 1
    fi
'
```

### 2. Add Test Case to SPEC

Add entry to `TEST-CASES.org` following the format:

```org
*** TC-NEW-001: New Test Case
:PROPERTIES:
:CATEGORY: New Category
:PRIORITY: P0
:ESTIMATED_TIME: 15
:END:

- Preconditions :: What must be true
- Steps :: 
  1. Step one
  2. Step two
- Expected Result :: What should happen
- Cleanup :: How to restore state
```

### 3. Register in Master Runner

Add to `run-all.sh`:

```bash
TEST_SUITES=(
    # ... existing ...
    "my-suite"  # Add here
)
```

## Performance Considerations

- **Sequential execution**: Safer, simpler, avoids port conflicts
- **Test duration**: ~30-60 seconds per suite (60+ total)
- **Resource usage**: ~100MB per worker, ~50MB supervisor
- **Cleanup**: Automatic after each suite

## Known Limitations

1. **No parallel execution**: Tests run sequentially to avoid conflicts
2. **No mock supervisor**: Uses real supervisor for E2E validation
3. **Port dependent**: Requires ports 3847-3852 available
4. **File system dependent**: Creates files in `/tmp/`
5. **No Windows support**: Requires bash and POSIX utilities

## Contributing

When adding tests:
1. Follow existing patterns
2. Use unique port per suite
3. Include cleanup in test
4. Update `TEST-CASES.org`
5. Run full suite before committing
6. Document expected behavior

## References

- [pi-adapter Protocol](file:../adapters/pi/protocol.ts)
- [Extension Implementation](file:../adapters/pi/extension.ts)
- [Test Case Specification](file:TEST-CASES.org)
- [AGENTS.md](../AGENTS.md) - Project guidelines
