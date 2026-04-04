#!/usr/bin/env npx ts-node --esm
/**
 * Referee Module E2E Tests - Phase 1
 * 
 * Tests for:
 * - T1.2: ActionParser (JSON extraction and parsing)
 * - T1.3: ActionValidator (schema and state validation)
 * - T1.4: RetryEnvelope (error message generation)
 * 
 * Usage:
 *   cd adapters/pi
 *   npx ts-node --esm ../../e2e/referee.test.ts
 * 
 * Or via npm script:
 *   npm run test:referee
 */

import { strict as assert } from 'assert';

// Import referee modules using .ts extension for ts-node
import { 
  createReferee,
  Referee,
  createActionParser,
  ActionParser,
  createActionValidator,
  ActionValidator,
  createRetryEnvelopeGenerator,
  RetryEnvelopeGenerator,
  OrchestratorAction,
  OrgState,
  TaskState,
  ALLOWED_ACTIONS,
} from '../adapters/pi/referee/index.ts';

// ============================================================
// Test Fixtures
// ============================================================

const VALID_SPAWN_JSON = {
  action: "SPAWN_SUBTASK",
  parent_task_id: "parent-001",
  reason: "Need code-agent to implement the API endpoint",
  payload: {
    child_task_id: "impl-api-001",
    title: "Implement user authentication API",
    role: "code-agent",
    phase: "implementation",
    depends_on: [],
    output_contract: {
      required_findings: 3,
      required_evidence_types: ["file", "command"],
      deliverables: ["code change", "test result"],
    },
  },
  expected_effect: "child task enters TODO and is ready for claim",
};

const VALID_MERGE_JSON = {
  action: "MERGE_SUBTASK_RESULT",
  parent_task_id: "parent-001",
  reason: "Child task completed with valid evidence",
  payload: {
    child_task_id: "impl-api-001",
    summary: "API endpoint implemented with JWT authentication",
    finding_refs: ["F-001", "F-002"],
    evidence_refs: ["E-001", "E-002"],
  },
  expected_effect: "parent task gains derived findings and evidence",
};

const VALID_ADVANCE_JSON = {
  action: "ADVANCE_PHASE",
  parent_task_id: "parent-001",
  reason: "All implementation subtasks complete",
  payload: {
    from_phase: "implementation",
    to_phase: "test",
    gate_basis: {
      required_roles: ["code-agent"],
      completed_child_tasks: ["impl-api-001"],
      evidence_refs: ["E-001"],
    },
  },
  expected_effect: "parent phase transitions to test",
};

const VALID_BLOCKER_JSON = {
  action: "RAISE_BLOCKER",
  parent_task_id: "parent-001",
  reason: "Waiting for external API documentation",
  payload: {
    blocker_type: "external-dependency",
    details: "Cannot proceed without third-party API spec",
    blocked_tasks: ["impl-api-001"],
    suggested_next_step: "Request user to provide documentation",
  },
  expected_effect: "task marked as BLOCKED",
};

const VALID_DECISION_JSON = {
  action: "REQUEST_USER_DECISION",
  parent_task_id: "parent-001",
  reason: "Two valid implementation paths",
  payload: {
    question: "Choose authentication approach",
    options: [
      { id: "jwt", description: "JWT tokens" },
      { id: "session", description: "Session-based" },
    ],
    default: "jwt",
  },
  expected_effect: "workflow pauses for user input",
};

const SAMPLE_ORG_STATE: OrgState = {
  workflowPath: "runbook/001-test.org",
  tasks: new Map([
    ["parent-001", {
      id: "parent-001",
      status: "IN-PROGRESS",
      phase: "implementation",
      findings: [
        { id: "F-001", content: "Auth API needed", rating: "★★★", timestamp: "2026-03-30T10:00:00Z" },
        { id: "F-002", content: "JWT recommended", rating: "★★", timestamp: "2026-03-30T10:01:00Z" },
      ],
      evidence: [
        { id: "E-001", type: "web", source: "https://docs.example.com/auth", finding_ref: "F-001", rating: "★★", timestamp: "2026-03-30T10:02:00Z" },
        { id: "E-002", type: "command", source: "npm search jwt", finding_ref: "F-002", rating: "★★★", timestamp: "2026-03-30T10:03:00Z" },
      ],
    } as TaskState],
    ["impl-api-001", {
      id: "impl-api-001",
      status: "DONE",
      phase: "implementation",
      parent: "parent-001",
      findings: [
        { id: "F-101", content: "API implemented", rating: "★★★", timestamp: "2026-03-30T11:00:00Z" },
      ],
      evidence: [
        { id: "E-101", type: "file", source: "/workspace/src/auth.ts", finding_ref: "F-101", rating: "★★★", timestamp: "2026-03-30T11:01:00Z" },
      ],
    } as TaskState],
    ["impl-blocked-001", {
      id: "impl-blocked-001",
      status: "TODO",
      phase: "implementation",
      parent: "parent-001",
      findings: [],
      evidence: [],
    } as TaskState],
  ]),
};

