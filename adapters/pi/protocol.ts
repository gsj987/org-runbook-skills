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
    if (ms > 30000) logWarn(`⚠️ [${id}] SLOW REQUEST: ${ms}ms`);
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
// Singleton
// ============================================================

const PID_FILE = path.join(process.env.HOME || "/tmp", ".pi-adapter-supervisor.pid");

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
  log(`⚠️ Supervisor already running with PID ${existingPid}`);
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
const PORT = parseInt(process.env.SUPERVISOR_PORT || "3847", 10);
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

  const protocolDir = __dirname;
  const cwd = path.join(protocolDir, "..", "..");
  
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
  const resolveOnce = (fn: () => void) => {
    if (!resolved) {
      resolved = true;
      fn();
    }
  };

  const timeoutId = setTimeout(() => {
    logWarn(`⏰ [await] TIMEOUT waiting for worker ${workerId} after ${timeout}s`);
    resolveOnce(() => {
      res.status(408).json({ 
        error: "Timeout waiting for worker", 
        workerId,
        suggestion: "Worker is still running. Use GET /worker/:id/status to check, or DELETE /worker/:id to kill.",
        uptime: Date.now() - workerState.startTime,
      });
    });
  }, timeout * 1000);

  const exitHandler = (code: number) => {
    clearTimeout(timeoutId);
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
  const { workflowPath, findings } = req.body;

  if (!workflowPath || !findings) {
    return res.status(400).json({ error: "Missing workflowPath or findings" });
  }

  try {
    if (!fs.existsSync(workflowPath)) {
      return res.status(404).json({ error: "Workflow file not found" });
    }

    let content = fs.readFileSync(workflowPath, "utf-8");

    for (const finding of findings) {
      const checkpoint = `\n- [${finding.timestamp}] ${finding.id}: ${finding.content} [${finding.rating}]`;
      content += checkpoint;
    }

    fs.writeFileSync(workflowPath, content);

    res.json({ success: true, message: "Findings written to workflow" });
  } catch (error) {
    logError(`Failed to update workflow: ${error}`);
    res.status(500).json({ error: String(error) });
  }
});

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

app.listen(PORT, () => {
  log(`✅ Supervisor v2.1 listening on http://localhost:${PORT}`);
  log(`   Log file: ${LOG_FILE}`);
});
