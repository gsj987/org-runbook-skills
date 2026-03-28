---
name: runbook-multiagent
description: Multi-agent orchestration for parallel sub-agent execution. Activates when task requires 2+ sub-agents, multiple rounds, or result merging.
depends on: runbook-org
---

Main agent workflow: split tasks → spawn sub-agents → collect results → merge outputs → push progress.

## When to Activate

- Requires **2+ sub-agents** executing in parallel
- Requires **multiple rounds** to complete
- Sub-agent outputs need **merging** into final deliverable
- Needs **periodic progress push** to user

If none apply → Use runbook-org for single-agent execution.

## Startup Flow

### Step 1: Design Task Tree
```org
* Project: <project-name>

** Task Queue

*** TODO <parent task: overall coordination>
:PROPERTIES:
:ID: parent-001
:OWNER: main-agent
:STATUS: in-progress
:END:
- Goal :: <one-sentence goal>
- Context ::
- Findings ::
- Evidence ::
- Next Actions ::

*** TODO <subtask A>
:PROPERTIES:
:ID: child-a
:PARENT: parent-001
:STATUS: todo
:END:
- Goal ::
- Context ::
- Findings ::
- Evidence ::
- Next Actions ::
```

### Step 2: Spawn Sub-Agents

Write checkpoint **immediately** after spawning:
```org
- [<timestamp>] 🤖 spawn <agent-name> (estimated <N min>) → <subtask-ID>
```

**Spawn modes:**
- **Parallel**: All start simultaneously (fastest)
- **Sequential**: Next starts after each completes (saves tokens)

### Step 3: Wait for Completion

**Don't poll.** Wait for `subagent_announce` events. Each notification includes:
- Agent code
- Task result summary
- Output org file path

### Step 4: Collect & Merge

```org
* Project: <project-name>

** DONE <parent task>
- Findings :: <merged summary from all sub-tasks>
- Evidence :: <merged evidence>
- Next Actions :: Final deliverable path
```

## Progress Push Rules

Trigger: sub-agent completes / all complete / blocker found / 15+ min no progress

```
🤖 <project-name> Progress
✅ Subtask A — Completed (<key finding>)
🔄 Subtask B — Running (doing X)
⏳ Subtask C — Waiting
Next: ...
```

## Sub-Agent Prompt Template

```
Task: <specific goal>
Context files: <files to read>
Skill: /path-to-skills/runbook-org/SKILL.md
Org file: /workspace/<project-name>.org
Your task ID: <task-id>

Checkpoint: Write progress every 3 findings
Evidence format: file: /abs/path | web: URL
```

## Error Handling

| Situation | Handling |
|-----------|----------|
| Timeout with content | Merge partial results, continue |
| Timeout without content | Restart with different strategy |
| Wrong org file | Read from chat summary, write to correct node |
| One sub-task stuck | Wait timeout, merge others, fill in manually |

## Completion Checklist

```
□ Read sub-agent's org node
□ Extract Findings → append to parent
□ Extract Evidence → attach to parent
□ Update sub-task STATUS → done
□ Check remaining sub-agents
  □ Yes → continue waiting
  □ No → start merge
□ Push progress to user
□ Check for blockers → ask user if needed
```

## Termination

Complete when:
- All sub-agent statuses are `done`
- Parent Findings contain all core discoveries
- Final deliverable file generated
