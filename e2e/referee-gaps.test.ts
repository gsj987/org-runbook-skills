#!/usr/bin/env npx ts-node --esm
/**
 * Referee Gap Tests - E2E Tests for G1, G2, G3, G4 Implementations
 * 
 * Tests coverage for:
 * - G1: No-Op Detection (D3)
 * - G2: MERGE parent_updates validation
 * - G3: Evidence type strict validation
 * - G4: CANCEL_TASK / REPLAN_SUBTASKS actions
 * 
 * Usage:
 *   cd adapters/pi
 *   npx ts-node --esm ../../e2e/referee-gaps.test.ts
 */

import { strict as assert } from 'assert';
import { createReferee, createActionParser } from '../adapters/pi/referee/index.ts';
import type { OrgState, OrchestratorAction } from '../adapters/pi/referee/types/referee.ts';

// ============================================================
// Test Utilities
// ============================================================

function createTestOrgState(overrides?: Partial<OrgState>): OrgState {
  return {
    workflowPath: "test.org",
    tasks: new Map([
      ["parent-001", {
        id: "parent-001",
        status: "IN-PROGRESS",
        phase: "implementation",
        owner: "orchestrator",
        findings: [],
        evidence: [],
      }],
      ["child-001", {
        id: "child-001",
        status: "DONE",
        phase: "implementation",
        owner: "code-agent",
        parent: "parent-001",
        findings: [
          { id: "F-001", content: "Found bug", rating: "★★★", timestamp: "" },
        ],
        evidence: [
          { id: "E-001", type: "file", source: "src/bug.ts", finding_ref: "F-001", rating: "★★★", timestamp: "" },
        ],
      }],
      ["child-002", {
        id: "child-002",
        status: "IN-PROGRESS",
        phase: "implementation",
        owner: "code-agent",
        parent: "parent-001",
        findings: [],
        evidence: [],
      }],
      ["blocked-task", {
        id: "blocked-task",
        status: "BLOCKED",
        phase: "discovery",
        owner: "orchestrator",
        findings: [],
        evidence: [],
      }],
    ]),
    ...overrides,
  } as OrgState;
}

// ============================================================
// G1: No-Op Detection Tests (Rule D3)
// ============================================================

console.log("\n============================================================");
console.log("  G1: No-Op Detection Tests (Rule D3)");
console.log("============================================================");

console.log("\nTC-D3-001: should reject ADVANCE_PHASE when phase unchanged");
{
  const referee = createReferee({ strictMode: true });
  const orgState = createTestOrgState({
    tasks: new Map([
      ["parent-001", {
        id: "parent-001",
        status: "IN-PROGRESS",
        phase: "implementation",
        owner: "orchestrator",
        findings: [],
        evidence: [],
      }],
    ]),
  });
  referee.setOrgState(orgState);

  const action = {
    action: "ADVANCE_PHASE",
    parent_task_id: "parent-001",
    reason: "Phase is done",
    payload: {
      from_phase: "implementation",
      to_phase: "implementation", // Same phase = no-op
      gate_basis: {
        required_roles: [],
        completed_child_tasks: [],
        evidence_refs: [],
      },
    },
    expected_effect: "phase advanced",
  };

  const validation = referee.validate(action as OrchestratorAction);
  assert(validation.ok === false, "Should reject action with no state change");
  const hasNoOpError = validation.errors.some(e => e.code === "NO_STATE_CHANGE");
  assert(hasNoOpError, "Should have NO_STATE_CHANGE error");
  console.log("  ✓ PASSED");
}

