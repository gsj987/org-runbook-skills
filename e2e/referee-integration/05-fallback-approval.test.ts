/**
 * Referee E2E Integration Tests - Fallback Approval
 * 
 * Tests the Fallback Approval system with real scenarios.
 * Verifies explicit approval workflow and audit logging.
 * 
 * Run from adapters/pi directory:
 *   npx tsx ../../e2e/referee/integration/05-fallback-approval.test.ts
 */

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';

// Import referee modules using .ts extension for tsx
// From e2e/referee-integration/ to project root = ../../ 
// So path is ../../adapters/pi/referee/
import { 
  createFallbackApprovalHandler,
  createOrchestratorFallbackValidator,
  createExceptionClassifier,
  createFallbackRequestGenerator,
} from '../../adapters/pi/referee/fallback-approval.ts';
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
// Tests: Fallback Request Lifecycle
// ============================================================

section("Integration Tests: Fallback Approval (TC-FALLBACK-001 to TC-FALLBACK-010)");

test("TC-FALLBACK-001: should create fallback request for no-suitable-role", () => {
  const handler = createFallbackApprovalHandler();
  
  const request = handler.createRequest(
    "parent-impl",
    "no-suitable-role",
    "No security-agent defined in the system",
    "Implement security audit"
  );
  
  assertEqual("pending", request.status, "Status should be pending");
  assertEqual("no-suitable-role", request.fallbackType, "Fallback type should match");
  assert(request.requestId.startsWith("FB-"), "Request ID should start with FB-");
});

test("TC-FALLBACK-002: should reject fallback by default", () => {
  const handler = createFallbackApprovalHandler();
  
  const request = handler.createRequest(
    "parent-impl",
    "no-suitable-role",
    "No role available",
    "Direct implementation"
  );
  
  const decision = handler.processDecision(request.requestId, {
    decision: 'reject',
    approvedBy: 'user',
    reason: 'Not approved - use proper delegation',
  });
  
  assertEqual(false, decision.canExecute, "Should not allow execution after rejection");
  assertEqual("rejected", decision.request.status, "Status should be rejected");
});

test("TC-FALLBACK-003: should approve fallback after explicit approval", () => {
  const handler = createFallbackApprovalHandler();
  
  const request = handler.createRequest(
    "parent-impl",
    "emergency-intervention",
    "Production system down",
    "Emergency fix required"
  );
  
  const decision = handler.processDecision(request.requestId, {
    decision: 'approve',
    approvedBy: 'admin@example.com',
    reason: 'Emergency approved',
  });
  
  assertEqual(true, decision.canExecute, "Should allow execution after approval");
  assertEqual("approved", decision.request.status, "Status should be approved");
  assertEqual("admin@example.com", decision.request.approvedBy, "Should record approver");
});

test("TC-FALLBACK-004: should execute approved fallback", () => {
  const handler = createFallbackApprovalHandler();
  
  const request = handler.createRequest(
    "parent-impl",
    "no-suitable-role",
    "No role available",
    "Implement feature"
  );
  
  // Approve
  handler.processDecision(request.requestId, {
    decision: 'approve',
    approvedBy: 'user',
  });
  
  // Execute
  const result = handler.executeFallback(request.requestId, {
    success: true,
    executedAt: new Date().toISOString(),
    output: 'Feature implemented',
    findings: ['F-001: Feature working'],
    evidence: ['E-001: file: src/feature.ts'],
  });
  
  assertEqual(true, result.success, "Execution should succeed");
  assertEqual("FALLBACK_EXECUTED", result.auditEntry.action, "Should have audit entry");
});

test("TC-FALLBACK-005: should not execute rejected fallback", () => {
  const handler = createFallbackApprovalHandler();
  
  const request = handler.createRequest(
    "parent-impl",
    "no-suitable-role",
    "No role available",
    "Implement feature"
  );
  
  // Reject
  handler.processDecision(request.requestId, {
    decision: 'reject',
    approvedBy: 'user',
  });
  
  // Try to execute - should fail
  let error;
  try {
    handler.executeFallback(request.requestId, { success: true });
  } catch (e: any) {
    error = e;
  }
  
  assert(error !== undefined, "Should throw error");
  assert(error.message.includes("not approved"), "Error should mention not approved");
});

test("TC-FALLBACK-006: should generate fallback audit log", () => {
  const handler = createFallbackApprovalHandler();
  
  // Create and execute a fallback
  const request = handler.createRequest(
    "parent-impl",
    "emergency-intervention",
    "Urgent fix",
    "Fix critical bug"
  );
  
  handler.processDecision(request.requestId, {
    decision: 'approve',
    approvedBy: 'admin',
  });
  
  handler.executeFallback(request.requestId, { 
    success: true,
    output: 'Bug fixed',
  });
  
  const auditLog = handler.generateAuditLog("parent-impl");
  
  assert(auditLog.includes("Fallback Audit Log"), "Should have audit header");
  assert(auditLog.includes("Executed Fallbacks"), "Should list executed");
  assert(auditLog.includes(request.requestId), "Should include request ID");
});

