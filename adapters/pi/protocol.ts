/**
 * pi-adapter: Supervisor HTTP API
 * 
 * Supervisor 暴露 HTTP 接口供 extension 调用
 * extension 通过 fetch 调用 supervisor 的 API
 */

import express from "express";
import { spawn, ChildProcess } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// ESM compatibility for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================
// Logging
// ============================================================

const LOG_DIR = path.join(process.env.HOME || "/tmp", ".pi-adapter", "logs");
const LOG_FILE = path.join(LOG_DIR, `supervisor-${new Date().toISOString().slice(0,10)}.log`);

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Simple file logger - no console replacement to avoid recursion
function writeLog(message: string): void {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}\n`;
  try {
    fs.appendFileSync(LOG_FILE, logLine);
  } catch (e) {
    // Ignore
  }
}

// Convenience log functions that also print to console
function log(...args: any[]): void {
  const msg = args.join(" ");
  writeLog(msg);
  console.log(...args);
}

function logError(...args: any[]): void {
  const msg = args.join(" ");
  writeLog(`ERROR: ${msg}`);
  console.error(...args);
}

log("📝 Supervisor starting...");
log(`📝 Log file: ${LOG_FILE}`);

// ============================================================
// Singleton: Only one supervisor per project
// ============================================================

const PID_FILE = path.join(process.env.HOME || "/tmp", ".pi-adapter-supervisor.pid");

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);  // Signal 0 just checks if process exists
    return true;
  } catch {
    return false;
  }
}

function checkExistingSupervisor(): number | null {
  try {
    if (fs.existsSync(PID_FILE)) {
      const pid = parseInt(fs.readFileSync(PID_FILE, "utf-8").trim(), 10);
      if (!isNaN(pid) && isProcessAlive(pid)) {
        return pid;
      }
      // Stale PID file, remove it
      fs.unlinkSync(PID_FILE);
    }
  } catch {
    // Ignore errors
  }
  return null;
}

function writePidFile(): void {
  fs.writeFileSync(PID_FILE, String(process.pid), { mode: 0o644 });
}

function cleanupPidFile(): void {
  try {
    if (fs.existsSync(PID_FILE)) {
      const pid = parseInt(fs.readFileSync(PID_FILE, "utf-8").trim(), 10);
      if (pid === process.pid) {
        fs.unlinkSync(PID_FILE);
      }
    }
  } catch {
    // Ignore
  }
}

// Check for existing supervisor
const existingPid = checkExistingSupervisor();
if (existingPid) {
  log(`⚠️ Supervisor already running with PID ${existingPid}`);
  log(`   Exiting to prevent duplicate supervisor.`);
  log(`   If you need to restart, kill PID ${existingPid} first.`);
  process.exit(0);
}

// Write our PID
writePidFile();

// Cleanup on exit
process.on("exit", cleanupPidFile);
process.on("SIGINT", () => { cleanupPidFile(); process.exit(0); });
process.on("SIGTERM", () => { cleanupPidFile(); process.exit(0); });

// ============================================================
// Types
// ============================================================

// Extended role type to include all possible roles
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

interface SpawnRequest {
  role: Role;
  task: string;
  taskId: string;
  skill?: string;
  contextFiles?: string[];
  workflowPath: string;
}

interface WorkerResult {
  workerId: string;
  taskId: string;
  role: Role;
  exitCode: number;
  findings: Finding[];
  artifacts: string[];
  stdout: string;
  stderr: string;
}

interface Finding {
  id: string;
  content: string;
  rating: string;
  timestamp: string;
}

interface SupervisorState {
  workers: Map<string, ChildProcess>;
  results: Map<string, WorkerResult>;
  resultsDir: string;
}

// ============================================================
// Configuration
// ============================================================

const PI_COMMAND = process.env.PI_PATH || "pi";
const RESULTS_DIR = process.env.SUPERVISOR_RESULTS_DIR || "/tmp/pi-adapter-results";
const PORT = parseInt(process.env.SUPERVISOR_PORT || "3847", 10);

// Phase to Role mapping
const PHASE_ROLES: Record<string, Role[]> = {
  discovery: ["research-agent", "pm-agent"],
  design: ["arch-agent", "ux-agent", "pm-agent"],
  implementation: ["code-agent", "api-agent"],
  test: ["test-agent", "qa-agent"],
  integration: ["integration-agent"],
  "deploy-check": ["deploy-agent", "ops-agent"],
  acceptance: ["pm-agent", "qa-agent"],
};

// ============================================================
// State
// ============================================================

const state: SupervisorState = {
  workers: new Map(),
  results: new Map(),
  resultsDir: RESULTS_DIR,
};

// Ensure results directory exists
if (!fs.existsSync(RESULTS_DIR)) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

// ============================================================
// Workflow Parser
// ============================================================

interface WorkflowState {
  tasks: Map<string, { id: string; status: string; phase: string; owner: string }>;
  currentPhase: string;
}

function parseWorkflow(orgContent: string): WorkflowState {
  const tasks = new Map();
  const lines = orgContent.split("\n");
  let currentPhase = "discovery";

  for (const line of lines) {
    const phaseMatch = line.match(/:PHASE:\s*(\w+)/);
    if (phaseMatch) currentPhase = phaseMatch[1];

    const idMatch = line.match(/:TASK-ID:\s*(\S+)/);
    const statusMatch = line.match(/^\*+\s+(TODO|IN-PROGRESS|DONE|BLOCKED)/);
    const ownerMatch = line.match(/:OWNER:\s*(\S+)/);

    if (idMatch) {
      tasks.set(idMatch[1], {
        id: idMatch[1],
        status: statusMatch?.[1] || "TODO",
        phase: currentPhase,
        owner: ownerMatch?.[1] || "",
      });
    }
  }

  return { tasks, currentPhase };
}

// ============================================================
// Worker Spawner
// ============================================================

function spawnWorker(config: SpawnRequest, workerId: string): ChildProcess {
  const { role, task, taskId, skill, workflowPath, contextFiles } = config;

  // Build pi command
  // Extension should be auto-discovered from .pi/extensions/
  const args: string[] = [
    `--skill=${skill || "./.pi/skills/runbook-org/SKILL.md"}`,
    `-p`,  // print mode - don't start interactive TUI
  ];

  // Add context files
  if (contextFiles && contextFiles.length > 0) {
    args.push(...contextFiles.map(f => `@${f}`));
  }
  
  // Add workflow as context
  args.push(`@${workflowPath}`);
  
  // Add task description as the actual prompt
  // The task describes what the worker should do
  const prompt = `[${role}] Task: ${task}\nTask ID: ${taskId}\n\nRead the workflow.org for context, then complete the assigned task.`;
  args.push(prompt);

  // Build environment
  const env = {
    ...process.env,
    PI_ROLE: role,
    PI_WORKER_ID: workerId,
    PI_TASK_ID: taskId,
    PI_TASK_DESCRIPTION: task,
    PI_SUPERVISOR_PORT: PORT.toString(),
    PI_RESULTS_DIR: RESULTS_DIR,
  };

  log(`🚀 Spawning ${role} worker (${workerId})`);
  log(`   Command: ${PI_COMMAND} ${args.join(" ")}`);

  // Workers should always run in the project root (parent of adapters/)
  // This ensures relative paths work correctly
  const protocolDir = __dirname;
  const cwd = path.join(protocolDir, "..", "..");
  
  const worker = spawn(PI_COMMAND, args, {
    stdio: ["ignore", "pipe", "pipe"],  // stdin = ignore (not pipe)
    env,
    cwd,
  });

  // Store worker reference
  state.workers.set(workerId, worker);

  // Handle stdout
  worker.stdout?.on("data", (data) => {
    process.stdout.write(`[${role}/${workerId}] ${data}`);
  });

  // Handle stderr
  worker.stderr?.on("data", (data) => {
    process.stderr.write(`[${role}/${workerId}] ${data}`);
  });

  // Handle exit
  worker.on("exit", (code) => {
    log(`👋 Worker ${workerId} exited with code ${code}`);
    
    // Read result file if exists
    const resultFile = path.join(RESULTS_DIR, `${workerId}.json`);
    if (fs.existsSync(resultFile)) {
      try {
        const result = JSON.parse(fs.readFileSync(resultFile, "utf-8")) as WorkerResult;
        state.results.set(workerId, result);
      } catch (e) {
        logError(`Failed to read result file: ${e}`);
      }
    }

    state.workers.delete(workerId);
  });

  return worker;
}

// ============================================================
// Express App
// ============================================================

const app = express();
app.use(express.json());

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    workers: state.workers.size,
    results: state.results.size,
  });
});

// Spawn a worker
app.post("/worker/spawn", (req, res) => {
  const config = req.body as SpawnRequest;

  if (!config.role || !config.task || !config.taskId) {
    return res.status(400).json({ error: "Missing required fields: role, task, taskId" });
  }

  const workerId = `worker-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  
  try {
    spawnWorker(config, workerId);
    
    res.json({
      success: true,
      workerId,
      message: `Worker ${config.role} spawned for task ${config.taskId}`,
      statusUrl: `http://localhost:${PORT}/worker/${workerId}/status`,
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Get worker status
app.get("/worker/:workerId/status", (req, res) => {
  const { workerId } = req.params;
  
  const worker = state.workers.get(workerId);
  const result = state.results.get(workerId);

  if (result) {
    return res.json({
      status: "completed",
      workerId,
      result,
    });
  }

  if (worker) {
    return res.json({
      status: "running",
      workerId,
    });
  }

  res.status(404).json({ error: "Worker not found" });
});

// Await worker result
app.post("/worker/:workerId/await", (req, res) => {
  const { workerId } = req.params;
  const timeout = req.body.timeout || 300; // 5 minutes default

  const result = state.results.get(workerId);
  if (result) {
    return res.json({ success: true, result });
  }

  const worker = state.workers.get(workerId);
  if (!worker) {
    return res.status(404).json({ error: "Worker not found or already completed" });
  }

  // Set up timeout
  const timeoutId = setTimeout(() => {
    res.status(408).json({ error: "Timeout waiting for worker" });
  }, timeout * 1000);

  worker.on("exit", () => {
    clearTimeout(timeoutId);
    const result = state.results.get(workerId);
    if (result) {
      res.json({ success: true, result });
    } else {
      res.status(500).json({ error: "Worker completed but no result found" });
    }
  });
});

// Get all results
app.get("/results", (req, res) => {
  const results = Array.from(state.results.values());
  res.json({ results });
});

// Write findings to workflow
app.post("/workflow/update", (req, res) => {
  const { workflowPath, findings } = req.body;

  if (!workflowPath || !findings) {
    return res.status(400).json({ error: "Missing workflowPath or findings" });
  }

  try {
    if (!fs.existsSync(workflowPath)) {
      return res.status(404).json({ error: "Workflow file not found" });
    }

    let content = fs.readFileSync(workflowPath, "utf-8");

    // Append findings to the appropriate task nodes
    for (const finding of findings) {
      const checkpoint = `\n- [${finding.timestamp}] ${finding.id}: ${finding.content} [${finding.rating}]`;
      content += checkpoint;
    }

    fs.writeFileSync(workflowPath, content);

    res.json({ success: true, message: "Findings written to workflow" });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// List active workers
app.get("/workers", (req, res) => {
  const workers = Array.from(state.workers.keys());
  res.json({ workers });
});

// ============================================================
// Main
// ============================================================

function main() {
  log(`
╔═══════════════════════════════════════════════════════════╗
║           pi-adapter Supervisor v1.0                      ║
╠═══════════════════════════════════════════════════════════╣
║  Port: ${PORT}                                              ║
║  Results Dir: ${RESULTS_DIR}                                  ║
║  PI Path: ${PI_COMMAND}                                       ║
╚═══════════════════════════════════════════════════════════╝
  `);

  app.listen(PORT, () => {
    log(`✅ Supervisor listening on http://localhost:${PORT}`);
    log(`API Endpoints:`);
    log(`  GET  /health              - Health check`);
    log(`  POST /worker/spawn        - Spawn a worker`);
    log(`  GET  /worker/:id/status   - Get worker status`);
    log(`  POST /worker/:id/await    - Await worker result`);
    log(`  GET  /results            - Get all results`);
    log(`  POST /workflow/update     - Write findings to workflow`);
    log(`  GET  /workers            - List active workers`);
  });
}

main();