// ============================================================
// Test Counters
// ============================================================

let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

function test(name: string, fn: () => void | Promise<void>): void {
  testsRun++;
  try {
    const result = fn();
    if (result instanceof Promise) {
      result.then(() => {
        testsPassed++;
        console.log(`  ✓ ${name}`);
      }).catch((err) => {
        testsFailed++;
        console.error(`  ✗ ${name}`);
        console.error(`    Error: ${err.message}`);
      });
    } else {
      testsPassed++;
      console.log(`  ✓ ${name}`);
    }
  } catch (err: any) {
    testsFailed++;
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${err.message}`);
  }
}

function section(name: string): void {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${name}`);
  console.log('='.repeat(60));
}

// ============================================================
// Parser Tests (T1.2)
// ============================================================

section("Parser Tests - JSON Extraction");

test("should parse valid SPAWN_SUBTASK from code block", () => {
  const parser = createActionParser();
  const raw = '```json\n' + JSON.stringify(VALID_SPAWN_JSON, null, 2) + '\n```';
  const result = parser.parse(raw);
  
  assert(result.success === true, "Parse should succeed");
  assert(result.action?.action === "SPAWN_SUBTASK", "Action type should be SPAWN_SUBTASK");
  assert(result.action?.payload.child_task_id === "impl-api-001", "Child task ID should match");
  assert(result.action?.payload.role === "code-agent", "Role should match");
});

test("should parse valid SPAWN_SUBTASK from bare JSON", () => {
  const parser = createActionParser();
  const raw = JSON.stringify(VALID_SPAWN_JSON);
  const result = parser.parse(raw);
  
  assert(result.success === true, "Parse should succeed");
  assert(result.action?.action === "SPAWN_SUBTASK", "Action type should be SPAWN_SUBTASK");
});

test("should parse valid MERGE_SUBTASK_RESULT", () => {
  const parser = createActionParser();
  const raw = JSON.stringify(VALID_MERGE_JSON);
  const result = parser.parse(raw);
  
  assert(result.success === true, "Parse should succeed");
  assert(result.action?.action === "MERGE_SUBTASK_RESULT", "Action type should be MERGE");
  assert(result.action?.payload.finding_refs.length === 2, "Should have 2 finding refs");
});

test("should parse valid ADVANCE_PHASE", () => {
  const parser = createActionParser();
  const raw = JSON.stringify(VALID_ADVANCE_JSON);
  const result = parser.parse(raw);
  
  assert(result.success === true, "Parse should succeed");
  assert(result.action?.action === "ADVANCE_PHASE", "Action type should be ADVANCE");
  assert(result.action?.payload.to_phase === "test", "Should advance to test phase");
});

test("should parse valid RAISE_BLOCKER", () => {
  const parser = createActionParser();
  const raw = JSON.stringify(VALID_BLOCKER_JSON);
  const result = parser.parse(raw);
  
  assert(result.success === true, "Parse should succeed");
  assert(result.action?.action === "RAISE_BLOCKER", "Action type should be RAISE_BLOCKER");
  assert(result.action?.payload.blocker_type === "external-dependency", "Blocker type should match");
});

test("should parse valid REQUEST_USER_DECISION", () => {
  const parser = createActionParser();
  const raw = JSON.stringify(VALID_DECISION_JSON);
  const result = parser.parse(raw);
  
  assert(result.success === true, "Parse should succeed");
  assert(result.action?.action === "REQUEST_USER_DECISION", "Action type should be REQUEST");
  assert(result.action?.payload.options.length === 2, "Should have 2 options");
});

test("should reject empty output", () => {
  const parser = createActionParser();
  const result = parser.parse("");
  
  assert(result.success === false, "Parse should fail for empty input");
  assert(result.error?.code === "PARSE_ERROR", "Error code should be PARSE_ERROR");
});

test("should reject non-JSON text", () => {
  const parser = createActionParser();
  const result = parser.parse("I will implement the feature now.");
  
  assert(result.success === false, "Parse should fail for non-JSON");
  assert(result.error?.code === "NO_JSON_FOUND", "Error code should be NO_JSON_FOUND");
});

