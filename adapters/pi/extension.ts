/**
 * pi-adapter: Extension for multi-agent orchestration
 * 
 * Purpose: Implements runtime adapter layer for spawning worker agents
 * 
 * Key capabilities:
 * - Custom workflow tools (workflow.*, worker.*)
 * - Path protection guardrail
 * - Role-based tool restrictions
 * - Supervisor auto-start integration via HTTP API
 * 
 * Based on:
 * - pi Extension API (pi.on, pi.registerTool)
 * - runbook-multiagent/SKILL.md protocol
 * - orchestrator-skill/SKILL.md profile
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import * as fs from "fs";

// ============================================================
// Configuration (from environment)
// ============================================================

const SUPERVISOR_PORT = parseInt(process.env.PI_SUPERVISOR_PORT || "3847", 10);
const SUPERVISOR_HOST = process.env.PI_SUPERVISOR_HOST || "localhost";
const WORKER_ID = process.env.PI_WORKER_ID || "";
const TASK_ID = process.env.PI_TASK_ID || "";
const RESULTS_DIR = process.env.PI_RESULTS_DIR || "/tmp/pi-adapter-results";

const SUPERVISOR_URL = `http://${SUPERVISOR_HOST}:${SUPERVISOR_PORT}`;

// ============================================================
// Types
// ============================================================

type Role = 
  | "orchestrator" 
  | "code-agent" 
  | "test-agent" 
  | "ops-agent" 
  | "pm-agent" 
  | "arch-agent"
  | "research-agent"
  | "ux-agent"
  | "api-agent"
  | "qa-agent"
  | "integration-agent"
  | "deploy-agent"
  | "deps-agent"
  | "security-agent"
  | "perf-agent"
  | "data-agent";

interface Task {
  id: string;
  owner: Role;
  phase: string;
  status: "TODO" | "IN-PROGRESS" | "DONE" | "BLOCKED";
}

interface Finding {
  id: string;
  content: string;
  rating: string;
  timestamp: string;
}

interface WorkerResult {
  workerId: string;
  taskId: string;
  role: Role;
  exitCode: number;
  findings: Finding[];
  artifacts: string[];
  stdout?: string;
  stderr?: string;
}

// ============================================================
// Role Tool Restrictions
// ============================================================

const ROLE_TOOLS: Record<string, string[]> = {
  orchestrator: [
    "workflow.claimTask",
    "workflow.appendFinding", 
    "workflow.attachEvidence",
    "workflow.setStatus",
    "workflow.advancePhase",
    "workflow.update",
    "workflow.init",
    "worker.spawn",
    "worker.awaitResult",
    "worker.status",
    "worker.getOutput",
    "worker.kill",
    "worker.getLog",
    "supervisor.getStatus",
    "supervisor.getLog",
    "read",
    "grep",
    "find",
    "ls",
  ],
  "code-agent": [
    "read",
    "write",
    "edit",
    "bash",
    "grep",
    "find",
    "ls",
    "workflow.appendFinding",
    "workflow.setStatus",
  ],
  "test-agent": [
    "read",
    "bash",
    "grep",
    "find",
    "ls",
    "workflow.appendFinding",
    "workflow.setStatus",
  ],
  "ops-agent": [
    "read",
    "bash",
    "grep",
    "find",
    "ls",
    "workflow.appendFinding",
    "workflow.setStatus",
  ],
  "research-agent": ["read", "write", "grep", "find", "ls", "workflow.appendFinding"],
  "ux-agent": ["read", "write", "grep", "find", "ls", "workflow.appendFinding"],
  "api-agent": ["read", "write", "edit", "bash", "grep", "find", "ls", "workflow.appendFinding"],
  "qa-agent": ["read", "bash", "grep", "find", "ls", "workflow.appendFinding"],
  "integration-agent": ["read", "bash", "grep", "find", "ls", "workflow.appendFinding"],
  "deploy-agent": ["read", "bash", "grep", "find", "ls", "workflow.appendFinding"],
  "deps-agent": ["read", "bash", "grep", "find", "ls", "workflow.appendFinding"],
  "security-agent": ["read", "bash", "grep", "find", "ls", "workflow.appendFinding"],
  "perf-agent": ["read", "bash", "grep", "find", "ls", "workflow.appendFinding"],
  "data-agent": ["read", "write", "bash", "grep", "find", "ls", "workflow.appendFinding"],
  "pm-agent": ["read", "write", "grep", "find", "ls", "workflow.appendFinding", "workflow.setStatus"],
  "arch-agent": ["read", "write", "grep", "find", "ls", "workflow.appendFinding", "workflow.setStatus"],
};

// ============================================================
// Protected Paths
// ============================================================

const PROTECTED_PATHS = [
  "/path/to/secrets",
  "/path/to/prod",
  "/.pi/secrets",
  "/.ssh",
];

// ============================================================
// State
// ============================================================

let currentRole: string = process.env.PI_ROLE || "orchestrator";
let taskRegistry = new Map<string, Task>();
let localFindings: Finding[] = [];
let supervisorProcess: ChildProcess | null = null;
let supervisorStartedByThis: boolean = false;

// ============================================================
// Supervisor Management
// ============================================================

// Unique ID for this extension instance (for debugging)
const INSTANCE_ID = Math.random().toString(36).substr(2, 6);

async function checkSupervisorHealth(): Promise<boolean> {
  try {
    await supervisorRequest("/health");
    return true;
  } catch {
    return false;
  }
}

async function ensureSupervisorRunning(): Promise<boolean> {
  // Check if supervisor is already running
  if (await checkSupervisorHealth()) {
    console.log(`[${INSTANCE_ID}] ✅ Supervisor already running`);
    return true;
  }

  console.log(`[${INSTANCE_ID}] ⚠️ Supervisor not running, attempting auto-start...`);
  return await startSupervisor();
}

async function supervisorRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  try {
    const response = await fetch(`${SUPERVISOR_URL}${endpoint}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Supervisor: worker not found (may still be starting). Try again in a few seconds.`);
      }
      throw new Error(`Supervisor error: ${response.status} ${response.statusText}`);
    }

    return await response.json() as T;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes("fetch")) {
      throw new Error(`Supervisor not ready (may still be starting). Auto-starting... Try again in a few seconds.`);
    }
    throw error;
  }
}

function findProtocolScript(): string | null {
  // Try multiple possible locations
  const possiblePaths = [
    // Relative to current working directory
    path.join(process.cwd(), "adapters", "pi", "protocol.ts"),
    path.join(process.cwd(), "protocol.ts"),
    // Relative to extension location
    path.join(__dirname, "protocol.ts"),
    path.join(__dirname, "..", "protocol.ts"),
    // Global adapters directory
    path.join(process.env.HOME || "", ".pi", "adapters", "pi", "protocol.ts"),
    // Project .pi/extensions/pi-adapter/
    path.join(process.env.HOME || "", ".pi", "extensions", "pi-adapter", "protocol.ts"),
  ];

  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) {
        return p;
      }
    } catch {
      // Continue searching
    }
  }
  return null;
}

async function startSupervisor(): Promise<boolean> {
  const protocolPath = findProtocolScript();
  
  if (!protocolPath) {
    console.error("❌ Could not find protocol.ts to start supervisor");
    return false;
  }

  console.log(`🚀 Auto-starting supervisor from: ${protocolPath}`);

  return new Promise((resolve) => {
    // Use shell to start supervisor - more reliable across environments
    supervisorProcess = spawn("bash", ["-c", `cd "${path.dirname(protocolPath)}" && npx ts-node --esm "${path.basename(protocolPath)}"`], {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        PI_SUPERVISOR_PORT: String(SUPERVISOR_PORT),
      },
      detached: true,
    });

    supervisorProcess.unref();  // Don't wait for this process

    // Poll for health check until supervisor is ready
    const pollInterval = setInterval(async () => {
      try {
        const response = await supervisorRequest<{status: string}>("/health");
        clearInterval(pollInterval);
        supervisorStartedByThis = true;
        console.log("✅ Supervisor auto-started");
        resolve(true);
      } catch {
        // Still waiting
      }
    }, 1000);

    // Timeout after 30 seconds
    setTimeout(() => {
      clearInterval(pollInterval);
      console.warn("⚠️ Supervisor start timeout");
      resolve(false);
    }, 30000);
  });
}

// ============================================================
// Helper Functions
// ============================================================

function isPathProtected(path: string | undefined): boolean {
  if (!path) return false;
  return PROTECTED_PATHS.some(p => path.startsWith(p));
}

function isToolAllowed(toolName: string): boolean {
  const allowedTools = ROLE_TOOLS[currentRole] || [];
  return allowedTools.includes(toolName);
}

function generateFindingId(): string {
  return `F-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

function saveLocalFindings(): void {
  // Always save result if WORKER_ID is set (even with no findings)
  if (!WORKER_ID) return;

  const resultFile = `${RESULTS_DIR}/${WORKER_ID}.json`;
  const result: WorkerResult = {
    workerId: WORKER_ID,
    taskId: TASK_ID,
    role: currentRole as Role,
    exitCode: 0,
    findings: localFindings,
    artifacts: [],
    stdout: "",
    stderr: "",
  };

  try {
    if (!fs.existsSync(RESULTS_DIR)) {
      fs.mkdirSync(RESULTS_DIR, { recursive: true });
    }
    fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));
    console.log(`💾 Saved ${localFindings.length} findings to ${resultFile}`);
  } catch (error) {
    console.error(`Failed to save findings: ${error}`);
  }
}

// ============================================================
// Main Extension
// ============================================================

export default function piAdapterExtension(pi: ExtensionAPI) {
  console.log("🔌 pi-adapter extension loaded");
  console.log(`   Role: ${currentRole}`);
  console.log(`   Worker ID: ${WORKER_ID || "(none - main session)"}`);
  console.log(`   Task ID: ${TASK_ID || "(none)"}`);
  console.log(`   Supervisor: ${SUPERVISOR_URL}`);

  // ============================================================
  // Auto-start supervisor for orchestrator role
  // ============================================================
  
  if (currentRole === "orchestrator") {
    // Try to ensure supervisor is running (non-blocking)
    ensureSupervisorRunning().catch(err => {
      console.warn(`⚠️ Failed to auto-start supervisor: ${err}`);
    });
  }

  // ============================================================
  // Workflow Tools
  // ============================================================

  // workflow.init
  pi.registerTool({
    name: "workflow.init",
    label: "Initialize Workflow",
    description: "Initialize a new workflow.org file following the schema defined in examples/schema.md. Creates a runbook with proper TODO keywords, Task/Finding/Evidence objects, and phase gates.",
    parameters: Type.Object({
      workflowPath: Type.String({ description: "Path for workflow (e.g., runbook/001-my-project.org)" }),
      projectName: Type.String({ description: "Project name" }),
      projectId: Type.Optional(Type.String({ description: "Project ID (auto-generated if not provided)" })),
      phases: Type.Optional(Type.String({ description: "Comma-separated phases (default: discovery,design,implementation,test,integration,deploy-check,acceptance)" })),
    }),
    execute: async (_toolCallId, params) => {
      const { workflowPath, projectName, projectId, phases } = params as {
        workflowPath: string; projectName: string; projectId?: string; phases?: string;
      };
      
      const phaseList = phases?.split(",").map(p => p.trim()) || 
        ["discovery", "design", "implementation", "test", "integration", "deploy-check", "acceptance"];
      const projectIdFinal = projectId || `proj-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
      const parentId = `parent-${Date.now()}`;
      const now = new Date().toISOString();
      
      // Check if file already exists
      if (fs.existsSync(workflowPath)) {
        return {
          content: [{ type: "text", text: `Workflow already exists at ${workflowPath}` }],
          details: {
            success: false,
            message: "Workflow file already exists",
            checkpoint: `⚠️ Workflow exists: ${workflowPath}`,
            workflowPath: workflowPath,
            phases: phaseList,
          },
        };
      }
      
      // Generate phase gate tasks
      let phaseGates = "";
      for (let i = 0; i < phaseList.length - 1; i++) {
        const current = phaseList[i];
        const next = phaseList[i + 1];
        phaseGates += `
*** TODO Phase: ${current} → ${next}
:PROPERTIES:
:ID: gate-${current}-${next}
:PARENT: ${parentId}
:OWNER: orchestrator
:PHASE: ${current}
:EXIT_CRITERIA:
:  - [ ] Define exit criteria for ${current}
:END:
- Gate :: Approval required to proceed
- Next Actions ::
`;
      }
      
      // Generate subtasks for discovery phase
      const discoverySubtasks = `
*** TODO Discovery subtask
:PROPERTIES:
:ID: subtask-discovery-001
:PARENT: ${parentId}
:OWNER: <role-code>
:PHASE: discovery
:CREATED: ${now}
:END:
- Goal :: <goal>
- Context ::
- Findings ::
- Evidence ::
- Next Actions ::
`;
      
      // Create workflow content following schema
      const content = `#+title:      ${projectName}
#+date:       [${now.slice(0, 10)}]
#+filetags:   :project:
#+identifier: ${projectIdFinal}
#+TODO:       TODO(t) IN-PROGRESS(i) | DONE(d) BLOCKED(b) CANCELLED(c)

* Project: ${projectName}
:PROPERTIES:
:PHASE: discovery
:END:

** IN-PROGRESS <overall coordination>
:PROPERTIES:
:ID: ${parentId}
:OWNER: orchestrator
:PHASE: discovery
:CREATED: ${now}
:UPDATED: ${now}
:EXIT_CRITERIA:
:  - [ ] Define project-specific exit criteria
:NON-GOALS:
:  - [ ] no scope expansion without approval
:END:

- Goal :: ${projectName}
- Context ::
- Findings ::
- Evidence ::
- Next Actions ::

${discoverySubtasks}
${phaseGates}
`;

      try {
        // Create parent directories if needed
        const dir = path.dirname(workflowPath);
        if (dir && dir !== ".") {
          fs.mkdirSync(dir, { recursive: true });
        }
        
        fs.writeFileSync(workflowPath, content);
        return {
          content: [{ type: "text", text: `Created workflow at ${workflowPath}` }],
          details: {
            success: true,
            message: "Workflow created following schema from examples/schema.md",
            checkpoint: `📋 Created workflow: ${workflowPath}`,
            workflowPath: workflowPath,
            projectId: projectIdFinal,
            parentTaskId: parentId,
            phases: phaseList,
          },
        };
      } catch (error) {
        throw new Error(`Failed to create workflow: ${error}`);
      }
    },
  });

  // workflow.claimTask
  pi.registerTool({
    name: "workflow.claimTask",
    label: "Claim Task",
    description: "Claim a task for the current role. Updates task status to IN-PROGRESS.",
    parameters: Type.Object({
      taskId: Type.String({ description: "Task ID to claim" }),
      strategy: Type.Optional(Type.String({ description: "Execution strategy" })),
    }),
    execute: async (_toolCallId, params) => {
      const taskId = params.taskId as string;
      const strategy = params.strategy as string | undefined;
      
      const task = taskRegistry.get(taskId);
      if (!task) {
        taskRegistry.set(taskId, {
          id: taskId,
          owner: currentRole as Role,
          phase: "unknown",
          status: "IN-PROGRESS",
        });
      } else if (task.status !== "TODO") {
        throw new Error(`Task ${taskId} is not in TODO status`);
      } else {
        task.status = "IN-PROGRESS";
        task.owner = currentRole as Role;
        taskRegistry.set(taskId, task);
      }

      return {
        content: [{ type: "text", text: `Task ${taskId} claimed by ${currentRole}` }],
        details: {
          success: true,
          message: `Task ${taskId} claimed by ${currentRole}`,
          checkpoint: `🔒 ${currentRole} claimed ${taskId} with strategy: ${strategy || "default"}`,
        },
      };
    },
  });

  // workflow.appendFinding
  pi.registerTool({
    name: "workflow.appendFinding",
    label: "Append Finding",
    description: "Append a finding to a task with rating.",
    parameters: Type.Object({
      taskId: Type.String({ description: "Task ID" }),
      content: Type.String({ description: "Finding content" }),
      rating: Type.String({ description: "Reliability rating: ★★★, ★★, or ★" }),
    }),
    execute: async (_toolCallId, params) => {
      const { taskId, content, rating } = params as { taskId: string; content: string; rating: string };
      const timestamp = new Date().toISOString();
      const findingId = generateFindingId();

      const finding: Finding = {
        id: findingId,
        content,
        rating,
        timestamp,
      };
      localFindings.push(finding);

      return {
        content: [{ type: "text", text: `Finding ${findingId} appended to task ${taskId}` }],
        details: {
          success: true,
          findingId,
          taskId,
          checkpoint: `- [${timestamp}] ${findingId}: ${content} [${rating}]`,
          note: `Finding stored locally (${localFindings.length} total). Will be saved on exit.`,
        },
      };
    },
  });

  // workflow.attachEvidence
  pi.registerTool({
    name: "workflow.attachEvidence",
    label: "Attach Evidence",
    description: "Attach evidence to an existing finding.",
    parameters: Type.Object({
      findingId: Type.String({ description: "Finding ID (F-xxx)" }),
      evidenceType: Type.String({ description: "Type: file, command, web, or agent-output" }),
      source: Type.String({ description: "File path or URL" }),
      rating: Type.String({ description: "Evidence rating: ★★★, ★★, or ★" }),
    }),
    execute: async (_toolCallId, params) => {
      const { findingId, evidenceType, source, rating } = params as {
        findingId: string; evidenceType: string; source: string; rating: string;
      };
      const timestamp = new Date().toISOString();
      const evidenceId = `E-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

      return {
        content: [{ type: "text", text: `Evidence ${evidenceId} attached to ${findingId}` }],
        details: {
          success: true,
          evidenceId,
          findingId,
          checkpoint: `- [${timestamp}] ${evidenceId}: ${evidenceType}: ${source} # Finding: ${findingId} # Rating: ${rating}`,
        },
      };
    },
  });

  // workflow.setStatus
  pi.registerTool({
    name: "workflow.setStatus",
    label: "Set Task Status",
    description: "Set the status of a task.",
    parameters: Type.Object({
      taskId: Type.String({ description: "Task ID" }),
      status: Type.String({ description: "New status: TODO, IN-PROGRESS, DONE, or BLOCKED" }),
    }),
    execute: async (_toolCallId, params) => {
      const { taskId, status } = params as { taskId: string; status: string };
      
      const task = taskRegistry.get(taskId);
      if (!task) {
        taskRegistry.set(taskId, {
          id: taskId,
          owner: currentRole as Role,
          phase: "unknown",
          status: status as Task["status"],
        });
      } else {
        task.status = status as Task["status"];
        taskRegistry.set(taskId, task);
      }

      return {
        content: [{ type: "text", text: `Task ${taskId} status set to ${status}` }],
        details: {
          success: true,
          checkpoint: `📋 Task ${taskId}: ${status}`,
        },
      };
    },
  });

  // workflow.advancePhase
  pi.registerTool({
    name: "workflow.advancePhase",
    label: "Advance Phase",
    description: "Advance the workflow to the next phase.",
    parameters: Type.Object({
      nextPhase: Type.String({ description: "Next phase: discovery, design, implementation, test, integration, deploy-check, or acceptance" }),
    }),
    execute: async (_toolCallId, params) => {
      const { nextPhase } = params as { nextPhase: string };

      return {
        content: [{ type: "text", text: `Phase advanced to ${nextPhase}` }],
        details: {
          success: true,
          checkpoint: `🔄 Phase: ${nextPhase}`,
        },
      };
    },
  });

  // workflow.update
  pi.registerTool({
    name: "workflow.update",
    label: "Update Workflow",
    description: "Write accumulated findings to workflow.org via supervisor.",
    parameters: Type.Object({
      workflowPath: Type.String({ description: "Path to workflow.org" }),
    }),
    execute: async (_toolCallId, params) => {
      const { workflowPath } = params as { workflowPath: string };
      
      // Ensure supervisor is running
      if (!await checkSupervisorHealth()) {
        const started = await ensureSupervisorRunning();
        if (!started) {
          throw new Error("Cannot update workflow: supervisor unavailable");
        }
      }
      
      if (localFindings.length === 0) {
        return {
          content: [{ type: "text", text: "No findings to write" }],
          details: { success: true, findingsWritten: 0 },
        };
      }

      try {
        const response = await supervisorRequest<{ success: boolean }>("/workflow/update", {
          method: "POST",
          body: JSON.stringify({ workflowPath, findings: localFindings }),
        });

        if (response.success) {
          const count = localFindings.length;
          localFindings = [];
          return {
            content: [{ type: "text", text: `Written ${count} findings to workflow` }],
            details: { success: true, findingsWritten: count },
          };
        } else {
          throw new Error("Failed to write to workflow");
        }
      } catch (error) {
        throw new Error(`Failed to update workflow: ${error}`);
      }
    },
  });

  // ============================================================
  // Worker Tools
  // ============================================================

  // worker.spawn
  pi.registerTool({
    name: "worker.spawn",
    label: "Spawn Worker",
    description: `Spawn a worker agent for a specific role to execute specialist work.

WHEN TO USE:
- When you (orchestrator) need to delegate specialist work
- When code-agent, test-agent, ops-agent, or other role is needed

REQUIRED PARAMETERS:
- role: The worker role (code-agent, test-agent, etc.)
- task: Description of what the worker should do
- taskId: Task ID in workflow for tracking
- workflowPath: Path to workflow.org

IMPORTANT: Orchestrator should use this tool instead of attempting domain work directly.`,
    parameters: Type.Object({
      role: Type.String({ description: "Worker role: code-agent, test-agent, ops-agent, pm-agent, or arch-agent" }),
      task: Type.String({ description: "Task description" }),
      taskId: Type.String({ description: "Task ID in workflow" }),
      skill: Type.Optional(Type.String({ description: "Skill path to inject" })),
      contextFiles: Type.Optional(Type.Array(Type.String(), { description: "Context files to read" })),
      workflowPath: Type.String({ description: "Path to workflow.org" }),
    }),
    execute: async (_toolCallId, params) => {
      const { role, task, taskId, skill, contextFiles, workflowPath } = params as {
        role: string; task: string; taskId: string; skill?: string; contextFiles?: string[]; workflowPath: string;
      };

      // Ensure supervisor is running
      if (!await checkSupervisorHealth()) {
        console.log("⚠️ Supervisor not running, attempting auto-start...");
        const started = await ensureSupervisorRunning();
        if (!started) {
          throw new Error(`Supervisor not available on ${SUPERVISOR_URL}. Could not auto-start.`);
        }
      }

      const config = { role, task, taskId, skill, contextFiles, workflowPath };

      try {
        const response = await supervisorRequest<{ success: boolean; workerId: string; statusUrl: string }>("/worker/spawn", {
          method: "POST",
          body: JSON.stringify(config),
        });

        return {
          content: [{ 
            type: "text", 
            text: `Spawned ${role} worker for task ${taskId}\nWorker ID: ${response.workerId}` 
          }],
          details: {
            success: true,
            workerId: response.workerId,
            statusUrl: response.statusUrl,
            checkpoint: `🤖 spawn ${role} (${response.workerId}) for ${taskId}`,
          },
        };
      } catch (error) {
        throw new Error(`Failed to spawn worker: ${error}`);
      }
    },
  });

  // worker.awaitResult
  pi.registerTool({
    name: "worker.awaitResult",
    label: "Await Worker Result",
    description: `Wait for a spawned worker to complete and return its results.

REQUIRED PARAMETERS:
- workerId: The worker ID returned from worker.spawn

OPTIONAL PARAMETERS:
- timeout: Max seconds to wait (default: 1800 = 30 minutes)`,
    parameters: Type.Object({
      workerId: Type.String({ description: "Worker ID to wait for" }),
      timeout: Type.Optional(Type.Number({ description: "Timeout in seconds (default: 300)" })),
    }),
    execute: async (_toolCallId, params) => {
      const { workerId, timeout } = params as { workerId: string; timeout?: number };

      // Ensure supervisor is running before waiting
      if (!await checkSupervisorHealth()) {
        console.log("⚠️ Supervisor not running, attempting auto-start...");
        const started = await ensureSupervisorRunning();
        if (!started) {
          throw new Error(`Supervisor not available on ${SUPERVISOR_URL}. Could not auto-start.`);
        }
      }

      try {
        const response = await supervisorRequest<{ success: boolean; result?: WorkerResult; error?: string }>(
          `/worker/${workerId}/await`,
          { method: "POST", body: JSON.stringify({ timeout: timeout || 1800 }) }
        );

        if (response.success && response.result) {
          return {
            content: [{ type: "text", text: `Worker ${workerId} completed with ${response.result.findings.length} findings` }],
            details: {
              success: true,
              workerId,
              exitCode: response.result.exitCode,
              findings: response.result.findings,
              artifacts: response.result.artifacts,
              checkpoint: `✅ Worker ${workerId} completed with ${response.result.findings.length} findings`,
            },
          };
        } else {
          throw new Error(response.error || "Unknown error");
        }
      } catch (error) {
        throw new Error(`Failed to await result: ${error}`);
      }
    },
  });

  // worker.status
  pi.registerTool({
    name: "worker.status",
    label: "Worker Status",
    description: "Check the status of a worker.",
    parameters: Type.Object({
      workerId: Type.String({ description: "Worker ID" }),
    }),
    execute: async (_toolCallId, params) => {
      const { workerId } = params as { workerId: string };

      // Ensure supervisor is running
      if (!await checkSupervisorHealth()) {
        console.log("⚠️ Supervisor not running, attempting auto-start...");
        const started = await ensureSupervisorRunning();
        if (!started) {
          throw new Error(`Supervisor not available on ${SUPERVISOR_URL}. Could not auto-start.`);
        }
      }

      try {
        const response = await supervisorRequest<any>(`/worker/${workerId}/status`);
        return {
          content: [{ type: "text", text: `Worker ${workerId}: ${response.status}` }],
          details: response,
        };
      } catch (error) {
        throw new Error(`Failed to get status: ${error}`);
      }
    },
  });

  // ============================================================
  // Debug/Log Tools (for Orchestrator)
  // ============================================================

  // supervisor.getLog
  pi.registerTool({
    name: "supervisor.getLog",
    label: "Get Supervisor Log",
    description: `Read supervisor log file to diagnose issues.

USE WHEN:
- You encounter 408 timeout errors
- Worker spawn fails unexpectedly
- Supervisor seems unresponsive
- You need to debug multi-agent coordination issues
- You want to see request timing, worker spawn/exit, errors

PARAMETERS:
- lines: Number of lines to read (default: 50, max: 500)
- date: Date to read log for (default: today, format: YYYY-MM-DD)

EXAMPLES:
- After awaitResult timeout: Check log to see if worker exited or is hung
- After spawn failure: Check log for error details
- Read yesterday's log: { date: "2026-03-29", lines: 100 }`,
    parameters: Type.Object({
      lines: Type.Optional(Type.Number({ description: "Number of lines to read (default: 50, max: 500)" })),
      date: Type.Optional(Type.String({ description: "Date to read log for (format: YYYY-MM-DD, default: today)" })),
    }),
    execute: async (_toolCallId, params) => {
      const lines = Math.min((params.lines as number) || 50, 500);
      const date = (params.date as string) || new Date().toISOString().slice(0, 10);
      
      try {
        // Read the specified day's log file
        const logFile = path.join(process.env.HOME || "/tmp", ".pi-adapter", "logs", `supervisor-${date}.log`);
        
        if (!fs.existsSync(logFile)) {
          // Try to list available log files
          const logsDir = path.join(process.env.HOME || "/tmp", ".pi-adapter", "logs");
          let availableDates = [];
          if (fs.existsSync(logsDir)) {
            availableDates = fs.readdirSync(logsDir)
              .filter(f => f.startsWith("supervisor-") && f.endsWith(".log"))
              .map(f => f.replace("supervisor-", "").replace(".log", ""))
              .sort()
              .reverse();
          }
          return {
            content: [{ type: "text", text: `No supervisor log found for ${date}. Available dates: ${availableDates.join(", ") || "none"}` }],
            details: { date, logFile, lines: 0, availableDates },
          };
        }
        
        const content = fs.readFileSync(logFile, "utf-8");
        const allLines = content.split("\n").filter(l => l.trim());
        const lastLines = allLines.slice(-lines);
        
        return {
          content: [{ type: "text", text: `Supervisor log for ${date} (last ${lastLines.length} lines):\n\`\`\`\n${lastLines.join("\n")}\n\`\`\`` }],
          details: {
            date,
            logFile,
            totalLines: allLines.length,
            returnedLines: lastLines.length,
            entries: lastLines,
          },
        };
      } catch (error) {
        throw new Error(`Failed to read supervisor log: ${error}`);
      }
    },
  });

  // worker.getLog
  pi.registerTool({
    name: "worker.getLog",
    label: "Get Worker Log",
    description: `Get stdout/stderr output from a worker via supervisor API.

USE WHEN:
- Worker is taking too long, want to see what it's doing
- Worker failed, want to see error output
- Worker completed but you need to see its output
- Diagnosing why worker is stuck or behaving unexpectedly

RETURNS:
- Worker stdout buffer (up to 2000 chars in response, full in details)
- Worker stderr buffer
- Output length (to detect excessive output)
- Status: "running" or "completed"

NOTE: Works for both running workers AND completed workers (results are persisted to disk).

EXAMPLES:
- Check progress: worker.getLog({ workerId: "worker-xxx" })
- Full output: Check details.stdout in response`,
    parameters: Type.Object({
      workerId: Type.String({ description: "Worker ID to get log from" }),
      tail: Type.Optional(Type.Number({ description: "Number of lines to tail from end (default: all)" })),
    }),
    execute: async (_toolCallId, params) => {
      const { workerId, tail } = params as { workerId: string; tail?: number };

      // Ensure supervisor is running
      if (!await checkSupervisorHealth()) {
        const started = await ensureSupervisorRunning();
        if (!started) {
          throw new Error(`Supervisor not available on ${SUPERVISOR_URL}. Could not auto-start.`);
        }
      }

      try {
        const response = await supervisorRequest<{
          workerId: string;
          status: "running" | "completed";
          stdout: string;
          stderr: string;
          stdoutLength: number;
          stderrLength: number;
        }>(`/worker/${workerId}/output`);

        // Apply tail if specified
        let stdout = response.stdout;
        let stderr = response.stderr;
        
        if (tail && tail > 0) {
          const stdoutLines = stdout.split("\n");
          const stderrLines = stderr.split("\n");
          stdout = stdoutLines.slice(-tail).join("\n");
          stderr = stderrLines.slice(-tail).join("\n");
        }

        const stdoutDisplay = stdout.slice(-2000);
        const stderrDisplay = stderr.slice(-2000);

        return {
          content: [{ 
            type: "text", 
            text: `Worker ${workerId} (${response.status}) output:\n\nSTDOUT (${response.stdoutLength} chars):\n\`\`\`\n${stdoutDisplay}\n\`\`\`\n\nSTDERR (${response.stderrLength} chars):\n\`\`\`\n${stderrDisplay}\n\`\`\`` 
          }],
          details: {
            workerId,
            status: response.status,
            stdoutLength: response.stdoutLength,
            stderrLength: response.stderrLength,
            stdout: response.stdout,  // Full output in details
            stderr: response.stderr,  // Full output in details
          },
        };
      } catch (error) {
        throw new Error(`Failed to get worker log: ${error}`);
      }
    },
  });

  // worker.getOutput
  pi.registerTool({
    name: "worker.getOutput",
    label: "Get Worker Output",
    description: `Get stdout/stderr output from a running or completed worker.

USE WHEN:
- Worker is taking too long, want to see what it's doing
- Worker failed, want to see error output
- Diagnosing why worker is hung

RETURNS:
- Worker stdout buffer
- Worker stderr buffer  
- Output length (to detect excessive output)`,
    parameters: Type.Object({
      workerId: Type.String({ description: "Worker ID to get output from" }),
    }),
    execute: async (_toolCallId, params) => {
      const { workerId } = params as { workerId: string };

      // Ensure supervisor is running
      if (!await checkSupervisorHealth()) {
        const started = await ensureSupervisorRunning();
        if (!started) {
          throw new Error(`Supervisor not available on ${SUPERVISOR_URL}. Could not auto-start.`);
        }
      }

      try {
        const response = await supervisorRequest<{
          workerId: string;
          stdout: string;
          stderr: string;
          stdoutLength: number;
          stderrLength: number;
        }>(`/worker/${workerId}/output`);

        return {
          content: [{ 
            type: "text", 
            text: `Worker ${workerId} output:\n\nSTDOUT (${response.stdoutLength} chars):\n\`\`\`\n${response.stdout.slice(-2000)}\n\`\`\`\n\nSTDERR (${response.stderrLength} chars):\n\`\`\`\n${response.stderr.slice(-2000)}\n\`\`\`` 
          }],
          details: {
            workerId,
            stdoutLength: response.stdoutLength,
            stderrLength: response.stderrLength,
            stdout: response.stdout,
            stderr: response.stderr,
          },
        };
      } catch (error) {
        throw new Error(`Failed to get worker output: ${error}`);
      }
    },
  });

  // worker.kill
  pi.registerTool({
    name: "worker.kill",
    label: "Kill Worker",
    description: `Force kill a hung worker process.

USE WHEN:
- Worker.awaitResult returns 408 timeout
- Worker has been running for too long
- Worker is clearly stuck (e.g., waiting for input)
- You need to restart a worker with new parameters

AFTER KILLING:
- Worker process will be terminated (SIGTERM, then SIGKILL after 5s)
- Result will NOT be available
- Spawn a new worker if needed

CAUTION:
- Worker will be forcefully terminated
- Any in-progress work will be lost
- Always check worker.getOutput first to understand the situation`,
    parameters: Type.Object({
      workerId: Type.String({ description: "Worker ID to kill" }),
    }),
    execute: async (_toolCallId, params) => {
      const { workerId } = params as { workerId: string };

      // Ensure supervisor is running
      if (!await checkSupervisorHealth()) {
        const started = await ensureSupervisorRunning();
        if (!started) {
          throw new Error(`Supervisor not available on ${SUPERVISOR_URL}. Could not auto-start.`);
        }
      }

      try {
        const response = await supervisorRequest<{
          success: boolean;
          message: string;
          note: string;
        }>(`/worker/${workerId}`, { method: "DELETE" });

        return {
          content: [{ 
            type: "text", 
            text: `Worker ${workerId} kill signal sent: ${response.message}\n${response.note}` 
          }],
          details: {
            success: response.success,
            workerId,
            message: response.message,
            note: response.note,
            checkpoint: `🛑 Killed worker: ${workerId}`,
          },
        };
      } catch (error) {
        throw new Error(`Failed to kill worker: ${error}`);
      }
    },
  });

  // ============================================================
  // Guardrail
  // ============================================================

  pi.on("tool_call", async (event, ctx) => {
    const toolName = event.toolName;

    // Skip check for supervisor-related tools
    if (toolName === "workflow.update" || toolName === "worker.spawn" || toolName === "workflow.init") {
      return null;
    }

    // Check if tool is allowed for current role
    if (!isToolAllowed(toolName)) {
      return {
        block: true,
        reason: `Tool '${toolName}' is not permitted for role '${currentRole}'. Allowed: ${ROLE_TOOLS[currentRole]?.join(", ") || "none"}`,
      };
    }

    // Check path protection for file operations
    if (toolName === "write" || toolName === "edit") {
      const path = (event.input?.path as string) || "";
      if (isPathProtected(path)) {
        return {
          block: true,
          reason: `Path '${path}' is protected`,
        };
      }
    }

    return null;
  });

  // ============================================================
  // Commands
  // ============================================================

  pi.registerCommand("adapter-status", {
    description: "Show pi-adapter status",
    handler: async (_args, ctx) => {
      const supervisorOk = await checkSupervisorHealth();
      const supervisorInfo = supervisorOk 
        ? "running" 
        : (supervisorStartedByThis ? "starting..." : "not running");
      
      ctx.ui.notify(`Role: ${currentRole}, Supervisor: ${supervisorInfo}`, "info");
    },
  });

  pi.registerCommand("supervisor-start", {
    description: "Manually start supervisor if not running",
    handler: async (_args, ctx) => {
      if (await checkSupervisorHealth()) {
        ctx.ui.notify("Supervisor already running", "info");
      } else {
        const started = await ensureSupervisorRunning();
        ctx.ui.notify(started ? "Supervisor started" : "Failed to start supervisor", started ? "success" : "error");
      }
    },
  });

  // supervisor.getStatus - Get supervisor and worker status
  pi.registerTool({
    name: "supervisor.getStatus",
    label: "Get Supervisor Status",
    description: `Get the current status of the supervisor and all workers.

RETURNS:
- supervisor: running | not_running
- activeWorkers: list of worker IDs currently running
- completedResults: list of recent completed workers with their results

WHEN TO USE:
- Before spawning workers to check supervisor is healthy
- After spawn failures to debug
- Before awaitResult to check if worker completed`,
    parameters: Type.Object({}),
    execute: async () => {
      const supervisorOk = await checkSupervisorHealth();
      if (!supervisorOk) {
        return {
          content: [{ type: "text", text: "Supervisor not running" }],
          details: { supervisor: "not_running", activeWorkers: [], completedResults: [] },
        };
      }

      try {
        const [workers, results] = await Promise.all([
          supervisorRequest<{workers: string[]}>("/workers"),
          supervisorRequest<{results: any[]}>("/results"),
        ]);

        return {
          content: [{ type: "text", text: `Supervisor running. Active: ${workers.workers?.length || 0}, Completed: ${results.results?.length || 0}` }],
          details: {
            supervisor: "running",
            activeWorkers: workers.workers || [],
            completedResults: results.results || [],
          },
        };
      } catch (error) {
        throw new Error(`Failed to get supervisor status: ${error}`);
      }
    },
  });

  pi.registerCommand("findings", {
    description: "Show local findings",
    handler: async (_args, ctx) => {
      ctx.ui.notify(`${localFindings.length} findings stored`, "info");
    },
  });

  // ============================================================
  // Exit Handler
  // ============================================================

  pi.on("session_shutdown", async () => {
    // Save findings before exit
    saveLocalFindings();
    
    // DON'T kill supervisor - it may have other workers running
    // or completed workers whose results need to be retrieved.
    // Supervisor will continue running and be reused by next session.
    // To kill manually: fuser -k 3847/tcp
  });

  // Save findings on exit - MUST be beforeExit to allow async operations
  process.on("beforeExit", () => {
    if (WORKER_ID && localFindings.length > 0) {
      saveLocalFindings();
    }
  });

  // Also save on SIGINT/SIGTERM
  process.on("SIGINT", () => {
    if (WORKER_ID) {
      saveLocalFindings();
    }
  });

  process.on("SIGTERM", () => {
    if (WORKER_ID) {
      saveLocalFindings();
    }
  });

  console.log(`✅ pi-adapter ready (role: ${currentRole})`);
}
