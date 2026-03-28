# Skill: brainstorm

> **Type**: Task-Specific Skill (Task Layer)
> **Trigger**: Activates when user says "research X" / "brainstorm Y" / "analyze Z"
> **What it does**: Designs multi-role parallel brainstorming → deepening → merging multi-round research workflow, proactively asks users questions to refine the topic
> **Depends on**: runbook-org (base layer) + runbook-multiagent (orchestration layer)
> **Prerequisite**: Before starting, must ask user to confirm: goals/scope/deliverables

---

## What is brainstorm

A complete multi-role research skill. What it does:

```
User's one sentence
  → Clarify goals (proactive questions)
  → Design roles and rounds
  → Parallel brainstorming (multiple sub-agents)
  → Deepen (Round 2)
  → Merge output (Round 3)
  → Push to user
```

---

## 0. Activation Conditions

This skill activates in the following situations:
- User says "research X"
- User says "analyze this project for me"
- User says "brainstorm solutions for Y"
- User says "I'd like to learn about Z"

**First thing after activation:** Do NOT start researching immediately. Instead, **ask the user questions**.

---

## 1. Pre-research Questions (Must Ask First, Don't Skip)

Before starting any research, confirm with the user:

### Question A: Research Goal (Must Ask)
```
I want to help you research "<topic>". I need to confirm a few things first:

1. What is the **research goal**?
   - Want to understand the full picture (exploratory)?
   - Or want to make a specific decision (decision-oriented)?
   - Or want to write a document for others (output-oriented)?
```

### Question B: Deliverable Format (Must Ask)
```
2. What do you want to receive in the end?
   - A research report (Markdown/PDF)?
   - A PRD/technical proposal ready for developers?
   - Or just conclusions in chat?
```

### Question C: Scope Boundaries (Ask If Applicable)
```
3. Do you want to limit the scope?
   - Some areas don't need research (e.g., deployment not considered for now)?
   - Which aspect should be the focus (e.g., more concerned about technical feasibility or user experience)?
```

### Question D: Existing Context (If User Provided Materials)
```
4. You mentioned <context> before. Can I use this information directly?
```

---

## 2. Role Design

Based on topic type, preset role templates:

### Template A: Technical Research Type (Suitable for: project analysis, technology selection, architecture design)

| Role | Research Direction | Output |
|------|-------------------|--------|
| `arch-agent` | System architecture, module boundaries, call paths | Architecture docs |
| `deps-agent` | Dependency availability, tech stack selection | Dependency analysis |
| `impl-agent` | Implementation path, effort estimation | Implementation plan |

### Template B: Product Research Type (Suitable for: PRD generation, competitive analysis, user research)

| Role | Research Direction | Output |
|------|-------------------|--------|
| `pm-agent` | User needs, feature scope, priorities | PRD |
| `ux-agent` | Interaction design, page flow, state machine | UI specs |
| `tech-agent` | Technical feasibility, API design | Technical proposal |

### Template C: Comprehensive Research Type (Suitable for: project status analysis, comprehensive reports)

| Role | Research Direction | Output |
|------|-------------------|--------|
| `research-agent` | Core module analysis | Module findings |
| `product-agent` | User perspective, experience, needs | Product findings |
| `infra-agent` | Infrastructure, deployment, operations | Technical findings |

---

## 3. Round Design

### Standard Rounds (Default: 3 rounds)

```
Round 1: Parallel Brainstorming
  → All roles start researching simultaneously
  → Each produces R1_<Role>_Brainstorm.md
  → Main agent collects results

Round 2: Deepening (Optional, depends on topic complexity)
  → Deepen Round 1 findings
  → Produce R2_<Role>_Deep.md
  → Main agent collects results

Round 3: Merge Output
  → Main agent merges all outputs
  → Generate final document
  → Push to user
```

### Simplified Rounds (2 rounds for quick tasks)

```
Round 1: Parallel Brainstorming (1-2 roles)
Round 2: Direct merge output
```

**When to use 2 rounds vs 3 rounds:**

