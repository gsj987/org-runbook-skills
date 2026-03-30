---
name: pi-adapter
description: Runtime adapter for multi-agent workflows in pi. Use when orchestrator needs to delegate specialist work to roles (code-agent, test-agent, etc.).
version: 1.0
---

# pi-adapter

Multi-agent workflow adapter for pi (pi-mono).

## Activation

This adapter is activated when running pi with the extension:

```bash
pi -e /path/to/extension.ts @workflow.org
```

The extension auto-loads and registers the tools below.

---

## Core Tools

### worker.spawn

Spawn a worker agent for a specific role.

**When to use:**
- When you (orchestrator) need to delegate specialist work
- When you should NOT do the work yourself

**Trigger patterns:**
| Task | Role |
|------|------|
| Implement feature | code-agent |
| Write tests | test-agent |
| Deploy | ops-agent |
| Design architecture | arch-agent |
| Clarify requirements | pm-agent |

**Parameters:**
```typescript
await worker.spawn({
  role: "code-agent",      // Required
  task: "Implement X",      // Required
  taskId: "impl-001",      // Required
  workflowPath: "./workflow.org"  // Required
})
```

**Output:** Returns `workerId` for awaiting results.

---

### worker.awaitResult

Wait for a spawned worker to complete.

**When to use:**
- After worker.spawn
- Before merging results

**Parameters:**
```typescript
await worker.awaitResult({
  workerId: "worker-xxx",  // Required
  timeout: 300              // Optional (seconds)
})
```

**Output:** Returns findings and artifacts.

---

## Complete Workflow Example

```typescript
// 1. Orchestrator identifies need for code-agent
// 2. Spawn the worker
const spawn = await worker.spawn({
  role: "code-agent",
  task: "Implement user authentication module",
  taskId: "impl-auth-001",
  workflowPath: "./workflow.org"
});

// 3. Do other orchestrator work while waiting
// 4. Await the result
const result = await worker.awaitResult({
  workerId: spawn.workerId
});

// 5. Merge findings
// findings: Array of F-<uuid> findings
// artifacts: Files created by worker
```

---

## Role Tool Restrictions

Each role has different permissions:

| Role | Tools |
|------|-------|
| orchestrator | workflow.*, worker.*, supervisor.*, read, grep, find, ls |
| code-agent | read, write, edit, bash, grep, find, ls |
| test-agent | read, bash, grep, find, ls |
| ops-agent | read, bash, grep, find, ls |

---

## Debugging & Log Tools

### supervisor.getLog
```
supervisor.getLog({ lines?: number, date?: string })
  → Read supervisor log file
  → date: YYYY-MM-DD format (default: today)
  → Returns: Request timing, worker spawn/exit, errors
```

### worker.getLog
```
worker.getLog({ workerId: string, tail?: number })
  → Get stdout/stderr from worker
  → Works for running AND completed workers (persisted to disk)
  → tail: Number of lines from end (optional)
```

### worker.kill
```
worker.kill({ workerId: string })
  → Force kill a hung worker
  → Use when: awaitResult timeout, worker stuck
  → CAUTION: In-progress work will be lost
```

---

## Supervisor Mode

For full multi-agent orchestration, run the supervisor first:

```bash
# Terminal 1: Start supervisor
cd adapters/pi
npx ts-node protocol.ts

# Terminal 2: Start orchestrator
pi -e ./extension.ts @workflow.org
```

---

## Result Persistence

Worker results are persisted to disk for reliable retrieval:

| File | Purpose |
|------|---------|
| `/tmp/pi-adapter-results/{workerId}.json` | Worker result (findings, artifacts) |
| `/tmp/pi-adapter-results/{workerId}.stdout` | Worker stdout |
| `/tmp/pi-adapter-results/{workerId}.stderr` | Worker stderr |

This ensures logs are available even after supervisor restart.

---

## Integration with orchestrator-skill

When using @orchestrate:

1. Orchestrator classifies the requirement
2. Orchestrator selects appropriate role
3. Orchestrator DELEGATES through host's spawn mechanism (worker.spawn)
4. Orchestrator AWAITS through host's callback (worker.awaitResult)
5. Orchestrator MERGEs findings
6. Orchestrator DECIDEs next phase

This adapter provides the spawn mechanism for step 3 and 4.

---

## See Also

- [[file:../../orchestrator-skill/SKILL.md][orchestrator-skill]] - Orchestrator profile
- [[file:../../runbook-multiagent/SKILL.md][runbook-multiagent]] - Multi-agent protocol
- [[file:../../exception-routing/SKILL.md][exception-routing]] - Exception routing protocol
- [[file:protocol.ts][protocol.ts]] - Supervisor implementation
- [[file:extension.ts][extension.ts]] - Extension implementation
