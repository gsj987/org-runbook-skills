# Bug Report: Phase Gate Not Advancing

> **Found**: 2026-04-04  
> **Severity**: High (breaks core PRD invariant)  
> **Status**: Fixed ✅

---

## Summary

During full-chain E2E testing, phase gates remained in `TODO` state after all child tasks completed. The root cause was **two bugs** in `workflow.advancePhase` implementation.

---

## Bug #1: `workflow.advancePhase` Was a Stub

**File**: `adapters/pi/extension.ts`  
**Lines**: ~978-1003 (original)

### Problem

```typescript
// ❌ WAS: Just returned text, never touched the file
execute: async (_toolCallId, params) => {
  const { nextPhase } = params as { nextPhase: string };
  return {
    content: [{ type: "text", text: `Phase advanced to ${nextPhase}` }],
    details: { success: true, checkpoint: `🔄 Phase: ${nextPhase}` },
  };
  // ← No file writes. No :PHASE: update. No gate DONE.
};
```

**Impact**: Orchestrator called `workflow.advancePhase("design")` and got a success response, but:
- Parent task `:PHASE:` stayed `"discovery"`
- Gate `"discovery → design"` stayed `TODO`
- No actual state change occurred

### Fix

Implemented real phase advancement logic:
1. Find current phase from parent task's `:PHASE:` property
2. Validate no phase skipping
3. Update `:PHASE:` to `nextPhase`
4. Mark matching gate `*** TODO Phase: X → Y` as `*** DONE Phase: X → Y`
5. Write changes to workflow file

---

## Bug #2: `IN-PROGRESS` Detection Used Exact Match

**File**: `adapters/pi/extension.ts`  
**Line**: ~1004 (original)

### Problem

```typescript
// ❌ BUGGY: Exact equality check
if (trimmed === "** IN-PROGRESS") {
  inParentProperties = true;
}

// Runbook actually has:
// ** IN-PROGRESS <overall coordination>
//                  ^^^^^^^^^^^^^^^^^^^^^
// Title suffix prevents match → currentPhase always "" → throws error
```

**Impact**: The `advancePhase` function threw "Could not determine current phase" because it could never enter the parent task's properties block. Orchestrator saw the error and reported failure.

### Fix

```typescript
// ✅ FIXED: Prefix match
if (trimmed.startsWith("** IN-PROGRESS")) {
  inParentProperties = true;
}
```

---

## Orchestrator Skill Gap

**File**: `orchestrator-skill/SKILL.md`

### Problem

The orchestrator skill documented the `advance-phase` protocol and `workflow.advancePhase` tool, but:
- No explicit step said "after all tasks DONE, you MUST call advancePhase"
- The "Finding Persistence Pattern" ended at `workflow.update()`
- Orchestrator didn't know phase advancement was required

### Fix

Added new section "Phase Advancement Pattern ⚠️ REQUIRED AFTER COMPLETION":

```markdown
### Phase Advancement Pattern ⚠️ REQUIRED AFTER COMPLETION

**After all child tasks in a phase are DONE, the orchestrator MUST advance the phase!**

Correct flow (extended):
```
1. worker.spawn(...)
2. worker.awaitResult(...)
3. workflow.appendFinding(...)
4. workflow.setStatus(taskId, "DONE")
5. workflow.update(workflowPath)
6. workflow.advancePhase({ nextPhase: "design" })  ← ADDED
```

Phase sequence: discovery → design → implementation → test → integration → deploy-check → acceptance
```

---

## Verification

### Before Fix

```
*** TODO Phase: discovery → design     ← Still TODO
*** TODO Phase: design → implementation
```

### After Fix

```
*** DONE Phase: discovery → design     ← ✅ Gate passed
:PHASE: design                          ← ✅ Phase advanced
*** TODO Phase: design → implementation ← ✅ Next gate waiting
```

### E2E Test Results

| Criterion | Result |
|-----------|--------|
| Gate marked DONE | ✅ |
| Parent PHASE updated | ✅ |
| All scan tasks DONE | ✅ |
| 0 HTTP failures | ✅ |
| Orchestrator correctly judged completion | ✅ |

---

## Files Changed

| File | Change |
|------|--------|
| `adapters/pi/extension.ts` | `advancePhase` stub → real impl + `startsWith` fix |
| `orchestrator-skill/SKILL.md` | Added phase advancement pattern section |
| `deploy.sh` | (Fixed earlier: referee/types symlinks) |

**Commits**: `4bd9c37` (this fix), `22506e1` (deploy.sh symlinks), `45c373f` (ensureTaskExists), `04a1e62` (cleanup)

---

## PRD Compliance After Fix

| Constraint | Status |
|-----------|--------|
| Phase progression requires child completion | ✅ Orchestrator advances after completion |
| Phase gate marked DONE after pass | ✅ |
| Parent task PHASE updated | ✅ |
| System has explicit next-step loop | ✅ Phase gates + orchestrator control |
| No phase skipping | ✅ Validated in `advancePhase` |
