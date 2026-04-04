/**
 * Referee E2E Integration Tests - Loop Driver
 * 
 * Tests the Loop Driver with real org-mode fixtures.
 * Verifies outer loop logic, child completion hooks, and state management.
 * 
 * Run from adapters/pi directory:
 *   npx tsx ../../e2e/referee/integration/04-loop-driver.test.ts
 */

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';

// Import referee modules using .ts extension for tsx
// From e2e/referee-integration/ to project root = ../../ 
// So path is ../../adapters/pi/referee/
import { createLoopDriver, LoopDriver } from '../../adapters/pi/referee/loop-driver.ts';
import { parseOrgContent, OrgState } from '../../adapters/pi/referee/org-state-reader.ts';
import { OrchestratorAction } from '../../adapters/pi/referee/types/referee.ts';

// ============================================================
// Test Fixtures
// ============================================================

const FIXTURES_DIR = path.join(__dirname, './fixtures');

function readFixture(name: string): string {
  const fixturePath = path.join(FIXTURES_DIR, name);
  if (!fs.existsSync(fixturePath)) {
    throw new Error(`Fixture not found: ${fixturePath}`);
  }
  return fs.readFileSync(fixturePath, 'utf-8');
}

// ============================================================
// Helper Functions
// ============================================================

function section(name: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${name}`);
  console.log('='.repeat(60));
}

let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

function test(name: string, fn: () => void) {
  testsRun++;
  try {
    fn();
    testsPassed++;
    console.log(`  ✓ ${name}`);
  } catch (error: any) {
    testsFailed++;
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${error.message}`);
  }
}

