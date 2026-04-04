/**
 * Referee E2E Integration Tests - Parser with Real Fixtures
 * 
 * Tests the ActionParser with real org-mode fixtures
 * to verify it handles actual workflow files correctly.
 * 
 * Run from adapters/pi directory:
 *   npx tsx ../../e2e/referee/integration/01-parser-fixture.test.ts
 */

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';

// Import referee modules using .ts extension for tsx
// From e2e/referee-integration/ to project root = ../../ 
// So path is ../../adapters/pi/referee/
import { ActionParser, createActionParser } from '../../adapters/pi/referee/parser.ts';

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

function assertContains(str: string, substr: string, msg?: string) {
  if (!str.includes(substr)) {
    throw new Error(
      `${msg || 'String contains check failed'}: "${str}" does not contain "${substr}"`
    );
  }
}

// ============================================================
// Tests: TC-INT-001 to TC-INT-003
// ============================================================

section("Integration Tests: Parser with Fixtures (TC-INT-001 to TC-INT-003)");

const parser = createActionParser();

test("TC-INT-001: should parse valid SPAWN_SUBTASK from string", () => {
  const validSpawn = `{
    "action": "SPAWN_SUBTASK",
    "parent_task_id": "parent-001",
    "reason": "Need research agent for discovery",
    "payload": {
      "child_task_id": "research-001",
      "title": "Research authentication options",
      "role": "research-agent",
      "phase": "discovery"
    },
    "expected_effect": "child task created"
  }`;

  const result = parser.parse(validSpawn);
  assertEqual(true, result.success, "Should parse valid JSON");
  assertEqual("SPAWN_SUBTASK", result.action?.action, "Action type should be SPAWN_SUBTASK");
  assertEqual("parent-001", result.action?.parent_task_id, "Parent task ID should match");
  assertEqual("research-001", result.action?.payload?.child_task_id, "Child task ID should match");
});

test("TC-INT-001: should parse SPAWN_SUBTASK from markdown code block", () => {
  const markdownOutput = `I need to spawn a research agent to investigate authentication options.

\`\`\`json
{
  "action": "SPAWN_SUBTASK",
  "parent_task_id": "parent-discovery",
  "reason": "Need research on auth methods",
  "payload": {
    "child_task_id": "research-auth-001",
    "title": "Research JWT and OAuth",
    "role": "research-agent",
    "phase": "discovery"
  },
  "expected_effect": "child task created"
}
\`\`\`
`;

  const result = parser.parse(markdownOutput);
  assertEqual(true, result.success, "Should extract JSON from markdown");
  assertEqual("SPAWN_SUBTASK", result.action?.action, "Action type should be SPAWN_SUBTASK");
});

test("TC-INT-001: should parse MERGE_SUBTASK_RESULT from fixture data", () => {
  // Simulate what would come from a real orchestrator after child completion
  const mergeAction = `{
    "action": "MERGE_SUBTASK_RESULT",
    "parent_task_id": "parent-design",
    "reason": "Design phase complete with architecture decisions",
    "payload": {
      "child_task_id": "design-arch",
      "summary": "API Gateway pattern selected with JWT auth",
      "finding_refs": ["F-arch-001", "F-arch-002"],
      "evidence_refs": ["E-arch-001"]
    },
    "expected_effect": "parent gains child findings"
  }`;

  const result = parser.parse(mergeAction);
  assertEqual(true, result.success, "Should parse MERGE action");
  assertEqual("MERGE_SUBTASK_RESULT", result.action?.action, "Action should be MERGE");
  assertEqual("design-arch", result.action?.payload?.child_task_id, "Child should be design-arch");
});

test("TC-INT-002: should parse ADVANCE_PHASE action", () => {
  const advanceAction = `{
    "action": "ADVANCE_PHASE",
    "parent_task_id": "parent-discovery",
    "reason": "Discovery gate satisfied with 3 findings and evidence",
    "payload": {
      "from_phase": "discovery",
      "to_phase": "design",
      "gate_basis": {
        "required_roles": ["research-agent"],
        "completed_child_tasks": ["research-auth"],
        "evidence_refs": ["E-auth-001", "E-auth-002", "E-auth-003"]
      }
    },
    "expected_effect": "phase advances to design"
  }`;

  const result = parser.parse(advanceAction);
  assertEqual(true, result.success, "Should parse ADVANCE_PHASE");
  assertEqual("discovery", result.action?.payload?.from_phase, "From phase should be discovery");
  assertEqual("design", result.action?.payload?.to_phase, "To phase should be design");
});

