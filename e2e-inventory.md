# E2E Test Inventory

> **Document**: pi-adapter Referee E2E Test Suite Inventory  
> **Last Updated**: 2026-03-30  
> **Location**: `/home/gsj987/Workspace/org-runbook-skills/e2e/`

---

## 1. E2E Directory Structure

```
e2e/
├── lib/                              # Shared test libraries
│   ├── assert.sh                     # Bash assertion helpers
│   └── setup.sh                      # Setup/teardown utilities
├── referee-integration/               # Layer 2 fixture-based tests
│   ├── 01-parser-fixture.test.ts     # Parser with 8 org-mode fixtures
│   ├── 02-validator-fixture.test.ts  # Validator with fixtures
│   ├── 03-gate-enforcement.test.ts   # Phase gate enforcement
│   ├── 04-loop-driver.test.ts         # Loop driver with fixtures
│   ├── 05-fallback-approval.test.ts   # Fallback approval
│   ├── fixtures/                      # 8 org-mode fixture files
│   ├── referee-e2e-integration.sh    # Test runner (shell)
│   └── README.md                     # Integration test docs
├── referee.test.ts                   # Unit tests (Phase 1-5, 76 tests)
├── referee-gaps.test.ts              # Gap fix tests (G1-G4, 21 tests)
├── findings-persistence.test.sh       # Findings persistence (bash)
├── path-propagation.test.ts          # Path propagation (tsx, needs supervisor)
├── task-status-persistence.test.ts   # Status persistence (tsx, needs supervisor)
└── README.md                        # This file
```

---

## 2. Test Suites Summary

| Suite | Tests | Type | Supervisor Required |
|-------|-------|------|---------------------|
| `referee.test.ts` | 76 | tsx | No |
| `referee-integration/` | 62 | tsx | No |
| `referee-gaps.test.ts` | 21 | tsx | No |
| `findings-persistence.test.sh` | ~5 | bash | Yes |
| `path-propagation.test.ts` | ~3 | tsx | Yes |
| `task-status-persistence.test.ts` | ~4 | tsx | Yes |
| **Total** | **~171** | | |

---

## 3. Running Tests

### 3.1 Referee Tests (No Supervisor Needed)

```bash
# Unit tests (Phase 1-5)
cd adapters/pi && npx tsx ../../e2e/referee.test.ts

# Integration tests (Layer 2)
./e2e/referee-integration/referee-e2e-integration.sh

# Gap fix tests (G1-G4)
cd adapters/pi && npx tsx ../../e2e/referee-gaps.test.ts
```

### 3.2 Supervisor-Dependent Tests (Require Running Supervisor)

```bash
# Start supervisor first
cd adapters/pi && npx ts-node --esm protocol.ts &
sleep 5

# Run supervisor-dependent tests
cd adapters/pi && npx tsx ../../e2e/path-propagation.test.ts
cd adapters/pi && npx tsx ../../e2e/task-status-persistence.test.ts
./e2e/findings-persistence.test.sh
```

---

## 4. Reference

- [Referee README](../adapters/pi/referee/README.md)
- [Referee Audit](../docs/REFERRER-AUDIT.md)
- [Architecture Audit](../docs/ARCHITECTURE-AUDIT.md)