test("should reject invalid JSON", () => {
  const parser = createActionParser();
  const result = parser.parse('{ "action": "SPAWN_SUBTASK", invalid }');
  
  assert(result.success === false, "Parse should fail for invalid JSON");
  assert(result.error?.code === "PARSE_ERROR", "Error code should be PARSE_ERROR");
});

test("should reject unknown action type", () => {
  const parser = createActionParser();
  const result = parser.parse(JSON.stringify({
    action: "DO_SOMETHING",
    parent_task_id: "parent-001",
    reason: "test",
    expected_effect: "test",
  }));
  
  assert(result.success === false, "Parse should fail for unknown action");
  assert(result.error?.message.includes("Unknown action type"), "Should mention unknown action");
});

test("should reject missing parent_task_id", () => {
  const parser = createActionParser();
  const result = parser.parse(JSON.stringify({
    action: "SPAWN_SUBTASK",
    reason: "test",
    payload: { child_task_id: "child-001", title: "Test", role: "code-agent" },
  }));
  
  assert(result.success === false, "Parse should fail for missing parent_task_id");
  assert(result.error?.message.includes("parent_task_id"), "Should mention missing field");
});

test("should reject missing action field", () => {
  const parser = createActionParser();
  const result = parser.parse(JSON.stringify({
    parent_task_id: "parent-001",
    reason: "test",
  }));
  
  assert(result.success === false, "Parse should fail for missing action");
  assert(result.error?.message.includes('"action"'), "Should mention missing action field");
});

test("should handle JSON with surrounding text", () => {
  const parser = createActionParser();
  const raw = `Based on my analysis, I'll spawn a subtask:

\`\`\`json
${JSON.stringify(VALID_SPAWN_JSON, null, 2)}
\`\`\`

Let me know if you need anything else.`;
  
  const result = parser.parse(raw);
  
  assert(result.success === true, "Parse should succeed with surrounding text");
  assert(result.action?.action === "SPAWN_SUBTASK", "Should extract SPAWN action");
});

test("should handle markdown without json tag", () => {
  const parser = createActionParser();
  const raw = `\`\`\`
${JSON.stringify(VALID_MERGE_JSON, null, 2)}
\`\`\``;
  
  const result = parser.parse(raw);
  
  assert(result.success === true, "Parse should succeed with plain code block");
  assert(result.action?.action === "MERGE_SUBTASK_RESULT", "Should extract MERGE action");
});

// ============================================================
// Validator Tests (T1.3)
// ============================================================

section("Validator Tests - Schema and State Validation");

test("should validate valid SPAWN action without org state", () => {
  const validator = createActionValidator();
  const action = VALID_SPAWN_JSON as OrchestratorAction;
  const result = validator.validate(action);
  
  assert(result.ok === true, "Validation should pass");
  assert(result.errors.length === 0, "Should have no errors");
});

test("should validate valid MERGE action with org state", () => {
  const validator = createActionValidator();
  validator.setOrgState(SAMPLE_ORG_STATE);
  
  // Use a simple MERGE action without finding_refs/evidence_refs
  // (Finding refs would need to belong to the child task, not parent)
  const action = {
    action: "MERGE_SUBTASK_RESULT",
    parent_task_id: "parent-001",
    reason: "Child task completed successfully",
    payload: {
      child_task_id: "impl-api-001",
      summary: "API endpoint implemented",
    },
    expected_effect: "parent gains child results",
  } as OrchestratorAction;
  
  const result = validator.validate(action);
  
  assert(result.ok === true, "Validation should pass, got errors: " + JSON.stringify(result.errors));
});

test("should reject MERGE when child task not DONE", () => {
  const validator = createActionValidator();
  validator.setOrgState(SAMPLE_ORG_STATE);
  
  const action = {
    action: "MERGE_SUBTASK_RESULT",
    parent_task_id: "parent-001",
    reason: "Child task completed",
    payload: {
      child_task_id: "impl-blocked-001", // This is TODO in sample state
      summary: "Summary",
    },
    expected_effect: "merged",
  } as OrchestratorAction;
  
  const result = validator.validate(action);
  
  assert(result.ok === false, "Validation should fail");
  assert(result.errors.some(e => e.code === "CHILD_NOT_DONE"), "Should have CHILD_NOT_DONE error");
});

