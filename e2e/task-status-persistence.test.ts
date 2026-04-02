/**
 * E2E Test: Task Status Persistence
 * 
 * Tests that workflow.setStatus actually persists task status changes to file.
 * 
 * BUG: Currently workflow.setStatus only updates an in-memory Map (taskRegistry),
 * but never persists to file. workflow.update only writes findings, not status.
 * 
 * This test reproduces the bug and verifies the fix.
 */

import * as fs from "fs";
import * as path from "path";
import * as http from "http";
import { fileURLToPath } from "url";
import { execSync, spawn } from "child_process";

// ESM compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const SUPERVISOR_PORT = parseInt(process.env.PI_SUPERVISOR_PORT || "3847", 10);
const SUPERVISOR_URL = `http://localhost:${SUPERVISOR_PORT}`;
const PROJECT_ROOT = path.join(__dirname, "..");
const TEST_WORKFLOW_DIR = path.join(PROJECT_ROOT, "runbook");

// Colors
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const NC = "\x1b[0m";

let testsPassed = 0;
let testsFailed = 0;

function log(msg: string, color: string = NC) {
  console.log(`${color}[INFO]${NC} ${msg}`);
}

function logSuccess(msg: string) {
  console.log(`${GREEN}[PASS]${NC} ${msg}`);
  testsPassed++;
}

function logFail(msg: string) {
  console.log(`${RED}[FAIL]${NC} ${msg}`);
  testsFailed++;
}

