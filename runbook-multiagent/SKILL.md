---
name: runbook-multiagent
description: Multi-agent orchestration with protocol/runtime separation. Manages parallel sub-agent execution, phase transitions, and exception routing.
depends on: runbook-org
version: 2.1
---

Main agent (orchestrator) workflow: **design task tree → spawn sub-agents → collect results → merge outputs → push progress**.

## Core Philosophy

> "Orchestrator is a state machine driver, not a domain executor."

Protocol level is **runtime-agnostic**. Implementation details (events, polling, timing) belong to the runtime adapter layer.

---

## Three-Layer Architecture

### Layer 1: Protocol Level (This Document)
Defines **what** orchestration does, not **how** the runtime implements it.

### Layer 2: Runtime Adapter (Per-Host Implementation)
Implements protocol primitives using host-specific mechanisms:
- Event names (`subagent_announce`, `tool_call`, etc.)
- Timing thresholds
- Spawn mechanisms

### Layer 3: User Progress Rules (Configurable)
Progress push triggers and formats.

---

## Orchestrator Non-Execution Rule ⚠️

**The orchestrator MUST NOT directly perform specialist work.**

### Forbidden (Unless Explicit Fallback)
- code changes
- writing or editing tests
- deployment/config changes
- environment debugging
- detailed dependency fixes
- performance tuning
- document implementation details

### Required Flow (When Specialist Work Needed)
```
1. classify exception / requirement
2. create or select subtask
3. assign to suitable role (code-agent, test-agent, ops-agent, etc.)
4. define expected output contract
5. wait for result
6. merge or route result
7. decide next phase transition
```

### Fallback Conditions (Must Be Recorded)
Only when:
- No suitable role exists
- User explicitly requests direct intervention
- System in degraded mode (runtime limitation)

Must record in task:
- Why delegation was not used
- What direct action was taken
- What boundary was crossed
- Whether new role/skill should be created

---

## Startup Flow

### Step 1: Design Task Tree

```org
* Project: <project-name>
:PROPERTIES:
:PHASE: discovery
:END:

** IN-PROGRESS <parent task: overall coordination>
:PROPERTIES:
:ID: parent-001
:OWNER: orchestrator
:PHASE: discovery
:EXIT_CRITERIA: <defined|undefined>
:END:
- Goal :: <one-sentence goal>
- Findings ::
- Evidence ::
- Next Actions ::

*** TODO <subtask A>
:PROPERTIES:
:ID: child-a
:PARENT: parent-001
:PHASE: discovery
:EXIT_CRITERIA: <role-specific>
:END:
- Goal ::
- Findings ::
- Evidence ::
- Next Actions ::

*** TODO <subtask B>
:PROPERTIES:
:ID: child-b
:PARENT: parent-001
:PHASE: discovery
:EXIT_CRITERIA: <role-specific>
:END:
- Goal ::
- Findings ::
- Evidence ::
- Next Actions ::
```

### Step 2: Spawn Sub-Agents

Write checkpoint immediately after spawning:
```org
- [<timestamp>] 🤖 spawn <agent-name> (<role-code>) → <subtask-ID>
```

**Spawn Modes:**
| Mode | When | How |
|------|------|-----|
| Parallel | Independent tasks | All start simultaneously |
| Sequential | Dependent tasks | Next after each completes |
| Phase-gated | Same phase, multiple roles | Wait for phase completion |

**Spawn Prompt Template:**
```
Task: <specific goal>
Context files: <files to read>
Skill: <skill-path>  ← Injected by orchestrator
Org file: <org-file-path>
Your task ID: <task-id>
Output Contract: <what this role must deliver>

Checkpoint: Write progress every 3 findings
Evidence format: file: /abs/path | web: URL
```

### Step 3: Wait for Completion

**Protocol level:**
- Sub-agent completion must be announced through host's available callback or message channel
- Orchestrator does NOT poll; waits for completion event

**Runtime adapter (implementation note):**
```typescript
// Example: pi runtime
pi.on("subagent_complete", async (result) => { ... });

// Example: Claude Code
// Uses built-in hook/subagent mechanism

// Example: OpenClaw
// Uses subagent_announce event
```

### Step 4: Collect & Merge

```org
** IN-PROGRESS <parent task: continue merging>
...
*** DONE <subtask A>
...
*** DONE <subtask B>
...

** Merged checkpoint at parent:
- Findings :: <merged summary from all sub-tasks>
- Evidence :: <merged evidence with F-<uuid> preserved>
- Next Actions :: <pending work for next phase>
```

**Merge Rules:**
- All F-<uuid> from sub-tasks preserved
- All E-<uuid> linked to findings preserved
- Contradicting findings marked as disputed
- Missing evidence flagged for follow-up

---

## Phase-Driven Orchestration

### Phase State Machine

```
discovery → design → implementation → test → integration → deploy-check → acceptance
```

### Phase Definition