console.log("\nTC-D3-002: should reject MERGE when no findings added");
{
  const referee = createReferee({ strictMode: true });
  const orgState = createTestOrgState({
    tasks: new Map([
      ["parent-001", {
        id: "parent-001",
        status: "IN-PROGRESS",
        phase: "implementation",
        owner: "orchestrator",
        findings: [{ id: "F-001", content: "Already has finding", rating: "★★★", timestamp: "" }],
        evidence: [],
      }],
      ["child-001", {
        id: "child-001",
        status: "DONE",
        phase: "implementation",
        owner: "code-agent",
        findings: [],
        evidence: [],
      }],
    ]),
  });
  referee.setOrgState(orgState);

  const action = {
    action: "MERGE_SUBTASK_RESULT",
    parent_task_id: "parent-001",
    reason: "Child complete",
    payload: {
      child_task_id: "child-001",
      summary: "Done",
      finding_refs: [], // No new findings
      evidence_refs: [], // No new evidence
    },
    expected_effect: "merged",
  };

  const validation = referee.validate(action as OrchestratorAction);
  assert(validation.ok === false, "Should reject MERGE with no state change");
  console.log("  ✓ PASSED");
}

console.log("\nTC-D3-003: should allow MERGE with new findings in non-strict mode");
{
  const referee = createReferee({ strictMode: false });
  const orgState = createTestOrgState();
  referee.setOrgState(orgState);

  const action = {
    action: "MERGE_SUBTASK_RESULT",
    parent_task_id: "parent-001",
    reason: "Child complete with findings",
    payload: {
      child_task_id: "child-001",
      summary: "Implementation complete",
      finding_refs: ["F-001"],
      evidence_refs: ["E-001"],
    },
    expected_effect: "merged",
  };

  const validation = referee.validate(action as OrchestratorAction);
  assert(validation.ok === true, "Should allow MERGE with findings");
  console.log("  ✓ PASSED");
}

console.log("\nTC-D3-004: should validate state change explicitly");
{
  const referee = createReferee({ strictMode: true });
  const orgState = createTestOrgState();
  referee.setOrgState(orgState);

  const action = {
    action: "SPAWN_SUBTASK",
    parent_task_id: "parent-001",
    reason: "New task needed",
    payload: {
      child_task_id: "new-child",
      title: "New Task",
      role: "code-agent",
      phase: "implementation",
      depends_on: [],
    },
    expected_effect: "child task created",
  };

  const validation = referee.validate(action as OrchestratorAction);
  assert(validation.ok === true, "SPAWN should be valid");
  console.log("  ✓ PASSED");
}

// ============================================================
// G2: MERGE parent_updates Validation
// ============================================================

console.log("\n============================================================");
console.log("  G2: MERGE parent_updates Validation");
console.log("============================================================");

console.log("\nTC-MERGE-001: should validate findings_append format");
{
  const referee = createReferee();
  const orgState = createTestOrgState();
  referee.setOrgState(orgState);

  const action = {
    action: "MERGE_SUBTASK_RESULT",
    parent_task_id: "parent-001",
    reason: "Child complete",
    payload: {
      child_task_id: "child-001",
      summary: "Implementation complete",
      finding_refs: ["F-001"],
      evidence_refs: ["E-001"],
      parent_updates: {
        findings_append: "not an array", // Invalid
      },
    },
    expected_effect: "merged",
  };

  const validation = referee.validate(action as OrchestratorAction);
  assert(validation.ok === false, "Should reject invalid findings_append");
  const hasInvalidUpdates = validation.errors.some(e => e.code === "INVALID_PARENT_UPDATES");
  assert(hasInvalidUpdates, "Should have INVALID_PARENT_UPDATES error");
  console.log("  ✓ PASSED");
}

