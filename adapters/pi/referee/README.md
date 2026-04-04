# Referee Module

> Orchestrator Action Validation Layer

This module provides the referee/gatekeeper functionality for enforcing orchestrator protocol compliance.

## Overview

The Referee validates orchestrator output and ensures compliance with the runbook protocol:

```
Orchestrator Output → Parse → Validate → Apply/Retry
```

## Quick Start

```typescript
import { createReferee } from './referee/index.ts';

const referee = createReferee();

// Set org state for validation
referee.setOrgState({
  workflowPath: "runbook/001-test.org",
  tasks: new Map([
    ["parent-001", { id: "parent-001", status: "IN-PROGRESS", findings: [], evidence: [] }],
  ]),
});

// Process orchestrator output
const result = referee.process(rawOutput, "parent-001");

if (result.success) {
  // Action is valid, apply it
  console.log("Valid action:", result.action);
} else {
  // Send retry envelope to orchestrator
  console.log("Retry required:", result.retryEnvelope);
  
  // Format as markdown for display
  console.log(referee.formatRetryAsMarkdown(result.retryEnvelope!));
}
```

## Module Structure

```
referee/
├── index.ts         # Main export + Referee facade class
├── parser.ts        # ActionParser - JSON extraction
├── validator.ts     # ActionValidator - schema/state validation
├── retry-envelope.ts # RetryEnvelopeGenerator - error messages
└── README.md        # This file
```

```
types/
└── referee.ts       # Type definitions for actions, validation, org state
```

## Allowed Actions

The orchestrator can only emit these actions:

| Action | Purpose |
|--------|---------|
| `SPAWN_SUBTASK` | Create a new child task and assign to a role |
| `MERGE_SUBTASK_RESULT` | Merge completed child results into parent |
| `ADVANCE_PHASE` | Transition to next workflow phase |
| `RAISE_BLOCKER` | Mark task or phase as blocked |
| `REQUEST_USER_DECISION` | Pause for human input |

## Action Schema Example

### SPAWN_SUBTASK

```json
{
  "action": "SPAWN_SUBTASK",
  "parent_task_id": "parent-001",
  "reason": "Need code-agent to implement the API endpoint",
  "payload": {
    "child_task_id": "impl-api-001",
    "title": "Implement user authentication API",
    "role": "code-agent",
    "phase": "implementation",
    "depends_on": [],
    "output_contract": {
      "required_findings": 3,
      "required_evidence_types": ["file", "command"],
      "deliverables": ["code change", "test result"]
    }
  },
  "expected_effect": "child task enters TODO and is ready for claim"
}
```

### MERGE_SUBTASK_RESULT

```json
{
  "action": "MERGE_SUBTASK_RESULT",
  "parent_task_id": "parent-001",
  "reason": "Child task completed with valid evidence",
  "payload": {
    "child_task_id": "impl-api-001",
    "summary": "API endpoint implemented with JWT authentication",
    "finding_refs": ["F-001", "F-002"],
    "evidence_refs": ["E-001", "E-002"]
  },
  "expected_effect": "parent task gains derived findings and evidence"
}
```

### ADVANCE_PHASE

```json
{
  "action": "ADVANCE_PHASE",
  "parent_task_id": "parent-001",
  "reason": "All implementation subtasks complete",
  "payload": {
    "from_phase": "implementation",
    "to_phase": "test",
    "gate_basis": {
      "required_roles": ["code-agent"],
      "completed_child_tasks": ["impl-api-001"],
      "evidence_refs": ["E-001"]
    }
  },
  "expected_effect": "parent phase transitions to test"
}
```

## Validation Rules

### Rule Group A: Output Legality

| Rule | Description |
|------|-------------|
| A1 | Single action only per turn |
| A2 | JSON only (or wrapped in code block) |
| A3 | Known action type only |

### Rule Group C: State Validity

| Rule | Description |
|------|-------------|
| C1 | Task existence (referenced IDs must exist) |
| C2 | Dependency validity (depends_on must be DONE) |
| C3 | Phase validity (valid transitions only) |
| C4 | Merge validity (child must be DONE) |

## Running Tests

```bash
cd adapters/pi
npm run test:referee
```

Or directly:

```bash
npx tsx ../../e2e/referee.test.ts
```

## Configuration

```typescript
const referee = createReferee({
  strictMode: false,           // Enable strict parsing
  detectSpecialistContent: false, // Detect direct specialist work
  validatePhaseGates: false,   // Validate phase gate policy
  maxRetries: 3,               // Max retries before escalation
});
```

## Retry Envelope

When an action is invalid, the Referee returns a structured retry envelope:

```json
{
  "action": "RETRY_INVALID_ACTION",
  "parent_task_id": "parent-001",
  "reason": "Invalid orchestrator action",
  "payload": {
    "error_code": "INVALID_TASK_ID",
    "details": "child_task_id cannot be empty",
    "errors": [...],
    "allowed_actions": ["SPAWN_SUBTASK", "MERGE_SUBTASK_RESULT", ...]
  },
  "expected_effect": "orchestrator retries with a valid action",
  "guidance": {
    "summary": "Your action has validation errors.",
    "suggestions": [...],
    "example": {...}
  }
}
```

## Future Phases

| Phase | Features |
|-------|----------|
| Phase 2 | Specialist content detection, role boundary enforcement |
| Phase 3 | Phase gate policy engine |
| Phase 4 | Loop driver for automatic re-entry |
| Phase 5 | Fallback approval flow |

## See Also

- [[file:../../docs/ARCHITECTURE-AUDIT.md][Architecture Audit]] - Full architecture analysis
- [[file:../types/referee.ts][Type Definitions]] - Complete type definitions
