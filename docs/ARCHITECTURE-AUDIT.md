# Architecture Audit Report

> **Date**: 2026-03-30  
> **Auditor**: Claude Code  
> **Project**: org-runbook-skills  
> **Reference**: [[file:../../../Sync/org-mode/roam/pages/20260329T092903--runbook-skill-backlogs__me_workflow.org][PRD - Referee/Gatekeeper Adapter]]

---

## 1. Project Structure Overview

### 1.1 Skill Inventory

| Skill | Purpose | Status | Layer |
|-------|---------|--------|-------|
| `runbook-org` | Single agent task execution with org-mode state machine | ✅ Implemented | Protocol |
| `runbook-multiagent` | Multi-agent orchestration protocol | ✅ Implemented | Protocol |
| `runbook-brainstorm` | Research workflow template | ✅ Implemented | Workflow |
| `exception-routing` | Exception taxonomy and routing rules | ✅ Implemented | Protocol |
| `orchestrator-skill` | Orchestrator role profile | ✅ Implemented | Profile |
| `pi-adapter` | Runtime adapter for pi harness | ✅ Implemented | Adapter |

### 1.2 Directory Structure

```
org-runbook-skills/
├── runbook-org/SKILL.md           # Single agent protocol
├── runbook-multiagent/SKILL.md   # Multi-agent protocol  
├── runbook-brainstorm/SKILL.md   # Research workflow
├── exception-routing/SKILL.md     # Exception handling
├── orchestrator-skill/SKILL.md    # Orchestrator profile
├── adapters/pi/
│   ├── extension.ts              # pi extension (client-side)
│   ├── protocol.ts               # Supervisor HTTP API
│   └── SKILL.md                  # Adapter skill
├── e2e/                          # End-to-end tests
│   ├── lib/                      # Test utilities
│   ├── supervisor-lifecycle.sh
│   ├── workflow-operations.sh
│   ├── worker-spawn-cycle.sh
│   ├── fencing.sh
│   ├── state-machine.sh
│   └── deploy-script.sh
├── deploy.sh                     # Deployment script
├── examples/schema.md            # Formal schema definition
├── e2e-inventory.md             # E2E test inventory
└── AGENTS.md                     # Agent documentation
```

### 1.3 Skill Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      USER INPUT                                  │
│         @runbook-org | @orchestrate | @exception                │
└─────────────────────────────┬───────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌─────────────────┐
│ runbook-org   │    │runbook-multi  │    │exception-routing│
│ (Protocol)    │◄───│  -agent       │───►│ (Protocol)      │
│               │    │ (Protocol)    │    │                 │
└───────┬───────┘    └───────┬───────┘    └────────┬────────┘
        │                    │                      │
        │    ┌───────────────┘                      │
        │    │                                      │
        ▼    ▼                                      │
┌───────────────────────┐                          │
│  orchestrator-skill   │                          │
│  (Profile)            │◄─────────────────────────┘
└───────────┬───────────┘
            │
            ▼
