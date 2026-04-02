# org-runbook-skills

> Structured task management for [pi](https://github.com/mariozechner/pi) using org-mode files.

This project provides skills that enable multi-agent orchestration with org-mode state machines, exception routing, and deterministic workflow tracking.

---

## Quick Start

### 1. Deploy to Your Project

```bash
./deploy.sh --project .
```

This deploys skills and the pi-adapter extension to your project's `.pi/` directory.

### 2. Deploy Globally

```bash
./deploy.sh --global
```

Installs skills and adapter to `~/.pi/agent/` for use across all projects.

### 3. Start Using

```bash
pi
```

Then use trigger words in your session:

| Trigger | Purpose |
|---------|---------|
| `@runbook-org` | Single agent task execution |
| `@orchestrate` | Multi-agent orchestrator |
| `@exception` | Exception handling |

---

## Deployment Options

| Command | Target | Use Case |
|---------|--------|----------|
| `./deploy.sh --project .` | `.pi/` in current dir | Project-local installation |
| `./deploy.sh --project ~/myproj` | `.pi/` in specific project | Deploy to another project |
| `./deploy.sh --global` | `~/.pi/agent/` | Global installation |
| `./deploy.sh --remove` | Remove from project | Clean up deployment |

**Flags:**
- `--force` — Overwrite existing skills
- `--remove` — Remove skills and adapter from project

### What Deploy Does

**Project mode (`--project`):**
- Copies skills to `.pi/skills/`
- Deploys pi-adapter to `.pi/extensions/pi-adapter/`
- Runs `npm install` for adapter dependencies
- Updates `.pi/settings.json`

**Global mode (`--global`):**
- Copies skills to `~/.pi/agent/skills/`
- Deploys pi-adapter to `~/.pi/agent/extensions/pi-adapter/`
- Installs adapter dependencies

---

## Project Structure

```
org-runbook-skills/
├── deploy.sh                  # Deployment script
├── runbook/                   # Project runbooks (not in git)
│   ├── 000-runbook-template.org  # Template
│   └── 001-my-project.org       # Project runbooks
├── runbook-org/              # Base operations skill
│   └── SKILL.md
├── runbook-multiagent/       # Orchestration skill
│   └── SKILL.md
├── orchestrator-skill/       # Orchestrator profile
│   └── SKILL.md
├── runbook-brainstorm/       # Research workflow
│   └── SKILL.md
├── exception-routing/        # Exception taxonomy
│   └── SKILL.md
├── adapters/
│   └── pi/                   # pi adapter extension
│       ├── extension.ts      # Supervisor extension
│       └── protocol.ts       # Worker protocol
└── examples/
    ├── schema.md             # Object definitions
    └── workflow.org          # Example runbook
```

---

## Skills Overview

### Trigger Words

| Trigger | Activation | Path |
|---------|-----------|------|
| `@runbook-org` | Single agent task | `runbook-org/SKILL.md` |
| `@runbook-multi` | Multi-agent orchestration | `runbook-multiagent/SKILL.md` |
| `@orchestrate` | Orchestrator profile | `orchestrator-skill/SKILL.md` |
| `@research` | Research workflow | `runbook-brainstorm/SKILL.md` |
| `@exception` | Exception handling | `exception-routing/SKILL.md` |

### Skill vs Workflow

| Type | Definition |
|------|-----------|
| **Skill** | Protocol for specific operation (how to modify org state) |
| **Workflow** | Template for organizing research tasks (how to organize a research type) |

---

## Core Skills

### runbook-org (Base Layer)

Single agent task execution with state machine semantics.

**Primitives:**
| Primitive | Purpose |
|-----------|---------|
| `claim-task(task-id, agent)` | Transitions to IN-PROGRESS |
| `append-finding(task-id, content, rating)` | Creates F-<uuid> finding |
| `attach-evidence(finding-id, type, source)` | Links E-<uuid> evidence |
| `complete-task(task-id)` | Marks DONE |

**State Machine:**
```
TODO ──claim──> IN-PROGRESS ──complete──> DONE
                  │
                  └──block──> BLOCKED ──resume──> IN-PROGRESS
```

### runbook-multiagent (Orchestration Layer)

Multi-agent orchestration with protocol/runtime separation.

**Protocol:**
1. Design task tree (parent + children with PHASE/EXIT_CRITERIA)
2. Spawn sub-agents with output contracts
3. Wait for completion
4. Merge findings (preserve F-<uuid> traceability)
5. Phase gating and exception routing

**Rule:** The orchestrator MUST NOT directly perform specialist work. It must delegate.

### orchestrator-skill (Orchestrator Profile)

Defines orchestrator behavior, exception handling, and phase-driven orchestration.

**Allowed Actions:**
- Phase control
- Task decomposition
- Routing (classify + dispatch)
- Merge and gate management
- Exception dispatch
- Completion gating

### exception-routing

Exception classification and routing matrix.

| Phase | Exception | Delegate | Output |
|-------|-----------|----------|--------|
| test | impl-bug | code-agent | patch + files |
| test | flaky-test | test-agent | repro + cause |
| integration | api-mismatch | integration-agent | mismatch report |
| deploy-check | config-error | ops-agent | config diff |
| acceptance | requirement-gap | pm-agent | criteria clarification |

---

## Agent Roles

### Core Roles

| Role | Responsibility | Output Contract |
|------|---------------|-----------------|
| arch-agent | System architecture, module boundaries | Module boundaries, call chains, risks |
| pm-agent | User needs, feature design | PRD, priorities, acceptance criteria |
| ux-agent | Page flow, component states | UI specs, interaction specs |
| code-agent | Code implementation | Code artifacts with tests |
| test-agent | Unit/integration tests | Test results, coverage report |
| ops-agent | Deployment, CI/CD | Deploy checklist, release plan |
| deps-agent | Dependency analysis | Availability, constraints, alternatives |
| research-agent | Tech research, competitive analysis | Research report with evidence |

### Extended Roles

| Role | Responsibility |
|------|---------------|
| api-agent | API design, contracts |
| data-agent | Data models, DB design |
| security-agent | Security design, compliance |
| perf-agent | Performance analysis |
| infra-agent | Infrastructure, monitoring |
| integration-agent | Integration testing |

---

## Phase-Driven Workflow

```
discovery → design → implementation → test → integration → deploy-check → acceptance
```

Each phase:
- Has entry conditions
- Allows specific roles to act
- Defines success gates
- Triggers exception routing on failure

---

## Design Principle: TODO Keywords Over :STATUS:

Org-mode's native TODO keywords are the **primary state mechanism**.

**Recommended header:**
```org
#+TODO: TODO(t) IN-PROGRESS(i) | DONE(d) BLOCKED(b) CANCELLED(c)
```

**Benefits:**
- Leverages org-mode's built-in state machine
- Automatic org-nature features (agenda, TODO statistics)
- No duplication between TODO keyword and :STATUS:

---

## Runbook Management

### Rules

1. All runbooks MUST be in `runbook/` directory
2. Naming: `runbook/<sequence>-<project-name>.org`
3. Sequence numbers MUST be sequential (001, 002, 003...)
4. Never create `workflow.org` at root level

### Example

```org
#+TODO: TODO(t) IN-PROGRESS(i) | DONE(d) BLOCKED(b)
#+FILETAGS: my-project

* TODO Implement feature X
  :PROPERTIES:
  :AGENT: code-agent
  :PHASE: implementation
  :EXIT_CRITERIA: Code complete, tests passing
  :END:
```

---

## pi Adapter

The pi-adapter extension (`adapters/pi/`) enables:

- Supervisor auto-starts on port 3847
- Workers spawn as child processes
- Protocol-based communication between supervisor and workers

**No compilation needed** — runs via `npx ts-node --esm`

---

## Examples

See `examples/` for:

- `schema.md` — Formal object definitions
- `workflow.org` — Complete execution trace

---

## Migration

### v1.x → v2.0

| Old | New |
|-----|-----|
| Generic triggers | `@runbook-org`, `@runbook-multi`, `@research` |
| Log entry findings | F-<uuid> findings with ratings |
| List evidence | E-<uuid> evidence linked to findings |
| Done when "finished" | Done when exit conditions met |
| No exception handling | Exception classification + routing |
| No orchestrator rule | Explicit Non-Execution Rule |

### v2.0 → v2.1

| Old | New |
|-----|-----|
| `:STATUS:` property | org-mode TODO keyword |
| `STATUS: in-progress` | `IN-PROGRESS` |
| `STATUS: done` | `DONE` |
