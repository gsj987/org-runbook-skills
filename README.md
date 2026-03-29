# OpenClaw Skills — Skill Index

> All skills are located at `<skill-name>/SKILL.md`
> All workflows are located at `workflows/<workflow-name>/SKILL.md`

---

## Trigger Words (Canonical Entry Points)

> ⚠️ Use **exact trigger words** to activate skills. Generic words like "skill" or "runbook" may misfire.

| You Say | Activated | Type | Path |
|---------|-----------|------|------|
| `@runbook-org` | Single agent task execution | **Skill** | `runbook-org/SKILL.md` |
| `@runbook-multi` | Multi-agent orchestration | **Skill** | `runbook-multiagent/SKILL.md` |
| `@research` | Multi-role research workflow | **Workflow** | `runbook-brainstorm/SKILL.md` |
| `@orchestrate` | Orchestrator profile with exception routing | **Skill** | `orchestrator-skill/SKILL.md` |

---

## Skill vs Workflow Distinction

| Type | Definition | Purpose |
|------|-----------|---------|
| **Skill** | Protocol for specific operation | Teaches agent "how to modify org state" |
| **Workflow** | Template for organizing research tasks | Teaches orchestrator "how to organize a research type" |

**Currently:**
- `runbook-org` → Skill (base operations)
- `runbook-multiagent` → Skill (orchestration protocol)
- `orchestrator-skill` → Skill (orchestrator profile)
- `runbook-brainstorm` → Workflow template (research harness)

**Future directory structure:**
```
skills/
  runbook-org/         # Base operations skill
  runbook-multiagent/  # Orchestration skill
  orchestrator-skill/  # Orchestrator profile skill
workflows/
  brainstorm-research/ # Research workflow template
```

---

## Design Principle: TODO Keywords Over :STATUS: Property

Org-mode's native TODO keywords are the **primary state mechanism**. We use them instead of redundant `:STATUS:` properties.

**Recommended org file header:**
```org
#+TODO: TODO(t) IN-PROGRESS(i) | DONE(d) BLOCKED(b) CANCELLED(c)
```

**Benefits:**
- Leverages org-mode's built-in state machine
- Automatic org-nature features (agenda, TODO statistics)
- No duplication between TODO keyword and :STATUS:

---

## Skill 1: runbook-org (Base Layer)

**Path:** `runbook-org/SKILL.md`  
**Activation:** `@runbook-org`

**Purpose:** Single agent task execution with **state machine semantics**.

**Core Primitives:**
| Primitive | What It Does |
|-----------|-------------|
| `claim-task(task-id, agent, strategy)` | Transitions task to IN-PROGRESS with owner |
| `append-finding(task-id, content, rating)` | Creates F-<uuid> finding |
| `attach-evidence(finding-id, type, source)` | Links E-<uuid> evidence to finding |
| `advance-phase(task-id, next-phase)` | Moves task through discovery→acceptance |
| `complete-task(task-id)` | Marks DONE when exit conditions met |

**State Machine (TODO Keywords):**
```
TODO ──claim──> IN-PROGRESS ──complete──> DONE
                  │
                  └──block──> BLOCKED ──resume──> IN-PROGRESS
```

---

## Skill 2: runbook-multiagent (Orchestration Layer)

**Path:** `runbook-multiagent/SKILL.md`  
**Activation:** `@runbook-multi`

**Purpose:** Multi-agent orchestration with **protocol/runtime separation**.

