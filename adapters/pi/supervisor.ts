/**
 * pi-adapter: Supervisor Process
 * 
 * Purpose: External supervisor for orchestrating multi-agent workflows in pi
 * 
 * Responsibilities:
 * - Read workflow.org for task state
 * - Spawn worker agents based on current phase
 * - Collect results and write back to workflow
 * 
 * Architecture:
 * ┌─────────────────────────────────────────────┐
 * │            External Supervisor               │
 * │  - Reads workflow.org                       │
 * │  - Decides current phase                    │
 * │  - Spawns corresponding pi worker           │
 * │  - Intercepts results and writes to workflow│
 * └─────────────────────────────────────────────┘
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { spawn, ChildProcess } from "child_process";
import * as path from "path";

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

interface Task {
  id: string;
  owner: string;
  phase: string;
  status: "TODO" | "IN-PROGRESS" | "DONE" | "BLOCKED";
  parent?: string;
}

interface WorkflowState {
  tasks: Map<string, Task>;
  currentPhase: string;
}

// ============================================================
// Configuration
// ============================================================

const PI_COMMAND = process.env.PI_PATH || "pi";
const WORKFLOW_PATH = process.env.WORKFLOW_PATH || "./workflow.org";

// Phase to Role mapping (based on orchestrator-skill)
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
// Workflow Parser (Simplified)
// ============================================================

function parseWorkflow(orgContent: string): WorkflowState {
  const tasks = new Map<string, Task>();
  const lines = orgContent.split("\n");
  let currentPhase = "discovery";
  
  for (const line of lines) {
    // Parse phase:PROPERTY
    const phaseMatch = line.match(/:PHASE:\s*(\w+)/);
    if (phaseMatch) {
      currentPhase = phaseMatch[1];
    }
    
    // Parse TASK-ID
    const idMatch = line.match(/:TASK-ID:\s*(\S+)/);
    const statusMatch = line.match(/^\*+\s+(TODO|IN-PROGRESS|DONE|BLOCKED)/);
    const parentMatch = line.match(/:PARENT:\s*(\S+)/);
    
    if (idMatch) {
      tasks.set(idMatch[1], {
        id: idMatch[1],
        status: (statusMatch?.[1] as Task["status"]) || "TODO",
        phase: currentPhase,
        parent: parentMatch?.[1],
        owner: "",
      });
    }
  }
  
  return { tasks, currentPhase };
}

// ============================================================
// Worker Spawner
// ============================================================

interface SpawnConfig {
  role: Role;
  task: string;
  skill?: string;
  contextFiles?: string[];
  workflowPath: string;
}

async function spawnWorker(config: SpawnConfig): Promise<ChildProcess> {
  const { role, task, skill, contextFiles, workflowPath } = config;
  
  // Build pi command with skill injection
  const args = [
    `--skill=${skill || "./skills/runbook-org/SKILL.md"}`,
    `@${workflowPath}`,
    `Task for ${role}: ${task}`,
  ];
  
  if (contextFiles && contextFiles.length > 0) {
    args.push(...contextFiles.map(f => `@${f}`));
  }
  
  console.log(`🚀 Spawning ${role} worker...`);
  console.log(`   Command: ${PI_COMMAND} ${args.join(" ")}`);
  
  const worker = spawn(PI_COMMAND, args, {
    stdio: "inherit",
    env: {
      ...process.env,
      PI_ROLE: role,
    },
  });
  
  return worker;
}

// ============================================================
// Result Collector
// ============================================================

interface CollectedResult {
  workerId: string;
  role: Role;
  exitCode: number;
  findings: string[];
  artifacts: string[];
}

// ============================================================
// Main Supervisor Loop
// ============================================================

async function runSupervisor() {
  console.log("📋 pi-adapter supervisor starting...");
  console.log(`   Workflow: ${WORKFLOW_PATH}`);
  
  // Load workflow
  if (!existsSync(WORKFLOW_PATH)) {
    console.error(`❌ Workflow file not found: ${WORKFLOW_PATH}`);
    process.exit(1);
  }
  
  const workflowContent = readFileSync(WORKFLOW_PATH, "utf-8");
  const state = parseWorkflow(workflowContent);
  
  console.log(`✅ Loaded workflow with ${state.tasks.size} tasks`);
  console.log(`   Current phase: ${state.currentPhase}`);
  
  // Get applicable roles for current phase
  const applicableRoles = PHASE_ROLES[state.currentPhase] || [];
  console.log(`   Applicable roles: ${applicableRoles.join(", ")}`);
  
  // Find TODO tasks that need workers
  const todoTasks = Array.from(state.tasks.values())
    .filter(t => t.status === "TODO");
  
  console.log(`\n📋 Found ${todoTasks.length} TODO tasks`);
  
  // Spawn workers for each role
  const workers: ChildProcess[] = [];
  const results: CollectedResult[] = [];
  
  for (const task of todoTasks) {
    // Determine role from task or phase
    const role = (task.owner as Role) || applicableRoles[0] || "code-agent";
    
    const worker = await spawnWorker({
      role,
      task: `Execute task ${task.id}`,
      workflowPath: WORKFLOW_PATH,
    });
    
    workers.push(worker);
    
    // Wait for worker to complete
    await new Promise<void>((resolve) => {
      worker.on("exit", (code) => {
        results.push({
          workerId: `worker-${task.id}`,
          role,
          exitCode: code || 0,
          findings: [],
          artifacts: [],
        });
        resolve();
      });
    });
  }
  
  // Collect results
  console.log("\n📊 Worker Results:");
  for (const result of results) {
    console.log(`   ${result.role}: exit code ${result.exitCode}`);
  }
  
  // Write results back to workflow (simplified)
  console.log("\n💾 Writing results to workflow...");
  
  // In a full implementation, this would parse and update the org file
  // For now, just log the intention
  console.log("   (Result writing would update workflow.org with findings)");
  
  console.log("\n✅ Supervisor complete");
}

// ============================================================
// CLI Interface
// ============================================================

function showHelp() {
  console.log(`
pi-adapter supervisor

Usage:
  npx ts-node supervisor.ts [options]

Options:
  --workflow <path>    Path to workflow.org file (default: ./workflow.org)
  --pi-path <path>     Path to pi command (default: pi)
  --help               Show this help

Environment Variables:
  WORKFLOW_PATH        Path to workflow.org file
  PI_PATH              Path to pi command

Examples:
  npx ts-node supervisor.ts --workflow ./my-workflow.org
  PI_PATH=/usr/local/bin/pi npx ts-node supervisor.ts
`);
}

// Parse CLI arguments
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--help") {
    showHelp();
    process.exit(0);
  }
  if (args[i] === "--workflow" && args[i + 1]) {
    process.env.WORKFLOW_PATH = args[++i];
  }
  if (args[i] === "--pi-path" && args[i + 1]) {
    process.env.PI_PATH = args[++i];
  }
}

// Run supervisor
runSupervisor().catch((err) => {
  console.error("❌ Supervisor error:", err);
  process.exit(1);
});
