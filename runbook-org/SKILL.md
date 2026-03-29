---
name: runbook-org
description: Single agent task execution standard using org-mode workflow with state machine semantics. Activates when executing a specific task that needs tracking, evidence, and checkpoints.
version: 2.1
---

Follow org-mode workflow to execute tasks with **state machine semantics**, not just text conventions.

## Core Philosophy

> "What legal state transitions can I perform on this object?"

This is not a writing format guide — it defines **state primitives** with clear ownership, identity, and validity rules.

## Design Decision: TODO Keywords vs :STATUS: Property

Org-mode's native TODO keywords (`TODO`, `IN-PROGRESS`, `DONE`, `BLOCKED`, etc.) are the **primary state mechanism**. We use them instead of redundant `:STATUS:` properties.

**Benefits:**
- Leverages org-mode's built-in state machine
- Automatic org-nature features (agenda, TODO statistics)
- No duplication between TODO keyword and :STATUS:

---

## Domain Objects

### 1. Task (任务)
```
*** TODO <task-name>
:PROPERTIES:
:ID: <uuid>                    # Unique identity, can be referenced
:OWNER: <agent-code>           # Current owner (transfers on claim)
:PHASE: <discovery|design|implementation|test|integration|deploy-check|acceptance>
:CREATED: <timestamp>
:UPDATED: <timestamp>
:EXIT_CRITERIA: <defined|undefined>
:END:

- Goal :: <one-sentence description>
- Context :: <background, dependencies>
- Findings :: <accumulated findings>
- Evidence :: <referenced evidence>
- Next Actions :: <pending work>
```

**State Machine (using TODO keywords):**
```
TODO ──claim──> IN-PROGRESS ──complete──> DONE
                  │
                  └──block──> BLOCKED ──resume──> IN-PROGRESS
```

**Recommended TODO Keywords Configuration:**
```org
#+TODO: TODO(t) IN-PROGRESS(i) | DONE(d) BLOCKED(b) CANCELLED(c)
```

**Claim Task Transition:**
```
Before: TODO keyword = TODO, OWNER = unassigned
After:  TODO keyword = IN-PROGRESS, OWNER = <agent-code>, UPDATED = now()
```

### 2. Finding (发现)
```
- [<timestamp>] F-<uuid>: <finding content>
```

**Properties:**
- Has unique ID (F-<uuid>)
- Can be referenced by Evidence
- Belongs to a Task
- Rating: ★★★ (core) | ★★ (supporting) | ★ (exploratory)

**Transition Rules:**
- Created with status = tentative
- Confirmed when attached with ★★★ evidence
- Disputed when attached with contradicting evidence

### 3. Evidence (证据)
```
- [<timestamp>] E-<uuid>: <type>: <source>  # Finding: F-<uuid>  # Rating: ★★★|★★|★
```

**Properties:**
- Must reference exactly one Finding (F-<uuid>)
- Has type: file | web | command | agent-output
- Has source URL or path
- Has reliability rating

**Type-Specific Rules:**
| Type | Source Format | Max Rating |
|------|---------------|------------|
| `file:` | Absolute path | ★★★ |
| `command:` | Command + output | ★★★ |
| `web:` | URL (GitHub/official) | ★★ |
| `blog:` | URL (third-party) | ★ |
| `agent-output:` | Sub-agent ID | ★★ |

---

## Core Actions (Protocol Level)

### claim-task
```
PROTOCOL: claim-task(task-id, agent-code, strategy, dependencies)
PRECONDITION: task TODO keyword = TODO AND task.OWNER = unassigned
TRANSITION:
  - task.OWNER = agent-code
  - task TODO keyword = IN-PROGRESS
  - task.UPDATED = now()
OUTPUT:
  - Checkpoint written to task node
  - Log: 🔒 <agent> claimed <task-id> with strategy: <strategy>
```

### append-finding
```
PROTOCOL: append-finding(task-id, finding-content, rating)
PRECONDITION: task TODO keyword = IN-PROGRESS
TRANSITION:
  - finding.ID = generate-uuid()
  - finding.content = finding-content
  - finding.rating = rating
  - finding.task-ref = task-id
  - Append to task.Findings
OUTPUT:
  - Finding with F-<uuid> written
```

