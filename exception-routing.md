# Exception Routing Protocol

> "Classify before acting. Dispatch before doing."

> **Design Note:** Org-mode TODO keywords (TODO, IN-PROGRESS, DONE, BLOCKED) are the state mechanism for tasks. See [[file:runbook-org/SKILL.md][runbook-org]] for state machine definition.

## Purpose

Exception routing provides a **deterministic path** from anomaly detection to resolution ownership. Orchestrator's job is to classify and dispatch, not to fix.

---

## Exception Taxonomy

### Definition
An **exception** is any deviation from expected workflow state that blocks progress.

### Taxonomy Table

| Code | Name | Description | Default Route | Urgency |
|------|------|-------------|---------------|---------|
| impl-bug | Implementation Bug | Code defect, logic error, runtime error | code-agent | high |
| test-failure | Test Failure | Unit/integration test not passing | test-agent | high |
| flaky-test | Flaky Test | Non-deterministic test behavior | test-agent | medium |
| integration-mismatch | Integration Mismatch | API contract violation, data format mismatch | integration-agent | high |
| deploy-config-error | Deployment Config Error | CI/CD, environment, container config issue | ops-agent | high |
| dependency-problem | Dependency Problem | Missing package, version conflict, unavailable service | deps-agent | medium |
| environment-issue | Environment Issue | SDK, tooling, local setup problem | infra-agent | medium |
| requirement-gap | Requirement Gap | Unclear, incomplete, or contradictory requirements | pm-agent | high |
| unknown | Unknown Exception | Cannot classify into existing categories | pm-agent | depends |

---

## Routing Rules

### Rule 1: Classify First
```
IF exception.classification IS NULL
  THEN classify(exception) BEFORE any action
  AND halt domain work until classified
```

### Rule 2: Route to Specific Role
```
IF exception.type IS <known>
  THEN route(exception.type) → matching role
  AND create remediation subtask
```

### Rule 3: Fallback for Unknown
```
IF exception.type IS unknown
  THEN route(exception) → pm-agent
  AND pm-agent determines appropriate role
```

### Rule 4: Parallel Exception Handling
```
IF multiple exceptions AND independent
  THEN spawn multiple remediation tasks in parallel
  AND track each separately
```

### Rule 5: Sequential Exception Handling
```
IF multiple exceptions AND dependent
  THEN route in dependency order
  AND wait for resolution before next
```

---

## Routing Matrix

### Phase × Exception × Role

| Phase | impl-bug | test-failure | flaky-test | mismatch | config-error | dep-problem | env-issue | req-gap |
|-------|----------|--------------|------------|----------|--------------|-------------|-----------|---------|
| discovery | - | - | - | - | - | - | - | pm |
| design | arch | pm | - | arch | arch | deps | infra | pm |
| impl | code | test | test | integration | ops | deps | infra | pm |
| test | code | test | test | integration | ops | deps | infra | pm |
| integration | code | integration | test | integration | ops | deps | infra | arch |
| deploy-check | code | test | test | integration | ops | deps | infra | arch |
| acceptance | pm | pm | pm | pm | ops | deps | infra | pm |

### Urgency × SLA

| Urgency | Response Time | Resolution Target |
|---------|---------------|-------------------|
| critical | Immediate | 1-2 hours |
| high | 4 hours | Same day |
| medium | 24 hours | 2 days |
| low | 72 hours | 1 week |

---

## Re-entry Rules

After remediation completes, orchestrator must determine re-entry point.

### Re-entry Decision Tree

```
Remediation Complete?
├── Yes
│   ├── Original gate passed?
│   │   ├── Yes → Resume normal flow
│   │   └── No → Re-run gate check
│   └── Original phase complete?
│       ├── Yes → Advance to next phase
│       └── No → Continue in same phase
└── No (partial/timeout)
    ├── Merge partial results
    ├── Evaluate if can continue
    └── Decide: escalate / retry / abandon
```

### Re-entry Phase Options

| Situation | Re-entry Phase |
|-----------|---------------|
| impl-bug fixed, test passing | Continue test phase |
| integration fixed, tests ready | Re-run integration |
| requirement clarified | Return to design |
| Cannot resolve | Block and escalate to user |

