---
name: runbook-org
description: Single agent task execution standard using org-mode workflow. Activates when executing a specific task that needs tracking, evidence, and checkpoints.
---

Follow org-mode workflow to execute tasks with full traceability.

## Core Actions

### claim-task
```org
- [<timestamp>] 🔒 Starting analysis of <target>, strategy: <how to investigate>, dependencies: <URL or file>
```

### append-finding
```org
- [<timestamp>] <finding content>
```

### attach-evidence
```org
- [<timestamp>] <type>: <source>  # reliability: ★★★|★★|★
```

### set-status
Status flow: `todo` → `in-progress` → `done` or `blocked`

## Task Structure
```org
*** TODO <task-name>
:PROPERTIES:
:ID: <unique-ID>
:OWNER: <agent-name>
:STATUS: <todo|in-progress|blocked|done>
:CREATED: <timestamp>
:END:

- Goal :: <one-sentence description>
- Context :: <background: dependencies, external resources>
- Findings ::
- Evidence ::
- Next Actions ::
```

## Evidence Types

| Type | Description | Reliability |
|------|-------------|-------------|
| `file:` | Local source file with absolute path | ★★★ |
| `web:` | GitHub / official docs | ★★ |
| `blog:` | Third-party blog / secondhand | ★ |
| `command:` | Command output | ★★★ |
| `agent-output:` | Sub-agent output | ★★ |

## Execution Order

```
1. claim-task        → Write checkpoint immediately
2. append-finding    → Write while doing
3. attach-evidence  → Attach source to each finding
4. [checkpoint]     → Write progress after every 3 findings
5. append-next-action → Write next step after completing each step
6. set-status       → Advance status
```

## Forbidden Actions

- ❌ Rewrite others' findings/evidence
- ❌ Delete existing records
- ❌ Skip checkpoints (3+ findings without checkpoint = wrong)
- ❌ Retry failed method 3+ times
- ❌ Leave conclusions only in chat

## Failure Handling

```
1. append-finding: - [BLOCKED] <reason>
2. append-next-action: - [ ] Switch strategy: <alternative>
3. set-status: blocked → in-progress (continue immediately)
```