### attach-evidence
```
PROTOCOL: attach-evidence(finding-id, evidence-type, source, rating)
PRECONDITION: finding.F-<uuid> exists in task.Findings
TRANSITION:
  - evidence.ID = generate-uuid()
  - evidence.type = evidence-type
  - evidence.source = source
  - evidence.rating = rating
  - evidence.finding-ref = finding-id
  - Append to task.Evidence
OUTPUT:
  - Evidence with E-<uuid> written, linked to F-<uuid>
```

### advance-phase
```
PROTOCOL: advance-phase(task-id, next-phase)
PRECONDITION: task.PHASE is defined
VALID_TRANSITIONS:
  discovery -> design -> implementation -> test -> integration -> deploy-check -> acceptance
TRANSITION:
  - task.PHASE = next-phase
  - task.UPDATED = now()
OUTPUT:
  - Phase gate completed
```

### complete-task
```
PROTOCOL: complete-task(task-id)
PRECONDITION:
  - task.Findings has >= 3 items
  - task.Evidence has >= 1 item with rating >= ★★
  - task.Next Actions is empty OR explicitly deferred
TRANSITION:
  - task TODO keyword = DONE
  - task.UPDATED = now()
OUTPUT:
  - Task marked complete with evidence summary
```

---

## Execution Order

```
1. claim-task     → Verify preconditions (TODO keyword = TODO) → Change to IN-PROGRESS
2. append-finding → Create F-<uuid> → Write while doing
3. attach-evidence → Link E-<uuid> to F-<uuid>
4. [checkpoint]   → Write progress after every 3 findings
5. advance-phase  → Move to next phase when gate passed
6. complete-task  → Verify exit conditions → Change to DONE
```

---

## Done Conditions (Mandatory Rules)

A task can only be marked `DONE` when ALL of:
- [ ] At least 3 findings recorded
- [ ] At least 1 evidence attached with rating ★★ or higher
- [ ] All Next Actions completed or explicitly deferred with reason
- [ ] Phase reached `acceptance` OR parent task accepts early completion

---

## Forbidden Actions (Protocol Violations)

| Violation | Consequence |
|-----------|-------------|
| ❌ claim-task when TODO keyword != TODO | Invalid transition, reject |
| ❌ attach-evidence to non-existent finding | Invalid reference, reject |
| ❌ complete-task without evidence | Protocol violation, block |
| ❌ Retry same method 3+ times | Auto-set TODO keyword = BLOCKED |
| ❌ Skip checkpoint after 3+ findings | Protocol violation |
| ❌ Leave findings only in chat | Must be in org |
| ❌ Rewrite others' findings | Append correction, mark disputed |

---

## Failure Handling

```
BLOCKED conditions:
  - Retry method exhausted
  - Dependency unavailable
  - Authority gap (user decision needed)

PROTOCOL: handle-blocked(task-id, reason, alternative)
TRANSITION:
  - task TODO keyword = BLOCKED
  - append-finding: [BLOCKED] <reason>
  - append-next-action: [ ] Alternative: <alternative>
OUTPUT:
  - Blocker recorded with re-entry path
```

---

## Integration with runbook-multiagent

When spawned by orchestrator:
- Parent task owns the overall workflow state
- Sub-task findings are merged back via orchestrator
- Finding IDs (F-<uuid>) are preserved across merges for traceability

---

## Migration from v2.0

| v2.0 Concept | v2.1 State Primitive |
|--------------|---------------------|
| :STATUS: property | TODO keyword (org-native) |
| STATUS = in-progress | TODO = IN-PROGRESS |
| STATUS = done | TODO = DONE |
| STATUS = blocked | TODO = BLOCKED |

**Example migration of existing tasks:**
```org
# Before (v2.0)
*** TODO Implement feature
:PROPERTIES:
:END:

# After (v2.1)
*** IN-PROGRESS Implement feature
:PROPERTIES:
:END:
```