---

## Fallback Rules

### Fallback Conditions

Orchestrator may perform direct work (fallback) ONLY when:

| Condition | Example | Recording |
|-----------|---------|-----------|
| No suitable role exists | New tech stack, specialized domain | Create role proposal |
| User explicitly requests | "Just fix it yourself" | Log user request |
| Runtime limitation | Cannot spawn sub-agent | Log limitation, note impact |
| Emergency | Production down, no time to delegate | Log urgency, document after |

### Fallback Recording Format

```org
** Orchestrator Fallback (EXCEPTION)
:PROPERTIES:
:FALLBACK-ID: <uuid>
:TIMESTAMP: <now>
:TRIGGER: <fallback condition>
:END:

- Reason delegation not used :: <specific reason>
- What was done :: <action taken>
- Boundary crossed :: <role boundary violated>
- Estimated time saved :: <duration>
- Recommendation :: <should new role be created?>
- Post-incident action :: <review, role proposal>
```

---

## Exception Lifecycle

```
┌──────────────────────────────────────────────────────────────┐
│                    EXCEPTION LIFECYCLE                       │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  DETECTED ──classify──> CLASSIFIED ──route──> DISPATCHED    │
│       │                    │                   │             │
│       │                    │                   ▼             │
│       │                    │            WAITING_FOR_RESULT   │
│       │                    │                   │             │
│       │                    │                   ▼             │
│       │                    │              RESOLVED           │
│       │                    │                   │             │
│       │                    │                   ▼             │
│       │                    │            RE-ENTRY_DECISION    │
│       │                    │                   │             │
│       │                    ▼                   ▼             │
│       ▼            ESCALATED ────────────────────────> USER   │
│  UNKNOWN                                                   │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

### State Definitions

| State | Meaning | Orchestrator Action |
|-------|---------|---------------------|
| DETECTED | Anomaly noticed | Halt, do not improvise |
| CLASSIFIED | Exception type determined | Look up routing matrix |
| DISPATCHED | Remediation task created | Wait for completion |
| WAITING_FOR_RESULT | Remediation in progress | Monitor, no interference |
| RESOLVED | Remediation complete | Evaluate gate pass/fail |
| RE-ENTRY_DECISION | Determine next step | Follow decision tree |
| ESCALATED | Cannot handle internally | Request user intervention |

---

## Evidence Requirements

Each exception record MUST contain:

| Field | Required | Description |
|-------|----------|-------------|
| exception-id | Yes | Unique identifier |
| task-id | Yes | Affected task |
| phase | Yes | Current phase when detected |
| type | Yes | From taxonomy |
| evidence | Yes | Error output, logs, screenshots |
| routing | Yes | Role selected, rationale |
| subtask | Yes | Remediation task details |
| re-entry | Yes | Next phase/action |
| resolution | Yes (post) | How it was resolved |

---

## Integration with orchestrator-skill

This document is referenced by `orchestrator-skill/SKILL.md`. Orchestrator must:

1. Follow exception taxonomy when classifying
2. Apply routing matrix for role selection
3. Use re-entry rules for phase transitions
4. Record fallback per the fallback rules

---

## Quick Reference Card

```
EXCEPTION DETECTED → STOP → CLASSIFY → ROUTE → DISPATCH → WAIT → RESOLVE → RE-ENTER

Classification: impl-bug | test-failure | flaky | mismatch | config | dep | env | req-gap | unknown
Routing: Use matrix for phase × exception → role
Fallback: Only when no role | user requests | runtime limit | emergency
Recording: Must have evidence + rationale + re-entry plan
```

---

## Anti-Patterns

| Anti-Pattern | Problem | Correct Approach |
|-------------|---------|------------------|
| "I'll fix it while waiting" | Violates non-execution | Create task, wait properly |
| "This is clearly a X problem" (without classification) | May be wrong | Always classify first |
| "User won't care about this detail" | Assumption | Route to pm-agent |
| "This is faster than documenting" | Shortcut | Record exception properly anyway |
| "Let's try a few things and see" | Improvisation | Classify, route, wait |
