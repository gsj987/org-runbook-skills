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

## Phase 4: Loop Driver

The Loop Driver manages the outer orchestration loop:

```typescript
import { createLoopDriver } from './referee/loop-driver.ts';

const driver = createLoopDriver();

// Initialize for a workflow
const state = driver.initialize("runbook/001-test.org", "parent-001", "discovery");

// Get orchestrator input
const input = driver.getOrchestratorInput("runbook/001-test.org", "parent-001");
console.log("Current phase:", input.currentPhase);
console.log("Child tasks:", input.childTasks);

// Process an action
const result = driver.processAction(action, validationResult, orgState);
if (result.waitReason === 'blocked') {
  console.log("Loop paused - waiting for:", result.waitReason);
}

// Handle child completion
const completion = driver.handleChildCompletion("impl-001", "completed");
if (completion.shouldRestartLoop) {
  console.log("Recommended action:", completion.action);
}
```

### Loop States

| State | Description |
|-------|-------------|
| `active` | Loop running normally |
| `waiting` | Waiting for child completion or user input |
| `blocked` | Task blocked by external dependency |
| `completed` | Terminal state reached |
| `failed` | Max turns exceeded or fatal error |

### Wait Reasons

| Reason | Description |
|--------|-------------|
| `child-completion` | Waiting for child task to complete |
| `user-decision` | Waiting for user to choose option |
| `external-input` | Waiting for external system |
| `blocked` | Task is blocked |
| `loop-active` | Normal loop operation |

## Phase 5: Fallback Approval

The Fallback Approval System ensures orchestrator direct execution is always explicit and audited:

```typescript
import { 
  createOrchestratorFallbackValidator,
  createFallbackApprovalHandler 
} from './referee/fallback-approval.ts';

// Create validator
const validator = createOrchestratorFallbackValidator();

// Detect fallback attempts
const result = validator.validateOrchestratorFallback(orchestratorOutput, {
  parentTaskId: "parent-001",
  currentPhase: "implementation",
  orgState: currentState,
});

if (result.isFallbackAttempt) {
  // Generate approval request
  const request = validator.generateFallbackRequest(
    "parent-001",
    "Implement security feature",
    { currentPhase: "implementation", orgState: currentState }
  );
  // Present to user...
}

// Process user decision
const decision = validator.processDecision(requestId, {
  decision: 'approve',
  approvedBy: 'user@example.com',
});

// Execute approved fallback
if (validator.canExecuteFallback(requestId)) {
  const result = validator.executeFallback(requestId, {
    success: true,
    output: 'Feature implemented',
  });
}

// Generate audit log
const auditLog = validator.generateAuditLog("parent-001");
```

### Fallback Types

| Type | Description |
|------|-------------|
| `no-suitable-role` | No role definition exists |
| `role-unavailable` | Role exists but not available |
| `emergency-intervention` | Urgent fix required |
| `degraded-mode` | System in degraded state |
| `direct-execution` | Orchestrator attempting direct work |

### Approval Options

| Option | Description |
|--------|-------------|
| `fallback-approve` | Allow orchestrator to perform work directly |
| `fallback-reject` | Reject - find alternative approach |
| `fallback-defer` | Defer decision to later |

### Audit Trail

Every fallback request maintains a complete audit trail:
- Request created
- Decision made (with approver/rejector)
- Execution (if approved)
- All timestamps

### Direct Execution Detection

The system automatically detects when orchestrator output looks like direct execution:
- Code blocks with implementation
- "Here's the implementation" patterns
- Git diff patches
- Direct fix claims

## Future Enhancements

| Phase | Features |
|-------|----------|
| Phase 5 | Fallback approval flow |
| Phase 6 | Multi-task orchestration |
| Phase 7 | Cross-workflow dependencies |

## See Also

- [[file:../../docs/ARCHITECTURE-AUDIT.md][Architecture Audit]] - Full architecture analysis
- [[file:../types/referee.ts][Type Definitions]] - Complete type definitions