console.log("\nTC-MERGE-002: should validate next_actions_append format");
{
  const referee = createReferee();
  const orgState = createTestOrgState();
  referee.setOrgState(orgState);

  const action = {
    action: "MERGE_SUBTASK_RESULT",
    parent_task_id: "parent-001",
    reason: "Child complete",
    payload: {
      child_task_id: "child-001",
      summary: "Implementation complete",
      finding_refs: ["F-001"],
      evidence_refs: ["E-001"],
      parent_updates: {
        next_actions_append: 123, // Invalid - not an array
      },
    },
    expected_effect: "merged",
  };

  const validation = referee.validate(action as OrchestratorAction);
  assert(validation.ok === false, "Should reject invalid next_actions_append");
  const hasInvalidUpdates = validation.errors.some(e => e.code === "INVALID_PARENT_UPDATES");
  assert(hasInvalidUpdates, "Should have INVALID_PARENT_UPDATES error");
  console.log("  ✓ PASSED");
}

console.log("\nTC-MERGE-003: should accept valid parent_updates");
{
  const referee = createReferee();
  const orgState = createTestOrgState();
  referee.setOrgState(orgState);

  const action = {
    action: "MERGE_SUBTASK_RESULT",
    parent_task_id: "parent-001",
    reason: "Child complete",
    payload: {
      child_task_id: "child-001",
      summary: "Implementation complete",
      finding_refs: ["F-001"],
      evidence_refs: ["E-001"],
      parent_updates: {
        findings_append: [
          "New finding from merge",
          "Another finding",
        ],
        next_actions_append: [
          "Review code",
          "Write tests",
        ],
      },
    },
    expected_effect: "merged",
  };

  const validation = referee.validate(action as OrchestratorAction);
  assert(validation.ok === true, "Should accept valid parent_updates");
  console.log("  ✓ PASSED");
}

// ============================================================
// G3: Evidence Type Strict Validation
// ============================================================

console.log("\n============================================================");
console.log("  G3: Evidence Type Strict Validation");
console.log("============================================================");

console.log("\nTC-EVID-001: should reject evidence types not in allowed list for implementation phase");
{
  const referee = createReferee({ validatePhaseGates: true });
  const orgState: OrgState = {
    workflowPath: "test.org",
    tasks: new Map([
      ["parent-001", {
        id: "parent-001",
        status: "IN-PROGRESS",
        phase: "implementation",
        owner: "orchestrator",
        findings: [
          { id: "F-001", content: "Research finding", rating: "★★★", timestamp: "" },
          { id: "F-002", content: "Another finding", rating: "★★★", timestamp: "" },
        ],
        evidence: [
          // blog type is NOT in allowed list for implementation phase
          { id: "E-blog", type: "blog", source: "https://example.com", finding_ref: "F-001", rating: "★", timestamp: "" },
          { id: "E-blog2", type: "blog", source: "https://another.com", finding_ref: "F-002", rating: "★", timestamp: "" },
        ],
      }],
      ["child-001", {
        id: "child-001",
        status: "DONE",
        phase: "implementation",
        owner: "code-agent",
        parent: "parent-001", // Must have parent reference!
        findings: [],
        evidence: [],
      }],
    ]),
  };
  referee.setOrgState(orgState);

  const action = {
    action: "ADVANCE_PHASE",
    parent_task_id: "parent-001",
    reason: "Implementation complete",
    payload: {
      from_phase: "implementation",
      to_phase: "test",
      gate_basis: {
        required_roles: ["code-agent"],
        completed_child_tasks: ["child-001"],
        evidence_refs: ["E-blog", "E-blog2"], // blog type - not allowed
      },
    },
    expected_effect: "phase advanced",
  };

  const validation = referee.validate(action as OrchestratorAction);
  // Implementation phase only allows file, command, agent-output
  // blog type should fail
  const hasEvidenceTypeError = validation.errors.some(e => e.code === "EVIDENCE_TYPE_NOT_ALLOWED");
  assert(hasEvidenceTypeError, "Should reject blog evidence type for implementation phase");
  console.log("  ✓ PASSED");
}