test("should reject ADVANCE_PHASE with invalid transition", () => {
  const validator = createActionValidator();
  validator.setOrgState(SAMPLE_ORG_STATE);
  
  const action = {
    action: "ADVANCE_PHASE",
    parent_task_id: "parent-001",
    reason: "Skip phases",
    payload: {
      from_phase: "implementation",
      to_phase: "acceptance", // Invalid: must go through test, integration, deploy-check
    },
    expected_effect: "advanced",
  } as OrchestratorAction;
  
  const result = validator.validate(action);
  
  assert(result.ok === false, "Validation should fail");
  assert(result.errors.some(e => e.code === "INVALID_PHASE_TRANSITION"), "Should have phase error");
});

test("should reject ADVANCE_PHASE from terminal phase", () => {
  const validator = createActionValidator();
  validator.setOrgState(SAMPLE_ORG_STATE);
  
  const action = {
    action: "ADVANCE_PHASE",
    parent_task_id: "parent-001",
    reason: "Continue from acceptance",
    payload: {
      from_phase: "acceptance",
      to_phase: "discovery",
    },
    expected_effect: "advanced",
  } as OrchestratorAction;
  
  const result = validator.validate(action);
  
  assert(result.ok === false, "Validation should fail");
  assert(result.errors.some(e => e.code === "INVALID_PHASE_TRANSITION"), "Should have phase error");
});

test("should reject reference to non-existent task", () => {
  const validator = createActionValidator();
  validator.setOrgState(SAMPLE_ORG_STATE);
  
  const action = {
    action: "SPAWN_SUBTASK",
    parent_task_id: "non-existent-task",
    reason: "Spawn from non-existent parent",
    payload: {
      child_task_id: "new-child",
      title: "New task",
      role: "code-agent",
    },
    expected_effect: "spawned",
  } as OrchestratorAction;
  
  const result = validator.validate(action);
  
  assert(result.ok === false, "Validation should fail");
  assert(result.errors.some(e => e.code === "TASK_NOT_FOUND"), "Should have TASK_NOT_FOUND error");
});

test("should reject empty parent_task_id", () => {
  const validator = createActionValidator();
  
  const action = {
    action: "SPAWN_SUBTASK",
    parent_task_id: "",
    reason: "Test",
    payload: {
      child_task_id: "child-001",
      title: "Test",
      role: "code-agent",
    },
    expected_effect: "test",
  } as OrchestratorAction;
  
  const result = validator.validate(action);
  
  assert(result.ok === false, "Validation should fail");
  assert(result.errors.some(e => e.code === "INVALID_TASK_ID"), "Should have INVALID_TASK_ID error");
});

test("should reject too short reason", () => {
  const validator = createActionValidator();
  
  const action = {
    action: "SPAWN_SUBTASK",
    parent_task_id: "parent-001",
    reason: "x", // Too short
    payload: {
      child_task_id: "child-001",
      title: "Test",
      role: "code-agent",
    },
    expected_effect: "test",
  } as OrchestratorAction;
  
  const result = validator.validate(action);
  
  assert(result.ok === false, "Validation should fail");
  assert(result.errors.some(e => e.code === "INVALID_REASON"), "Should have INVALID_REASON error");
});

test("should reject invalid phase name", () => {
  const validator = createActionValidator();
  
  const action = {
    action: "ADVANCE_PHASE",
    parent_task_id: "parent-001",
    reason: "Invalid phase",
    payload: {
      from_phase: "invalid-phase",
      to_phase: "test",
    },
    expected_effect: "test",
  } as OrchestratorAction;
  
  const result = validator.validate(action);
  
  assert(result.ok === false, "Validation should fail");
  assert(result.errors.some(e => e.code === "INVALID_PHASE_TRANSITION"), "Should have phase error");
});

// ============================================================
// RetryEnvelope Tests (T1.4)
// ============================================================

section("RetryEnvelope Tests - Error Message Generation");

test("should generate retry envelope for parse error", () => {
  const generator = createRetryEnvelopeGenerator();
  const envelope = generator.generateFromParseError("parent-001", {
    code: "NO_JSON_FOUND",
    message: "No JSON found in output",
  });
  
  assert(envelope.action === "RETRY_INVALID_ACTION", "Action should be RETRY");
  assert(envelope.parent_task_id === "parent-001", "Parent task should match");
  assert(envelope.payload.error_code === "NO_JSON_FOUND", "Error code should match");
  assert(envelope.guidance.suggestions.length > 0, "Should have suggestions");
});