| Topic Complexity | Recommended Rounds | Description |
|-----------------|-------------------|-------------|
| Single goal, clear scope | 2 rounds | Direct brainstorm → merge |
| Multiple modules, cross-domain | 3 rounds | Brainstorm → deepen → merge |
| Needs cross-section analysis | 3 rounds | Architecture first, then cross-sections, then merge |
| Exploratory topic (unclear what's there) | 3 rounds | Leave enough room for discoveries |

---

## 4. Data Collection Strategy

Each role must collect data before brainstorming.

### Data Collection Order

```
1. User-provided context (highest priority, most reliable)
2. Local files (project files under /workspace/)
3. Web search (batch_web_search)
4. Web content extraction (extract_content_from_websites)
5. Existing research documents (PRDs/reports, etc.)
```

### Collection Priority (Based on Topic Type)

**Technical Research Type:**
```
Priority: project source code / README / architecture docs / API docs
Secondary: official docs / GitHub Issues / tech blogs
Fallback: search engine
```

**Product Research Type:**
```
Priority: user description / existing PRD / competitor screenshots
Secondary: app store reviews / user interview records
Fallback: competitor websites / industry reports
```

---

## 5. Quality Standards

### Finding Quality Ratings

```markdown
★★★ Finding (Core):
- Has specific numbers/facts
- Has clear evidence source
- Can directly support conclusion

★★ Finding (Supporting):
- Has directional judgment but not fully verified
- Has source but secondhand information

★ Finding (Exploratory):
- Speculative judgment
- Needs further verification
```

### Completion Standards (Each Role Must Meet)

- [ ] At least 3 ★★★ findings
- [ ] Every finding has evidence
- [ ] Has clear conclusion (not "maybe/perhaps")
- [ ] Identified topic boundaries and limitations

---

## 6. Output File Naming Convention

```
/workspace/
├── <project-name>/
│   ├── R1_<RoleA>_Brainstorm.md     ← Round 1 Brainstorm
│   ├── R1_<RoleB>_Brainstorm.md
│   ├── R2_<RoleA>_Deep.md           ← Round 2 Deepening
│   ├── R2_<RoleB>_Deep.md
│   ├── R3_<OutputName>_Final.md     ← Round 3 Final Delivery
│   └── SUMMARY.md                   ← Executive Summary (one line per role)
└── org/
    └── <project-name>.org           ← Workflow execution log
```

---

## 7. When to Proactively Ask Users Questions

During research, must stop and ask user in these situations:

| Situation | Question | Why Ask |
|-----------|----------|---------|
| Goal unclear | "Do you want to focus on technical feasibility or user experience?" | Prevent wasted effort |
| Found direction divergence | "About X, there are two conclusions A and B. Which do you prefer?" | Can't make decisions for user |
| Scope needs confirmation | "Does this feature need mobile support?" | Prevent overdoing or underdoing |
| Encountered blocker | "I need you to provide Y at this step to continue" | External dependencies can't be bypassed |
| After Round 1 complete | "These are Round 1 findings. What aspect do you care most about?" | Let user participate in direction adjustment |

**Question format:**
```
I found X, but there are two possible interpretations:
A. <Interpretation A> → Will affect <conclusion 1>
B. <Interpretation B> → Will affect <conclusion 2>

Which direction do you care more about?
```

---

## 8. Brainstorm Task Structured Template

In the org file, each brainstorm task structure:

```org
*** TODO <research topic>
:PROPERTIES:
:ID: brainstorm-XXX
:OWNER: main-agent
:STATUS: in-progress
:TYPE: brainstorm
:ROUND: <current round>
:END:

- Topic :: <user's original description>
- Research Goal :: <goal confirmed through questions>
- Deliverable Format :: <PRD / report / execution plan>
- Role Configuration :: <Template A/B/C>
- Rounds :: <2 rounds / 3 rounds>
- User Constraints :: <explicit scope limits from user>

- User Question History ::
  - [time] Q: <question> → A: <answer>

- Round-1 Status :: ✅/🔄/⬜
- Round-2 Status :: ✅/🔄/⬜
- Round-3 Status :: ✅/🔄/⬜

- Findings ::
- Evidence ::
- Next Actions ::
```

---

## 9. Quality Self-Check (Execute Before Merging)

Before Round 3 merge, main agent self-checks:

```
□ All sub-agents completed?
□ Every finding has ★ rating?
□ Any contradictory findings? (Yes → must confirm with user)
□ Do findings cover user-confirmed research goals?
□ Does final deliverable format match user requirements?
□ Are research limitations clearly marked?
```

---

## 10. Relationship with runbook-multiagent

brainstorm is a **specific application instance** of runbook-multiagent:

```
brainstorm skill
  → Uses runbook-multiagent's spawn + merge process
  → Has built-in role templates and round design (no need to design each time)
  → Has built-in quality standards and question timing
```

When a brainstorm task is executing:
- Main agent spawns sub-agents according to brainstorm's role templates
- Sub-agents strictly follow runbook-org rules when writing org
- Main agent executes merge according to runbook-multiagent's checklist

---

*This is the brainstorm skill (task-specific layer). Depends on runbook-org + runbook-multiagent.*