console.log("\nTC-EVID-002: should allow evidence types in allowed list");
{
  // Create org state with enough evidence (min_evidence: 2 for implementation)
  // and child task properly linked to parent
  const orgState: OrgState = {
    workflowPath: "test.org",
    tasks: new Map([
      ["parent-001", {
        id: "parent-001",
        status: "IN-PROGRESS",
        phase: "implementation",
        owner: "orchestrator",
        findings: [
          { id: "F-001", content: "Found bug", rating: "★★★", timestamp: "" },
          { id: "F-002", content: "Fixed bug", rating: "★★★", timestamp: "" },
        ],
        evidence: [
          { id: "E-001", type: "file", source: "src/bug.ts", finding_ref: "F-001", rating: "★★★", timestamp: "" },
          { id: "E-002", type: "command", source: "npm test", finding_ref: "F-002", rating: "★★★", timestamp: "" },
        ],
      }],
      ["child-001", {
        id: "child-001",
        status: "DONE",
        phase: "implementation",
        owner: "code-agent",
        parent: "parent-001", // Must have parent reference!
        findings: [],
        evidence: [],
      }],
    ]),
  };
  
  const referee = createReferee({ validatePhaseGates: true });
  referee.setOrgState(orgState);

  const action = {
    action: "ADVANCE_PHASE",
    parent_task_id: "parent-001",
    reason: "Implementation complete",
    payload: {
      from_phase: "implementation",
      to_phase: "test",
      gate_basis: {
        required_roles: ["code-agent"],
        completed_child_tasks: ["child-001"],
        evidence_refs: ["E-001", "E-002"], // file and command types (both allowed)
      },
    },
    expected_effect: "phase advanced",
  };

  const validation = referee.validate(action as OrchestratorAction);
  console.log("  DEBUG: validation ok:", validation.ok);
  console.log("  DEBUG: errors:", JSON.stringify(validation.errors.map(e => ({ code: e.code, message: e.message }))));
  // file and command types are both allowed for implementation phase
  assert(validation.ok === true, "Should allow file evidence type");
  console.log("  ✓ PASSED");
}

console.log("\nTC-EVID-003: should allow web evidence in discovery phase");
{
  const referee = createReferee({ validatePhaseGates: true });
  const orgState: OrgState = {
    workflowPath: "test.org",
    tasks: new Map([
      ["parent-001", {
        id: "parent-001",
        status: "IN-PROGRESS",
        phase: "discovery",
        owner: "orchestrator",
        findings: [
          { id: "F-001", content: "Research finding", rating: "★★★", timestamp: "" },
          { id: "F-002", content: "Another finding", rating: "★★★", timestamp: "" },
          { id: "F-003", content: "Third finding", rating: "★★★", timestamp: "" },
        ],
        evidence: [
          { id: "E-web", type: "web", source: "https://docs.example.com", finding_ref: "F-001", rating: "★★", timestamp: "" },
          { id: "E-blog", type: "blog", source: "https://blog.example.com", finding_ref: "F-002", rating: "★", timestamp: "" },
        ],
      }],
      ["child-001", {
        id: "child-001",
        status: "DONE",
        phase: "discovery",
        owner: "research-agent",
        parent: "parent-001", // Must have parent reference!
        findings: [],
        evidence: [],
      }],
    ]),
  };
  referee.setOrgState(orgState);

  const action = {
    action: "ADVANCE_PHASE",
    parent_task_id: "parent-001",
    reason: "Discovery complete",
    payload: {
      from_phase: "discovery",
      to_phase: "design",
      gate_basis: {
        required_roles: ["research-agent"],
        completed_child_tasks: ["child-001"],
        evidence_refs: ["E-web", "E-blog"],
      },
    },
    expected_effect: "phase advanced",
  };

  const validation = referee.validate(action as OrchestratorAction);
  console.log("  DEBUG: validation ok:", validation.ok);
  console.log("  DEBUG: errors:", JSON.stringify(validation.errors.map(e => ({ code: e.code, message: e.message }))));
  // discovery phase allows all evidence types (no allowed_evidence_types restriction)
  assert(validation.ok === true, "Should allow web evidence in discovery phase");
  console.log("  ✓ PASSED");
}

