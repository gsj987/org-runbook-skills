# Referee E2E Test Suite

End-to-end tests for the Referee module (Phase 1-5 implementation).

## Test Layers

### Layer 2: Integration Tests (Fixture-based)

Tests that verify component collaboration using real org-mode fixtures.

```
e2e/referee/
├── fixtures/           # Real org-mode test fixtures
├── integration/        # Integration tests
│   ├── 01-parser-fixture.test.ts
│   ├── 02-validator-fixture.test.ts
│   ├── 03-gate-enforcement.test.ts
│   ├── 04-loop-driver.test.ts
│   └── 05-fallback-approval.test.ts
└── referee-e2e-integration.sh
```

### Test Fixtures

| Fixture | Phase | State | Purpose |
|---------|-------|-------|---------|
| `minimal.org` | discovery | TODO | Basic parsing tests |
| `discovery.org` | discovery | IN-PROGRESS | Phase gate tests |
| `design.org` | design | IN-PROGRESS | Multi-child tests |
| `implementation.org` | implementation | IN-PROGRESS | Gate enforcement |
| `test.org` | test | IN-PROGRESS | Phase progression |
| `blocked.org` | implementation | BLOCKED | Blocked state tests |
| `terminal.org` | acceptance | DONE | Terminal state tests |
| `multi-child.org` | implementation | MIXED | Parallel tasks |

## Running Tests

### Run All Integration Tests

```bash
cd e2e/referee
./referee-e2e-integration.sh
```

### Run Individual Tests

```bash
cd adapters/pi
npx tsx ../../e2e/referee/integration/01-parser-fixture.test.ts
npx tsx ../../e2e/referee/integration/02-validator-fixture.test.ts
npx tsx ../../e2e/referee/integration/03-gate-enforcement.test.ts
npx tsx ../../e2e/referee/integration/04-loop-driver.test.ts
npx tsx ../../e2e/referee/integration/05-fallback-approval.test.ts
```

### Run Unit Tests (existing)

```bash
cd adapters/pi
npx tsx ../../e2e/referee.test.ts
```

## Test Coverage

### Phase 1: Minimal Enforcement

| Test ID | Coverage |
|---------|----------|
| TC-INT-001 | Parse SPAWN_SUBTASK from JSON |
| TC-INT-001 | Parse SPAWN_SUBTASK from markdown |
| TC-INT-001 | Parse MERGE_SUBTASK_RESULT |
| TC-INT-002 | Parse ADVANCE_PHASE |
| TC-INT-002 | Parse RAISE_BLOCKER |
| TC-INT-003 | Reject invalid JSON |
| TC-INT-003 | Reject unknown action type |
| TC-INT-003 | Reject missing required fields |

### Phase 2: Role Boundary

| Test ID | Coverage |
|---------|----------|
| TC-INT-004 | Validate SPAWN with existing parent |
| TC-INT-004 | Reject SPAWN with non-existent parent |
| TC-INT-004 | Validate MERGE with DONE child |
| TC-INT-006 | Reject MERGE with non-existent finding |
| TC-INT-006 | Reject ADVANCE from terminal phase |

### Phase 3: Phase Gate

| Test ID | Coverage |
|---------|----------|
| TC-GATE-001 | Discovery → Design |
| TC-GATE-002 | Design → Implementation |
| TC-GATE-003 | Implementation → Test (requires code-agent) |
| TC-GATE-004 | Reject without required role |
| TC-GATE-005 | Min evidence enforcement |
| TC-GATE-006 | Evidence type validation |
| TC-GATE-007 | Test → Integration |
| TC-GATE-008 | Acceptance is terminal |
| TC-GATE-009 | Blocked state prevents gate |
| TC-GATE-010 | Multi-child requires all roles |

### Phase 4: Loop Driver

| Test ID | Coverage |
|---------|----------|
| TC-LOOP-001 | Initialize for discovery phase |
| TC-LOOP-002 | Track loop turns |
| TC-LOOP-003 | Handle SPAWN_SUBTASK |
| TC-LOOP-004 | Handle MERGE_SUBTASK_RESULT |
| TC-LOOP-005 | Handle ADVANCE_PHASE to terminal |
| TC-LOOP-006 | Handle RAISE_BLOCKER |
| TC-LOOP-007 | Handle REQUEST_USER_DECISION |
| TC-LOOP-008 | Detect completed children |
| TC-LOOP-009 | Build orchestrator input |
| TC-LOOP-010 | Max turns exceeded |

### Phase 5: Fallback Approval

| Test ID | Coverage |
|---------|----------|
| TC-FALLBACK-001 | Create fallback request |
| TC-FALLBACK-002 | Default rejection |
| TC-FALLBACK-003 | Explicit approval |
| TC-FALLBACK-004 | Execute approved fallback |
| TC-FALLBACK-005 | Reject rejected fallback |
| TC-FALLBACK-006 | Generate audit log |
| TC-FALLBACK-007 | Classify impl-bug |
| TC-FALLBACK-008 | Allow fallback for no-role |
| TC-FALLBACK-009 | Generate fallback request action |
| TC-FALLBACK-010 | Track statistics |

## Expected Output

```
============================================================
  Referee E2E Integration Tests
  Layer 2: Integration with Real Fixtures
============================================================

📁 Found 8 fixture files:
   - blocked.org
   - design.org
   - discovery.org
   - implementation.org
   - minimal.org
   - multi-child.org
   - terminal.org
   - test.org

🧪 Found 5 integration test files:
   - 01-parser-fixture.test.ts
   - 02-validator-fixture.test.ts
   - 03-gate-enforcement.test.ts
   - 04-loop-driver.test.ts
   - 05-fallback-approval.test.ts

============================================================
  Running Integration Tests
============================================================

▶ Running: 01-parser-fixture.test.ts
✓ All integration tests passed!

▶ Running: 02-validator-fixture.test.ts
✓ All validator integration tests passed!

...

============================================================
  Integration Test Summary
============================================================
  Files tested: 5
  Passed:      5
  Failed:      0
============================================================

✅ All integration tests passed!
```

## Adding New Tests

1. Add fixture to `fixtures/` directory
2. Create test in `integration/` directory
3. Follow naming: `XX-name.test.ts`
4. Run with `./referee-e2e-integration.sh`

## Next Steps

- Layer 3: Simulation Tests (complete workflow simulation)
- Layer 4: Real pi Session Tests (manual verification)