test("should generate retry envelope for validation errors", () => {
  const generator = createRetryEnvelopeGenerator();
  const action = VALID_SPAWN_JSON as OrchestratorAction;
  const validationResult = {
    ok: false,
    errors: [
      { code: "INVALID_TASK_ID", message: "parent_task_id cannot be empty", path: "parent_task_id" },
    ],
    warnings: [],
  };
  
  const envelope = generator.generate(action, validationResult);
  
  assert(envelope.action === "RETRY_INVALID_ACTION", "Action should be RETRY");
  assert(envelope.payload.errors.length === 1, "Should have 1 error");
  assert(envelope.payload.errors[0].code === "INVALID_TASK_ID", "Error code should match");
  assert(envelope.payload.allowed_actions.length === ALLOWED_ACTIONS.length, "Should list all allowed actions");
});

test("should include relevant example in retry envelope", () => {
  const generator = createRetryEnvelopeGenerator();
  const action = VALID_MERGE_JSON as OrchestratorAction;
  const validationResult = {
    ok: false,
    errors: [{ code: "TASK_NOT_FOUND", message: "Task not found" }],
    warnings: [],
  };
  
  const envelope = generator.generate(action, validationResult);
  
  assert(envelope.guidance.example !== undefined, "Should have example");
  assert(envelope.guidance.example.action === "SPAWN_SUBTASK", "Example should be SPAWN for missing task");
});

test("should format retry as JSON", () => {
  const generator = createRetryEnvelopeGenerator();
  const envelope = generator.generateFromParseError("parent-001", {
    code: "PARSE_ERROR",
    message: "Invalid JSON",
  });
  
  const json = generator.formatAsJson(envelope);
  const parsed = JSON.parse(json);
  
  assert(parsed.action === "RETRY_INVALID_ACTION", "JSON should parse correctly");
});

test("should format retry as markdown", () => {
  const generator = createRetryEnvelopeGenerator();
  const envelope = generator.generateFromParseError("parent-001", {
    code: "NO_JSON_FOUND",
    message: "No JSON found",
  });
  
  const md = generator.formatAsMarkdown(envelope);
  
  assert(md.includes("Invalid Action"), "Should include header");
  assert(md.includes("NO_JSON_FOUND"), "Should include error code");
  assert(md.includes("Allowed Actions"), "Should include allowed actions section");
  assert(md.includes("Suggestions"), "Should include suggestions section");
});

// ============================================================
// Integration Tests
// ============================================================

section("Referee Integration Tests - End-to-End Processing");

test("should process valid action end-to-end", () => {
  const referee = createReferee();
  referee.setOrgState(SAMPLE_ORG_STATE);
  
  const raw = JSON.stringify(VALID_SPAWN_JSON);
  const result = referee.process(raw, "parent-001");
  
  assert(result.success === true, "Processing should succeed");
  assert(result.action !== undefined, "Should return action");
  assert(result.retryEnvelope === undefined, "Should not have retry envelope");
});

test("should reject invalid JSON with retry envelope", () => {
  const referee = createReferee();
  referee.setOrgState(SAMPLE_ORG_STATE);
  
  const raw = "This is not JSON";
  const result = referee.process(raw, "parent-001");
  
  assert(result.success === false, "Processing should fail");
  assert(result.action === undefined, "Should not return action");
  assert(result.retryEnvelope !== undefined, "Should return retry envelope");
  assert(result.retryEnvelope?.action === "RETRY_INVALID_ACTION", "Envelope action should be RETRY");
});

test("should reject invalid action with retry envelope", () => {
  const referee = createReferee();
  referee.setOrgState(SAMPLE_ORG_STATE);
  
  // Action with empty child_task_id
  const invalidAction = {
    action: "SPAWN_SUBTASK",
    parent_task_id: "parent-001",
    reason: "Test spawn with empty child id",
    payload: {
      child_task_id: "",
      title: "Test task",
      role: "code-agent",
      phase: "implementation",
      depends_on: [],
    },
    expected_effect: "spawned",
  };
  
  const raw = JSON.stringify(invalidAction);
  const result = referee.process(raw, "parent-001");
  
  assert(result.success === false, "Processing should fail");
  assert(result.retryEnvelope !== undefined, "Should return retry envelope");
  assert(result.retryEnvelope?.payload.errors.some(e => e.code === "INVALID_TASK_ID"), 
    "Should include INVALID_TASK_ID error");
});

test("should track retry counts", () => {
  const referee = createReferee({ maxRetries: 3 });
  
  assert(referee.getRetryCount("parent-001") === 0, "Initial retry count should be 0");
  
  referee.incrementRetryCount("parent-001");
  assert(referee.getRetryCount("parent-001") === 1, "Retry count should be 1");
  
  referee.incrementRetryCount("parent-001");
  referee.incrementRetryCount("parent-001");
  assert(referee.getRetryCount("parent-001") === 3, "Retry count should be 3");
  
  assert(referee.isMaxRetriesExceeded("parent-001") === true, "Max retries exceeded");
});

