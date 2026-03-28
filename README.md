# OpenClaw Skills — Skill Index

> All skills are located at `<skill-name>/SKILL.md`

---

## How to Use

When you say the following, the corresponding skill will automatically activate:

| You Say | Activated Skill | Trigger Words |
|---------|-----------------|---------------|
| "Execute according to skills.md" | `runbook-org` | skills, skill, runbook |
| "Research X for me / Brainstorm Y" | `runbook-brainstorm` | research, brainstorm, analysis |
| "Use multiple roles to do this in parallel" | `runbook-multiagent` | parallel, divide and conquer, multi-role |

---

## Skill 1: runbook-org (Base Layer)

**Path:** `runbook-org/SKILL.md`

**Purpose:** Single agent task execution standard. Org-mode workflow with claim-task / append-finding / attach-evidence / set-status.

**Core Rules:**
- claim-task → Write checkpoint immediately
- Every finding must have evidence source
- On failure, write BLOCKED and switch strategy
- Never retry the same method more than 2 times

---

## Skill 2: runbook-multiagent (Orchestration Layer)

**Path:** `runbook-multiagent/SKILL.md`

**Purpose:** Standards for main agent to manage multiple sub-agent parallel tasks.

**Core Rules:**
- Write checkpoint to parent task immediately after spawning
- Wait for `subagent_announce` events, no polling
- After receiving completion notification, read org and merge into parent task
- No progress for over 15 minutes → Proactively notify user

---

## Skill 3: runbook-brainstorm (Task Layer)

**Path:** `runbook-brainstorm/SKILL.md`

**Purpose:** Complete multi-role research workflow.

**Core Rules:**
- After activation, **ask the user first**: goals/deliverables/scope
- Select role template (arch-agent / pm-agent / ...)
- Design rounds (2 or 3 rounds)
- When disagreements arise, stop and ask the user — don't make decisions for them

---

## Agent → Skill Registry (Extended Version)

When spawning sub-agents, the **main agent injects skills based on role code**. Sub-agents don't auto-load; the main agent informs them in the spawn prompt.

### Spawn Prompt Standard Format

```
Agent: <code-name>
Task: <specific-goal>
Skill: <skill-path>  ← Injected by main agent
Context files: <files-to-read>
Org file: <org-file-path>
```

---

### Core Roles (Universal for All Projects)

| Agent Code | Activation Trigger | Responsibility | Minimum Skill |
|------------|--------------------|----------------|---------------|
| `arch-agent` | architecture/module/system design/layering | system architecture, module boundaries, call paths | `runbook-org` |
| `pm-agent` | product/requirements/feature scope/PRD/features | user needs, feature design, PRD | `runbook-org` |
| `ux-agent` | UX/interaction/UI/user experience/page design | page flow, component states, interaction specs | `runbook-org` |
| `research-agent` | research/survey/technology selection/analysis | tech research, competitive analysis, data collection | `runbook-org` |
| `code-agent` | implement/write code/development/feature dev | code implementation, function design, API implementation | `runbook-org` |
| `test-agent` | test/test cases/coverage/E2E | unit tests, integration tests, test strategy | `runbook-org` |
| `deps-agent` | dependencies/package management/third-party libs | dependency availability, version analysis, alternatives | `runbook-org` |
| `deploy-agent` | deployment/DevOps/CI/CD/release | deployment architecture, CI/CD pipeline, release strategy | `runbook-org` |

### Technical Roles (Extended by Domain)

| Agent Code | Activation Trigger | Responsibility | Minimum Skill |
|------------|--------------------|----------------|---------------|
| `api-agent` | API/interface/protocol/REST | API design, interface contracts, protocol definitions | `runbook-org` |
| `data-agent` | data/data model/database/storage | data models, database design, data flow | `runbook-org` |
| `security-agent` | security/permissions/authentication/compliance | security design, permission models, compliance checks | `runbook-org` |
| `perf-agent` | performance/optimization/bottleneck/load testing | performance analysis, bottleneck identification, optimization plans | `runbook-org` |
| `docs-agent` | documentation/guides/comments/README | technical docs, API docs, user manuals | `runbook-org` |
| `qa-agent` | quality/acceptance/test plan | QA process, acceptance criteria, quality checks | `runbook-org` |
| `frontend-agent` | frontend/React/Vue/UI components | frontend architecture, component design, style guidelines | `runbook-org` |
| `backend-agent` | backend/Python/FastAPI/services | backend architecture, API implementation, business logic | `runbook-org` |
| `mobil-agent` | mobile/iOS/Android/mini-program | mobile adaptation, native interactions, performance | `runbook-org` |
| `ml-agent` | machine learning/model/training/AI | AI model design, training pipeline, inference optimization | `runbook-org` |
| `fintech-agent` | finance/quantitative/trading/risk control | quant strategies, trading interfaces, risk models | `runbook-org` |
| `infra-agent` | infrastructure/operations/monitoring/SRE | infrastructure, monitoring alerts, log analysis | `runbook-org` |

---

### Spawn Principles

1. **One sub-task gets one agent code**. Two unrelated directions are orthogonal → spawn two sub-agents in parallel.
2. **Dependent tasks run sequentially**: API design → API implementation, design first then implement.
3. **Block immediately → notify user**: Don't make decisions for the user.
4. **Merge before spawning new tasks**: Round N all complete → main agent merges → spawn Round N+1 only if needed.

---

## Usage in Codex / Claude Code

These tools don't auto-read skills; reference paths in spawn prompts:

```
Reference skill: /path-to-skills/runbook-org/SKILL.md
Reference skill: /path-to-skills/runbook-brainstorm/SKILL.md
```

Just attach the path, don't copy the full content.