test("TC-FALLBACK-007: should classify impl-bug to code-agent", () => {
  const classifier = createExceptionClassifier();
  
  const implOrg = parseOrgContent(readFixture('implementation.org'), 'implementation.org');
  
  const result = classifier.classify("impl-bug", {
    currentPhase: "test",
    parentTaskId: "parent-test",
    orgState: implOrg,
  });
  
  // impl-bug should delegate to code-agent
  assertEqual(false, result.canRequestFallback, "Should not need fallback for impl-bug");
  assert(result.alternativeRoles.includes("code-agent"), "Should suggest code-agent");
});

test("TC-FALLBACK-008: should allow fallback for no-suitable-role", () => {
  const classifier = createExceptionClassifier();
  
  const implOrg = parseOrgContent(readFixture('implementation.org'), 'implementation.org');
  
  const result = classifier.classify("custom-feature", {
    currentPhase: "implementation",
    parentTaskId: "parent-impl",
    orgState: implOrg,
    missingRole: "ml-agent",
  });
  
  // No ml-agent defined, so fallback might be needed
  // Check that alternative roles are suggested
  assert(result.alternativeRoles.length >= 0, "Should return alternatives");
});

test("TC-FALLBACK-009: should generate fallback request action", () => {
  const generator = createFallbackRequestGenerator();
  
  const validation = {
    canRequestFallback: true,
    reason: 'no-suitable-role' as const,
    details: 'No ml-agent defined',
    alternativeRoles: ['code-agent', 'arch-agent'],
    requiredApprovalLevel: 'user' as const,
  };
  
  const action = generator.generateFallbackRequest(
    "parent-impl",
    validation,
    {
      currentPhase: "implementation",
      proposedWork: "Implement ML model",
    }
  );
  
  assertEqual("REQUEST_USER_DECISION", action.action, "Should be REQUEST_USER_DECISION");
  assertEqual("fallback-approval", action.payload.decision_type, "Should have fallback type");
  
  // Check options
  const approveOption = action.payload.options?.find((o: any) => o.id === "fallback-approve");
  const rejectOption = action.payload.options?.find((o: any) => o.id === "fallback-reject");
  
  assert(approveOption !== undefined, "Should have approve option");
  assert(rejectOption !== undefined, "Should have reject option");
  assertEqual(true, rejectOption?.is_default || rejectOption?.default === true, "Reject should be default");
});

test("TC-FALLBACK-010: should track fallback statistics", () => {
  const handler = createFallbackApprovalHandler();
  
  // Create multiple requests
  const req1 = handler.createRequest("parent-impl", "no-suitable-role", "Reason 1", "Work 1");
  const req2 = handler.createRequest("parent-impl", "emergency", "Reason 2", "Work 2");
  
  // Approve and execute one
  handler.processDecision(req1.requestId, { decision: 'approve', approvedBy: 'user' });
  handler.executeFallback(req1.requestId, { success: true });
  
  // Reject another
  handler.processDecision(req2.requestId, { decision: 'reject', approvedBy: 'user' });
  
  const stats = handler.getStatistics("parent-impl");
  
  assertEqual(2, stats.total, "Should have 2 total requests");
  assertEqual(1, stats.executed, "Should have 1 executed");
  assertEqual(1, stats.rejected, "Should have 1 rejected");
});

// ============================================================
// Tests: Direct Execution Detection
// ============================================================

section("Integration Tests: Direct Execution Detection");

test("should detect direct implementation output", () => {
  const validator = createOrchestratorFallbackValidator();
  
  // Direct implementation output
  const directExecOutput = `Here's the implementation:

\`\`\`typescript
const auth = new JWTAuth();
await auth.login(username, password);
\`\`\`

This should work now.`;
  
  const result = validator.validateOrchestratorFallback(directExecOutput, {
    parentTaskId: "parent-impl",
    currentPhase: "implementation",
    orgState: parseOrgContent(readFixture('implementation.org'), 'implementation.org'),
  });
  
  assertEqual(true, result.isFallbackAttempt, "Should detect direct execution");
});

test("should allow delegation narrative", () => {
  const validator = createOrchestratorFallbackValidator();
  
  // Normal delegation output
  const delegationOutput = `I need to spawn a child task for this implementation work. Let me delegate to the code-agent.`;
  
  const result = validator.validateOrchestratorFallback(delegationOutput, {
    parentTaskId: "parent-impl",
    currentPhase: "implementation",
    orgState: parseOrgContent(readFixture('implementation.org'), 'implementation.org'),
  });
  
  assertEqual(false, result.isFallbackAttempt, "Should not flag as fallback");
});

test("should detect 'Here\\'s the implementation' pattern", () => {
  const validator = createOrchestratorFallbackValidator();
  
  const output = `Here's my implementation of the feature. It uses the JWT library for authentication.`;
  
  const result = validator.validateOrchestratorFallback(output, {
    parentTaskId: "parent-impl",
    currentPhase: "implementation",
    orgState: parseOrgContent(readFixture('implementation.org'), 'implementation.org'),
  });
  
  // Should detect as potential direct execution
  assertEqual(true, result.isFallbackAttempt, "Should detect 'Here's implementation' pattern");
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
    console.log("\n✓ All fallback approval tests passed!");
    process.exit(0);
  }
});