┌───────────────────────────────────────┐
│          pi-adapter                    │
│  ┌─────────────────────────────────┐  │
│  │ Layer 3: Runtime Adapter        │  │
│  │ - worker.spawn/awaitResult      │  │
│  │ - workflow.init/update          │  │
│  │ - Role tool restrictions         │  │
│  └─────────────────────────────────┘  │
│  ┌─────────────────────────────────┐  │
│  │ Layer 4: ??? MISSING            │  │
│  │ - Referee/Gatekeeper            │  │
│  │ - Action validation              │  │
│  │ - Loop driver                    │  │
│  └─────────────────────────────────┘  │
└───────────────────────────────────────┘
```

---

## 2. Current Architecture Analysis

### 2.1 What Exists ✅

#### Protocol Layer (Skills)
| Component | Capability | Gap |
|-----------|------------|-----|
| `runbook-org` | State machine (TODO/IN-PROGRESS/DONE/BLOCKED), Finding/Evidence semantics, Done conditions | No machine-checkable phase gates |
| `runbook-multiagent` | Task tree design, spawn contract, merge rules, phase transitions | No structured action output contract |
| `exception-routing` | Exception taxonomy (10 types), routing matrix, re-entry rules | Routing is advisory, not enforced |
| `orchestrator-skill` | Role profile, non-execution rule | Profile is text-based, not enforced |

#### Adapter Layer (pi-adapter)
| Component | Capability | Gap |
|-----------|------------|-----|
| `extension.ts` | Custom tools (workflow.*, worker.*), Guardrail (tool_call hook), Role restrictions | Guardrail only blocks tools, not orchestrator output format |
| `protocol.ts` | Supervisor HTTP API, Worker spawning, Result persistence | No action parsing, no validation |
| Auto-start | Supervisor auto-discovery | No action enforcement loop |

### 2.2 What's Missing ❌

#### Critical Gaps (From PRD)

| Gap | Severity | Impact |
|-----|----------|--------|
| **Structured Output Contract** | 🔴 Critical | Orchestrator can output anything, not just JSON actions |
| **Action Validator** | 🔴 Critical | No enforcement of SPAWN/MERGE/ADVANCE/RAISE_BLOCKER/REQUEST_USER_DECISION |
| **Phase Gate Engine** | 🔴 Critical | No machine-checkable policy for phase transitions |
| **Loop Driver** | 🔴 Critical | No automatic re-entry after child completion |
| **Fallback Approval Flow** | 🟡 Important | Fallback is unconstrained |
| **Role Boundary Validator** | 🟡 Important | Cannot detect "specialist content detected" violations |

---

## 3. Architecture Gap Analysis

### 3.1 PRD Requirements vs Current Implementation

| PRD Requirement | Current State | Gap Severity |
|-----------------|---------------|--------------|
| **Section 5.1: Layer 4 Referee** | Does not exist | 🔴 Critical |
| **Section 6.1: Allowed Orchestrator Actions (6 actions)** | Only implicit in prompts | 🔴 Critical |
| **Section 7: Structured Output Contract** | No JSON schema | 🔴 Critical |
| **Section 8.1: Output Legality Rules (A1-A4)** | No enforcement | 🔴 Critical |
| **Section 8.2: Role Boundary Rules (B1-B3)** | Soft constraint only | 🟡 Important |
| **Section 8.3: State Validity Rules (C1-C5)** | No machine check | 🟡 Important |
| **Section 8.4: Loop Validity Rules (D1-D3)** | No loop driver | 🔴 Critical |
| **Section 9: Phase Gate Policy** | No policy engine | 🔴 Critical |
| **Section 10: Fallback Redesign** | Ad-hoc only | 🟡 Important |
| **Section 11: Event and Loop Driver** | Missing | 🔴 Critical |
| **Section 12: Referee API Design** | No API | 🔴 Critical |

### 3.2 Specific Architectural Differences

#### Current Flow (Protocol Level)

```
Orchestrator Output (free-form)
         │
         ▼
┌─────────────────────────┐
│   Human/Model reviews   │  ← No machine enforcement
└─────────┬───────────────┘
          │
          ▼
    [Action executed?]
          │
     ┌────┴────┐
     │         │
    Yes        No
     │         │
     ▼         ▼
 [Writeback]  [Ignored]
```

#### Required Flow (With Referee)

```
Orchestrator Output (JSON)
         │
         ▼
┌─────────────────────────┐
│   ActionParser          │  ← Parse raw → typed action
└─────────┬───────────────┘
          │
          ▼
┌─────────────────────────┐
│   ActionValidator        │
│   ├─ Schema check        │
│   ├─ Role boundary check │
│   ├─ State validity      │
│   └─ Phase gate check    │
└─────────┬───────────────┘
          │
     ┌────┴────┐
     │         │
   Valid     Invalid
     │         │
     ▼         ▼
┌─────────┐ ┌─────────────────────┐
│  Apply   │ │ RETRY_INVALID_ACTION│
│  Action  │ │ + error code        │
└────┬─────┘ └─────────────────────┘
     │
     ▼
