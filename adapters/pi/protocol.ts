/**
 * pi-adapter: Supervisor HTTP API
 * 
 * Supervisor exposes HTTP API for extension to call
 * Extension uses fetch to call supervisor's API
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
// Logging (Enhanced)
// ============================================================

const LOG_DIR = path.join(process.env.HOME || "/tmp", ".pi-adapter", "logs");
const LOG_FILE = path.join(LOG_DIR, `supervisor-${new Date().toISOString().slice(0,10)}.log`);

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Log rotation - keep last 7 days
function rotateLogsIfNeeded(): void {
  try {
    const files = fs.readdirSync(LOG_DIR)
      .filter(f => f.startsWith("supervisor-") && f.endsWith(".log"))
      .sort()
      .reverse();
    if (files.length > 7) {
      for (let i = 7; i < files.length; i++) {
        const filePath = path.join(LOG_DIR, files[i]);
        console.log(`🗑️ Rotating old log: ${files[i]}`);
        fs.unlinkSync(filePath);
      }
    }
  } catch {
    // Ignore rotation errors
  }
}

rotateLogsIfNeeded();

// File logger
function writeLog(message: string): void {
  const timestamp = new Date().toISOString();
  try {
    fs.appendFileSync(LOG_FILE, `[${timestamp}] ${message}\n`);
  } catch {
    // Ignore
  }
}

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

function logWarn(...args: any[]): void {
  const msg = args.join(" ");
  writeLog(`WARN: ${msg}`);
  console.warn(...args);
}

// HTTP Request logging
const pendingRequests = new Map<string, { method: string; path: string; start: number; workerId?: string }>();
let reqCounter = 0;

function logRequest(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const id = `req-${++reqCounter}`;
  const start = Date.now();
  pendingRequests.set(id, { 
    method: req.method, 
    path: req.path, 
    start,
    workerId: req.params.workerId,
  });

  log(`🚀 [${id}] ${req.method} ${req.path}${req.params.workerId ? ` (worker: ${req.params.workerId})` : ""}`);

  res.on("finish", () => {
    const ms = Date.now() - start;
    const icon = res.statusCode >= 400 ? "❌" : "✅";
    log(`${icon} [${id}] ${req.method} ${req.path} → ${res.statusCode} (${ms}ms)`);
    if (res.statusCode >= 500) logError(`💥 [${id}] SERVER ERROR ${res.statusCode}`);
    pendingRequests.delete(id);
  });

  next();
}

// Memory stats every 60s
setInterval(() => {
  const mem = process.memoryUsage();
  log(`📊 Heap: ${Math.round(mem.heapUsed/1024/1024)}/${Math.round(mem.heapTotal/1024/1024)}MB, Workers: ${state.workers.size}, Pending: ${pendingRequests.size}`);
}, 60000);

log("📝 Supervisor starting...");
log(`📝 Log file: ${LOG_FILE}`);

// ============================================================
// Singleton (Port must be defined before PID file)
// ============================================================

// Support both PI_SUPERVISOR_PORT (from extension) and SUPERVISOR_PORT (direct invocation)
const PORT = parseInt(process.env.PI_SUPERVISOR_PORT || process.env.SUPERVISOR_PORT || "3847", 10);

// PID file is port-specific to allow multiple supervisors on different ports
const PID_FILE = path.join(process.env.HOME || "/tmp", `.pi-adapter-supervisor-${PORT}.pid`);

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
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
      fs.unlinkSync(PID_FILE);
    }
  } catch {}
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
  } catch {}
}

const existingPid = checkExistingSupervisor();
if (existingPid) {
  log(`⚠️ Supervisor already running on port ${PORT} with PID ${existingPid}`);
  process.exit(0);
}

writePidFile();
process.on("exit", cleanupPidFile);
process.on("SIGINT", () => { cleanupPidFile(); process.exit(0); });
process.on("SIGTERM", () => { cleanupPidFile(); process.exit(0); });

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

interface SpawnRequest {
  role: Role;
  task: string;
  taskId: string;
  skill?: string;
  contextFiles?: string[];
  workflowPath: string;
  projectDir?: string;  // Explicit project directory (passed from extension)
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

interface WorkerState {
  process: ChildProcess;
  config: SpawnRequest;
  stdoutBuffer: string;
  stderrBuffer: string;
  startTime: number;
}

interface SupervisorState {
  workers: Map<string, WorkerState>;
  results: Map<string, WorkerResult>;
  resultsDir: string;
}

const PI_COMMAND = process.env.PI_PATH || "pi";
const RESULTS_DIR = process.env.SUPERVISOR_RESULTS_DIR || "/tmp/pi-adapter-results";
const MAX_BUFFER_SIZE = 1024 * 1024;

const state: SupervisorState = {
  workers: new Map(),
  results: new Map(),
  resultsDir: RESULTS_DIR,
};

if (!fs.existsSync(RESULTS_DIR)) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

// ============================================================
// Worker Spawner
// ============================================================

function spawnWorker(config: SpawnRequest, workerId: string): ChildProcess {
  const { role, task, taskId, skill, workflowPath, contextFiles } = config;

  const args: string[] = [
    `--skill=${skill || "./.pi/skills/runbook-org/SKILL.md"}`,
    `-p`,
  ];

  if (contextFiles && contextFiles.length > 0) {
    args.push(...contextFiles.map(f => `@${f}`));
  }
  
  args.push(`@${workflowPath}`);
  const prompt = `[${role}] Task: ${task}\nTask ID: ${taskId}\n\nRead the workflow.org for context, then complete the assigned task.`;
  args.push(prompt);

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

  // Use projectDir from config if provided (passed from extension)
  // Fall back to calculating from process.cwd() if not provided
  // projectDir is the absolute path to the project root where runbook/ lives
  let cwd: string;
  if (config.projectDir && fs.existsSync(config.projectDir)) {
    cwd = config.projectDir;
    log(`   Using explicit projectDir: ${cwd}`);
  } else {
    // Legacy fallback: calculate from supervisor's process.cwd()
    // Assumes supervisor runs from .pi/extensions/pi-adapter
    const baseDir = process.cwd();
    cwd = path.resolve(baseDir, "..", "..", "..");
    log(`   Supervisor cwd: ${baseDir}`);
    log(`   Worker working directory (calculated): ${cwd}`);
    if (!config.projectDir) {
      logWarn(`   No projectDir provided, using calculated cwd. Workers may run in wrong directory!`);
    }
  }
  
  const worker = spawn(PI_COMMAND, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env,
    cwd,
  });

  const workerState: WorkerState = {
    process: worker,
    config,
    stdoutBuffer: "",
    stderrBuffer: "",
    startTime: Date.now(),
  };

  state.workers.set(workerId, workerState);

  worker.stdout?.on("data", (data: Buffer) => {
    const chunk = data.toString();
    workerState.stdoutBuffer += chunk;
    if (workerState.stdoutBuffer.length > MAX_BUFFER_SIZE) {
      workerState.stdoutBuffer = workerState.stdoutBuffer.slice(-MAX_BUFFER_SIZE);
    }
    try {
      process.stdout.write(chunk.substring(0, 10000));
    } catch {}
  });

  worker.stderr?.on("data", (data: Buffer) => {
    const chunk = data.toString();
    workerState.stderrBuffer += chunk;
    if (workerState.stderrBuffer.length > MAX_BUFFER_SIZE) {
      workerState.stderrBuffer = workerState.stderrBuffer.slice(-MAX_BUFFER_SIZE);
    }
    try {
      process.stderr.write(chunk.substring(0, 10000));
    } catch {}
  });

  // Handle exit - saves stdout/stderr to disk and memory
  worker.on("exit", (code) => {
    const duration = Date.now() - workerState.startTime;
    log(`👋 Worker ${workerId} exited with code ${code} (ran for ${duration}ms)`);
    
    const resultFile = path.join(RESULTS_DIR, `${workerId}.json`);
    const stdoutFile = path.join(RESULTS_DIR, `${workerId}.stdout`);
    const stderrFile = path.join(RESULTS_DIR, `${workerId}.stderr`);
    
    // Always save stdout/stderr to separate files for reliable retrieval
    try {
      fs.writeFileSync(stdoutFile, workerState.stdoutBuffer);
      fs.writeFileSync(stderrFile, workerState.stderrBuffer);
      log(`💾 Saved stdout (${workerState.stdoutBuffer.length}) and stderr (${workerState.stderrBuffer.length}) for ${workerId}`);
    } catch (e) {
      logError(`Failed to save stdout/stderr files: ${e}`);
    }
    
    let result: WorkerResult | null = null;
    
    if (fs.existsSync(resultFile)) {
      try {
        result = JSON.parse(fs.readFileSync(resultFile, "utf-8")) as WorkerResult;
        // Add stdout/stderr to result
        result.stdout = workerState.stdoutBuffer;
        result.stderr = workerState.stderrBuffer;
        // Update JSON file with stdout/stderr
        fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));
        state.results.set(workerId, result);
        log(`✅ Result loaded for worker ${workerId}`);
      } catch (e) {
        logError(`Failed to read result file: ${e}`);
      }
    } else {
      logWarn(`No result file for worker ${workerId}`);
      result = {
        workerId,
        taskId: workerState.config.taskId,
        role: workerState.config.role,
        exitCode: code || 0,
        findings: [],
        artifacts: [],
        stdout: workerState.stdoutBuffer,
        stderr: workerState.stderrBuffer,
      };
      state.results.set(workerId, result);
    }

    state.workers.delete(workerId);
  });

  worker.on("error", (err) => {
    logError(`Worker ${workerId} error: ${err.message}`);
  });

  return worker;
}

// ============================================================
// Express App
// ============================================================

const app = express();
app.use(express.json());
app.use(logRequest);

app.get("/health", (req, res) => {
  const mem = process.memoryUsage();
  res.json({
    status: "ok",
    workers: state.workers.size,
    results: state.results.size,
    pendingRequests: pendingRequests.size,
    memory: {
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
      rss: Math.round(mem.rss / 1024 / 1024),
    },
  });
});

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
    logError(`Failed to spawn worker: ${error}`);
    res.status(500).json({ error: String(error) });
  }
});

app.get("/worker/:workerId/status", (req, res) => {
  const { workerId } = req.params;
  
  const workerState = state.workers.get(workerId);
  const result = state.results.get(workerId);

  if (result) {
    return res.json({ status: "completed", workerId, result });
  }

  if (workerState) {
    const duration = Date.now() - workerState.startTime;
    return res.json({
      status: "running",
      workerId,
      role: workerState.config.role,
      taskId: workerState.config.taskId,
      uptime: duration,
      stdoutLength: workerState.stdoutBuffer.length,
      stderrLength: workerState.stderrBuffer.length,
    });
  }

  // Check disk for result files (for supervisor restart scenarios)
  const resultFile = path.join(RESULTS_DIR, `${workerId}.json`);
  const stdoutFile = path.join(RESULTS_DIR, `${workerId}.stdout`);
  const stderrFile = path.join(RESULTS_DIR, `${workerId}.stderr`);
  
  if (fs.existsSync(resultFile) || fs.existsSync(stdoutFile)) {
    // Load from disk and cache in memory
    let fileResult: WorkerResult | null = null;
    
    if (fs.existsSync(resultFile)) {
      try {
        fileResult = JSON.parse(fs.readFileSync(resultFile, "utf-8")) as WorkerResult;
      } catch (e) {
        logError(`Failed to read result file: ${e}`);
      }
    }
    
    const stdout = fs.existsSync(stdoutFile) ? fs.readFileSync(stdoutFile, "utf-8") : "";
    const stderr = fs.existsSync(stderrFile) ? fs.readFileSync(stderrFile, "utf-8") : "";
    
    const result: WorkerResult = fileResult ? {
      ...fileResult,
      stdout: stdout || fileResult.stdout || "",
      stderr: stderr || fileResult.stderr || "",
    } : {
      workerId,
      taskId: workerId,
      role: "unknown",
      exitCode: 0,
      findings: [],
      artifacts: [],
      stdout,
      stderr,
    };
    
    state.results.set(workerId, result);
    return res.json({ status: "completed", workerId, result });
  }

  res.status(404).json({ error: "Worker not found" });
});

app.post("/worker/:workerId/await", (req, res) => {
  const { workerId } = req.params;
  const timeout = req.body.timeout || 300;
  const progressInterval = 30; // Report progress every 30 seconds

  log(`⏳ [await] Waiting for worker ${workerId} (timeout: ${timeout}s)`);

  const existingResult = state.results.get(workerId);
  if (existingResult) {
    log(`✅ [await] Worker ${workerId} already completed`);
    return res.json({ success: true, result: existingResult });
  }

  const workerState = state.workers.get(workerId);
  if (!workerState) {
    log(`❌ [await] Worker ${workerId} not found`);
    return res.status(404).json({ error: "Worker not found or already completed" });
  }

  let resolved = false;
  let progressReported = false;
  
  const resolveOnce = (fn: () => void) => {
    if (!resolved) {
      resolved = true;
      fn();
    }
  };

  // Get health status based on output activity
  const getHealthStatus = (): "healthy" | "idle" | "unknown" => {
    const stdoutLen = workerState.stdoutBuffer.length;
    const stderrLen = workerState.stderrBuffer.length;
    const uptime = Date.now() - workerState.startTime;
    
    if (stdoutLen > 0 || stderrLen > 0) {
      return "healthy"; // Worker is producing output
    } else if (uptime < 5000) {
      return "unknown"; // Too early to tell
    } else {
      return "idle"; // No output yet but might be normal (e.g., downloading, compiling)
    }
  };

  // Progress report function
  const sendProgress = () => {
    if (resolved) return;
    
    const uptime = Date.now() - workerState.startTime;
    const health = getHealthStatus();
    
    log(`📊 [await] Progress report for ${workerId}: ${Math.round(uptime/1000)}s, health: ${health}`);
    
    resolveOnce(() => {
      res.json({ 
        success: false,
        status: "running",
        workerId,
        uptime,
        health,
        stdoutLength: workerState.stdoutBuffer.length,
        stderrLength: workerState.stderrBuffer.length,
        stdoutPreview: workerState.stdoutBuffer.slice(-200),
        message: `Worker still running (${Math.round(uptime/1000)}s elapsed). Health: ${health}.`,
        suggestion: "Continue waiting or check with GET /worker/:id/status for details.",
      });
    });
  };

  // Schedule progress reports every 30 seconds
  const progressTimerId = setInterval(() => {
    if (!resolved) {
      sendProgress();
    }
  }, progressInterval * 1000);

  const timeoutId = setTimeout(() => {
    logWarn(`⏰ [await] TIMEOUT waiting for worker ${workerId} after ${timeout}s`);
    clearInterval(progressTimerId);
    resolveOnce(() => {
      res.status(408).json({ 
        success: false,
        status: "timeout",
        error: "Timeout waiting for worker", 
        workerId,
        uptime: Date.now() - workerState.startTime,
        health: getHealthStatus(),
        stdoutLength: workerState.stdoutBuffer.length,
        stderrLength: workerState.stderrBuffer.length,
        suggestion: "Worker is still running. Use GET /worker/:id/status to check, or DELETE /worker/:id to kill.",
      });
    });
  }, timeout * 1000);

  const exitHandler = (code: number) => {
    clearTimeout(timeoutId);
    clearInterval(progressTimerId);
    const duration = Date.now() - workerState.startTime;
    log(`👋 [await] Worker ${workerId} exited with code ${code} (${duration}ms)`);
    
    const resultFile = path.join(RESULTS_DIR, `${workerId}.json`);
    if (fs.existsSync(resultFile)) {
      try {
        const result = JSON.parse(fs.readFileSync(resultFile, "utf-8")) as WorkerResult;
        state.results.set(workerId, result);
        log(`✅ [await] Result loaded for worker ${workerId}`);
        resolveOnce(() => {
          res.json({ success: true, result });
        });
      } catch (e) {
        logError(`[await] Failed to parse result file: ${e}`);
        resolveOnce(() => {
          res.status(500).json({ error: `Worker completed but failed to read result: ${e}` });
        });
      }
    } else {
      logWarn(`[await] No result file for worker ${workerId}`);
      resolveOnce(() => {
        res.status(500).json({ 
          error: "Worker completed but no result file found",
          workerId,
          exitCode: code,
          stdoutPreview: workerState.stdoutBuffer.slice(-500),
        });
      });
    }
    
    workerState.process.removeListener("exit", exitHandler);
    state.workers.delete(workerId);
  };

  workerState.process.on("exit", exitHandler);
});

app.delete("/worker/:workerId", (req, res) => {
  const { workerId } = req.params;
  const workerState = state.workers.get(workerId);
  
  if (!workerState) {
    return res.status(404).json({ error: "Worker not found" });
  }

  log(`🛑 [kill] Force killing worker ${workerId}`);
  workerState.process.kill("SIGTERM");
  
  setTimeout(() => {
    const ws = state.workers.get(workerId);
    if (ws) {
      logWarn(`[kill] Worker ${workerId} didn't respond to SIGTERM, sending SIGKILL`);
      ws.process.kill("SIGKILL");
    }
  }, 5000);

  res.json({ 
    success: true, 
    message: `Worker ${workerId} kill signal sent`,
    note: "Worker will be forcefully killed in 5s if it doesn't exit gracefully",
  });
});

app.get("/results", (req, res) => {
  res.json({ results: Array.from(state.results.values()) });
});

app.post("/workflow/update", (req, res) => {
  const { workflowPath, taskId, findings } = req.body;

  if (!workflowPath) {
    return res.status(400).json({ error: "Missing workflowPath" });
  }
  
  // Support both single finding and findings array
  const findingsArray = findings 
    ? (Array.isArray(findings) ? findings : [findings])
    : [];
  
  // If no findings provided, return success (no-op)
  if (findingsArray.length === 0) {
    return res.json({ success: true, message: "No findings to append", findingsWritten: 0 });
  }
  
  // If taskId not provided, extract from first finding
  const effectiveTaskId = taskId || (findingsArray[0]?.taskId);
  
  if (!effectiveTaskId) {
    return res.status(400).json({ error: "Missing taskId - must be provided in body or in findings[0].taskId" });
  }

  try {
    if (!fs.existsSync(workflowPath)) {
      return res.status(404).json({ 
        error: "Workflow file not found",
        workflowPath,
        hint: `File does not exist: ${workflowPath}`
      });
    }

    let content = fs.readFileSync(workflowPath, "utf-8");
    const lines = content.split("\n");
    
    // Find the task by taskId
    let taskStartLine = -1;
    let taskEndLine = lines.length;
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(`:ID: ${effectiveTaskId}`) || lines[i].includes(`:ID:${effectiveTaskId}`)) {
        // Found the task ID - now find the task heading (backtrack)
        for (let j = i; j >= 0; j--) {
          const line = lines[j].trim();
          // Match org-mode heading with status (e.g., "*** TODO <title>" or "** IN-PROGRESS <title>")
          if (/^\*{1,3}\s+(TODO|IN-PROGRESS|DONE|BLOCKED|CANCELLED)\s+</.test(line)) {
            taskStartLine = j;
            break;
          }
        }
        break;
      }
    }
    
    if (taskStartLine === -1) {
      return res.status(404).json({ 
        error: `Task not found: ${effectiveTaskId}`,
        workflowPath,
        hint: `No task with ID ${effectiveTaskId} found in the workflow file`
      });
    }
    
    // Find the end of this task (next heading at same or higher level, or end of file)
    // Get the level of current task (number of * at start)
    const taskLevel = (lines[taskStartLine].match(/^\*/) || [""])[0].length;
    
    for (let i = taskStartLine + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      // Check if this is a heading (starts with *)
      const headingMatch = line.match(/^(\*+)\s+(TODO|IN-PROGRESS|DONE|BLOCKED|CANCELLED)\s+</);
      if (headingMatch) {
        const headingLevel = headingMatch[1].length;
        // If next heading is same level or higher (fewer *), end current task
        if (headingLevel <= taskLevel) {
          taskEndLine = i;
          break;
        }
      }
    }
    
    // Find "Findings ::" section within this task's range
    let findingsSectionLine = -1;
    for (let i = taskStartLine; i < taskEndLine; i++) {
      // Match "- Findings ::" or "- Findings::" (with or without space)
      if (/^-\s+Findings\s*::/.test(lines[i].trim())) {
        findingsSectionLine = i;
        break;
      }
    }
    
    if (findingsSectionLine === -1) {
      return res.status(404).json({ 
        error: `Findings section not found in task ${taskId}`,
        workflowPath,
        hint: `Task ${taskId} exists but has no "Findings ::" section`
      });
    }
    
    // Find where to insert new findings:
    // 1. If there are existing findings (lines starting with "- ["), insert AFTER the last one
    // 2. Otherwise, insert after "Findings ::" line
    // 3. But stop before "- Next Actions" or other section headers
    
    let insertAfterLine = findingsSectionLine;
    
    // Look for existing findings and find the last one
    // Existing findings have format: "  - [timestamp] F-xxx: content [rating]"
    // OR they might not be indented (format: "- [timestamp] F-xxx: content [rating]")
    for (let i = findingsSectionLine + 1; i < taskEndLine; i++) {
      const line = lines[i].trim();
      
      // Stop at section headers or other items
      // Section headers: "- Next Actions ::", "- Evidence ::", "- Context ::"
      // Or lines that start a new section (indented or not indented list items that look like headers)
      if (/^-\s+(Next Actions|Evidence|Context|Goal)::?\s*$/.test(line)) {
        // We've reached the next section, stop here
        break;
      }
      
      // Check if this is a finding line (has timestamp format)
      // Finding format: "- [2026-04-01T12:00:00Z] F-xxx: content [rating]"
      if (/^-\s+\[/.test(line) || /^  -\s+\[/.test(line)) {
        // This is a finding line, update insert position
        insertAfterLine = i;
        continue;
      }
      
      // If we hit an empty line after findings, that's fine, we'll insert before it
      if (line === "") {
        continue;
      }
    }
    
    // Build finding lines
    const findingLines: string[] = [];
    for (const finding of findingsArray) {
      const timestamp = finding.timestamp || new Date().toISOString();
      findingLines.push(`  - [${timestamp}] ${finding.id}: ${finding.content} [${finding.rating}]`);
    }
    
    // Split lines at insert position
    // If insertAfterLine is findingsSectionLine, insert right after "Findings ::"
    // If insertAfterLine is the last finding, insert after it
    const beforeInsert = lines.slice(0, insertAfterLine + 1);
    const afterInsert = lines.slice(insertAfterLine + 1, taskEndLine);
    const restOfFile = lines.slice(taskEndLine);
    
    // Reconstruct: before + newline + findings + after + rest
    // Add newline before first finding for spacing
    const newContent = [
      ...beforeInsert,
      "",
      ...findingLines,
      ...afterInsert,
      ...restOfFile,
    ].join("\n");
    
    fs.writeFileSync(workflowPath, newContent);
    
    log(`📝 Added ${findingsArray.length} finding(s) to task ${taskId}`);

    res.json({ 
      success: true, 
      message: `Findings written to task ${taskId}`,
      findingsWritten: findingsArray.length,
      taskId,
    });
  } catch (error) {
    logError(`Failed to update workflow: ${error}`);
    res.status(500).json({ error: String(error) });
  }
});