// ============================================================
// G4: CANCEL_TASK / REPLAN_SUBTASKS Actions
// ============================================================

console.log("\n============================================================");
console.log("  G4: CANCEL_TASK / REPLAN_SUBTASKS Actions");
console.log("============================================================");

console.log("\nTC-OPT-001: should accept valid CANCEL_TASK action");
{
  const referee = createReferee();
  const orgState = createTestOrgState();
  referee.setOrgState(orgState);

  const action = {
    action: "CANCEL_TASK",
    parent_task_id: "parent-001",
    reason: "This task is no longer needed due to scope change. User approved cancellation.",
    payload: {
      task_id: "child-002",
      reason: "No longer needed",
      alternatives: ["Remove feature", "Defer to next sprint"],
    },
    expected_effect: "task cancelled",
  };

  const validation = referee.validate(action as OrchestratorAction);
  assert(validation.ok === true, "Should accept valid CANCEL_TASK");
  console.log("  ✓ PASSED");
}

console.log("\nTC-OPT-002: should reject CANCEL_TASK without reason");
{
  const referee = createReferee();
  const orgState = createTestOrgState();
  referee.setOrgState(orgState);

  const action = {
    action: "CANCEL_TASK",
    parent_task_id: "parent-001",
    reason: "Too short",
    payload: {
      task_id: "child-002",
      reason: "x", // Task reason too short
    },
    expected_effect: "task cancelled",
  };

  const validation = referee.validate(action as OrchestratorAction);
  assert(validation.ok === false, "Should reject CANCEL_TASK with short reason");
  const hasReasonError = validation.errors.some(e => e.code === "INVALID_REASON");
  assert(hasReasonError, "Should have INVALID_REASON error");
  console.log("  ✓ PASSED");
}

console.log("\nTC-OPT-003: should accept valid REPLAN_SUBTASKS action");
{
  const referee = createReferee();
  const orgState = createTestOrgState();
  referee.setOrgState(orgState);

  const action = {
    action: "REPLAN_SUBTASKS",
    parent_task_id: "parent-001",
    reason: "Current plan needs adjustment based on discovery findings.",
    payload: {
      current_tasks: ["child-001", "child-002"],
      completed_tasks: ["child-001"],
      failed_tasks: [],
      new_plan: [
        { task_id: "new-child-1", title: "New Task 1", role: "code-agent", depends_on: [] },
        { task_id: "new-child-2", title: "New Task 2", role: "test-agent", depends_on: ["new-child-1"] },
      ],
    },
    expected_effect: "tasks replanned",
  };

  const validation = referee.validate(action as OrchestratorAction);
  assert(validation.ok === true, "Should accept valid REPLAN_SUBTASKS");
  console.log("  ✓ PASSED");
}

console.log("\nTC-OPT-004: should reject REPLAN_SUBTASKS with empty new_plan");
{
  const referee = createReferee();
  const orgState = createTestOrgState();
  referee.setOrgState(orgState);

  const action = {
    action: "REPLAN_SUBTASKS",
    parent_task_id: "parent-001",
    reason: "Replanning subtasks with valid reason",
    payload: {
      current_tasks: ["child-001"],
      completed_tasks: [],
      failed_tasks: [],
      new_plan: [], // Empty plan
    },
    expected_effect: "tasks replanned",
  };

  const validation = referee.validate(action as OrchestratorAction);
  assert(validation.ok === false, "Should reject REPLAN_SUBTASKS with empty new_plan");
  const hasTaskError = validation.errors.some(e => e.code === "INVALID_TASK_ID");
  assert(hasTaskError, "Should have INVALID_TASK_ID error");
  console.log("  ✓ PASSED");
}