┌─────────────────────────┐
│   LoopDriver            │  ← Decides next step
│   - Continue if non-terminal │
│   - Re-enter parent loop │
└─────────────────────────┘
```

---

## 4. Referee Architecture Design

### 4.1 Component Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        ORCHESTRATOR                               │
│                     (Model Output)                                │
└─────────────────────────────┬───────────────────────────────────┘
                              │ Raw text
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      REFEREE (NEW)                               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    ActionParser                           │   │
│  │  - Extract JSON from raw output                          │   │
│  │  - Handle non-JSON gracefully                             │   │
│  │  - Map to typed action                                    │   │
│  └─────────────────────────┬───────────────────────────────┘   │
│                            │ OrchestratorAction                 │
│                            ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    ActionValidator                       │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────────┐  │   │
│  │  │ SchemaRule  │ │ RoleBoundary│ │ StateValidity   │  │   │
│  │  │ - A1 Single │ │ - B1 No     │ │ - C1 Task exist │  │   │
│  │  │ - A2 JSON   │ │   specialist│ │ - C2 Dep valid  │  │   │
│  │  │ - A3 Known  │ │ - B2 Merge  │ │ - C3 Phase valid│  │   │
│  │  │ - A4 No     │ │   must cite │ │ - C4 Merge      │  │   │
│  │  │   specialist│ │ - B3 Role   │ │   requires DONE│  │   │
│  │  │   payload   │ │   gate      │ │ - C5 Advance    │  │   │
│  │  └─────────────┘ └─────────────┘ │   requires gate │  │   │
│  │                                  └─────────────────┘  │   │
│  └─────────────────────────┬───────────────────────────────┘   │
│                            │ ValidationResult                   │
│                            ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    PhaseGateValidator                    │   │
│  │  - Read policy YAML/JSON                                │   │
│  │  - Check min_findings, required_roles, evidence         │   │
│  │  - Enforce deterministic transitions                     │   │
│  └─────────────────────────┬───────────────────────────────┘   │
│                            │ GateResult                         │
│                            ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    LoopDriver                           │   │
│  │  - Track parent task terminal state                     │   │
│  │  - Schedule re-entry after child completion             │   │
│  │  - Handle blocked/awaiting states                       │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
           ┌─────────────┐    ┌─────────────────┐
           │ OrgWriter   │    │ RETRY_INVALID   │
           │ (Apply)     │    │ (Reject)        │
           └──────┬──────┘    └─────────────────┘
                  │
                  ▼
         ┌─────────────────┐
         │  Workflow.org   │
         │  (Updated)      │
         └─────────────────┘
```

### 4.2 Action Schema

```typescript
// types.ts

export type OrchestratorAction =
  | SpawnSubtaskAction
  | MergeSubtaskResultAction
  | AdvancePhaseAction
  | RaiseBlockerAction
  | RequestUserDecisionAction;

export interface SpawnSubtaskAction {
  action: "SPAWN_SUBTASK";
  parent_task_id: string;
  reason: string;
  payload: {
    child_task_id: string;
    title: string;
    role: Role;
    phase: Phase;
    depends_on: string[];
    skill?: string;
    output_contract: {
      required_findings: number;
      required_evidence_types: string[];
      deliverables: string[];
    };
  };
  expected_effect: string;
}

export interface MergeSubtaskResultAction {
  action: "MERGE_SUBTASK_RESULT";
  parent_task_id: string;
  reason: string;
  payload: {
    child_task_id: string;
    summary: string;
    finding_refs: string[];  // F-<uuid>
    evidence_refs: string[];  // E-<uuid>
    parent_updates: {
      findings_append: string[];
      next_actions_append: string[];
    };
  };
  expected_effect: string;
}

export interface AdvancePhaseAction {
  action: "ADVANCE_PHASE";
  parent_task_id: string;
  reason: string;
  payload: {
    from_phase: Phase;
    to_phase: Phase;
    gate_basis: {
      required_roles: Role[];
      completed_child_tasks: string[];
      evidence_refs: string[];
    };
  };
  expected_effect: string;
}

export interface RaiseBlockerAction {
  action: "RAISE_BLOCKER";
  parent_task_id: string;
  reason: string;
  payload: {
    blocker_type: BlockerType;
    details: string;
    blocked_tasks: string[];
    suggested_next_step: string;
  };
  expected_effect: string;
}

export interface RequestUserDecisionAction {
  action: "REQUEST_USER_DECISION";
  parent_task_id: string;
  reason: string;
  payload: {
    question: string;
    options: Array<{ id: string; description: string }>;
    default: string;
  };
  expected_effect: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  code: 
    | "INVALID_JSON"
    | "UNKNOWN_ACTION"
    | "SPECIALIST_CONTENT_DETECTED"
    | "TASK_NOT_FOUND"
    | "PHASE_GATE_UNSATISFIED"
    | "CHILD_NOT_DONE"
    | "DEPENDENCY_UNSATISFIED"
    | "NO_STATE_CHANGE"
    | "MISSING_EVIDENCE_REF"
    | "MULTIPLE_ACTIONS";
  message: string;
  path?: string;
}
```