| Phase | Input | Valid Roles | Output Contract | Success Condition |
|-------|-------|-------------|-----------------|-------------------|
| discovery | Initial requirements | research-agent, pm-agent | Findings with evidence | Requirements clarified |
| design | Clarified requirements | arch-agent, ux-agent, pm-agent | Design artifacts | Design approved |
| implementation | Approved design | code-agent, api-agent | Implementation | Code complete |
| test | Implementation | test-agent, qa-agent | Test results | Tests passing |
| integration | Test passing | integration-agent | Integration report | Systems connected |
| deploy-check | Integration passing | deploy-agent, ops-agent | Deploy checklist | Ready for deploy |
| acceptance | Deploy ready | pm-agent, qa-agent | Acceptance report | User approves |

### Phase Transition Rules
- Enter phase → Spawn applicable roles in parallel
- Phase gate passed → Orchestrator advances PHASE
- Phase gate failed → Exception routing triggered

---

## Exception Handling (Integrated)

### Exception Classification

| Code | Description | Default Route |
|------|-------------|---------------|
| impl-bug | Code defect found | code-agent |
| test-failure | Test not passing | test-agent |
| flaky-test | Non-deterministic test | test-agent |
| integration-mismatch | API/interface mismatch | integration-agent |
| deploy-config-error | Deployment config issue | ops-agent |
| dependency-problem | Missing/incompatible dep | deps-agent |
| environment-issue | Env setup problem | infra-agent |
| requirement-gap | Unclear/incomplete req | pm-agent |

### Exception Handling Template

```org
*** Exception Record
:PROPERTIES:
:EXCEPTION-ID: <uuid>
:TASK-ID: <affected-task>
:PHASE: <current-phase>
:END:

- Current phase :: <phase>
- Failed gate :: <what failed>
- Failure type :: <from exception table above>
- Evidence :: <error output, logs>
- Impacted task/subtask :: <ID>
- Selected delegate role :: <role-code>
- Delegate task :: <new subtask description>
- Re-entry phase :: <after completion>
```

### Orchestrator Response Template (When Exception Occurs)

```org
** Exception Detected: <type>
- Phase: <current>
- Gate: <failed>
- Type: <classified>
- Action: Creating remediation subtask for <role>
- Re-entry: <next-phase> after completion
```

---

## Task PHASE and EXIT_CRITERIA

### Required Fields

Every parent task must have:
```org
:PHASE: <current-phase>
:EXIT_CRITERIA:
  - [ ] implementation artifacts present
  - [ ] tests passing
  - [ ] integration checks passing
  - [ ] deploy-check passing (if applicable)
  - [ ] acceptance criteria satisfied
:NON-GOALS:
  - [ ] no manual optimization beyond scope
  - [ ] no opportunistic refactor
  - [ ] no unrelated bug fixing
```

### Non-Goals Principle

If EXIT_CRITERIA and NON-GOALS are not defined, orchestrator may improvise. **Define them explicitly to prevent scope creep.**

---

## Progress Push Rules (Protocol Level)

**Trigger protocol:**
- Sub-agent completes
- All sub-agents complete
- Blocker found
- Progress stalls beyond host-defined threshold

**Protocol format (runtime formats per host):**
```org
🤖 <project-name> Progress
✅ Subtask A — DONE (<key finding>)
🔄 Subtask B — IN-PROGRESS (doing X)
⏳ Subtask C — TODO (waiting)
Next: <orchestrator next action>
```

---

## Error Handling

| Situation | Protocol Handling |
|-----------|------------------|
| Timeout with content | Merge partial results, continue |
| Timeout without content | Restart with different strategy |
| Wrong org file | Read from chat summary, write to correct node |
| One sub-task stuck | Wait timeout, merge others, fill gap manually |
| Unexpected exception type | Default to pm-agent for clarification |

---

## Completion Checklist

```
□ Read sub-agent's org node
□ Extract Findings → append to parent (preserve F-<uuid>)
□ Extract Evidence → attach to parent (preserve E-<uuid>)
□ Update sub-task TODO keyword → DONE
□ Check remaining sub-tasks
  □ Yes → continue waiting
  □ No → check phase gate
□ Phase gate passed → advance PHASE
□ Phase gate failed → trigger exception routing
□ Push progress to user
□ Check for blockers → ask user if needed
```

---

## Termination

Complete when:
- All sub-tasks have TODO keyword = DONE
- Parent PHASE reached `acceptance`
- EXIT_CRITERIA satisfied
- Final deliverable file generated

---

## Migration from v2.0

| v2.0 Concept | v2.1 Protocol |
|--------------|---------------|
| :STATUS: property | TODO keyword (org-native) |
| STATUS: in-progress | TODO = IN-PROGRESS |
| STATUS: done | TODO = DONE |
| STATUS: blocked | TODO = BLOCKED |
| Merge as "DONE parent" | Merge during IN-PROGRESS, mark DONE at end |
