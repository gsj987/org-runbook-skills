# Schema Definition

> Formal definition of domain objects in org-runbook-skills v2.1

---

## Design Decision: TODO Keywords vs :STATUS: Property

Org-mode's native TODO keywords (`TODO`, `IN-PROGRESS`, `DONE`, `BLOCKED`, etc.) are the **primary state mechanism**. We use them instead of redundant `:STATUS:` properties.

**Why:**
- Leverages org-mode's built-in state machine
- Automatic org-nature features (agenda, TODO statistics)
- No duplication between TODO keyword and :STATUS:

**Recommended org file header:**
```org
#+TODO: TODO(t) IN-PROGRESS(i) | DONE(d) BLOCKED(b) CANCELLED(c)
```

---

## Object Overview

| Object | Purpose | Key Property |
|--------|---------|--------------|
| **Task** | Unit of work with state | TODO keyword (TODO/IN-PROGRESS/DONE/BLOCKED) |
| **Finding** | Discovery with identity | F-<uuid>, can be referenced |
| **Evidence** | Source with reliability | E-<uuid>, must link to Finding |
| **Subtask** | Child task in tree | PARENT reference |
| **Merge** | Result aggregation | Preserves F-<uuid> traceability |

---

## Task Object

```org
*** TODO <task-name>
:PROPERTIES:
:ID: <uuid>                      # Required: Unique identifier
:OWNER: <agent-code>            # Required: Current owner
:PHASE: <phase-name>            # Optional: discovery/design/implementation/test/integration/deploy-check/acceptance
:PARENT: <parent-id>             # Optional: For subtasks only
:CREATED: <ISO-timestamp>       # Required
:UPDATED: <ISO-timestamp>       # Auto-updated on change
:EXIT_CRITERIA:                 # Required for parent tasks
:  - [ ] <criterion 1>
:  - [ ] <criterion 2>
:NON-GOALS:                     # Optional but recommended
:  - [ ] <non-goal 1>
:END:

- Goal :: <one-sentence description>
- Context :: <background, dependencies, constraints>
- Findings ::                    # Accumulated findings
- Evidence ::                    # Referenced evidence
- Next Actions ::                # Pending work
```

### Task Status Transitions (via TODO Keywords)

```
TODO ──claim──> IN-PROGRESS ──complete──> DONE
                  │
                  └──block──> BLOCKED ──resume──> IN-PROGRESS
```

### Valid TODO Keywords

| Keyword | When to Use |
|---------|-------------|
| `TODO` | Task exists but not started |
| `IN-PROGRESS` | Task claimed and actively working |
| `DONE` | Task completed successfully |
| `BLOCKED` | Task blocked by dependency or issue |
| `CANCELLED` | Task cancelled (not needed, scope removed) |

---

## Finding Object

```org
- [<timestamp>] F-<uuid>: <finding content>  # Rating: ★★★|★★|★
```

### Properties

| Field | Format | Description |
|-------|-------|-------------|
| ID | F-<uuid> | Auto-generated UUID |
| Content | Text | The discovery itself |
| Rating | ★★★ / ★★ / ★ | Reliability rating |
| Task-ref | Task ID | Parent task |
| Status | tentative / confirmed / disputed | Validation status |

### Finding Ratings

| Rating | Meaning | Requires |
|--------|---------|---------|
| ★★★ | Core finding | Specific facts, clear source |
| ★★ | Supporting | Directional, needs verification |
| ★ | Exploratory | Speculation, needs further work |

### Finding Lifecycle

```
tentative ──[evidence ★★★]──> confirmed
tentative ──[contradicting evidence]──> disputed
```

---

## Evidence Object

```org
- [<timestamp>] E-<uuid>: <type>: <source>  # Finding: F-<uuid>  # Rating: ★★★|★★|★
```

### Properties

| Field | Format | Required |
|-------|-------|----------|
| ID | E-<uuid> | Yes |
| Type | file / web / command / blog / agent-output | Yes |
| Source | URL or path | Yes |
| Finding-ref | F-<uuid> | Yes |
| Rating | ★★★ / ★★ / ★ | Yes |

### Evidence Type Rules

| Type | Source Format | Max Rating |
|------|---------------|------------|
| file: | /abs/path | ★★★ |
| command: | `command` + output | ★★★ |
| web: | https://... | ★★ |
| blog: | https://... | ★ |
| agent-output: | Agent code + org path | ★★ |

### Evidence → Finding Link

Every evidence MUST reference exactly one finding:

```org
- [2026-03-29 10:00] F-abc123: JWT tokens expire after 1 hour
- [2026-03-29 10:01] E-def456: web: https://docs.example.com/auth#token-expiry  # Finding: F-abc123  # Rating: ★★★
```

---

## Subtask Object

Subtask is a Task with PARENT reference:

```org
*** TODO <subtask-name>
:PROPERTIES:
:ID: <uuid>
:PARENT: <parent-task-id>       # Required: Links to parent
:OWNER: <role-code>
:PHASE: <phase-name>
:END:
...
```

### Subtask Relationships