console.log("\nTC-OPT-005: should reject REPLAN_SUBTASKS with missing role");
{
  const referee = createReferee();
  const orgState = createTestOrgState();
  referee.setOrgState(orgState);

  const action = {
    action: "REPLAN_SUBTASKS",
    parent_task_id: "parent-001",
    reason: "Replanning subtasks with valid reason",
    payload: {
      current_tasks: [],
      completed_tasks: [],
      failed_tasks: [],
      new_plan: [
        { task_id: "new-child", title: "New Task", role: "", depends_on: [] }, // Missing role
      ],
    },
    expected_effect: "tasks replanned",
  };

  const validation = referee.validate(action as OrchestratorAction);
  assert(validation.ok === false, "Should reject REPLAN_SUBTASKS with missing role");
  const hasRoleError = validation.errors.some(e => e.code === "INVALID_ROLE");
  assert(hasRoleError, "Should have INVALID_ROLE error");
  console.log("  ✓ PASSED");
}

console.log("\nTC-OPT-006: should parse CANCEL_TASK from JSON");
{
  const parser = createActionParser();

  const rawOutput = `{
  "action": "CANCEL_TASK",
  "parent_task_id": "parent-001",
  "reason": "Task no longer needed",
  "payload": {
    "task_id": "child-002",
    "reason": "User cancelled feature request"
  },
  "expected_effect": "task cancelled"
}`;

  const result = parser.parse(rawOutput);
  console.log("  DEBUG: parse result:", JSON.stringify(result));
  assert(result.success === true, "Should parse CANCEL_TASK");
  assert(result.action?.action === "CANCEL_TASK", "Action type should be CANCEL_TASK");
  console.log("  ✓ PASSED");
}

console.log("\nTC-OPT-007: should parse REPLAN_SUBTASKS from JSON");
{
  const parser = createActionParser();

  const rawOutput = `{
  "action": "REPLAN_SUBTASKS",
  "parent_task_id": "parent-001",
  "reason": "Adjusting plan based on findings",
  "payload": {
    "current_tasks": ["old-001"],
    "completed_tasks": ["old-001"],
    "failed_tasks": [],
    "new_plan": [
      { "task_id": "new-001", "title": "New Work", "role": "code-agent", "depends_on": [] }
    ]
  },
  "expected_effect": "plan updated"
}`;

  const result = parser.parse(rawOutput);
  console.log("  DEBUG: parse result:", JSON.stringify(result));
  assert(result.success === true, "Should parse REPLAN_SUBTASKS");
  assert(result.action?.action === "REPLAN_SUBTASKS", "Action type should be REPLAN_SUBTASKS");
  console.log("  ✓ PASSED");
}

console.log("\nTC-OPT-008: full process with CANCEL_TASK");
{
  const referee = createReferee();
  const orgState = createTestOrgState();
  referee.setOrgState(orgState);

  const rawOutput = `{
  "action": "CANCEL_TASK",
  "parent_task_id": "parent-001",
  "reason": "User approved cancellation of this subtask.",
  "payload": {
    "task_id": "child-002",
    "reason": "Feature scope removed by user decision",
    "alternatives": ["Implement in v2", "Use third-party solution"]
  },
  "expected_effect": "task cancelled and parent notified"
}`;

  const result = referee.process(rawOutput, "parent-001");
  assert(result.success === true, "Should process CANCEL_TASK successfully");
  assert(result.action?.action === "CANCEL_TASK", "Should return CANCEL_TASK action");
  console.log("  ✓ PASSED");
}

// ============================================================
// Integration Tests
// ============================================================

console.log("\n============================================================");
console.log("  Integration Tests");
console.log("============================================================");

console.log("\nTC-INT-GAP-001: strict mode catches no-ops");
{
  const referee = createReferee({ strictMode: true });
  const orgState = createTestOrgState();
  referee.setOrgState(orgState);

  // No-op MERGE
  const action = {
    action: "MERGE_SUBTASK_RESULT",
    parent_task_id: "parent-001",
    reason: "Merge",
    payload: {
      child_task_id: "child-001",
      summary: "No findings",
      finding_refs: [],
      evidence_refs: [],
    },
    expected_effect: "merged",
  };

  const validation = referee.validate(action as OrchestratorAction);
  assert(validation.ok === false, "Strict mode should catch no-ops");
  console.log("  ✓ PASSED");
}

