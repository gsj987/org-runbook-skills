# pi-adapter E2E Test Suite

> Last updated: 2026-03-30

## Overview

This directory contains end-to-end tests for the pi-adapter Referee/Gatekeeper system.

| Suite | Description | Tests |
|-------|-------------|-------|
| `referee-integration/` | Layer 2 fixture-based integration tests | 62 |
| `referee.test.ts` | Unit tests for Referee components | 76 |
| `referee-gaps.test.ts` | Gap fix tests (G1-G4) | 21 |
| `findings-persistence.test.ts` | Findings persistence validation | ~10 |
| `path-propagation.test.ts` | Path propagation to workers | ~5 |
| `task-status-persistence.test.ts` | Task status persistence | ~8 |

**Total: 180+ E2E tests**

## Quick Start

### Run All Tests

```bash
cd /home/gsj987/Workspace/org-runbook-skills

# Run all referee tests
cd adapters/pi && npx tsx ../../e2e/referee.test.ts         # 76 unit tests
./../../e2e/referee-integration/referee-e2e-integration.sh  # 62 integration tests
npx tsx ../../e2e/referee-gaps.test.ts                      # 21 gap tests
```

Or use the deploy script:

```bash
./deploy.sh --project . --test
```

## Test Structure

```
e2e/
├── lib/
│   ├── setup.sh          # Setup/teardown helpers
│   └── assert.sh         # Assertion helpers
├── referee-integration/         # Layer 2 fixture tests
│   ├── 01-parser-fixture.test.ts
│   ├── 02-validator-fixture.test.ts
│   ├── 03-gate-enforcement.test.ts
│   ├── 04-loop-driver.test.ts
│   ├── 05-fallback-approval.test.ts
│   ├── fixtures/                  # 8 org-mode fixture files
│   ├── referee-e2e-integration.sh # Test runner
│   └── README.md
├── referee.test.ts        # Phase 1-5 unit tests (76 tests)
├── referee-gaps.test.ts   # G1-G4 gap fix tests (21 tests)
├── findings-persistence.test.ts
├── path-propagation.test.ts
├── task-status-persistence.test.ts
└── README.md              # This file
```

## Running Tests

### Referee Unit Tests (Phase 1-5)

```bash
cd adapters/pi
npx tsx ../../e2e/referee.test.ts
```

### Referee Integration Tests (Layer 2)

```bash
./e2e/referee-integration/referee-e2e-integration.sh
```

### Referee Gap Tests (G1-G4)

```bash
cd adapters/pi
npx tsx ../../e2e/referee-gaps.test.ts
```

### Persistence Tests

```bash
cd adapters/pi
npx tsx ../../e2e/findings-persistence.test.ts
npx tsx ../../e2e/path-propagation.test.ts
npx tsx ../../e2e/task-status-persistence.test.ts
```

## Test Summary

### referee.test.ts (76 tests)

| Phase | Tests | Description |
|-------|-------|-------------|
| Phase 1 | T1.1-T1.5 | Minimal Enforcement - Parser, Validator, RetryEnvelope |
| Phase 2 | T2.1-T2.4 | Role Boundary - SpecialistDetector, CitationValidator, RoleGate |
| Phase 3 | T3.1-T3.5 | Phase Gate - PhaseGatePolicy, OrgStateReader, OrgStateWriter |
| Phase 4 | T4.1-T4.5 | Loop Driver - LoopDriver, ChildCompletionHandler |
| Phase 5 | T5.1-T5.3 | Fallback Approval - ExceptionClassifier, FallbackApprovalHandler |

### referee-integration/ (62 tests)

| File | Tests | Description |
|------|-------|-------------|
| 01-parser-fixture | 11 | Parse real org-mode fixtures |
| 02-validator-fixture | 12 | Validate actions against fixtures |
| 03-gate-enforcement | 14 | Phase gate enforcement |
| 04-loop-driver | 12 | Loop driver with real fixtures |
| 05-fallback-approval | 13 | Fallback approval scenarios |

### referee-gaps.test.ts (21 tests)

| Gap | Tests | Description |
|-----|-------|-------------|
| G1 | TC-D3-001 to TC-D3-004 | No-Op Detection (Rule D3) |
| G2 | TC-MERGE-001 to TC-MERGE-003 | MERGE parent_updates validation |
| G3 | TC-EVID-001 to TC-EVID-003 | Evidence type strict validation |
| G4 | TC-OPT-001 to TC-OPT-008 | CANCEL_TASK / REPLAN_SUBTASKS actions |

## Reference

- [Referee Architecture](../adapters/pi/referee/README.md)
- [Referee Audit](../docs/REFERRER-AUDIT.md)
- [Architecture Audit](../docs/ARCHITECTURE-AUDIT.md)
- [AGENTS.md](../AGENTS.md)