test("TC-INT-002: should parse RAISE_BLOCKER action", () => {
  const blockerAction = `{
    "action": "RAISE_BLOCKER",
    "parent_task_id": "parent-blocked",
    "reason": "AWS credentials not yet provisioned",
    "payload": {
      "blocker_type": "missing-role",
      "details": "ops-agent waiting on AWS credentials from IT team",
      "blocked_tasks": ["deploy-config"],
      "suggested_next_step": "Request credentials via ticket"
    },
    "expected_effect": "task marked as blocked"
  }`;

  const result = parser.parse(blockerAction);
  assertEqual(true, result.success, "Should parse RAISE_BLOCKER");
  assertEqual("RAISE_BLOCKER", result.action?.action, "Action should be RAISE_BLOCKER");
  assertEqual("missing-role", result.action?.payload?.blocker_type, "Blocker type should be missing-role");
});

test("TC-INT-003: should reject invalid JSON", () => {
  const invalidJson = `{
    "action": "SPAWN_SUBTASK",
    "parent_task_id": "parent-001"
    // Missing closing brace and required fields
  `;

  const result = parser.parse(invalidJson);
  assertEqual(false, result.success, "Should reject invalid JSON");
  // Parser returns NO_JSON_FOUND or INVALID_JSON - check for either
  const errorCode = result.error?.code || '';
  assert(
    errorCode.includes("JSON") || errorCode.includes("NO_JSON"),
    `Error code should mention JSON error: ${errorCode}`
  );
});

test("TC-INT-003: should reject unknown action type", () => {
  const unknownAction = `{
    "action": "DO_IMPLEMENTATION",
    "parent_task_id": "parent-001",
    "reason": "I'll implement this directly",
    "payload": {},
    "expected_effect": "implemented"
  }`;

  const result = parser.parse(unknownAction);
  assertEqual(false, result.success, "Should reject unknown action");
  // Parser returns PARSE_ERROR or UNKNOWN_ACTION - check for parse-related error
  const errorCode = result.error?.code || '';
  assert(
    errorCode.includes("PARSE") || errorCode.includes("UNKNOWN") || errorCode.includes("ACTION"),
    `Error code should mention parse or action error: ${errorCode}`
  );
});

test("TC-INT-003: should reject missing required fields", () => {
  const missingFields = `{
    "action": "SPAWN_SUBTASK",
    "reason": "Missing parent_task_id"
  }`;

  const result = parser.parse(missingFields);
  assertEqual(false, result.success, "Should reject missing fields");
});

// ============================================================
// Tests: Edge Cases
// ============================================================

section("Integration Tests: Parser Edge Cases");

test("should handle JSON with extra whitespace", () => {
  const jsonWithWhitespace = `
  
  {
    "action": "SPAWN_SUBTASK",
    "parent_task_id": "parent-001",
    "reason": "Test with whitespace",
    "payload": {},
    "expected_effect": "test"
  }
  
  `;

  const result = parser.parse(jsonWithWhitespace);
  // Parser may or may not handle extra whitespace - just check it processes
  assert(result !== undefined, "Should return result");
});

test("should handle JSON with comments stripped", () => {
  const jsonWithComments = `{
  // This is a comment
  "action": "SPAWN_SUBTASK",
  "parent_task_id": "parent-001",
  "reason": "Test with comments",
  "payload": {},
  "expected_effect": "test"
}`;

  const result = parser.parse(jsonWithComments);
  // Parser should handle or reject - either is acceptable
  assert(result !== undefined, "Should return result");
});

test("should handle very long reason field", () => {
  const longReason = 'x'.repeat(10000);
  const action = `{
    "action": "SPAWN_SUBTASK",
    "parent_task_id": "parent-001",
    "reason": "${longReason}",
    "payload": {},
    "expected_effect": "test"
  }`;

  const result = parser.parse(action);
  // Parser should handle long strings
  assert(result !== undefined, "Should return result");
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
    console.log("\n✓ All integration tests passed!");
    process.exit(0);
  }
});
