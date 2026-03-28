---
name: runbook-brainstorm
description: Multi-role research workflow with brainstorming → deepening → merging. Activates when user says "research X" / "brainstorm Y" / "analyze Z".
depends on: runbook-org, runbook-multiagent
---

Complete multi-role research process: clarify goals → parallel brainstorming → deepen → merge → deliver.

## Prerequisites

**Before starting, ask user to confirm:**
1. **Research goal**: Exploratory / Decision-oriented / Output-oriented?
2. **Deliverable format**: Report (Markdown/PDF) / PRD / Just chat conclusions?
3. **Scope boundaries**: What to include/exclude?

## Role Templates

### Template A: Technical Research
| Role | Direction | Output |
|------|-----------|--------|
| `arch-agent` | System architecture, module boundaries | Architecture docs |
| `deps-agent` | Dependency availability, tech stack | Dependency analysis |
| `impl-agent` | Implementation path, effort estimation | Implementation plan |

### Template B: Product Research
| Role | Direction | Output |
|------|-----------|--------|
| `pm-agent` | User needs, feature scope, priorities | PRD |
| `ux-agent` | Interaction design, page flow | UI specs |
| `tech-agent` | Technical feasibility, API design | Technical proposal |

### Template C: Comprehensive Research
| Role | Direction | Output |
|------|-----------|--------|
| `research-agent` | Core module analysis | Module findings |
| `product-agent` | User perspective, needs | Product findings |
| `infra-agent` | Infrastructure, deployment | Technical findings |

## Round Design

### Standard (3 rounds)
```
Round 1: Parallel Brainstorming
  → All roles research simultaneously
  → Produce R1_<Role>_Brainstorm.md

Round 2: Deepening (optional)
  → Deepen Round 1 findings
  → Produce R2_<Role>_Deep.md

Round 3: Merge Output
  → Generate FINAL_<OutputName>.md
```

### Simplified (2 rounds)
```
Round 1: Parallel Brainstorming (1-2 roles)
Round 2: Direct merge output
```

**When to use:**
| Complexity | Rounds |
|------------|--------|
| Single goal, clear scope | 2 |
| Multiple modules, cross-domain | 3 |
| Needs cross-section analysis | 3 |
| Exploratory (unclear) | 3 |

## Data Collection Order

```
1. User-provided context (highest priority)
2. Local files (/workspace/)
3. Web search
4. Web content extraction
5. Existing research documents
```

## Quality Standards

### Finding Ratings
```markdown
★★★ Core finding: specific facts, clear source, supports conclusion
★★ Supporting: directional judgment, needs verification
★ Exploratory: speculation, needs further verification
```

### Completion Checklist
- [ ] At least 3 ★★★ findings per role
- [ ] Every finding has evidence
- [ ] Clear conclusion (not "maybe/perhaps")
- [ ] Topic boundaries identified

## When to Ask User

| Situation | Question |
|-----------|----------|
| Goal unclear | "Focus on technical feasibility or user experience?" |
| Direction divergence | "Two conclusions A/B — which do you prefer?" |
| Scope needs confirmation | "Does this feature need mobile support?" |
| Blocker | "Need you to provide Y to continue" |
| After Round 1 | "What aspect do you care most about?" |

## Output Structure
```
/workspace/<project-name>/
├── R1_<RoleA>_Brainstorm.md
├── R2_<RoleA>_Deep.md
├── R3_<OutputName>_Final.md
└── SUMMARY.md
```

## Quality Self-Check (Before Merge)
```
□ All sub-agents completed?
□ Every finding has ★ rating?
□ No contradictory findings?
□ Findings cover confirmed research goals?
□ Deliverable format matches user request?
□ Limitations clearly marked?
```
