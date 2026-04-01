# org-runbook-skills for Agents

> **Note:** All documentation must be written in **English**. No Chinese comments or mixed language content.

## Quick Start

### 1. Deploy to Your Project

```bash
./deploy.sh --project .
```

This deploys skills and the pi-adapter extension to your project's `.pi/` directory.

**What it does:**
- Copies all skills to `.pi/skills/`
- Deploys pi-adapter extension to `.pi/extensions/pi-adapter/`
- Runs `npm install` for extension dependencies
- Updates `.pi/settings.json`

### 2. Available Trigger Words

After deployment, use these in any pi session:

| Trigger | Purpose |
|---------|---------|
| `@runbook-org` | Single agent task execution |
| `@orchestrate` | Multi-agent orchestrator |
| `@exception` | Exception handling |

---

## Runbook Management

### Rules (MANDATORY)

1. **All runbooks MUST be in `runbook/` directory**
2. **Naming: `runbook/<sequence>-<project-name>.org`**
3. **Sequence numbers MUST be sequential (001, 002, 003...)**
   - Check existing runbooks first, use next available number
   - Never skip numbers or reuse deleted numbers
   - This ensures deterministic ordering
4. **Never create `workflow.org` at root level**

### Directory Structure

```
runbook/
├── 000-runbook-template.org  # Template (in git, DO NOT modify)
├── 001-my-project.org         # First project
├── 002-another-project.org   # Second project
└── ...
```

### Creating a New Runbook

**Step 1:** Check existing runbooks to determine next sequence number

**Step 2:** Use workflow.init with correct path:

```javascript
// CORRECT
workflow.init({
  workflowPath: "runbook/001-my-project.org",
  projectName: "My Project"
})

// WRONG - will be rejected
workflow.init({
  workflowPath: "workflow.org",        // ❌ No root-level org
  workflowPath: "runbook/my-proj.org"  // ❌ No sequence number
})
```

### Git Policy

| File | In Git | Purpose |
|------|--------|---------|
| `runbook/000-runbook-template.org` | ✅ Yes | Template |
| `runbook/001-*.org` | ❌ No | Project runbooks |
| `runbook/002-*.org` | ❌ No | Project runbooks |
| `*.org` at root | ❌ No | Never create here |
| `examples/*.org` | ✅ Yes | Example files |

---

## Orchestrator Workflow

When orchestrator starts a new project:

1. **Initialize runbook** using `workflow.init`:
   ```
   workflow.init(projectName="My Project", workflowPath="runbook/my-project.org")
   ```

2. **Delegate tasks** using `worker.spawn`:
   ```
   worker.spawn(role="ops-agent", task="...", workflowPath="runbook/my-project.org")
   ```

3. **Track findings** using `workflow.appendFinding`

4. **Update runbook** using `workflow.update`

---

## Key Files

| File | Purpose |
|------|---------|
| `deploy.sh` | Deployment script |
| `runbook/000-runbook-template.org` | Runbook template (see [[file:examples/schema.md][schema.md]] for format) |
| `examples/schema.md` | Formal schema definition for org files |
| `.pi/` | Runtime directory (not in git) |
| `.pi/skills/` | Deployed skills |
| `.pi/extensions/pi-adapter/` | Supervisor extension (no compilation needed, uses npx ts-node) |

## Development Notes

### pi-adapter Extension
- **No compilation required** - runs via `npx ts-node --esm`
- Source: `adapters/pi/extension.ts` and `protocol.ts`
- Supervisor auto-starts on port 3847 when not running
- Workers spawn as child processes of supervisor

### Testing Changes to pi-adapter (MANDATORY)

**Before committing any changes to `adapters/pi/extension.ts` or `protocol.ts`, you MUST run this E2E test:**

```bash
./e2e/pi-adapter-extension.sh
```

**This test verifies:**
1. Clean deploy works (delete .pi, redeploy)
2. Supervisor starts correctly with proper CWD
3. Worker spawns and executes task
4. Worker output is captured correctly
5. No errors or warnings in supervisor log

**Why this is required:**
- The pi-adapter has many subtle timing issues (supervisor startup, worker registration, etc.)
- curl tests don't catch issues visible only when pi loads the extension
- Silent failures can break orchestrator sessions in production
- Worker CWD issues can cause workers to fail silently

### Extension Conflict Prevention (IMPORTANT)

When testing locally, pi may load BOTH:
1. Global extension: `~/.pi/agent/extensions/pi-adapter/` (if installed globally)
2. Local extension: `.pi/extensions/pi-adapter/` (from deploy.sh)

This causes a conflict with error: `Failed to load extension ... conflicts`.

**Before local testing, ALWAYS clean up global extension:**

```bash
rm -rf ~/.pi/agent/extensions/pi-adapter
```

**Why this happens:**
- Running `./deploy.sh --project .` deploys pi-adapter to `.pi/extensions/pi-adapter/`
- If you previously installed pi-adapter globally (e.g., via `npm install -g`), both copies load
- This creates duplicate tool registrations and conflicts

**When to clean:**
- Before running `./e2e/pi-adapter-extension.sh`
- Before testing `pi` manually with this project
- After any E2E test that may have installed global packages

### Known Test Coverage Gaps

**IMPORTANT**: Some tests in `e2e/additional-coverage.sh` are stubs (echo statements only):
- TC-WK-023 to TC-WK-028: `worker.getOutput` and `spawnSequential` tests are not implemented
- TC-WK-021, TC-WK-022: `worker.kill` tests are not implemented

**Supervisor Restart Behavior**:
- In-memory results (`state.results`) are lost on restart
- Disk fallback (`/tmp/pi-adapter-results/`) preserves results across restarts
- `worker.getOutput` works after restart via disk fallback

**API Endpoint Note**:
- `POST /workflow/update` expects `workflowPath` field (not `path`)
- Returns 404 if workflow file doesn't exist at the specified path
- Error messages are now differentiated by endpoint (previously all 404s returned "worker not found")

**Tool Parameter Descriptions**:
- `workflow.init`: Creates workflow.org following schema
- `workflow.appendFinding`: Stores findings locally until update()
- `workflow.update`: Writes accumulated findings to file

**Test Suite Status**:
- `worker-spawn-cycle.sh`: TC-WK-001 to TC-WK-017 pass (16/20)
- TC-WK-018 (timeout test): fails due to curl --fail option
- TC-WK-019 (status test): fails due to race condition
- TC-WK-020 (isolation test): fails due to result file path issues

### Schema Compliance
All workflow.org files must follow the schema defined in [[file:examples/schema.md][examples/schema.md]]:
- Use `#+TODO:` header line with keywords
- Tasks use TODO keywords (TODO/IN-PROGRESS/DONE/BLOCKED)
- Findings: `F-<uuid>` with ratings (★★★/★★/★)
- Evidence: `E-<uuid>` must link to Finding
- See [[file:examples/schema.md][schema.md]] for full object definitions