console.log("\nTC-INT-GAP-002: parent_updates validation in full process");
{
  const referee = createReferee();
  const orgState = createTestOrgState();
  referee.setOrgState(orgState);

  const rawOutput = `{
  "action": "MERGE_SUBTASK_RESULT",
  "parent_task_id": "parent-001",
  "reason": "Child complete with invalid parent_updates",
  "payload": {
    "child_task_id": "child-001",
    "summary": "Done",
    "finding_refs": ["F-001"],
    "evidence_refs": ["E-001"],
    "parent_updates": {
      "findings_append": "not an array"
    }
  },
  "expected_effect": "merged"
}`;

  const result = referee.process(rawOutput, "parent-001");
  assert(result.success === false, "Should reject invalid parent_updates");
  assert(result.retryEnvelope !== undefined, "Should return retry envelope");
  console.log("  ✓ PASSED");
}

console.log("\nTC-INT-GAP-003: evidence type validation in full process");
{
  const referee = createReferee({ validatePhaseGates: true });
  const orgState: OrgState = {
    workflowPath: "test.org",
    tasks: new Map([
      ["parent-001", {
        id: "parent-001",
        status: "IN-PROGRESS",
        phase: "implementation",
        owner: "orchestrator",
        findings: [
          { id: "F-001", content: "Research", rating: "★★★", timestamp: "" },
          { id: "F-002", content: "Another finding", rating: "★★★", timestamp: "" },
        ],
        evidence: [
          { id: "E-blog", type: "blog", source: "https://blog.example.com", finding_ref: "F-001", rating: "★", timestamp: "" },
          { id: "E-blog2", type: "blog", source: "https://another.example.com", finding_ref: "F-002", rating: "★", timestamp: "" },
        ],
      }],
      ["child-001", {
        id: "child-001",
        status: "DONE",
        phase: "implementation",
        owner: "code-agent",
        parent: "parent-001", // Must have parent reference!
        findings: [],
        evidence: [],
      }],
    ]),
  };
  referee.setOrgState(orgState);

  const rawOutput = `{
  "action": "ADVANCE_PHASE",
  "parent_task_id": "parent-001",
  "reason": "Implementation complete with blog evidence",
  "payload": {
    "from_phase": "implementation",
    "to_phase": "test",
    "gate_basis": {
      "required_roles": ["code-agent"],
      "completed_child_tasks": ["child-001"],
      "evidence_refs": ["E-blog", "E-blog2"]
    }
  },
  "expected_effect": "phase advanced"
}`;

  const result = referee.process(rawOutput, "parent-001");
  console.log("  DEBUG: result.success:", result.success);
  console.log("  DEBUG: error_code:", result.retryEnvelope?.payload?.error_code);
  assert(result.success === false, "Should reject invalid evidence type");
  assert(result.retryEnvelope?.payload?.error_code?.includes("EVIDENCE_TYPE"), 
    "Should have evidence type error");
  console.log("  ✓ PASSED");
}

// ============================================================
// Summary
// ============================================================

console.log("\n============================================================");
console.log("  Gap Test Coverage Summary");
console.log("============================================================");
console.log("  G1 (No-Op Detection): 4 tests");
console.log("  G2 (parent_updates): 3 tests");
console.log("  G3 (Evidence Types): 3 tests");
console.log("  G4 (Cancel/Replan): 8 tests");
console.log("  Integration: 3 tests");
console.log("  --------------------------------------------------------");
console.log("  Total: 21 tests");
console.log("============================================================");
console.log("\n✅ All gap tests passed!\n");
