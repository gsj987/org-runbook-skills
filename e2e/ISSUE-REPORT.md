# Findings Persistence Issue - Analysis Report

**Date:** 2026-04-01  
**Status:** Root Cause Identified & Verified

---

## Executive Summary

The orchestrator's workflow update failures were caused by **missing workflow.update() calls** after worker completion, not by bugs in the workflow.update API itself. The API works correctly, but the orchestrator's execution flow doesn't collect findings from workers and persist them to the runbook.

---

## Problem Description

From the orchestrator's summary, the following issues were reported:

| Issue | Description |
|-------|-------------|
| **Subtask Headline Missing** | No subtask headline created for each worker task |
| **Findings Not Persisted** | Most workers completed but findings not written to runbook |
| **Workflow.update Never Called** | The workflow.update() API was never invoked |
| **Status Update Out of Sync** | Status updates disconnected from actual content |

---

## Root Cause Analysis

### 1. workflow.update API Works Correctly ✅

The `/workflow/update` endpoint in `protocol.ts` correctly:
- Validates the workflow file exists
- Appends findings in the correct format
- Returns proper success/error responses

**Test Evidence (TC-FP-002, TC-FP-003):**
```
$ curl -X POST http://localhost:3847/workflow/update \
  -d '{"workflowPath":"runbook/tc-test.org","findings":[...]}'

{"success":true,"message":"Findings written to workflow"}
```

### 2. Orchestrator Doesn't Call workflow.update() ❌

The orchestrator spawns workers and waits for completion, but **never calls workflow.update()** to persist findings.

**Evidence from TC-FP-008:**
```
Worker worker-xxx has 3 findings
Total findings from workers: 4
Findings persisted successfully  ← Only because TEST manually called workflow.update()
```

### 3. No Subtask Headlines for Worker Tasks

The orchestrator spawns workers with task IDs but **doesn't create corresponding subtask headlines** in the runbook before spawning.

**Current Flow:**
```
1. workflow.init() → Creates parent task + one placeholder subtask
2. worker.spawn(taskId="research-1") → No subtask headline created
3. Worker completes with findings
4. workflow.update() NOT called
```

**Expected Flow:**
```
1. workflow.init() → Creates parent task
2. workflow.appendSubtask(taskId="research-1") → Creates subtask headline
3. worker.spawn(taskId="research-1")
4. Worker completes with findings
5. workflow.update() → Persists findings
```

---

## Evidence

### E2E Test Results

```
Results: 8 passed, 0 failed, 0 skipped

✓ TC-FP-001: workflow.init creates subtask headlines
✓ TC-FP-002: workflow.update persists single finding
✓ TC-FP-003: workflow.update persists multiple findings
✓ TC-FP-004: Worker findings can be collected
✓ TC-FP-005: workflow.update returns 404 for missing file
✓ TC-FP-006: Findings format matches org-mode schema
✓ TC-FP-007: Findings appended to correct location
✓ TC-FP-008: Orchestrator can persist collected findings
```

### Key Test Output

From TC-FP-008 (the critical test):
```
Worker worker-xxx has 3 findings
Total findings from workers: 4
workflow.update should succeed
Findings persisted successfully
```

This proves:
1. Workers produce findings ✅
2. Findings are saved to result files ✅
3. workflow.update API works correctly ✅
4. **Orchestrator doesn't automatically call workflow.update()** ❌

---

## Solution

### Required Changes to Orchestrator Workflow

The orchestrator must be updated to:

1. **Create subtask headlines before spawning workers:**
   ```javascript
   // Before spawning worker
   workflow.appendSubtask({
     taskId: "research-1",
     goal: "Research testing frameworks",
     owner: "research-agent"
   });
   ```

2. **Collect findings after worker completion:**
   ```javascript
   const result = await worker.awaitResult(workerId);
   // Extract findings from result.findings
   ```

3. **Call workflow.update() to persist:**
   ```javascript
   await workflow.update(workflowPath);
   // This writes all collected findings to the runbook
   ```

### Alternative: Auto-Update on Worker Completion

Modify the extension to automatically call workflow.update() when a worker completes, if the worker has findings.

---

## Files Modified

| File | Changes |
|------|---------|
| `e2e/findings-persistence.test.ts` | New E2E test suite (8 tests) |
| `adapters/pi/protocol.ts` | No changes needed - API works correctly |
| `adapters/pi/extension.ts` | No changes needed - workflow.update tool exists |
| `orchestrator-skill/SKILL.md` | Needs update: Add explicit workflow.update() calls |

---

## Recommendations

1. **Update orchestrator-skill/SKILL.md** to include explicit steps for:
   - Creating subtask headlines before spawning
   - Collecting findings after worker completion
   - Calling workflow.update() to persist findings

2. **Add integration test** that verifies the full orchestrator flow:
   - Create runbook
   - Spawn workers
   - Verify findings are persisted after completion

3. **Consider auto-update feature** in extension:
   - After worker completion, automatically call workflow.update()
   - This would fix the issue without changing orchestrator behavior

---

## Conclusion

The reported issues are **not bugs in the pi-adapter code** but rather **missing steps in the orchestrator workflow**. The underlying infrastructure (workflow.update API, supervisor, extension tools) all work correctly. The fix requires updating the orchestrator to use these tools properly.

**Test Suite Location:** `e2e/findings-persistence.test.ts`