test("should reset retry counts", () => {
  const referee = createReferee({ maxRetries: 3 });
  
  referee.incrementRetryCount("parent-001");
  referee.incrementRetryCount("parent-001");
  referee.resetRetryCount("parent-001");
  
  assert(referee.getRetryCount("parent-001") === 0, "Retry count should be reset");
  assert(referee.isMaxRetriesExceeded("parent-001") === false, "Should not exceed max");
});

// ============================================================
// Phase 2: Specialist Content Detection Tests (T2.1)
// ============================================================

section("Phase 2: Specialist Content Detection");

test("should detect code blocks in orchestrator output", () => {
  const { createSpecialistContentDetector } = require('../adapters/pi/referee/specialist-detector.js');
  const detector = createSpecialistContentDetector();
  
  const output = `I've implemented the feature:

\`\`\`typescript
export function hello() {
  return "world";
}
\`\`\`

Now let me spawn a test task.`;
  
  const result = detector.detect(output);
  
  assert(result.detected === true, "Should detect specialist content");
  assert(result.types.includes("code_block"), "Should detect code block");
});

test("should detect shell commands in orchestrator output", () => {
  const { createSpecialistContentDetector } = require('../adapters/pi/referee/specialist-detector.js');
  const detector = createSpecialistContentDetector();
  
  const output = `I'll run the tests:

$ npm test
$ git commit -m "feat: add feature"

Now spawning the verification task.`;
  
  const result = detector.detect(output);
  
  assert(result.detected === true, "Should detect specialist content");
  assert(result.types.includes("shell_command"), "Should detect shell commands");
});

test("should detect implementation prose", () => {
  const { createSpecialistContentDetector } = require('../adapters/pi/referee/specialist-detector.js');
  const detector = createSpecialistContentDetector({ minImplementationHints: 2 });
  
  const output = `I've written the function that handles the async callback. 
The class now implements the interface with proper typing.
I need to export the default module.`;
  
  const result = detector.detect(output);
  
  assert(result.detected === true, "Should detect specialist content");
  assert(result.types.includes("implementation_prose"), "Should detect implementation prose");
});

test("should allow pure delegation narrative", () => {
  const { createSpecialistContentDetector } = require('../adapters/pi/referee/specialist-detector.js');
  const detector = createSpecialistContentDetector();
  
  const output = `Based on the requirements, I should delegate the implementation work to a code-agent.
The code-agent should create the API endpoint and ensure tests pass.
Let me spawn the appropriate subtask.`;
  
  const result = detector.detect(output);
  
  // Pure delegation narrative should not trigger specialist detection
  assert(result.detected === false || result.severity !== "error", 
    "Pure delegation narrative should not be flagged as error");
});

test("should generate SPECIALIST_CONTENT_DETECTED error", () => {
  const { createSpecialistContentDetector } = require('../adapters/pi/referee/specialist-detector.js');
  const detector = createSpecialistContentDetector({ minCodeBlockLength: 10 }); // Lower threshold for test
  
  const output = `Here's the implementation:

\`\`\`javascript
const x = 1;
\`\`\``;
  
  const result = detector.detect(output);
  const error = detector.toValidationError(result);
  
  assert(error !== null, "Should generate error");
  assert(error!.code === "SPECIALIST_CONTENT_DETECTED", "Error code should be SPECIALIST_CONTENT_DETECTED");
});

// ============================================================
// Phase 2: Citation Validation Tests (T2.2)
// ============================================================

section("Phase 2: Citation Validation");

test("should accept MERGE with child task findings", () => {
  const { createCitationValidator } = require('../adapters/pi/referee/citation-validator.js');
  const validator = createCitationValidator();
  
  // Create org state with child task that has findings
  const childTask: TaskState = {
    id: "impl-001",
    status: "DONE",
    phase: "implementation",
    parent: "parent-001",
    findings: [
      { id: "F-101", content: "Implementation complete", rating: "★★★", timestamp: "2026-03-30T10:00:00Z" },
    ],
    evidence: [
      { id: "E-101", type: "file", source: "/src/api.ts", finding_ref: "F-101", rating: "★★★", timestamp: "2026-03-30T10:01:00Z" },
    ],
  };
  
  const state: OrgState = {
    workflowPath: "runbook/001-test.org",
    tasks: new Map([
      ["parent-001", { id: "parent-001", status: "IN-PROGRESS", findings: [], evidence: [] } as TaskState],
      ["impl-001", childTask],
    ]),
  };
  
  const action: OrchestratorAction = {
    action: "MERGE_SUBTASK_RESULT",
    parent_task_id: "parent-001",
    reason: "Child task completed",
    payload: {
      child_task_id: "impl-001",
      summary: "Implementation done",
      finding_refs: ["F-101"],
      evidence_refs: ["E-101"],
    },
    expected_effect: "merged",
  } as OrchestratorAction;
  
  const result = validator.validateMergeCitation(action, state);
  
  assert(result.valid === true, "Citation validation should pass");
  assert(result.errors.length === 0, "Should have no errors");
});

