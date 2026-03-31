# claude-adapter

> Runtime Adapter for org-runbook-skills on Claude Code

## Overview

This adapter enables org-runbook-skills to run on Claude Code by implementing:

1. **Claude hooks** - Tool use interception for guardrail
2. **Claude profiles** - Role-based tool permissions
3. **Subagent configuration** - Multi-agent setup

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: Protocol (SKILL.md files)                           │
│ - runbook-org, runbook-multiagent, orchestrator-skill       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 2: claude-adapter (this directory)                    │
│ - hooks.ts: Tool interception + guardrail                   │
│ - profiles/: Role permission definitions                    │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 3: Claude Code Runtime                                 │
│ - Built-in hooks mechanism                                  │
│ - Built-in profile system                                   │
│ - Built-in subagent support                                 │
└─────────────────────────────────────────────────────────────┘
```

## Why claude-adapter?

Claude Code has a rich built-in feature set:
- **Built-in hooks** → Hook-based guardrail is native
- **Built-in profiles** → Role permissions are configuration
- **Built-in subagents** → Multi-agent is a first-class feature

The adapter primarily configures these features for org-runbook-skills.

## Installation

### 1. Copy hooks.ts to your project

```bash
cp adapters/claude/hooks.ts /path/to/your/project/
```

### 2. Configure in your Claude settings

In `~/.claude/settings.json` or project `.claude/settings.json`:

```json
{
  "hooks": {
    "tool-use": "/path/to/project/hooks.ts#toolUse"
  }
}
```

### 3. Configure profiles

Create profiles in `~/.claude/profiles/` or project `.claude/profiles/`:

```
.claude/
  profiles/
    orchestrator.md
    code-agent.md
    test-agent.md
    ops-agent.md
```

### 4. Set up subagents (optional)

In your Claude project configuration:

```json
{
  "subagents": {
    "orchestrator": {
      "profile": "orchestrator"
    },
    "code-agent": {
      "profile": "code-agent"
    }
  }
}
```

## Usage

### Check adapter status

```bash
claude --profile orchestrator
```

### Spawn a subagent

```bash
claude --subagent code-agent "Implement feature X"
```

### Run with specific role

```bash
claude --profile test-agent
```

## Role Profiles

| Profile | Description | Tools |
|---------|-------------|-------|
| orchestrator | Workflow control | Read, Workflow.*, Glob, Grep |
| code-agent | Code implementation | Read, Write, Edit, Bash |
| test-agent | Testing | Read, Bash, Glob, Grep |
| ops-agent | Operations | Read, Bash, Glob, Grep |

## Hooks

### toolUse Hook

Called before each tool execution:

```typescript
toolUse: (tool: string, args: Record<string, unknown>, context: HookContext) => {
  // Check permissions
  // Block dangerous operations
  // Log access attempts
}
```

### preTask / postTask Hooks

Called before/after tasks:

```typescript
preTask: (task: string, context: HookContext) => {
  console.log(`Starting: ${task}`);
}

postTask: (task: string, result: unknown, context: HookContext) => {
  console.log(`Completed: ${task}`);
}
```

## Protected Paths

Same as [[file:../pi/README.md][pi-adapter]]:

- `/path/to/secrets`
- `/path/to/prod`
- `/.claude/secrets`
- `/.ssh`

## Configuration

### Environment Variables

| Variable | Description |
|----------|-------------|
| `CLAUDE_ROLE` | Current role for the session |
| `WORKFLOW_PATH` | Path to workflow.org |

### Hook Options

Edit `hooks.ts` to customize:

```typescript
// Protected paths
const PROTECTED_PATHS = [ ... ];

// Dangerous commands
const DANGEROUS_COMMANDS = [ ... ];

// Role tool permissions
const ROLE_TOOLS: Record<Role, string[]> = { ... };
```

## Migration Checklist

From [[file:../../FINAL_CrossAgent_Adaptation.md][FINAL_CrossAgent_Adaptation.md]]:

- [x] Phase 1: Protocol extraction (SKILL.md updates)
- [x] Phase 2: pi-adapter development
- [x] Phase 3: claude-adapter development
  - [x] adapters/claude/hooks.ts
  - [x] adapters/claude/profiles/
  - [x] adapters/claude/README.md

## See Also

- [[file:../pi/README.md][pi-adapter]] - pi adapter
- [[file:../../runbook-multiagent/SKILL.md][runbook-multiagent]] - Multi-agent protocol
- [[file:../../orchestrator-skill/SKILL.md][orchestrator-skill]] - Orchestrator profile
- [Claude Code Docs](https://docs.claude.com/claude-code/) - Claude Code documentation