// Update task status in workflow.org file
// Changes TODO/IN-PROGRESS/DONE/BLOCKED keyword for a specific task ID
app.post("/workflow/status", (req, res) => {
  const { workflowPath, taskId, status } = req.body;

  if (!workflowPath || !taskId || !status) {
    return res.status(400).json({ error: "Missing workflowPath, taskId, or status" });
  }

  // Validate status is one of the allowed keywords
  const validStatuses = ["TODO", "IN-PROGRESS", "DONE", "BLOCKED", "CANCELLED"];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ 
      error: `Invalid status: ${status}`,
      validStatuses,
    });
  }

  try {
    if (!fs.existsSync(workflowPath)) {
      return res.status(404).json({ 
        error: "Workflow file not found",
        workflowPath,
        hint: `File does not exist: ${workflowPath}`
      });
    }

    let content = fs.readFileSync(workflowPath, "utf-8");

    // First, verify the task ID exists in the file
    const idPattern = new RegExp(`:ID:\\s+${escapeRegExp(taskId)}\\s*\n`, "m");
    if (!idPattern.test(content)) {
      return res.status(404).json({ 
        error: `Task not found: ${taskId}`,
        workflowPath,
        hint: `No task with ID ${taskId} found in the workflow file`
      });
    }

    // Find the position of :ID: taskId
    const idMatch = content.match(idPattern);
    if (!idMatch || !idMatch.index) {
      return res.status(404).json({ error: `Could not locate task ID ${taskId}` });
    }
    const idPos = idMatch.index;

    // Find the start of the properties block containing this ID
    // Walk backwards from the ID position to find ":PROPERTIES:"
    let propsStart = content.lastIndexOf(":PROPERTIES:", idPos);
    if (propsStart === -1) {
      return res.status(500).json({ error: "Malformed task: no :PROPERTIES: before :ID:" });
    }

    // Find the heading line before :PROPERTIES:
    // The heading is the line with *** or ** and TODO/IN-PROGRESS/etc
    // that comes before :PROPERTIES:
    let headingStart = content.lastIndexOf("\n", propsStart - 1);
    if (headingStart > 0) {
      headingStart++; // Skip the newline
    }
    
    // Find the actual start of the heading line (after any leading whitespace/newlines)
    const contentBeforeProps = content.substring(0, propsStart);
    const lines = contentBeforeProps.split("\n");
    let headingLineIndex = lines.length - 1;
    
    // Find the heading line with a status keyword
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      // Match patterns like "*** TODO", "** IN-PROGRESS", "* DONE"
      if (/^\*+ (TODO|IN-PROGRESS|DONE|BLOCKED|CANCELLED)/.test(line)) {
        headingLineIndex = i;
        break;
      }
    }

    // Get the heading line
    const headingLine = lines[headingLineIndex];
    
    // Check if already has the desired status
    const currentStatus = headingLine.match(/^\*+ (TODO|IN-PROGRESS|DONE|BLOCKED|CANCELLED)/)?.[1];
    if (currentStatus === status) {
      return res.json({ 
        success: true, 
        message: `Task already has status ${status}`,
        taskId,
        status,
        noChange: true,
      });
    }

    // Replace the status keyword
    const newHeadingLine = headingLine.replace(
      /^\*+ (TODO|IN-PROGRESS|DONE|BLOCKED|CANCELLED)/,
      (match) => match.replace(currentStatus!, status)
    );

    // Reconstruct the file content
    lines[headingLineIndex] = newHeadingLine;
    const newContent = lines.join("\n") + content.substring(propsStart);

    fs.writeFileSync(workflowPath, newContent);

    log(`📝 Task ${taskId} status: ${currentStatus} → ${status}`);

    res.json({ 
      success: true, 
      message: `Task ${taskId} status updated to ${status}`,
      taskId,
      oldStatus: currentStatus,
      newStatus: status,
    });
  } catch (error) {
    logError(`Failed to update task status: ${error}`);
    res.status(500).json({ error: String(error) });
  }
});

