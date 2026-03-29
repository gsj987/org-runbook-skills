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
3. **Sequence numbers start from 001**
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
| `runbook/000-runbook-template.org` | Runbook template |
| `.pi/` | Runtime directory (not in git) |
| `.pi/skills/` | Deployed skills |
| `.pi/extensions/pi-adapter/` | Supervisor extension |