### 4.3 Phase Gate Policy Schema

```yaml
# phase-gates.yaml

phase_gates:
  discovery:
    advance_to: design
    requires:
      min_findings: 3
      min_evidence: 1
      required_child_roles: []

  design:
    advance_to: implementation
    requires:
      min_findings: 3
      min_evidence: 1
      required_child_roles: ["research-agent"]

  implementation:
    advance_to: test
    requires:
      completed_child_roles: ["code-agent"]
      min_child_done: 1
      min_evidence: 2
      allowed_evidence_types: ["file", "command", "agent-output"]

  test:
    advance_to: integration
    requires:
      completed_child_roles: ["test-agent"]
      min_evidence: 2

  integration:
    advance_to: deploy-check
    requires:
      completed_child_roles: ["code-agent", "test-agent"]
      min_evidence: 2

  deploy-check:
    advance_to: acceptance
    requires:
      completed_child_roles: ["ops-agent"]
      min_evidence: 1

  acceptance:
    terminal: true
```

---

## 5. Optimization Plan & Tasks

### 5.1 Phase Implementation Plan

| Phase | Deliverables | Priority | Dependencies |
|-------|--------------|----------|--------------|
| **Phase 1: Minimal Enforcement** | JSON schema, parser, base validator | P0 | None |
| **Phase 2: Role Boundary** | Specialist content detector, merge validation | P0 | Phase 1 |
| **Phase 3: Phase Gate Engine** | YAML policy, gate validator, org metadata | P0 | Phase 1 |
| **Phase 4: Loop Driver** | Outer loop, child completion hook, state pause | P1 | Phase 1-3 ✅ COMPLETED |
| **Phase 5: Fallback Approval** | Fallback request action, approval flow | P2 | Phase 1 ✅ COMPLETED |

### 5.2 Task Checklist

#### Phase 1: Minimal Enforcement ✅ COMPLETED

- [x] **T1.1** Create TypeScript types for all orchestrator actions (`types.ts`)
  - ✅ Define `OrchestratorAction` union type
  - ✅ Define `SpawnSubtaskAction`, `MergeSubtaskResultAction`, `AdvancePhaseAction`, `RaiseBlockerAction`, `RequestUserDecisionAction`
  - ✅ Define `ValidationResult`, `ValidationError`, `ValidationWarning`

- [x] **T1.2** Implement `ActionParser` class
  - ✅ Extract JSON from raw model output (handle markdown code blocks, bare JSON)
  - ✅ Return `ParseFailure` for non-JSON output
  - ✅ Validate single action rule (A1)

- [x] **T1.3** Implement base `ActionValidator`
  - ✅ Validate action type is in allowed set (A3)
  - ✅ Validate task existence (C1)
  - ✅ Validate JSON-only rule (A2)

- [x] **T1.4** Implement retry envelope generator
  - ✅ Generate `RETRY_INVALID_ACTION` JSON
  - ✅ Include error code and allowed actions list
  - ✅ Format for model to retry