test("should reject MERGE with non-existent finding ref", () => {
  const { createCitationValidator } = require('../adapters/pi/referee/citation-validator.js');
  const validator = createCitationValidator();
  
  const state: OrgState = {
    workflowPath: "runbook/001-test.org",
    tasks: new Map([
      ["parent-001", { id: "parent-001", status: "IN-PROGRESS", findings: [], evidence: [] } as TaskState],
      ["impl-001", { id: "impl-001", status: "DONE", findings: [], evidence: [] } as TaskState],
    ]),
  };
  
  const action: OrchestratorAction = {
    action: "MERGE_SUBTASK_RESULT",
    parent_task_id: "parent-001",
    reason: "Child task completed",
    payload: {
      child_task_id: "impl-001",
      summary: "Implementation done",
      finding_refs: ["F-NONEXISTENT"],
    },
    expected_effect: "merged",
  } as OrchestratorAction;
  
  const result = validator.validateMergeCitation(action, state);
  
  assert(result.valid === false, "Citation validation should fail");
  assert(result.errors.some(e => e.code === "MISSING_EVIDENCE_REF"), "Should have MISSING_EVIDENCE_REF error");
});

test("should reject MERGE citing parent findings as child findings", () => {
  const { createCitationValidator } = require('../adapters/pi/referee/citation-validator.js');
  const validator = createCitationValidator();
  
  const state: OrgState = {
    workflowPath: "runbook/001-test.org",
    tasks: new Map([
      ["parent-001", { 
        id: "parent-001", 
        status: "IN-PROGRESS", 
        findings: [
          { id: "F-001", content: "Parent finding", rating: "★★", timestamp: "2026-03-30T10:00:00Z" },
        ], 
        evidence: [] 
      } as TaskState],
      ["impl-001", { id: "impl-001", status: "DONE", findings: [], evidence: [] } as TaskState],
    ]),
  };
  
  const action: OrchestratorAction = {
    action: "MERGE_SUBTASK_RESULT",
    parent_task_id: "parent-001",
    reason: "Child task completed",
    payload: {
      child_task_id: "impl-001",
      summary: "Implementation done",
      finding_refs: ["F-001"],  // F-001 belongs to parent, not child!
    },
    expected_effect: "merged",
  } as OrchestratorAction;
  
  const result = validator.validateMergeCitation(action, state);
  
  assert(result.valid === false, "Citation validation should fail");
  assert(result.nonChildFindings.length > 0, "Should detect non-child findings");
});

// ============================================================
// Phase 2: Role Gate Validation Tests (T2.3)
// ============================================================

section("Phase 2: Role Gate Validation");

test("should pass role gate with required role completed", () => {
  const { createRoleGateValidator } = require('../adapters/pi/referee/role-gate-validator.js');
  const validator = createRoleGateValidator();
  
  const state: OrgState = {
    workflowPath: "runbook/001-test.org",
    tasks: new Map([
      ["parent-001", { 
        id: "parent-001", 
        status: "IN-PROGRESS", 
        phase: "implementation",
        findings: [], 
        evidence: [
          { id: "E-001", type: "file", source: "/src/api.ts", finding_ref: "F-001", rating: "★★★", timestamp: "2026-03-30T10:01:00Z" },
          { id: "E-002", type: "command", source: "npm test", finding_ref: "F-002", rating: "★★★", timestamp: "2026-03-30T10:02:00Z" },
        ]
      } as TaskState],
      ["impl-001", { 
        id: "impl-001", 
        status: "DONE", 
        phase: "implementation",
        parent: "parent-001",
        owner: "code-agent",  // Required role for implementation phase
        findings: [], 
        evidence: [] 
      } as TaskState],
    ]),
  };
  
  const action: OrchestratorAction = {
    action: "ADVANCE_PHASE",
    parent_task_id: "parent-001",
    reason: "Implementation complete",
    payload: {
      from_phase: "implementation",
      to_phase: "test",
      gate_basis: {
        required_roles: ["code-agent"],
        completed_child_tasks: ["impl-001"],
        evidence_refs: ["E-001", "E-002"],
      },
    },
    expected_effect: "phase advanced",
  } as OrchestratorAction;
  
  const result = validator.validateRoleGate(action, state);
  
  assert(result.satisfied === true, "Role gate should be satisfied");
  assert(result.completedRoles.includes("code-agent"), "Should have completed code-agent role");
});