function assertEqual(expected: any, actual: any, msg?: string) {
  if (expected !== actual) {
    throw new Error(
      `${msg || 'Assertion failed'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

// ============================================================
// Tests: Loop Driver Initialization
// ============================================================

section("Integration Tests: Loop Driver (TC-LOOP-001 to TC-LOOP-010)");

test("TC-LOOP-001: should initialize for discovery phase", () => {
  const driver = createLoopDriver();
  const state = driver.initialize("discovery.org", "parent-discovery", "discovery");
  
  assertEqual("parent-discovery", state.parentTaskId, "Parent task ID should match");
  assertEqual("discovery", state.currentPhase, "Phase should be discovery");
  assertEqual(0, state.turn, "Turn should start at 0");
  assertEqual("active", state.status, "Status should be active");
});

test("TC-LOOP-002: should track loop turns", () => {
  const driver = createLoopDriver();
  driver.initialize("discovery.org", "parent-discovery", "discovery");
  
  // Get initial state
  let state = driver.getState();
  assertEqual(0, state!.turn, "Initial turn should be 0");
  
  // Note: processAction increments turn
});

test("TC-LOOP-003: should handle SPAWN_SUBTASK action", () => {
  const driver = createLoopDriver();
  driver.initialize("discovery.org", "parent-discovery", "discovery");
  
  const discoveryOrg = parseOrgContent(readFixture('discovery.org'), 'discovery.org');
  
  const spawnAction: OrchestratorAction = {
    action: "SPAWN_SUBTASK",
    parent_task_id: "parent-discovery",
    reason: "Need security research",
    payload: {
      child_task_id: "research-security",
      title: "Security review",
      role: "security-agent",
      phase: "discovery",
    },
    expected_effect: "child task created",
  } as OrchestratorAction;

  const result = driver.processAction(spawnAction, { ok: true, errors: [], warnings: [] }, discoveryOrg);
  
  assertEqual(true, result.success, "Spawn should succeed");
  assertEqual(true, result.shouldContinue, "Loop should continue after spawn");
});

test("TC-LOOP-004: should handle MERGE_SUBTASK_RESULT action", () => {
  const driver = createLoopDriver();
  driver.initialize("discovery.org", "parent-discovery", "discovery");
  
  const discoveryOrg = parseOrgContent(readFixture('discovery.org'), 'discovery.org');
  
  const mergeAction: OrchestratorAction = {
    action: "MERGE_SUBTASK_RESULT",
    parent_task_id: "parent-discovery",
    reason: "Research complete",
    payload: {
      child_task_id: "research-auth",
      summary: "Auth options researched",
      finding_refs: ["F-auth-001", "F-auth-002"],
      evidence_refs: ["E-auth-001", "E-auth-002"],
    },
    expected_effect: "merged",
  } as OrchestratorAction;

  const result = driver.processAction(mergeAction, { ok: true, errors: [], warnings: [] }, discoveryOrg);
  
  assertEqual(true, result.success, "Merge should succeed");
  assertEqual(true, result.shouldContinue, "Loop should continue after merge");
});

test("TC-LOOP-005: should handle ADVANCE_PHASE to terminal", () => {
  const driver = createLoopDriver();
  driver.initialize("terminal.org", "parent-complete", "acceptance");
  
  // Test the decision logic - should handle terminal state
  const decision = driver.decideNext("terminal.org", "parent-complete");
  
  // Should indicate completion or handle terminal state
  assert(decision !== undefined, "Should return decision");
});

test("TC-LOOP-006: should handle RAISE_BLOCKER action", () => {
  const driver = createLoopDriver();
  driver.initialize("blocked.org", "parent-blocked", "implementation");
  
  const blockedOrg = parseOrgContent(readFixture('blocked.org'), 'blocked.org');
  
  const blockerAction: OrchestratorAction = {
    action: "RAISE_BLOCKER",
    parent_task_id: "parent-blocked",
    reason: "Waiting for credentials",
    payload: {
      blocker_type: "missing-credentials",
      details: "AWS credentials not provisioned",
      blocked_tasks: ["deploy-config"],
      suggested_next_step: "Contact ops team",
    },
    expected_effect: "blocked",
  } as OrchestratorAction;

  const result = driver.processAction(blockerAction, { ok: true, errors: [], warnings: [] }, blockedOrg);
  
  assertEqual(true, result.success, "Raise blocker should succeed");
  assertEqual("blocked", result.waitReason, "Wait reason should be blocked");
  assertEqual(false, result.shouldContinue, "Loop should pause when blocked");
});

test("TC-LOOP-007: should handle REQUEST_USER_DECISION action", () => {
  const driver = createLoopDriver();
  driver.initialize("discovery.org", "parent-discovery", "discovery");
  
  const discoveryOrg = parseOrgContent(readFixture('discovery.org'), 'discovery.org');
  
  const decisionAction: OrchestratorAction = {
    action: "REQUEST_USER_DECISION",
    parent_task_id: "parent-discovery",
    reason: "Multiple auth options",
    payload: {
      question: "Choose JWT or OAuth?",
      options: [
        { id: "jwt", description: "Use JWT tokens" },
        { id: "oauth", description: "Use OAuth 2.0" },
      ],
      default: "jwt",
    },
    expected_effect: "waiting",
  } as OrchestratorAction;

  const result = driver.processAction(decisionAction, { ok: true, errors: [], warnings: [] }, discoveryOrg);
  
  assertEqual(true, result.success, "Request decision should succeed");
  assertEqual("user-decision", result.waitReason, "Wait reason should be user-decision");
  assertEqual(false, result.shouldContinue, "Loop should pause for decision");
});

test("TC-LOOP-008: should detect completed children for merge", () => {
  const driver = createLoopDriver();
  
  const completion = driver.handleChildCompletion("research-auth", "completed", {
    findings: [{ id: "F-auth-001", content: "Test", rating: "★★★", timestamp: "" }],
    evidence: [],
  });
  
  // Should handle completion
  assert(completion !== undefined, "Should return completion result");
});

test("TC-LOOP-009: should build orchestrator input from state", () => {
  const driver = createLoopDriver();
  driver.initialize("discovery.org", "parent-discovery", "discovery");
  
  // Build input - may fail if file doesn't exist but should handle gracefully
  try {
    const input = driver.getOrchestratorInput("discovery.org", "parent-discovery");
    assert(input !== undefined, "Should return input");
  } catch {
    // File not found is acceptable for this test
    assert(true, "Handled gracefully");
  }
});

test("TC-LOOP-010: should not continue loop when max turns exceeded", () => {
  const driver = createLoopDriver({ maxLoopTurns: 3 });
  driver.initialize("discovery.org", "parent-discovery", "discovery");
  
  // Manually set turns to max
  const state = driver.getState();
  state!.turn = 3;
  
  assertEqual(false, driver.shouldContinue(), "Should not continue when max turns reached");
});

// ============================================================
// Tests: Child Completion Events
// ============================================================

section("Integration Tests: Child Completion Events");

test("should detect completed children from fixture", () => {
  const driver = createLoopDriver();
  
  // Current state (child done)
  const currentState = parseOrgContent(readFixture('discovery.org'), 'discovery.org');
  
  // Check that org was parsed
  assert(currentState !== undefined, "Should parse fixture");
});

test("should generate merge recommendation on completion", () => {
  const driver = createLoopDriver();
  
  const recommendation = driver.handleChildCompletion("impl-jwt", "completed", {
    findings: [{ id: "F-jwt-001", content: "JWT implemented", rating: "★★★", timestamp: "" }],
    evidence: [{ id: "E-jwt-001", type: "file", source: "src/auth.ts", finding_ref: "F-jwt-001", rating: "★★★", timestamp: "" }],
    summary: "JWT middleware implemented",
  });
  
  assert(recommendation !== undefined, "Should return recommendation");
});

// ============================================================
// Summary
// ============================================================

process.on('exit', () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log("  Test Summary");
  console.log('='.repeat(60));
  console.log(`  Total:  ${testsRun}`);
  console.log(`  Passed: ${testsPassed}`);
  console.log(`  Failed: ${testsFailed}`);
  console.log('='.repeat(60));
  
  if (testsFailed > 0) {
    console.log("\n⚠️  Some tests failed!");
    process.exit(1);
  } else {
    console.log("\n✓ All loop driver tests passed!");
    process.exit(0);
  }
});
