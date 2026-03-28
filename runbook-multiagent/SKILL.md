# Skill: runbook-multiagent

> **Type**: Orchestration Skill (Orchestration Layer)
> **Trigger**: Activates when a task is complex enough to require parallel sub-agents, or spans multiple rounds
> **What it does**: How the main agent splits tasks, spawns sub-agents, collects results, pushes progress, merges outputs
> **Depends on**: runbook-org (base layer, must read first)

---

## What is runbook-multiagent

This skill activates when a task meets any of the following:
- Requires **2+ sub-agents to execute in parallel**
- Requires **multiple rounds** to complete
- Sub-agent outputs need to be **merged** into final deliverable
- Needs to **periodically push progress to user** (not wait for user to ask)

---

## 0. Core Concepts

**Main agent (you):**
- Doesn't do specific research, only: split tasks → spawn → observe → merge
- Only focuses on one thing at a time: Which sub-agents are still running? Any completed?

**Sub-agents:**
- Spawned in `sessions_spawn`
- Strictly follow runbook-org
- Write outputs to designated task nodes in org
- Notify main agent when complete

**Workflow file (.org):**
- Main task + multiple sub-task nodes
- After sub-tasks complete, main agent reads content and merges into main task

---

## 1. Startup Flow (5 Steps)

### Step 1: Evaluate if Task Needs Multi-Agent

Trigger conditions (any one met):
- Task can naturally split into independent modules?
- Can modules search for information in parallel?
- Expecting to need 2+ sub-agents?

If no → Don't activate this skill, use runbook-org for single-agent execution directly.

---

### Step 2: Design Task Tree

Build task structure in org file:

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
- Context :: <background + dependencies>
- Findings ::
- Evidence ::
- Next Actions ::

*** TODO <subtask A>
:PROPERTIES:
:ID: child-a
:PARENT: parent-001
:OWNER:
:STATUS: todo
:END:
- Goal ::
- Context :: <dependencies: <external URL>>
- Findings ::
- Evidence ::
- Next Actions ::

*** TODO <subtask B>
:PROPERTIES:
:ID: child-b
:PARENT: parent-001
:OWNER:
:STATUS: todo
:END:
- Goal ::
- Context ::
- Findings ::
- Evidence ::
- Next Actions ::
```

---

### Step 3: Define Sub-Agent Task Prompts

Each sub-agent prompt must include:

```
Task: <specific goal, one sentence>
Context files: <file paths to read>
Skill: /workspace/skills/runbook-org/SKILL.md  ← Only pass path, don't copy content
Org file: /workspace/<project-name>.org
Your task ID: <task-id>
Evidence format: file: /abs/path | web: URL
Checkpoint: Must write progress every 3 findings
Do NOT copy runbook-org.md into this prompt.

**Agent → Skill Registry (used when spawning)**

Core roles (universal for all projects): arch-agent / pm-agent / ux-agent / research-agent / code-agent / test-agent / deps-agent / deploy-agent → all inject `/workspace/skills/runbook-org/SKILL.md`

Extended technical roles: api-agent / data-agent / security-agent / perf-agent / docs-agent / frontend-agent / backend-agent / mobil-agent / ml-agent / fintech-agent / infra-agent / qa-agent → all inject `/workspace/skills/runbook-org/SKILL.md`

See `/workspace/skills.md` Agent → Skill Registry for detailed mapping.
```

**Forbidden in prompt:**
- Full skills.md content (wastes context)
- Descriptions unrelated to the task ("this project is a quantitative platform...")

---

### Step 4: Spawn Sub-Agents

Write checkpoint to parent task **immediately** after spawning:

```org
- [<timestamp>] 🤖 spawn <agent-name-1> (estimated <10 minutes>) → <subtask-ID>
- [<timestamp>] 🤖 spawn <agent-name-2> (estimated <10 minutes>) → <subtask-ID>
```

**Spawn modes:**
- **Parallel spawn**: All sub-agents start simultaneously (fastest convergence)
- **Sequential spawn**: Next starts after each completes (saves tokens, suitable for dependencies)

---

### Step 5: Wait for Sub-Agents to Complete

**Wait method: Don't poll, wait for notifications.**

Sub-agents notify you via `subagent_announce` events. Each notification includes:
- Agent code
- Task result summary
- Output org file path

**After receiving completion notification:**
1. Read Findings + Evidence from that subtask in org
2. Merge key findings to parent task (use append-finding, don't rewrite)
3. Check if other sub-agents are still running
4. If all complete → Start merge flow

---

## 2. Progress Push Rules

**Proactively push, don't wait for user to ask.**

Trigger conditions (any one met):
- One sub-agent completed
- All sub-agents completed
- Encountered blocker, need user decision
- No progress update for over 15 minutes

**Push format (concise, bullet points):**
```
🤖 <project-name> Progress
✅ Subtask A — Completed (<one-sentence key finding>)
🔄 Subtask B — Running (completed X, doing Y)
⏳ Subtask C — Waiting
Next steps: ...
```

---

## 3. Merge Flow

When all sub-agents complete:

### 3.1 Collect
Read Findings and Evidence from each subtask

### 3.2 Deduplicate + Sort
- Keep only one copy of duplicate findings (keep the one with highest source reliability)
- Categorize by theme: Technical / Product / Business

### 3.3 Write Merged Output File
```
/workspace/<project-name>/FINAL_<output-name>.md
```

Header of merged file:
```markdown
> This file was collaboratively produced by the following sub-agents:
> - <agent-A>: <responsible module>
> - <agent-B>: <responsible module>
> Merge time: <timestamp>
```

### 3.4 Update Org
- Parent task STATUS → done
- Parent task Findings → merged summary
- Parent task Next Actions → final deliverable path

---

## 4. Error Handling

### 4.1 Sub-Agent Timeout
**Symptom:** Received timeout completion event, but org file may have content.

**Handling:**
1. Check if that subtask in org has ≥1 finding + evidence
2. If yes → Treat as **partial completion**, merge content to parent task, continue
3. If no → **Start completely over** with different strategy

### 4.2 Sub-Agent Wrote to Wrong Org File
**Symptom:** Wrote to wrong org node, or path doesn't exist.

**Handling:**
1. Main agent reads result summary from chat (every completion event has one)
2. Main agent writes to correct org node

### 4.3 One Sub-Task Never Completes
**Symptom:** Other sub-agents all completed, only one still running.

**Handling:**
1. Wait for timeout event
2. After timeout, merge completed sub-agent results and continue
3. Main agent fills in content for incomplete sub-agent

---

## 5. Termination Conditions (When to End This Task)

Any one met = complete:
- All sub-agent statuses are `done`
- Parent task Findings contain core findings from all subtasks
- Final deliverable file generated and written to org

---

## 6. Main Agent's "Checklist" (Execute on Each Sub-Agent Completion Notification)

```
□ Read sub-agent's org node
□ Extract Findings → append-finding to parent task
□ Extract Evidence → attach-evidence to parent task
□ Update sub-task STATUS in org → done
□ Check if any sub-agents still running
  □ Yes → continue waiting
  □ No → start merge flow
□ Push progress to user
□ Check if user decision needed (blocker)
  □ Yes → stop, ask user
  □ No → continue merging
```

---

*This is the runbook-multiagent skill (orchestration layer). Depends on runbook-org.*