test("should reject ADVANCE_PHASE without required role", () => {
  const { createRoleGateValidator } = require('../adapters/pi/referee/role-gate-validator.js');
  const validator = createRoleGateValidator();
  
  const state: OrgState = {
    workflowPath: "runbook/001-test.org",
    tasks: new Map([
      ["parent-001", { 
        id: "parent-001", 
        status: "IN-PROGRESS", 
        phase: "implementation",
        findings: [], 
        evidence: [] 
      } as TaskState],
      // No completed code-agent child task
    ]),
  };
  
  const action: OrchestratorAction = {
    action: "ADVANCE_PHASE",
    parent_task_id: "parent-001",
    reason: "Want to advance phase",
    payload: {
      from_phase: "implementation",
      to_phase: "test",
    },
    expected_effect: "phase advanced",
  } as OrchestratorAction;
  
  const result = validator.validateRoleGate(action, state);
  
  assert(result.satisfied === false, "Role gate should not be satisfied");
  assert(result.missingRoles.includes("code-agent"), "Should be missing code-agent role");
  assert(result.errors.some(e => e.code === "PHASE_GATE_UNSATISFIED"), "Should have PHASE_GATE_UNSATISFIED error");
});

// ============================================================
// Phase 2: Integration Tests
// ============================================================

section("Phase 2: Integration Tests with Referee");

test("should reject specialist content with Phase 2 enabled", () => {
  const referee = createReferee({ detectSpecialistContent: true });
  
  const raw = `I've implemented the feature:

\`\`\`typescript
export const x = 1;
\`\`\`

Spawning a task now.`;
  
  const result = referee.process(raw, "parent-001");
  
  assert(result.success === false, "Should reject specialist content");
  assert(result.retryEnvelope?.payload.errors.some(e => e.code === "SPECIALIST_CONTENT_DETECTED"),
    "Should have SPECIALIST_CONTENT_DETECTED error");
});

test("should pass pure delegation with Phase 2 enabled", () => {
  const referee = createReferee({ detectSpecialistContent: true });
  referee.setOrgState(SAMPLE_ORG_STATE);
  
  const raw = `Based on the analysis, I should delegate the implementation work to a code-agent.
The code-agent should create the API endpoint with proper authentication.
Let me spawn the appropriate subtask for this work.`;
  
  const result = referee.process(raw, "parent-001");
  
  // Delegation narrative should pass (no JSON action, but parse error is acceptable)
  // The key is it shouldn't have SPECIALIST_CONTENT_DETECTED for delegation prose
  assert(result.retryEnvelope === undefined || 
    !result.retryEnvelope.payload.errors.some((e: any) => e.code === "SPECIALIST_CONTENT_DETECTED"),
    "Pure delegation should not trigger specialist content error");
});

test("should validate citation when merging child findings", () => {
  const referee = createReferee();
  
  // Set up org state with child having findings
  const stateWithChild: OrgState = {
    workflowPath: "runbook/001-test.org",
    tasks: new Map([
      ["parent-001", { id: "parent-001", status: "IN-PROGRESS", findings: [], evidence: [] } as TaskState],
      ["impl-001", { 
        id: "impl-001", 
        status: "DONE", 
        phase: "implementation",
        parent: "parent-001",
        findings: [
          { id: "F-101", content: "API implemented", rating: "★★★", timestamp: "2026-03-30T10:00:00Z" },
        ],
        evidence: [
          { id: "E-101", type: "file", source: "/src/api.ts", finding_ref: "F-101", rating: "★★★", timestamp: "2026-03-30T10:01:00Z" },
        ],
      } as TaskState],
    ]),
  };
  referee.setOrgState(stateWithChild);
  
  const validMerge = {
    action: "MERGE_SUBTASK_RESULT",
    parent_task_id: "parent-001",
    reason: "Implementation completed successfully",
    payload: {
      child_task_id: "impl-001",
      summary: "API endpoint implemented",
      finding_refs: ["F-101"],
      evidence_refs: ["E-101"],
    },
    expected_effect: "merged",
  };
  
  const result = referee.process(JSON.stringify(validMerge), "parent-001");
  
  assert(result.success === true, "Valid merge with child findings should pass");
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
    console.log("\n✓ All tests passed!");
    process.exit(0);
  }
});