// API helpers
async function supervisorRequest(endpoint: string, options: {
  method?: string;
  body?: any;
  headers?: http.OutgoingHttpHeaders;
} = {}): Promise<any> {
  const bodyStr = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
  
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "localhost",
        port: SUPERVISOR_PORT,
        path: endpoint,
        method: options.method || "GET",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(bodyStr || ""),
          ...options.headers,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, data });
          }
        });
      }
    );
    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function waitForHealth(timeout: number = 30): Promise<boolean> {
  for (let i = 0; i < timeout; i++) {
    try {
      const res = await supervisorRequest("/health");
      if (res.status === 200) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

// Create a test workflow file
function createTestWorkflow(filename: string): string {
  const workflowPath = path.join(TEST_WORKFLOW_DIR, filename);
  
  const content = `#+title:      Task Status Test Workflow
#+date:       [2026-03-30]
#+filetags:   :test:
#+identifier: proj-status-test
#+TODO:       TODO(t) IN-PROGRESS(i) | DONE(d) BLOCKED(b) CANCELLED(c)

* Project: Task Status Test
:PROPERTIES:
:PHASE: discovery
:END:

** TODO Coordination task
:PROPERTIES:
:ID: coord-task-001
:OWNER: orchestrator
:PHASE: discovery
:CREATED: 2026-03-30T00:00:00.000Z
:END:
- Goal :: Coordination task for status test
- Context ::
- Findings ::
- Evidence ::
- Next Actions ::

*** TODO Discovery subtask
:PROPERTIES:
:ID: subtask-001
:PARENT: coord-task-001
:OWNER: code-agent
:PHASE: discovery
:CREATED: 2026-03-30T00:00:00.000Z
:END:
- Goal :: Subtask to be completed
- Context ::
- Findings ::
- Evidence ::
- Next Actions ::

*** TODO Phase: discovery → design
:PROPERTIES:
:ID: gate-discovery-design
:PARENT: coord-task-001
:OWNER: orchestrator
:PHASE: discovery
:EXIT_CRITERIA:
:  - [ ] Define exit criteria
:END:
- Gate :: Approval required to proceed
- Next Actions ::
`;

  fs.mkdirSync(TEST_WORKFLOW_DIR, { recursive: true });
  fs.writeFileSync(workflowPath, content);
  log(`Created workflow: ${workflowPath}`);
  return workflowPath;
}

// Read workflow and extract task status
function getTaskStatus(workflowPath: string, taskId: string): string | null {
  const content = fs.readFileSync(workflowPath, "utf-8");
  
  // Find the :ID: taskId line, then look backwards for the heading
  const idPattern = new RegExp(`:ID:\\s+${taskId}\\s*\n`);
  const idMatch = content.match(idPattern);
  
  if (!idMatch || idMatch.index === undefined) {
    return null;
  }
  
  // Get content before :ID:
  const beforeId = content.substring(0, idMatch.index);
  const lines = beforeId.split("\n");
  
  // Find the heading line with status keyword
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    const match = line.match(/^\*+ (TODO|IN-PROGRESS|DONE|BLOCKED|CANCELLED)/);
    if (match) {
      return match[1];
    }
  }
  
  return null;
}

// Main test
async function main() {
  console.log("\n" + "=".repeat(70));
  console.log(" E2E Test: Task Status Persistence");
  console.log("=".repeat(70) + "\n");

  // Cleanup
  log("Cleaning up existing supervisor...");
  try {
    execSync(`fuser -k ${SUPERVISOR_PORT}/tcp 2>/dev/null || true`);
    execSync(`rm -f ~/.pi-adapter-supervisor-${SUPERVISOR_PORT}.pid`);
  } catch {}

  // Wait for port to be free
  await new Promise((r) => setTimeout(r, 2));

  // Start supervisor
  log("Starting supervisor...");
  const protocolPath = path.join(PROJECT_ROOT, "adapters", "pi", "protocol.ts");
  
  const supervisor = spawn("npx", ["ts-node", "--esm", "protocol.ts"], {
    cwd: path.join(PROJECT_ROOT, "adapters", "pi"),
    env: { ...process.env, PI_SUPERVISOR_PORT: String(SUPERVISOR_PORT) },
    detached: true,
    stdio: "ignore",
  });
  supervisor.unref();

  // Wait for supervisor to be ready
  log("Waiting for supervisor to be healthy...");
  const healthy = await waitForHealth(60);
  if (!healthy) {
    logFail("Supervisor failed to start");
    process.exit(1);
  }
  log("Supervisor is healthy", GREEN);

  try {
    // TC-STATUS-001: Verify initial workflow state
    log("\n--- TC-STATUS-001: Verify initial workflow state ---");
    const workflowPath = createTestWorkflow("tc-status-001-test.org");
    
    let status = getTaskStatus(workflowPath, "coord-task-001");
    if (status === "TODO") {
      logSuccess("Initial task status is TODO (correct)");
    } else {
      logFail(`Expected TODO, got ${status}`);
    }

    // TC-STATUS-002: Test that findings are written via workflow.update
    log("\n--- TC-STATUS-002: Test workflow.update writes findings ---");
    const findings = [
      {
        id: "F-test-001",
        content: "Test finding content",
        rating: "★★★",
        timestamp: new Date().toISOString(),
      },
    ];

    const updateRes = await supervisorRequest("/workflow/update", {
      method: "POST",
      body: JSON.stringify({ workflowPath, findings }),
    });

    if (updateRes.status === 200 && updateRes.data.success) {
      logSuccess("workflow.update returned success");
    } else {
      logFail(`workflow.update failed: ${JSON.stringify(updateRes)}`);
    }

    // Verify finding was written
    const contentAfterFinding = fs.readFileSync(workflowPath, "utf-8");
    if (contentAfterFinding.includes("F-test-001")) {
      logSuccess("Finding was written to file");
    } else {
      logFail("Finding was NOT written to file");
    }

    // TC-STATUS-003: Verify task status was NOT changed (demonstrates bug)
    log("\n--- TC-STATUS-003: Verify task status is NOT changed (demonstrates bug) ---");
    status = getTaskStatus(workflowPath, "coord-task-001");
    if (status === "TODO") {
      log("Task status is still TODO (expected - demonstrates the bug)", YELLOW);
      log("The bug: workflow.setStatus only updates in-memory Map, not file");
    } else {
      log(`Task status is ${status} - unexpected`);
    }

    // TC-STATUS-004: Need endpoint to update task status
    log("\n--- TC-STATUS-004: Test task status update endpoint ---");
    
    // Currently there's no /workflow/status endpoint
    // The fix should add one that updates the TODO keyword in the file
    
    // Check if endpoint exists
    const statusRes = await supervisorRequest("/workflow/status", {
      method: "POST",
      body: JSON.stringify({ workflowPath, taskId: "coord-task-001", status: "DONE" }),
    });

    if (statusRes.status === 200 || statusRes.status === 404) {
      log(`Status update endpoint returned ${statusRes.status}`, 
          statusRes.status === 200 ? GREEN : YELLOW);
      
      if (statusRes.status === 404) {
        log("BUG CONFIRMED: No endpoint to update task status", RED);
        log("FIX NEEDED: Add /workflow/status endpoint to protocol.ts");
      }
    }

    // TC-STATUS-005: Verify task status change was persisted (after fix)
    log("\n--- TC-STATUS-005: Verify task status was persisted ---");
    status = getTaskStatus(workflowPath, "coord-task-001");
    if (status === "DONE") {
      logSuccess("Task status is now DONE (fix working)");
    } else {
      logFail(`Task status is still ${status} (fix not working)`);
    }

  } catch (error) {
    log(`Error during test: ${error}`, RED);
    logFail(String(error));
  } finally {
    // Cleanup
    log("\nCleaning up...");
    try {
      execSync(`fuser -k ${SUPERVISOR_PORT}/tcp 2>/dev/null || true`);
    } catch {}
  }

  // Summary
  console.log("\n" + "=".repeat(70));
  console.log(" TEST SUMMARY");
  console.log("=".repeat(70));
  console.log(`  ${GREEN}Passed: ${testsPassed}${NC}`);
  console.log(`  ${RED}Failed: ${testsFailed}${NC}`);
  console.log("=".repeat(70) + "\n");

  process.exit(testsFailed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