```
IN-PROGRESS parent (ID: p-001)
├── TODO child A (PARENT: p-001)
├── IN-PROGRESS child B (PARENT: p-001)
└── TODO remediation: fix X (PARENT: p-001)
    └── TODO verification: verify fix (PARENT: remediation-ID)
```

---

## Merge Object

Merge is a checkpoint recording result aggregation:

```org
** Merged Results
:PROPERTIES:
:MERGE-ID: <uuid>
:PARENT: <parent-task-id>
:TIMESTAMP: <ISO-timestamp>
:SUBTASKS-INCLUDED: <list of subtask IDs>
:END:

** Merged Findings
- F-xxx: <finding 1>
- F-yyy: <finding 2>

** Merged Evidence
- E-zzz: file: /path  # Finding: F-yyy  # Rating: ★★★

** Synthesis
<summary of what the merge means>

** Next Actions
- [ ] <action 1>
- [ ] <action 2>
```

### Merge Rules

1. All F-<uuid> from subtasks preserved
2. All E-<uuid> linked to their F-<uuid>
3. Contradicting findings marked as disputed
4. Missing evidence flagged for follow-up

---

## Exception Record Object

```org
*** Exception Record
:PROPERTIES:
:EXCEPTION-ID: <uuid>
:TASK-ID: <affected-task>
:PARENT-ID: <parent-task>
:PHASE: <current-phase>
:TIMESTAMP: <ISO-timestamp>
:END:

** Classification
- Exception Type :: <from taxonomy>
- Confidence :: <high|medium|low>
- Evidence :: <error output, logs>

** Routing Decision
- Selected Role :: <role-code>
- Rationale :: <why this role>
- Output Contract :: <what must be delivered>

** Remediation Subtask
- Subtask ID :: <new-child-id>
- Goal :: <specific remediation goal>
- Exit Criteria :: <what constitutes resolution>

** Re-entry Plan
- Re-entry Phase :: <phase after remediation>
- Next Action :: <orchestrator action after result>
```

### Exception Taxonomy (Quick Ref)

| Code | Name | Default Route |
|------|------|---------------|
| impl-bug | Implementation Bug | code-agent |
| test-failure | Test Failure | test-agent |
| flaky-test | Flaky Test | test-agent |
| integration-mismatch | Integration Mismatch | integration-agent |
| deploy-config-error | Deployment Config Error | ops-agent |
| dependency-problem | Dependency Problem | deps-agent |
| environment-issue | Environment Issue | infra-agent |
| requirement-gap | Requirement Gap | pm-agent |

---

## Workflow.org Template

```org
#+title:      <project-name>
#+date:       [<date>]
#+filetags:   :project:
#+identifier: <project-id>
#+TODO:       TODO(t) IN-PROGRESS(i) | DONE(d) BLOCKED(b) CANCELLED(c)

* Project: <project-name>
:PROPERTIES:
:PHASE: discovery
:END:

** IN-PROGRESS <parent task: overall coordination>
:PROPERTIES:
:ID: parent-001
:OWNER: orchestrator
:PHASE: discovery
:EXIT_CRITERIA:
:  - [ ] <criterion 1>
:  - [ ] <criterion 2>
:NON-GOALS:
:  - [ ] no <specific non-goal>
:END:

- Goal :: <one-sentence goal>
- Context :: <background>
- Findings ::
- Evidence ::
- Next Actions ::

*** TODO <subtask A>
:PROPERTIES:
:ID: child-a
:PARENT: parent-001
:OWNER: <role-a>
:PHASE: discovery
:END:
- Goal :: <goal>
- Context ::
- Findings ::
- Evidence ::
- Next Actions ::

*** TODO <subtask B>
:PROPERTIES:
:ID: child-b
:PARENT: parent-001
:OWNER: <role-b>
:PHASE: discovery
:END:
- Goal :: <goal>
- Context ::
- Findings ::
- Evidence ::
- Next Actions ::
```

---

## Validator Rules

| Rule | Object | Condition |
|------|--------|-----------|
| Finding must have evidence | Finding | At least 1 E-<uuid> with rating >= ★★ |
| Evidence must reference finding | Evidence | E.finding-ref must exist |
| Task must have owner | Task | OWNER != nil |
| Claim requires TODO | Task | TODO keyword = TODO before claim |
| Complete requires evidence | Task | TODO keyword = DONE only if evidence exists |
| Subtask must have parent | Subtask | PARENT must reference existing task |

---

## Minimal Valid Workflow

```org
#+title:      Minimal Example
#+date:       [2026-03-29]
#+TODO:       TODO(t) IN-PROGRESS(i) | DONE(d) BLOCKED(b) CANCELLED(c)

* Project: Minimal
:PROPERTIES:
:END:

** IN-PROGRESS Example Task
:PROPERTIES:
:ID: task-001
:OWNER: orchestrator
:CREATED: 2026-03-29T10:00
:END:

- Goal :: Demonstrate minimal workflow
- Findings ::
  - [2026-03-29 10:01] F-001: This is a finding  # Rating: ★★
- Evidence ::
  - [2026-03-29 10:02] E-001: file: /workspace/test.txt  # Finding: F-001  # Rating: ★★★
- Next Actions ::
```
