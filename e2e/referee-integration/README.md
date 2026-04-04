# Referee E2E Integration Test Suite

End-to-end integration tests for the Referee module (Phase 1-5 implementation).

## Test Structure

```
e2e/referee-integration/
├── fixtures/           # Real org-mode test fixtures (8 files)
├── *.test.ts          # Integration tests (5 files, 62 tests)
└── referee-e2e-integration.sh  # Test runner
```

## Test Fixtures

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

```bash
# Run all integration tests
./referee-e2e-integration.sh

# Or from adapters/pi directory
cd adapters/pi
npx tsx ../../e2e/referee-integration/01-parser-fixture.test.ts
npx tsx ../../e2e/referee-integration/02-validator-fixture.test.ts
npx tsx ../../e2e/referee-integration/03-gate-enforcement.test.ts
npx tsx ../../e2e/referee-integration/04-loop-driver.test.ts
npx tsx ../../e2e/referee-integration/05-fallback-approval.test.ts
```

## Test Coverage

| Test File | Tests | Coverage |
|-----------|-------|----------|
| 01-parser-fixture.test.ts | 11 | Phase 1 parser integration |
| 02-validator-fixture.test.ts | 12 | Phase 1-2 validator integration |
| 03-gate-enforcement.test.ts | 14 | Phase 3 gate enforcement |
| 04-loop-driver.test.ts | 12 | Phase 4 loop driver |
| 05-fallback-approval.test.ts | 13 | Phase 5 fallback approval |
| **Total** | **62** | All phases |

## Test Cases

### TC-INT-* (Parser Integration)
- Parse SPAWN_SUBTASK from JSON/markdown
- Parse MERGE_SUBTASK_RESULT
- Parse ADVANCE_PHASE
- Parse RAISE_BLOCKER
- Reject invalid JSON
- Reject unknown action type
- Reject missing required fields

### TC-GATE-* (Gate Enforcement)
- discovery → design transition
- design → implementation transition
- implementation requires code-agent
- Reject without required role
- Min evidence enforcement
- Evidence type validation
- test → integration transition
- acceptance is terminal
- BLOCKED state prevents gate
- Multi-child requires all roles

### TC-LOOP-* (Loop Driver)
- Initialize for discovery phase
- Track loop turns
- Handle SPAWN_SUBTASK
- Handle MERGE_SUBTASK_RESULT
- Handle ADVANCE_PHASE to terminal
- Handle RAISE_BLOCKER
- Handle REQUEST_USER_DECISION
- Detect completed children
- Build orchestrator input
- Max turns exceeded

### TC-FALLBACK-* (Fallback Approval)
- Create fallback request
- Default rejection
- Explicit approval
- Execute approved fallback
- Reject rejected fallback
- Generate audit log
- Classify impl-bug
- Direct execution detection
- Statistics tracking