- [x] **T1.5** Add E2E tests for Phase 1
  - ✅ 33 tests passing
  - ✅ Parser tests: 14 tests
  - ✅ Validator tests: 9 tests
  - ✅ RetryEnvelope tests: 5 tests
  - ✅ Integration tests: 5 tests

#### Phase 2: Role Boundary Enforcement ✅ COMPLETED

- [x] **T2.1** Implement specialist content detector
  - ✅ Detect code blocks, shell scripts, patch hunks
  - ✅ Detect implementation prose (not delegation narrative)
  - ✅ Return `SPECIALIST_CONTENT_DETECTED` error (B1)

- [x] **T2.2** Implement merge citation validator
  - ✅ All `finding_refs` and `evidence_refs` must exist (B2)
  - ✅ Cannot cite findings from non-child tasks

- [x] **T2.3** Implement role gate validator
  - ✅ Check `completed_child_roles` against phase requirements (B3)
  - ✅ Reject phase advance without required role

- [x] **T2.4** Add E2E tests for Phase 2
  - ✅ 46 tests passing (total)
  - ✅ Specialist content detection tests: 5 tests
  - ✅ Citation validation tests: 3 tests
  - ✅ Role gate validation tests: 2 tests
  - ✅ Integration tests: 3 tests

#### Phase 3: Phase Gate Engine ✅ COMPLETED

- [x] **T3.1** Create `phase-gates.yaml` policy file
  - ✅ Define all phase transitions
  - ✅ Define requirements per gate (min_findings, required_roles, etc.)
  - ✅ Exception routing matrix
  - ✅ Role definitions

- [x] **T3.2** Implement `PhaseGateValidator` (enhanced)
  - ✅ Read policy YAML
  - ✅ Check gate requirements against current org state
  - ✅ Return gate pass/fail with details

- [x] **T3.3** Implement org state reader
  - ✅ Parse workflow.org for current state
  - ✅ Count findings, evidence per task
  - ✅ List completed child tasks by role
  - ✅ Detect terminal states

- [x] **T3.4** Add referee metadata fields to org schema
  - ✅ `:GATE_STATUS:` - Current gate pass/fail
  - ✅ `:LAST_ACTION:` - Last accepted action
  - ✅ `:REFEREE_ERROR:` - Last rejection reason
  - ✅ Org state writer for updating workflow.org

- [x] **T3.5** Add E2E tests for Phase 3
  - ✅ 56 tests passing (total)
  - ✅ Phase gate policy tests: 4 tests
  - ✅ Org state reader tests: 4 tests
  - ✅ Integration tests: 2 tests

#### Phase 4: Loop Driver ✅ COMPLETED

- [x] **T4.1** Define terminal state detection
  - ✅ DONE, CANCELLED, BLOCKED (awaiting external), awaiting user decision
  - ✅ Non-terminal → must schedule re-entry

- [x] **T4.2** Implement child completion event hook
  - ✅ Worker completion triggers parent loop re-entry
  - ✅ Read child findings/evidence, queue merge

- [x] **T4.3** Implement `LoopDriver` class
  - ✅ while loop until terminal state
  - ✅ schedule next turn after each action
  - ✅ Handle blocked/paused states

- [x] **T4.4** Add action log to org
  - ✅ Record each accepted action with timestamp
  - ✅ Record each rejected action with error code

- [x] **T4.5** Add E2E tests for Phase 4
  - ✅ 65 tests passing (total)
  - ✅ Child completion triggers parent loop
  - ✅ No silent stop before terminal state
  - ✅ Action log verification

#### Phase 5: Fallback Approval Flow ✅ COMPLETED

- [x] **T5.1** Implement fallback request action
  - ✅ `REQUEST_USER_DECISION` with `fallback-approve` / `fallback-reject` options
  - ✅ Default: `fallback-reject`

- [x] **T5.2** Implement fallback approval handler
  - ✅ Only proceed with fallback after explicit approval
  - ✅ Log fallback in action log with approval reference

- [x] **T5.3** Add E2E tests for Phase 5
  - ✅ 76 tests passing (total)
  - ✅ Fallback request generated on role gap
  - ✅ Fallback rejected by default
  - ✅ Approved fallback execution with audit

