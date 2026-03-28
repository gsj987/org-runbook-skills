# Skill: runbook-org

> **Type**: Base Execution Skill (Foundation for all tasks)
> **Trigger**: Automatically activates when needing to execute a specific task
> **What it does**: Writes tasks to org-mode workflow files, executes strictly step-by-step, records evidence, failures must have checkpoints

---

## What is runbook-org

When you (the main agent) receive a task, this skill defines how to transform it into a trackable work unit.

**Problems it solves:**
- Agent skips steps, doesn't write intermediate results, restarts everything on failure
- Multiple agents running in parallel don't know where each other are
- Conclusions are in chat, files are empty

**It enforces:**
- Every task has a unique ID and OWNER
- Every step is recorded (even just one sentence)
- All findings must have evidence sources
- Failures must have checkpoints (can resume from here)

---

## 0. Core Principles

1. **Org is the single source of truth** — Chat is not. Conclusions in chat aren't conclusions until written to org
2. **Evidence is a first-class citizen** — Findings without sources don't exist
3. **Checkpoints must be written immediately** — Don't wait until the end. After completing each meaningful step, write it in immediately
4. **Never retry a failed method more than 2 times** — After failure, must switch strategy, record the change
5. **Once claimed, take responsibility** — Whoever the OWNER is must write checkpoints
6. **Never delete others' findings** — Can only append, cannot rewrite

---

## 1. Task Structure

Each task is a `*** TODO <task-name>` node:

```org
*** TODO <task-name>
:PROPERTIES:
:ID: <unique-ID>
:OWNER: <agent-name>
:STATUS: <todo|in-progress|blocked|done>
:CREATED: <timestamp>
:END:

- Goal :: <one-sentence description of what this task wants>
- Context :: <background: dependencies, external resources, known constraints>
- Findings :: <all findings go here>
- Evidence :: <all evidence sources go here>
- Next Actions :: <pending items>
```

---

## 2. Allowed Actions (Only These)

### 2.1 claim-task
First thing to do after receiving a task.

**Must do:**
1. Find the corresponding `*** TODO <task-name>` node
2. Set `OWNER` to your name
3. Set `STATUS` to `in-progress`
4. **Write the first checkpoint finding immediately:**
```org
- [<timestamp>] 🔒 Starting analysis of <target>, strategy: <how you plan to investigate>, dependencies: <URL or file>
```

### 2.2 append-finding
Record a finding.

```org
- [<timestamp>] <finding content>
```

**Quality rules:**
- Good finding: specific, actionable, has source
- Bad finding: vague opinion, duplicate, unsourced speculation

**Progress convention:** Every 3-5 findings, write a progress note:
```org
- [<timestamp>] 🔄 Progress: completed X, currently doing Y, pending Z
```

### 2.3 attach-evidence
Evidence must indicate source type and reliability.

```org
- [<timestamp>] <type>: <source>  # reliability: ★★★|★★|★
```

**Source types:**

| Type | Description | Reliability |
|------|-------------|-------------|
| `file:` | Local source file with absolute path | ★★★ |
| `web:` | GitHub / official docs / official website | ★★ |
| `blog:` | Third-party blog / secondhand analysis | ★ |
| `command:` | Summary of command output | ★★★ |
| `agent-output:` | Summary of sub-agent output | ★★ |

### 2.4 set-status
Update status.

**Allowed statuses:** `todo` → `in-progress` → `done` or `blocked`

**Done requirements:**
- At least 1 finding
- At least 1 evidence

**Blocked requirements:**
- Findings must include: `- [BLOCKED] <reason>, attempted: <alternative solution>`
- Next Actions must include next step

### 2.5 spawn-subtask
Spawn a child task.

```org
*** TODO <subtask-name>
:PROPERTIES:
:ID: <parent-ID>-1
:OWNER:
:STATUS: todo
:CREATED: <timestamp>
:PARENT: <parent-task-ID>
:END:

- Goal :: <subtask goal>
- Context :: <dependencies: <external URL or resource>>
- Findings ::
- Evidence ::
- Next Actions ::
```

### 2.6 append-next-action
Write the next pending action.

```org
- [ ] <specific action>
```

**Rules:**
- Must be specific ("analyze X file" not "continue analysis")
- If you know a certain path will fail, write a backup plan: `- [ ] If A fails → use B instead`

---

## 3. Forbidden Actions

- ❌ Rewrite others' findings/evidence
- ❌ Delete existing records
- ❌ Modify unrelated task nodes
- ❌ Skip checkpoints (more than 3 findings without a checkpoint = done wrong)
- ❌ Use a failed method for the 3rd time
- ❌ Leave conclusions only in chat

---

## 4. Execution Mode (Every Task Must Follow)

```
1. claim-task        → Write checkpoint immediately
2. append-finding    → Write while doing
3. attach-evidence  → Attach source to each finding
4. [checkpoint]     → Write progress after every 3 findings
5. append-next-action → Write next step after completing each step
6. set-status       → Advance status
```

**Do NOT skip. Do NOT go silent.**

---

## 5. Failure Handling

If stuck:

```
1. append-finding: - [BLOCKED] <reason>
2. append-next-action: - [ ] Switch strategy: <alternative solution>
3. set-status: blocked
4. set-status: in-progress  ← Don't stop here, immediately switch methods and continue
```

---

## 6. Main Agent Responsibilities

Additional responsibilities of main agent in multi-agent tasks:

- **Before spawning tasks**: Update parent task `Next Actions`, clarify task boundaries for each sub-agent
- **After spawning**: Immediately write checkpoint in parent task: `- [<timestamp>] 🤖 spawn <agent-name> estimated time <N minutes>`
- **When receiving sub-agent completion**: Read sub-task content from org, merge into parent task
- **Periodic push**: After each milestone, proactively send user a progress summary (no need for user to ask)

---

*This is the runbook-org skill (base layer). Foundation rules for all tasks.*