**Core Protocol:**
1. Design task tree (parent + children with PHASE/EXIT_CRITERIA)
2. Spawn sub-agents with output contracts
3. Wait for completion (host's callback mechanism)
4. Merge findings (preserve F-<uuid> traceability)
5. Phase gating and exception routing

**Orchestrator Non-Execution Rule:**
The orchestrator MUST NOT directly perform specialist work. It must delegate to appropriate role.

---

## Skill 3: orchestrator-skill (Orchestrator Profile)

**Path:** `orchestrator-skill/SKILL.md`  
**Activation:** `@orchestrate`

**Purpose:** Defines orchestrator behavior profile, exception handling, and phase-driven orchestration.

**Orchestrator Allowed Actions:**
- Phase control
- Task decomposition
- Routing (classify + dispatch)
- Merge and gate management
- Exception dispatch
- Completion gating

**Exception Routing Matrix (Phase × Exception × Role):**

| Phase | Exception | Delegate Role | Expected Output |
|-------|-----------|---------------|-----------------|
| test | impl-bug | code-agent | patch + changed files |
| test | flaky-test | test-agent | repro + root cause |
| integration | api-mismatch | integration-agent | mismatch report |
| deploy-check | config-error | ops-agent | config diff + steps |
| acceptance | requirement-gap | pm-agent | clarified criteria |

---

## Workflow: runbook-brainstorm (Research Harness)

**Path:** `runbook-brainstorm/SKILL.md`  
**Activation:** `@research`

**Purpose:** Complete multi-role research workflow template.

**Round Design:**
| Rounds | Use When | Roles |
|--------|----------|-------|
| 2 | Single goal, clear scope | 1-2 roles |
| 3 | Multiple modules, cross-domain | 3+ roles |

**Role Templates (Technical Research):**
| Role | Direction | Output Contract |
|------|-----------|-----------------|
| arch-agent | System architecture, module boundaries | Module boundaries, call chains, risks |
| deps-agent | Dependency availability, tech stack | Availability, version constraints, alternatives |
| impl-agent | Implementation path, effort | Implementation plan, effort estimate |

**Role Templates (Product Research):**
| Role | Direction | Output Contract |
|------|-----------|-----------------|
| pm-agent | User needs, feature scope | PRD, priorities |
| ux-agent | Interaction design, page flow | UI specs, component states |
| tech-agent | Technical feasibility, API design | Technical proposal |

---

## Agent → Skill Registry

When spawning sub-agents, the **orchestrator injects skills based on role code**. Sub-agents don't auto-load; the orchestrator informs them in spawn prompt.

### Spawn Prompt Standard Format

```
Agent: <role-code>
Task: <specific-goal>
Skill: <skill-path>  ← Injected by orchestrator
Context files: <files-to-read>
Org file: <org-file-path>
Your task ID: <task-id>
Output Contract: <what this role must deliver>
```

### Core Roles (Universal)

| Agent Code | Trigger Keywords | Responsibility | Output Contract | Minimum Skill |
|------------|------------------|----------------|-----------------|---------------|
| arch-agent | architecture, module, system design | System architecture, module boundaries, call paths | Module boundaries, call chains, risk points | runbook-org |
| pm-agent | product, requirements, PRD, features | User needs, feature design | PRD, priorities, acceptance criteria | runbook-org |
| ux-agent | UX, interaction, UI, user experience | Page flow, component states | UI specs, interaction specs | runbook-org |
| research-agent | research, survey, technology selection | Tech research, competitive analysis | Research report with evidence | runbook-org |
| code-agent | implement, write code, development | Code implementation, function design | Code artifacts with test coverage | runbook-org |
| test-agent | test, test cases, coverage, E2E | Unit tests, integration tests | Test results, coverage report | runbook-org |
| deps-agent | dependencies, package management | Dependency availability, version analysis | Availability, constraints, alternatives | runbook-org |
| deploy-agent | deployment, DevOps, CI/CD | Deployment architecture, pipeline | Deploy checklist, release plan | runbook-org |

### Technical Roles (Extended by Domain)

| Agent Code | Trigger Keywords | Responsibility | Output Contract | Minimum Skill |
|------------|------------------|----------------|-----------------|---------------|
| api-agent | API, interface, REST | API design, contracts | API specs, contract definitions | runbook-org |
| data-agent | data, database, storage | Data models, DB design | Data model, schema definitions | runbook-org |
| security-agent | security, permissions, auth | Security design, compliance | Security analysis, permission model | runbook-org |
| perf-agent | performance, optimization | Performance analysis | Bottleneck report, optimization plan | runbook-org |
| infra-agent | infrastructure, operations, monitoring | Infrastructure, alerts | Infrastructure diagram, runbooks | runbook-org |
| integration-agent | integration, API mismatch | Integration testing | Integration report, mismatch fixes | runbook-org |

### Output Contract Column Purpose

> **Why add output contracts?**
> Without explicit output contracts, merge relies on orchestrator interpretation. With output contracts, each role delivers **structured, predictable artifacts** that can be merged deterministically.

**Example:**
- arch-agent without contract → "architecture analysis"
- arch-agent with contract → "Module: auth, api-gateway | Calls: auth → api-gateway → user-service | Risks: session storage, token refresh"

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

## Usage in Codex / Claude Code / pi

These tools don't auto-read skills; reference paths in spawn prompts:

```
Reference skill: /path-to-skills/runbook-org/SKILL.md
Reference skill: /path-to-skills/runbook-multiagent/SKILL.md
Reference skill: /path-to-skills/runbook-brainstorm/SKILL.md
```

Just attach the path, don't copy the full content.

---

## Directory Structure

```
org-runbook-skills/
├── README.md                 # This file
├── .gitignore               # Git ignore rules
├── runbook-org/             # Base operations skill
│   └── SKILL.md
├── runbook-multiagent/      # Orchestration skill
│   └── SKILL.md
├── orchestrator-skill/     # Orchestrator profile
│   └── SKILL.md
├── runbook-brainstorm/      # Research workflow (moves to workflows/)
│   └── SKILL.md
├── exception-routing.md     # Exception taxonomy and routing
└── examples/                # Complete project examples
    ├── schema.md            # Object definitions
    └── workflow.org         # Full execution trace

# Future structure:
skills/
  runbook-org/
  runbook-multiagent/
  orchestrator-skill/
workflows/
  brainstorm-research/

# Ignored by .gitignore (process management):
#   runbook.org               # Runtime task tracking
#   R*_*.md                   # Brainstorm/thinking documents
#   output/                   # Generated outputs
```

---

## Migration Guide

### v1.x → v2.0

| Old | New |
|-----|-----|
| "skills / skill / runbook" triggers | `@runbook-org`, `@runbook-multi`, `@research` |
| Finding as log entry | Finding with F-<uuid>, can be referenced |
| Evidence as list item | Evidence with E-<uuid>, must link to finding |
| Done when "finished" | Done when exit conditions met |
| `subagent_announce` hardcoded | "host's callback mechanism" |
| "15+ min" timing | "host-defined threshold" |
| No exception handling | Exception classification + routing matrix |
| No non-execution rule | Explicit Orchestrator Non-Execution Rule |
| README role table | Role table with output contracts |

### v2.0 → v2.1

| Old (v2.0) | New (v2.1) |
|-------------|------------|
| `:STATUS:` property in task Properties | Use org-mode TODO keyword instead |
| `STATUS: in-progress` | `IN-PROGRESS` keyword |
| `STATUS: done` | `DONE` keyword |
| `STATUS: blocked` | `BLOCKED` keyword |

**Recommended org file header:**
```org
#+TODO: TODO(t) IN-PROGRESS(i) | DONE(d) BLOCKED(b) CANCELLED(c)
```