// Helper: Escape special regex characters
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Helper: Create regex pattern for matching any status
function statusRegex(status?: string): string {
  if (status) {
    return status.replace(/-/g, "\\-");
  }
  return "(TODO|IN-PROGRESS|DONE|BLOCKED|CANCELLED)";
}

app.get("/workers", (req, res) => {
  const workers = Array.from(state.workers.entries()).map(([id, ws]) => ({
    id,
    role: ws.config.role,
    taskId: ws.config.taskId,
    uptime: Date.now() - ws.startTime,
    stdoutLength: ws.stdoutBuffer.length,
    stderrLength: ws.stderrBuffer.length,
  }));
  res.json({ workers });
});

// Get worker output - checks running workers, memory results, and disk results
app.get("/worker/:workerId/output", (req, res) => {
  const { workerId } = req.params;
  
  // Check running workers first
  const workerState = state.workers.get(workerId);
  if (workerState) {
    return res.json({
      workerId,
      status: "running",
      stdout: workerState.stdoutBuffer,
      stderr: workerState.stderrBuffer,
      stdoutLength: workerState.stdoutBuffer.length,
      stderrLength: workerState.stderrBuffer.length,
    });
  }
  
  // Check in-memory results
  const result = state.results.get(workerId);
  if (result) {
    return res.json({
      workerId,
      status: "completed",
      stdout: result.stdout || "",
      stderr: result.stderr || "",
      stdoutLength: (result.stdout || "").length,
      stderrLength: (result.stderr || "").length,
    });
  }

  // Check result file on disk (for supervisor restart scenarios)
  const resultFile = path.join(RESULTS_DIR, `${workerId}.json`);
  const stdoutFile = path.join(RESULTS_DIR, `${workerId}.stdout`);
  const stderrFile = path.join(RESULTS_DIR, `${workerId}.stderr`);
  
  let stdout = "";
  let stderr = "";
  
  // Load from result file if exists
  if (fs.existsSync(resultFile)) {
    try {
      const fileResult = JSON.parse(fs.readFileSync(resultFile, "utf-8")) as WorkerResult;
      stdout = fileResult.stdout || "";
      stderr = fileResult.stderr || "";
    } catch (e) {
      logError(`Failed to read result file: ${e}`);
    }
  }
  
  // Load stdout/stderr from buffer files (these are always saved on worker exit)
  if (fs.existsSync(stdoutFile)) {
    stdout = fs.readFileSync(stdoutFile, "utf-8");
  }
  if (fs.existsSync(stderrFile)) {
    stderr = fs.readFileSync(stderrFile, "utf-8");
  }
  
  // Return result if we have either JSON file or stdout/stderr files
  if (fs.existsSync(resultFile) || fs.existsSync(stdoutFile) || fs.existsSync(stderrFile)) {
    const result = {
      workerId,
      taskId: workerId,  // Use workerId as fallback
      role: "unknown" as Role,
      exitCode: 0,
      findings: [],
      artifacts: [],
      stdout,
      stderr,
    };
    state.results.set(workerId, result);
    
    return res.json({
      workerId,
      status: "completed",
      stdout,
      stderr,
      stdoutLength: stdout.length,
      stderrLength: stderr.length,
      note: fs.existsSync(resultFile) ? "Loaded from result file" : "Loaded from stdout/stderr files",
    });
  }

  return res.status(404).json({ error: "Worker not found (may have been cleaned up)" });
});

// Get worker log file path (for viewing log files directly)
app.get("/worker/:workerId/logfile", (req, res) => {
  const { workerId } = req.params;
  
  const workerState = state.workers.get(workerId);
  if (workerState) {
    return res.json({
      workerId,
      status: "running",
      logFile: LOG_FILE,
      resultFile: null,
    });
  }
  
  const resultFile = path.join(RESULTS_DIR, `${workerId}.json`);
  if (fs.existsSync(resultFile)) {
    return res.json({
      workerId,
      status: "completed",
      logFile: LOG_FILE,
      resultFile,
    });
  }

  return res.status(404).json({ error: "Worker not found" });
});

// ============================================================
// Start Server
// ============================================================

const server = app.listen(PORT, () => {
  log(`✅ Supervisor v2.1 listening on http://localhost:${PORT}`);
  log(`   Log file: ${LOG_FILE}`);
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    logError(`Port ${PORT} is already in use.`);
    logError(`Either stop the existing supervisor or use a different port:`);
    logError(`  SUPERVISOR_PORT=<other-port> npx ts-node --esm protocol.ts`);
    process.exit(1);
  }
  throw err;
});