### 5.3 Integration Points

| Component | File | Changes |
|-----------|------|---------|
| Referee | `adapters/pi/referee.ts` (NEW) | New module |
| Types | `adapters/pi/types/referee.ts` (NEW) | New file |
| Policy | `adapters/pi/config/phase-gates.yaml` (NEW) | New file |
| Extension | `adapters/pi/extension.ts` | Integrate referee into tool_call hook |
| Protocol | `adapters/pi/protocol.ts` | Add /referee/* endpoints |
| Schema | `examples/schema.md` | Add referee metadata fields |

### 5.4 Testing Strategy

| Level | Coverage | Tool |
|-------|----------|------|
| Unit | Parser, validator, gate engine | Jest + fixtures |
| Integration | End-to-end on org fixtures | Bash + curl |
| Regression | Real failure transcripts | Compare before/after |
| E2E | Full workflow | pi sessions |

---

## 6. Migration Path

### 6.1 Non-Breaking Integration

The referee can be added as an **opt-in layer**:

1. **New trigger word**: `@runbook-org-strict` enables referee
2. **Default behavior**: Existing `@runbook-org` unchanged
3. **Gradual adoption**: Teams enable strict mode per project

### 6.2 Adapter Extension Point

```typescript
// In extension.ts - integrate referee

pi.on("tool_call", async (event, ctx) => {
  // Existing guardrail checks
  if (!isToolAllowed(event.toolName)) {
    return { block: true, reason: "..." };
  }
  
  // NEW: Referee integration for orchestrator output
  if (ctx.role === "orchestrator" && isRefereeEnabled(ctx.sessionId)) {
    const referee = new Referee(policy);
    const action = referee.parse(rawOutput);
    const validation = referee.validate(action, currentOrgState);
    
    if (!validation.ok) {
      return { 
        block: false,  // Don't block tool, but inject retry
        retry: referee.generateRetryEnvelope(validation)
      };
    }
    
    // Apply action and drive loop
    referee.apply(action, currentOrgState);
    referee.driveLoop();
  }
  
  return null;
});
```

---

## 7. Open Questions

1. **Where should referee live?**
   - Option A: Inside `adapters/pi/extension.ts` (simpler deployment)
   - Option B: Separate `adapters/pi/referee.ts` module (cleaner separation)

2. **Where should phase gate policy live?**
   - Option A: `adapters/pi/config/phase-gates.yaml` (repo config)
   - Option B: Skill text metadata (per-project customization)
   - Option C: Org file properties (runbook-level override)

3. **How strict should specialist content detection be?**
   - Current: Reject code blocks/patches
   - Extended: Reject any prose that looks like implementation?
   - Risk: False positives on legitimate analysis text

4. **Should evidence be copied or referenced in MERGE?**
   - Reference: `E-xxx` from child → parent (simpler)
   - Copy: Full evidence content in parent (independent)

5. **How to bound retry loops?**
   - Max retries per action type?
   - Max total retries?
   - After limit: escalate to user?

---

## 8. Summary

### Current Strengths
- ✅ Clear three-layer architecture (Protocol → Adapter → Host)
- ✅ Solid state machine foundation (runbook-org)
- ✅ Multi-agent orchestration protocol (runbook-multiagent)
- ✅ Exception taxonomy and routing (exception-routing)
- ✅ pi runtime adapter working

### Critical Gaps
- ❌ No structured output contract for orchestrator
- ❌ No runtime enforcement of protocol rules
- ❌ No phase gate engine
- ❌ No outer loop driver

### Recommended Next Step
**Implement Phase 1 (Minimal Enforcement)** to add:
- JSON action schema
- ActionParser
- Base ActionValidator
- Retry envelope generator

This provides immediate value (orchestrator output becomes machine-checkable) while laying foundation for full referee implementation.

---

*Document generated from project audit + PRD comparison*
*See [[file:../../../Sync/org-mode/roam/pages/20260329T092903--runbook-skill-backlogs__me_workflow.org][PRD - Referee/Gatekeeper Adapter]] for full requirements*
